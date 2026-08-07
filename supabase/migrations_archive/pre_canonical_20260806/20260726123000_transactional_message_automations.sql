begin;

create table if not exists public.sanad_transactional_message_rules (
  event_type text primary key,
  display_name text not null,
  description text,
  enabled boolean not null default false,
  template_name text,
  template_language text not null default 'ar',
  parameter_keys jsonb not null default '[]'::jsonb,
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_transactional_rule_event_check check (event_type in (
    'report_requested','report_ready','report_failed',
    'pro_payment_submitted','pro_payment_approved','pro_payment_rejected',
    'subscription_expiring','subscription_expired'
  )),
  constraint sanad_transactional_rule_template_check check (
    template_name is null or template_name ~ '^[a-z0-9_]{1,512}$'
  ),
  constraint sanad_transactional_rule_parameters_check check (jsonb_typeof(parameter_keys)='array')
);

create table if not exists public.sanad_transactional_message_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null references public.sanad_transactional_message_rules(event_type),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  phone_normalized text not null,
  source_type text not null,
  source_id text not null,
  notification_id uuid references public.notifications(id) on delete set null,
  template_name text not null,
  template_language text not null default 'ar',
  template_parameters jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','delivered','read','failed','cancelled')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  external_message_id text,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_type,recipient_user_id,source_type,source_id)
);

create index if not exists sanad_transactional_outbox_claim_idx
  on public.sanad_transactional_message_outbox(status,next_attempt_at,created_at)
  where status in ('pending','failed');
create index if not exists sanad_transactional_outbox_external_idx
  on public.sanad_transactional_message_outbox(external_message_id)
  where external_message_id is not null;

alter table public.sanad_transactional_message_rules enable row level security;
alter table public.sanad_transactional_message_outbox enable row level security;
revoke all on public.sanad_transactional_message_rules from anon, authenticated;
revoke all on public.sanad_transactional_message_outbox from anon, authenticated;

insert into public.sanad_transactional_message_rules(event_type,display_name,description,parameter_keys)
values
 ('report_requested','تم استلام طلب التقرير','إشعار واتساب يؤكد استلام طلب التقرير.',jsonb_build_array('full_name','report_title')),
 ('report_ready','التقرير جاهز','رسالة متابعة عند اكتمال تجهيز التقرير وإرساله.',jsonb_build_array('full_name','report_title')),
 ('report_failed','تعذر تجهيز التقرير','رسالة خدمية عند فشل التقرير بعد المحاولات.',jsonb_build_array('full_name','report_title')),
 ('pro_payment_submitted','تم استلام طلب سند Pro','تأكيد استلام طلب الاشتراك أو التجديد.',jsonb_build_array('full_name')),
 ('pro_payment_approved','تم تفعيل سند Pro','تأكيد التفعيل مع تاريخ انتهاء الباقة.',jsonb_build_array('full_name','period_end')),
 ('pro_payment_rejected','تعذر اعتماد طلب سند Pro','إبلاغ المستخدم بتعذر اعتماد الطلب.',jsonb_build_array('full_name')),
 ('subscription_expiring','اشتراك سند Pro يقترب من الانتهاء','تنبيه قبل انتهاء الاشتراك بثلاثة أيام.',jsonb_build_array('full_name','period_end')),
 ('subscription_expired','انتهى اشتراك سند Pro','تنبيه انتهاء الاشتراك مع دعوة للتجديد.',jsonb_build_array('full_name'))
on conflict(event_type) do update set
 display_name=excluded.display_name,
 description=excluded.description;

create or replace function private.normalize_yemen_phone(p_phone text)
returns text language sql immutable set search_path='' as $$
  select case
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^967[0-9]{9}$' then regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^00967[0-9]{9}$' then substring(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') from 3)
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') ~ '^0?7[0-9]{8}$' then '967'||right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),9)
    else null end;
$$;

create or replace function private.render_transactional_parameters(
  p_keys jsonb,
  p_profile public.profiles,
  p_notification public.notifications
) returns jsonb
language plpgsql stable set search_path='' as $$
declare v_result jsonb := '[]'::jsonb; v_key text; v_value text;
begin
  for v_key in select jsonb_array_elements_text(coalesce(p_keys,'[]'::jsonb)) loop
    v_value := case v_key
      when 'full_name' then coalesce(nullif(trim(p_profile.full_name),''),'عميل سند')
      when 'title' then p_notification.title
      when 'body' then p_notification.body
      when 'period_end' then coalesce(to_char(nullif(p_notification.data->>'ends_at','')::timestamptz at time zone 'Asia/Aden','YYYY-MM-DD'),to_char(nullif(p_notification.data->>'ended_at','')::timestamptz at time zone 'Asia/Aden','YYYY-MM-DD'),'—')
      when 'report_title' then coalesce(nullif(p_notification.data->>'report_title',''),p_notification.title)
      else coalesce(p_notification.data->>v_key,'—') end;
    v_result := v_result || jsonb_build_array(coalesce(v_value,'—'));
  end loop;
  return v_result;
exception when others then
  return '[]'::jsonb;
end;
$$;

create or replace function private.enqueue_transactional_message_from_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_rule public.sanad_transactional_message_rules%rowtype; v_profile public.profiles%rowtype; v_phone text; v_contact_status text;
begin
  select * into v_rule from public.sanad_transactional_message_rules where event_type=new.notification_type and enabled=true;
  if not found or v_rule.template_name is null then return new; end if;
  select * into v_profile from public.profiles where id=new.recipient_user_id and status='active';
  if not found then return new; end if;
  v_phone := private.normalize_yemen_phone(v_profile.phone);
  if v_phone is null then return new; end if;
  select transactional_status into v_contact_status from public.sanad_whatsapp_contacts where phone_normalized=v_phone limit 1;
  if coalesce(v_contact_status,'active') <> 'active' then return new; end if;

  insert into public.sanad_transactional_message_outbox(
    event_type,recipient_user_id,phone_normalized,source_type,source_id,notification_id,
    template_name,template_language,template_parameters,payload,max_attempts
  ) values (
    new.notification_type,new.recipient_user_id,v_phone,coalesce(new.source_event_type,'notification'),
    coalesce(new.source_event_id,new.id::text),new.id,v_rule.template_name,v_rule.template_language,
    private.render_transactional_parameters(v_rule.parameter_keys,v_profile,new),
    jsonb_build_object('title',new.title,'body',new.body,'data',new.data),v_rule.max_attempts
  ) on conflict(event_type,recipient_user_id,source_type,source_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notifications_transactional_whatsapp on public.notifications;
create trigger trg_notifications_transactional_whatsapp
after insert on public.notifications for each row
when (new.notification_type in ('report_requested','report_ready','report_failed','pro_payment_submitted','pro_payment_approved','pro_payment_rejected','subscription_expiring','subscription_expired'))
execute function private.enqueue_transactional_message_from_notification();

create or replace function private.report_request_notifications()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text; v_title text; v_body text; v_severity text := 'info';
begin
  if tg_op='INSERT' then
    v_type:='report_requested'; v_title:='تم استلام طلب التقرير'; v_body:='تم استلام طلبك وسيُجهّز التقرير ثم يُرسل عبر واتساب.';
  elsif new.status is distinct from old.status and new.status in ('sent','completed') then
    v_type:='report_ready'; v_title:='تقريرك جاهز'; v_body:='تم تجهيز التقرير وإرساله إلى رقم واتساب المحدد.'; v_severity:='success';
  elsif new.status is distinct from old.status and new.status='failed' then
    v_type:='report_failed'; v_title:='تعذر تجهيز التقرير'; v_body:='تعذر إكمال التقرير. يمكنك إعادة المحاولة من قسم التقارير.'; v_severity:='warning';
  else return new; end if;

  insert into public.notifications(recipient_user_id,notification_type,category,severity,title,body,action_type,action_payload,
    business_id,source_event_type,source_event_id,dedupe_key,data)
  values(new.requested_by_user_id,v_type,'reports',v_severity,v_title,v_body,'reports','{}'::jsonb,new.business_id,
    'report_request',new.id::text,v_type||':'||new.id::text,
    jsonb_build_object('report_request_id',new.id,'report_title',coalesce(new.report_title,'تقرير سند'),'status',new.status))
  on conflict(recipient_user_id,dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_report_request_notifications on public.report_requests;
create trigger trg_report_request_notifications
after insert or update of status on public.report_requests
for each row execute function private.report_request_notifications();

create or replace function public.claim_transactional_message_batch(p_limit integer default 25)
returns table(id uuid,phone text,template_name text,template_language text,template_parameters jsonb)
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  return query
  with candidates as (
    select o.id from public.sanad_transactional_message_outbox o
    where o.status in ('pending','failed') and o.next_attempt_at<=now() and o.attempt_count<o.max_attempts
    order by o.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.sanad_transactional_message_outbox o set status='processing',claimed_at=now(),attempt_count=o.attempt_count+1,updated_at=now()
    from candidates c where o.id=c.id returning o.*
  ) select c.id,c.phone_normalized,c.template_name,c.template_language,c.template_parameters from claimed c;
end;
$$;

create or replace function public.mark_transactional_message_result(p_id uuid,p_status text,p_message_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_attempt integer; v_max integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select attempt_count,max_attempts into v_attempt,v_max from public.sanad_transactional_message_outbox where id=p_id for update;
  if not found then raise exception 'message_not_found'; end if;
  if p_status='sent' then
    update public.sanad_transactional_message_outbox set status='sent',external_message_id=p_message_id,sent_at=now(),last_error=null,updated_at=now() where id=p_id;
  else
    update public.sanad_transactional_message_outbox set status=case when v_attempt>=v_max then 'failed' else 'pending' end,
      next_attempt_at=now()+make_interval(mins=>least(60,power(2,greatest(v_attempt,1))::integer)),
      last_error=left(coalesce(p_error,'unknown_error'),1000),failed_at=case when v_attempt>=v_max then now() else failed_at end,updated_at=now() where id=p_id;
  end if;
end;
$$;

create or replace function public.apply_transactional_whatsapp_delivery_status(p_message_id text,p_status text,p_event_at timestamptz default now(),p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_status text:=lower(trim(coalesce(p_status,''))); v_count integer;
begin
  update public.sanad_transactional_message_outbox set
    status=case when v_status in ('delivered','read','failed') then v_status else status end,
    delivered_at=case when v_status='delivered' then coalesce(delivered_at,p_event_at,now()) else delivered_at end,
    read_at=case when v_status='read' then coalesce(read_at,p_event_at,now()) else read_at end,
    failed_at=case when v_status='failed' then coalesce(failed_at,p_event_at,now()) else failed_at end,
    last_error=case when v_status='failed' then left(coalesce(p_error,last_error),1000) else last_error end,
    updated_at=now()
  where external_message_id=p_message_id;
  get diagnostics v_count=row_count; return v_count>0;
end;
$$;

create or replace function public.platform_admin_get_transactional_messages(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.event_type),'[]'::jsonb) from public.sanad_transactional_message_rules r),
    'stats',jsonb_build_object(
      'pending',(select count(*) from public.sanad_transactional_message_outbox where status='pending'),
      'processing',(select count(*) from public.sanad_transactional_message_outbox where status='processing'),
      'sent',(select count(*) from public.sanad_transactional_message_outbox where status in ('sent','delivered','read')),
      'failed',(select count(*) from public.sanad_transactional_message_outbox where status='failed')
    ),
    'messages',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
      select o.*,p.full_name from public.sanad_transactional_message_outbox o left join public.profiles p on p.id=o.recipient_user_id
      order by o.created_at desc limit greatest(1,least(coalesce(p_limit,100),300))
    ) x)
  );
end;
$$;

create or replace function public.platform_admin_update_transactional_message_rule(p_event_type text,p_enabled boolean,p_template_name text,p_template_language text,p_parameter_keys jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  if p_enabled and trim(coalesce(p_template_name,'')) !~ '^[a-z0-9_]{1,512}$' then raise exception 'approved_template_required'; end if;
  if jsonb_typeof(coalesce(p_parameter_keys,'[]'::jsonb))<>'array' then raise exception 'invalid_parameter_keys'; end if;
  select to_jsonb(r) into v_before from public.sanad_transactional_message_rules r where event_type=p_event_type for update;
  if not found then raise exception 'rule_not_found'; end if;
  update public.sanad_transactional_message_rules set enabled=coalesce(p_enabled,false),template_name=nullif(trim(p_template_name),''),
    template_language=coalesce(nullif(trim(p_template_language),''),'ar'),parameter_keys=coalesce(p_parameter_keys,'[]'::jsonb),updated_by=auth.uid(),updated_at=now()
  where event_type=p_event_type returning to_jsonb(sanad_transactional_message_rules) into v_after;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'transactional_message_rule_updated','transactional_message_rule',p_event_type,trim(p_reason),v_before,v_after);
end;
$$;

create or replace function public.platform_admin_retry_transactional_message(p_message_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  update public.sanad_transactional_message_outbox set status='pending',attempt_count=0,next_attempt_at=now(),claimed_at=null,last_error=null,updated_at=now()
  where id=p_message_id and status='failed';
  if not found then raise exception 'failed_message_not_found'; end if;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason)
  values(auth.uid(),'transactional_message_retried','transactional_message',p_message_id::text,trim(p_reason));
end;
$$;

revoke all on function public.claim_transactional_message_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_transactional_message_batch(integer) to service_role;
revoke all on function public.mark_transactional_message_result(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mark_transactional_message_result(uuid,text,text,text) to service_role;
revoke all on function public.platform_admin_get_transactional_messages(integer) from public,anon;
grant execute on function public.platform_admin_get_transactional_messages(integer) to authenticated;
revoke all on function public.platform_admin_update_transactional_message_rule(text,boolean,text,text,jsonb,text) from public,anon;
grant execute on function public.platform_admin_update_transactional_message_rule(text,boolean,text,text,jsonb,text) to authenticated;
revoke all on function public.platform_admin_retry_transactional_message(uuid,text) from public,anon;
grant execute on function public.platform_admin_retry_transactional_message(uuid,text) to authenticated;

commit;
