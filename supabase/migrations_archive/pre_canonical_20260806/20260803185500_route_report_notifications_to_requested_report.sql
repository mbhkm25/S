create or replace function private.report_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_type text;
  v_title text;
  v_body text;
  v_severity text := 'info';
  v_action_payload jsonb;
  v_report_token text;
begin
  v_action_payload := jsonb_build_object('report_request_id', new.id);

  if tg_op = 'INSERT' then
    v_type := 'report_requested';
    v_title := 'تم استلام طلب التقرير';
    v_body := 'تم استلام طلبك وسيُجهّز التقرير ثم يُرسل عبر واتساب.';
  elsif new.status is distinct from old.status and new.status in ('sent', 'completed') then
    v_type := 'report_ready';
    v_title := 'تقريرك جاهز';
    v_body := 'تم تجهيز التقرير وإرساله إلى رقم واتساب المحدد.';
    v_severity := 'success';

    if new.interactive_report_id is not null
       and coalesce(new.delivery_format, 'interactive') in ('interactive', 'both') then
      v_report_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.report_access_tokens(report_snapshot_id, token_hash, expires_at)
      values (
        new.interactive_report_id,
        encode(extensions.digest(v_report_token, 'sha256'), 'hex'),
        now() + interval '30 days'
      );
      v_action_payload := v_action_payload || jsonb_build_object('report_token', v_report_token);
    end if;
  elsif new.status is distinct from old.status and new.status = 'failed' then
    v_type := 'report_failed';
    v_title := 'تعذر تجهيز التقرير';
    v_body := 'تعذر إكمال التقرير. يمكنك إعادة المحاولة من قسم التقارير.';
    v_severity := 'warning';
  else
    return new;
  end if;

  insert into public.notifications(
    recipient_user_id, notification_type, category, severity, title, body,
    action_type, action_payload, business_id, source_event_type,
    source_event_id, dedupe_key, data
  )
  values (
    new.requested_by_user_id, v_type, 'reports', v_severity, v_title, v_body,
    'reports', v_action_payload, new.business_id, 'report_request',
    new.id::text, v_type || ':' || new.id::text,
    jsonb_build_object(
      'report_request_id', new.id,
      'report_title', coalesce(new.report_title, 'تقرير سند'),
      'status', new.status
    )
  )
  on conflict(recipient_user_id, dedupe_key) do update
  set action_type = excluded.action_type,
      action_payload = excluded.action_payload,
      data = excluded.data,
      updated_at = now();

  return new;
end;
$function$;

update public.notifications n
set action_payload = coalesce(n.action_payload, '{}'::jsonb)
  || jsonb_build_object('report_request_id', n.source_event_id::uuid),
    updated_at = now()
where n.source_event_type = 'report_request'
  and n.source_event_id ~* '^[0-9a-f-]{36}$'
  and n.notification_type in ('report_requested', 'report_ready', 'report_failed');

do $block$
declare
  v_row record;
  v_token text;
begin
  for v_row in
    select n.id as notification_id, r.interactive_report_id
    from public.notifications n
    join public.report_requests r on r.id::text = n.source_event_id
    where n.notification_type = 'report_ready'
      and n.source_event_type = 'report_request'
      and r.interactive_report_id is not null
      and coalesce(r.delivery_format, 'interactive') in ('interactive', 'both')
      and not (coalesce(n.action_payload, '{}'::jsonb) ? 'report_token')
  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.report_access_tokens(report_snapshot_id, token_hash, expires_at)
    values (
      v_row.interactive_report_id,
      encode(extensions.digest(v_token, 'sha256'), 'hex'),
      now() + interval '30 days'
    );

    update public.notifications
    set action_payload = coalesce(action_payload, '{}'::jsonb)
      || jsonb_build_object('report_token', v_token),
        updated_at = now()
    where id = v_row.notification_id;
  end loop;
end;
$block$;
