-- SANAD production hardening: Alomqy identifier semantics + automatic operation-pipeline watchdog.
-- Incident basis: operation 38426fe2-9287-46e1-bba1-237fae2285a3 selected an identity number
-- (08010076816) as the beneficiary account although the source document also exposed account 254073867.

update public.ai_prompts
set prompt_text = prompt_text || E'\n\n## قواعد دلالية خاصة بالعمقي موبايل\n- في إشعارات العمقي، النص «بط» أو «بطاقة» أو «هوية» الملاصق للرقم يعني national_id. لا تصنّف هذا الرقم account_number ولا تجعله isPrimaryRoutingIdentifier=true إذا ظهر رقم حساب صريح للمستفيد.\n- البادئتان 080 و663 قرينتان قويتان لهوية/بطاقة العمقي عندما تكونان بجوار «بط» أو «بطاقة» أو «هوية». البادئة وحدها ليست قاعدة حاسمة إذا كان الحقل مسمى صراحة «رقم الحساب».\n- أرقام حسابات العمقي المالية كثيرًا ما تبدأ بـ25. اعتبر البادئة 25 قرينة مساندة فقط، ويظل اسم الحقل والسياق البصري أقوى من شكل الرقم.\n- عند وجود «إلى حساب: <اسم المستفيد> ... بط:<رقم هوية> ... رقم <رقم حساب>» استخرج للمستفيد معرفين: national_id لرقم البطاقة وaccount_number لرقم الحساب، واجعل account_number هو Primary Routing Identifier.\n- لا تنقل national_id إلى receiver account في المخرجات المطبعة. إذا لم تجد حسابًا ماليًا واضحًا مع وجود هوية فقط، ضع reviewRequired=true بدل التخمين.\n- مثال دلالي: «إلى حساب: محمد ... بط:08010076816 رقم 254073867» => national_id=08010076816 و account_number=254073867، والمعرف الأساسي للمطابقة هو 254073867.\n',
    version = greatest(version, 15) + 1,
    notes = trim(both from concat_ws(E'\n', nullif(notes,''), 'v16: Alomqy national-ID/account disambiguation; 080/663 identity evidence; 25 account evidence; account wins when explicitly present.')),
    updated_at = now()
where prompt_key = 'sanad_operation_extraction_operational_v2_shadow';

create table if not exists private.operation_pipeline_watchdog_runs (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  stuck_operations integer not null default 0,
  failed_jobs integer not null default 0,
  dead_letter_jobs integer not null default 0,
  sample_operations integer not null default 0,
  p95_ms numeric,
  p95_breached boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

revoke all on private.operation_pipeline_watchdog_runs from public, anon, authenticated;

create index if not exists idx_operation_pipeline_watchdog_runs_checked_at
  on private.operation_pipeline_watchdog_runs(checked_at desc);

create or replace function private.run_operation_pipeline_watchdog()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_stuck integer := 0;
  v_failed integer := 0;
  v_dead integer := 0;
  v_sample integer := 0;
  v_p95 numeric := null;
  v_p95_breached boolean := false;
  v_admin record;
  v_operation record;
  v_hour_bucket text := to_char(date_trunc('hour', v_now), 'YYYYMMDDHH24');
  v_result jsonb;
begin
  select count(*)::integer
    into v_stuck
  from public.operations o
  where o.created_at >= v_now - interval '24 hours'
    and o.ai_status in ('pending','running')
    and o.created_at <= v_now - interval '15 seconds';

  select
    count(*) filter (where j.status='failed')::integer,
    count(*) filter (where j.status='dead_letter')::integer
  into v_failed, v_dead
  from private.operation_analysis_jobs j
  where j.updated_at >= v_now - interval '1 hour'
    and j.status in ('failed','dead_letter');

  select
    count(*)::integer,
    percentile_cont(0.95) within group (
      order by extract(epoch from (o.analysis_completed_at-o.created_at))*1000
    )
  into v_sample, v_p95
  from public.operations o
  where o.created_at >= v_now - interval '1 hour'
    and o.ai_status='completed'
    and o.analysis_completed_at is not null
    and o.analysis_completed_at >= o.created_at;

  v_p95_breached := v_sample >= 3 and coalesce(v_p95,0) > 6000;

  insert into private.operation_pipeline_watchdog_runs(
    checked_at, stuck_operations, failed_jobs, dead_letter_jobs,
    sample_operations, p95_ms, p95_breached, metadata
  ) values (
    v_now, v_stuck, v_failed, v_dead, v_sample,
    case when v_p95 is null then null else round(v_p95::numeric,0) end,
    v_p95_breached,
    jsonb_build_object(
      'stuck_threshold_ms',15000,
      'p95_target_ms',6000,
      'window_minutes',60
    )
  );

  -- Per-operation alert: created once for each operation that remains unanalysed after 15s.
  for v_operation in
    select o.id, o.public_token, o.source, o.created_at,
           round(extract(epoch from (v_now-o.created_at))*1000)::bigint as age_ms
    from public.operations o
    where o.created_at >= v_now - interval '24 hours'
      and o.ai_status in ('pending','running')
      and o.created_at <= v_now - interval '15 seconds'
  loop
    for v_admin in
      select p.id from public.profiles p
      where p.global_role='platform_admin' and p.status='active'
    loop
      insert into public.notifications(
        recipient_user_id, notification_type, category, severity, title, body,
        action_type, action_payload, operation_id, source_event_type,
        source_event_id, dedupe_key, data
      ) values (
        v_admin.id,
        'system_announcement','system','warning',
        'عملية تجاوزت 15 ثانية دون اكتمال التحليل',
        'رصد سند عملية لم يكتمل تحليلها ضمن الحد التشغيلي. افتح العملية لمراجعة الطابور ومحرك التحليل.',
        'operation_details',
        jsonb_build_object('operation_id',v_operation.id,'public_token',v_operation.public_token),
        v_operation.id,
        'operation_pipeline_watchdog',
        v_operation.id::text,
        'pipeline-watchdog:stuck:'||v_operation.id::text,
        jsonb_build_object('source',v_operation.source,'age_ms',v_operation.age_ms,'threshold_ms',15000)
      ) on conflict (recipient_user_id,dedupe_key) do nothing;
    end loop;
  end loop;

  -- Queue terminal failures are immediately visible to the platform administrator.
  for v_operation in
    select j.id as job_id, j.operation_id, j.status, j.last_error_code, j.last_error_message, j.updated_at
    from private.operation_analysis_jobs j
    where j.updated_at >= v_now - interval '1 hour'
      and j.status in ('failed','dead_letter')
  loop
    for v_admin in
      select p.id from public.profiles p
      where p.global_role='platform_admin' and p.status='active'
    loop
      insert into public.notifications(
        recipient_user_id, notification_type, category, severity, title, body,
        action_type, action_payload, operation_id, source_event_type,
        source_event_id, dedupe_key, data
      ) values (
        v_admin.id,
        'system_announcement','system','error',
        case when v_operation.status='dead_letter'
          then 'عملية وصلت إلى Dead Letter'
          else 'فشل نهائي في تحليل عملية'
        end,
        left(coalesce(v_operation.last_error_message,'فشل محرك التحليل دون رسالة خطأ.'),1000),
        'operation_details',
        jsonb_build_object('operation_id',v_operation.operation_id),
        v_operation.operation_id,
        'operation_analysis_job_failure',
        v_operation.job_id::text,
        'pipeline-watchdog:job:'||v_operation.job_id::text||':'||v_operation.status,
        jsonb_build_object(
          'job_id',v_operation.job_id,
          'job_status',v_operation.status,
          'error_code',v_operation.last_error_code
        )
      ) on conflict (recipient_user_id,dedupe_key) do nothing;
    end loop;
  end loop;

  -- Performance breach: at most one admin notification per clock-hour while P95 remains above target.
  if v_p95_breached then
    for v_admin in
      select p.id from public.profiles p
      where p.global_role='platform_admin' and p.status='active'
    loop
      insert into public.notifications(
        recipient_user_id, notification_type, category, severity, title, body,
        action_type, action_payload, source_event_type, source_event_id,
        dedupe_key, data
      ) values (
        v_admin.id,
        'system_announcement','system','warning',
        'تباطؤ في خط تحليل العمليات',
        'تجاوز P95 لتحليل العمليات هدف 6 ثوانٍ خلال الساعة الأخيرة.',
        'none','{}'::jsonb,
        'operation_pipeline_slo',v_hour_bucket,
        'pipeline-watchdog:p95:'||v_hour_bucket,
        jsonb_build_object('p95_ms',round(v_p95::numeric,0),'target_ms',6000,'sample_operations',v_sample)
      ) on conflict (recipient_user_id,dedupe_key) do nothing;
    end loop;
  end if;

  v_result := jsonb_build_object(
    'ok',true,
    'checked_at',v_now,
    'stuck_operations',v_stuck,
    'failed_jobs',v_failed,
    'dead_letter_jobs',v_dead,
    'sample_operations',v_sample,
    'p95_ms',case when v_p95 is null then null else round(v_p95::numeric,0) end,
    'p95_breached',v_p95_breached
  );
  return v_result;
end;
$$;

revoke all on function private.run_operation_pipeline_watchdog() from public, anon, authenticated;
grant execute on function private.run_operation_pipeline_watchdog() to service_role;

comment on function private.run_operation_pipeline_watchdog() is
  'Automatic SANAD operation-pipeline watchdog: stuck >15s, failed/dead-letter analysis jobs, and rolling 1h P95 >6s; notifies platform admins through the canonical notifications table.';

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='sanad-operation-pipeline-watchdog-v1'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'sanad-operation-pipeline-watchdog-v1',
    '* * * * *',
    'select private.run_operation_pipeline_watchdog();'
  );
end;
$$;
