begin;

create table if not exists public.sanad_admin_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  body text not null,
  category text not null default 'system',
  severity text not null default 'info',
  channels text[] not null default array['in_app']::text[],
  audience_filter jsonb not null default '{}'::jsonb,
  action_type text not null default 'none',
  action_payload jsonb not null default '{}'::jsonb,
  whatsapp_template_name text,
  whatsapp_template_language text not null default 'ar',
  whatsapp_template_parameters jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  scheduled_at timestamptz,
  dispatched_at timestamptz,
  completed_at timestamptz,
  total_users integer not null default 0,
  total_whatsapp integer not null default 0,
  notification_count integer not null default 0,
  whatsapp_campaign_id uuid references public.sanad_whatsapp_campaigns(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  queued_by uuid references public.profiles(id),
  admin_reason text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_admin_campaigns_name_check check (char_length(trim(name)) between 3 and 160),
  constraint sanad_admin_campaigns_title_check check (char_length(trim(title)) between 1 and 160),
  constraint sanad_admin_campaigns_body_check check (char_length(trim(body)) between 1 and 1000),
  constraint sanad_admin_campaigns_category_check check (category in ('operations','reports','business','subscription','security','system')),
  constraint sanad_admin_campaigns_severity_check check (severity in ('info','success','warning','error')),
  constraint sanad_admin_campaigns_status_check check (status in ('draft','scheduled','dispatching','queued','completed','failed','cancelled')),
  constraint sanad_admin_campaigns_channels_check check (
    cardinality(channels) between 1 and 3
    and channels <@ array['in_app','push','whatsapp']::text[]
  ),
  constraint sanad_admin_campaigns_action_check check (action_type in ('none','reports','business_manage','business_team','business_operations','business_public_profile','pro_payment','subscription','profile'))
);

create table if not exists public.sanad_admin_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sanad_admin_campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  whatsapp_contact_id uuid references public.sanad_whatsapp_contacts(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  channels text[] not null default '{}'::text[],
  in_app_status text,
  whatsapp_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanad_admin_campaign_recipient_target_check check (user_id is not null or whatsapp_contact_id is not null),
  unique (campaign_id,user_id),
  unique (campaign_id,whatsapp_contact_id)
);

create index if not exists sanad_admin_campaigns_status_schedule_idx on public.sanad_admin_campaigns(status,scheduled_at);
create index if not exists sanad_admin_campaign_recipients_campaign_idx on public.sanad_admin_campaign_recipients(campaign_id);

alter table public.sanad_admin_campaigns enable row level security;
alter table public.sanad_admin_campaign_recipients enable row level security;
revoke all on public.sanad_admin_campaigns from anon, authenticated;
revoke all on public.sanad_admin_campaign_recipients from anon, authenticated;
grant all on public.sanad_admin_campaigns to service_role;
grant all on public.sanad_admin_campaign_recipients to service_role;

create or replace function private.admin_campaign_user_audience(p_filter jsonb)
returns table(user_id uuid)
language sql
security definer
set search_path = ''
as $$
  with filter as (
    select
      coalesce(nullif(trim(p_filter->>'mode'),''),'all_registered') as mode,
      nullif(trim(p_filter->>'governorate'),'') as governorate,
      coalesce((p_filter->>'subscription_expiring_days')::integer,0) as expiring_days,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_filter->'include_user_ids','[]'::jsonb)))::uuid[],array[]::uuid[]) as include_ids
  )
  select distinct p.id
  from public.profiles p cross join filter f
  where p.status='active'
    and (f.governorate is null or p.governorate=f.governorate)
    and (
      (f.mode='all_registered')
      or (f.mode='push_enabled' and exists(select 1 from public.push_subscriptions ps where ps.user_id=p.id and ps.is_active and ps.permission_state='granted'))
      or (f.mode='business_owners' and exists(select 1 from public.business_profiles b where b.owner_user_id=p.id))
      or (f.mode='pro_active' and exists(select 1 from public.user_subscriptions us where us.user_id=p.id and us.status='active' and (us.current_period_end is null or us.current_period_end>now())))
      or (f.mode='registered_whatsapp' and exists(select 1 from public.sanad_whatsapp_contacts c where c.linked_user_id=p.id and c.transactional_status='active'))
      or (f.mode='custom' and p.id=any(f.include_ids))
    )
    and (
      f.expiring_days<=0
      or exists(
        select 1 from public.user_subscriptions us
        where us.user_id=p.id and us.status='active' and us.current_period_end between now() and now()+make_interval(days=>f.expiring_days)
      )
    );
$$;

create or replace function private.admin_campaign_whatsapp_audience(p_filter jsonb)
returns table(contact_id uuid, linked_user_id uuid)
language sql
security definer
set search_path = ''
as $$
  with f as (select coalesce(nullif(trim(p_filter->>'mode'),''),'all_registered') mode),
  users as (select user_id from private.admin_campaign_user_audience(p_filter))
  select distinct c.id,c.linked_user_id
  from public.sanad_whatsapp_contacts c cross join f
  where c.transactional_status='active'
    and c.marketing_status='opted_in'
    and (
      (f.mode='whatsapp_only' and c.linked_user_id is null)
      or (f.mode='all_whatsapp_opted_in')
      or (c.linked_user_id in (select user_id from users))
    );
$$;

create or replace function public.platform_admin_preview_campaign_audience(p_filter jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_users integer; v_push integer; v_whatsapp integer; v_business integer; v_pro integer;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_filter,'{}'::jsonb))<>'object' then raise exception 'invalid_audience_filter'; end if;
  select count(*) into v_users from private.admin_campaign_user_audience(coalesce(p_filter,'{}'::jsonb));
  select count(distinct a.user_id) into v_push from private.admin_campaign_user_audience(coalesce(p_filter,'{}'::jsonb)) a join public.push_subscriptions ps on ps.user_id=a.user_id and ps.is_active and ps.permission_state='granted';
  select count(*) into v_whatsapp from private.admin_campaign_whatsapp_audience(coalesce(p_filter,'{}'::jsonb));
  select count(distinct a.user_id) into v_business from private.admin_campaign_user_audience(coalesce(p_filter,'{}'::jsonb)) a join public.business_profiles b on b.owner_user_id=a.user_id;
  select count(distinct a.user_id) into v_pro from private.admin_campaign_user_audience(coalesce(p_filter,'{}'::jsonb)) a join public.user_subscriptions us on us.user_id=a.user_id and us.status='active' and (us.current_period_end is null or us.current_period_end>now());
  return jsonb_build_object('users',v_users,'push_enabled',v_push,'whatsapp_opted_in',v_whatsapp,'business_owners',v_business,'pro_active',v_pro);
end;
$$;

create or replace function public.platform_admin_create_audience_campaign(p_payload jsonb,p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_channels text[]; v_template text;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then raise exception 'invalid_campaign_payload'; end if;
  v_channels:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'channels','[]'::jsonb))),array[]::text[]);
  if cardinality(v_channels)=0 or not(v_channels <@ array['in_app','push','whatsapp']::text[]) then raise exception 'invalid_campaign_channels'; end if;
  v_template:=nullif(trim(p_payload->>'whatsapp_template_name'),'');
  if 'whatsapp'=any(v_channels) and (v_template is null or v_template !~ '^[a-z0-9_]{1,512}$') then raise exception 'valid_whatsapp_template_required'; end if;
  insert into public.sanad_admin_campaigns(name,title,body,category,severity,channels,audience_filter,action_type,action_payload,whatsapp_template_name,whatsapp_template_language,whatsapp_template_parameters,created_by,admin_reason)
  values(trim(p_payload->>'name'),trim(p_payload->>'title'),trim(p_payload->>'body'),coalesce(nullif(p_payload->>'category',''),'system'),coalesce(nullif(p_payload->>'severity',''),'info'),v_channels,coalesce(p_payload->'audience_filter','{}'::jsonb),coalesce(nullif(p_payload->>'action_type',''),'none'),coalesce(p_payload->'action_payload','{}'::jsonb),v_template,coalesce(nullif(p_payload->>'whatsapp_template_language',''),'ar'),coalesce(p_payload->'whatsapp_template_parameters','[]'::jsonb),auth.uid(),trim(p_reason)) returning id into v_id;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_data) values(auth.uid(),'audience_campaign_created','admin_campaign',v_id::text,trim(p_reason),p_payload);
  return v_id;
end;
$$;

create or replace function private.dispatch_admin_campaign(p_campaign_id uuid,p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v public.sanad_admin_campaigns%rowtype; r record; v_notification jsonb; v_notification_count integer:=0; v_user_count integer:=0; v_wa_count integer:=0; v_wa_campaign uuid;
begin
  select * into v from public.sanad_admin_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'admin_campaign_not_found'; end if;
  if v.status not in ('draft','scheduled') then return jsonb_build_object('ok',false,'reason','campaign_not_dispatchable','status',v.status); end if;
  update public.sanad_admin_campaigns set status='dispatching',dispatched_at=now(),updated_at=now() where id=v.id;

  for r in select user_id from private.admin_campaign_user_audience(v.audience_filter) loop
    insert into public.sanad_admin_campaign_recipients(campaign_id,user_id,channels,in_app_status)
    values(v.id,r.user_id,v.channels,case when ('in_app'=any(v.channels) or 'push'=any(v.channels)) then 'pending' else null end)
    on conflict(campaign_id,user_id) do nothing;
    v_user_count:=v_user_count+1;
    if 'in_app'=any(v.channels) or 'push'=any(v.channels) then
      v_notification:=private.create_notification(r.user_id,'system_announcement',v.category,v.severity,v.title,v.body,v.action_type,v.action_payload,p_actor,null,null,'admin_campaign',v.id::text,'admin_campaign:'||v.id::text||':'||r.user_id::text,jsonb_build_object('campaign_id',v.id,'channels',v.channels),null);
      update public.sanad_admin_campaign_recipients set notification_id=nullif(v_notification->>'notification_id','')::uuid,in_app_status='created',updated_at=now() where campaign_id=v.id and user_id=r.user_id;
      v_notification_count:=v_notification_count+case when coalesce((v_notification->>'created')::boolean,false) then 1 else 0 end;
    end if;
  end loop;

  if 'whatsapp'=any(v.channels) then
    insert into public.sanad_whatsapp_campaigns(name,purpose,template_name,template_language,template_parameters,audience_filter,status,created_by,queued_by,admin_reason,queued_at)
    values(v.name,'service_update',v.whatsapp_template_name,v.whatsapp_template_language,v.whatsapp_template_parameters,v.audience_filter,'queued',v.created_by,coalesce(p_actor,v.created_by),coalesce(v.admin_reason,'حملة متعددة القنوات'),now()) returning id into v_wa_campaign;
    for r in select contact_id,linked_user_id from private.admin_campaign_whatsapp_audience(v.audience_filter) loop
      insert into public.sanad_admin_campaign_recipients(campaign_id,user_id,whatsapp_contact_id,channels,whatsapp_status)
      values(v.id,r.linked_user_id,r.contact_id,v.channels,'pending')
      on conflict(campaign_id,whatsapp_contact_id) do nothing;
      insert into public.sanad_whatsapp_campaign_recipients(campaign_id,contact_id,phone_normalized)
      select v_wa_campaign,c.id,c.phone_normalized from public.sanad_whatsapp_contacts c where c.id=r.contact_id
      on conflict(campaign_id,contact_id) do nothing;
      v_wa_count:=v_wa_count+1;
    end loop;
    update public.sanad_whatsapp_campaigns set total_recipients=v_wa_count,pending_count=v_wa_count,updated_at=now() where id=v_wa_campaign;
  end if;

  update public.sanad_admin_campaigns set status=case when v_wa_campaign is null then 'completed' else 'queued' end,total_users=v_user_count,total_whatsapp=v_wa_count,notification_count=v_notification_count,whatsapp_campaign_id=v_wa_campaign,completed_at=case when v_wa_campaign is null then now() else null end,updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'campaign_id',v.id,'status',case when v_wa_campaign is null then 'completed' else 'queued' end,'users',v_user_count,'notifications',v_notification_count,'whatsapp',v_wa_count,'whatsapp_campaign_id',v_wa_campaign);
exception when others then
  update public.sanad_admin_campaigns set status='failed',last_error=left(sqlerrm,1500),updated_at=now() where id=p_campaign_id;
  raise;
end;
$$;

create or replace function public.platform_admin_queue_audience_campaign(p_campaign_id uuid,p_scheduled_at timestamptz default null,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  if p_scheduled_at is not null and p_scheduled_at>now()+interval '1 minute' then
    update public.sanad_admin_campaigns set status='scheduled',scheduled_at=p_scheduled_at,queued_by=auth.uid(),admin_reason=trim(p_reason),updated_at=now() where id=p_campaign_id and status='draft';
    if not found then raise exception 'campaign_not_draft'; end if;
    insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_data) values(auth.uid(),'audience_campaign_scheduled','admin_campaign',p_campaign_id::text,trim(p_reason),jsonb_build_object('scheduled_at',p_scheduled_at));
    return jsonb_build_object('ok',true,'status','scheduled','scheduled_at',p_scheduled_at);
  end if;
  update public.sanad_admin_campaigns set queued_by=auth.uid(),admin_reason=trim(p_reason),updated_at=now() where id=p_campaign_id and status='draft';
  if not found then raise exception 'campaign_not_draft'; end if;
  return private.dispatch_admin_campaign(p_campaign_id,auth.uid());
end;
$$;

create or replace function private.dispatch_due_admin_campaigns()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_count integer:=0;
begin
  for r in select id from public.sanad_admin_campaigns where status='scheduled' and scheduled_at<=now() order by scheduled_at for update skip locked loop
    perform private.dispatch_admin_campaign(r.id,null); v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.platform_admin_cancel_audience_campaign(p_campaign_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  update public.sanad_admin_campaigns set status='cancelled',completed_at=now(),admin_reason=trim(p_reason),updated_at=now() where id=p_campaign_id and status in ('draft','scheduled','queued');
  if not found then raise exception 'campaign_not_cancellable'; end if;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason) values(auth.uid(),'audience_campaign_cancelled','admin_campaign',p_campaign_id::text,trim(p_reason));
end;
$$;

create or replace function public.platform_admin_get_audience_campaigns(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'generated_at',now(),
    'audience_modes',jsonb_build_array(
      jsonb_build_object('id','all_registered','label','جميع المستخدمين المسجلين'),
      jsonb_build_object('id','push_enabled','label','المستخدمون ذوو الإشعارات المفعلة'),
      jsonb_build_object('id','business_owners','label','مالكو الأنشطة التجارية'),
      jsonb_build_object('id','pro_active','label','مشتركو سند Pro النشطون'),
      jsonb_build_object('id','registered_whatsapp','label','المستخدمون المسجلون المرتبطون بواتساب'),
      jsonb_build_object('id','whatsapp_only','label','مستخدمو واتساب غير المسجلين'),
      jsonb_build_object('id','all_whatsapp_opted_in','label','كل جهات واتساب الموافقة')
    ),
    'campaigns',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select c.*,coalesce(w.sent_count,0) whatsapp_sent_count,coalesce(w.delivered_count,0) whatsapp_delivered_count,coalesce(w.read_count,0) whatsapp_read_count,coalesce(w.failed_count,0) whatsapp_failed_count from public.sanad_admin_campaigns c left join public.sanad_whatsapp_campaigns w on w.id=c.whatsapp_campaign_id order by c.created_at desc limit least(greatest(coalesce(p_limit,50),1),100)) x),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_admin_preview_campaign_audience(jsonb) from public,anon;
revoke all on function public.platform_admin_create_audience_campaign(jsonb,text) from public,anon;
revoke all on function public.platform_admin_queue_audience_campaign(uuid,timestamptz,text) from public,anon;
revoke all on function public.platform_admin_cancel_audience_campaign(uuid,text) from public,anon;
revoke all on function public.platform_admin_get_audience_campaigns(integer) from public,anon;
grant execute on function public.platform_admin_preview_campaign_audience(jsonb) to authenticated;
grant execute on function public.platform_admin_create_audience_campaign(jsonb,text) to authenticated;
grant execute on function public.platform_admin_queue_audience_campaign(uuid,timestamptz,text) to authenticated;
grant execute on function public.platform_admin_cancel_audience_campaign(uuid,text) to authenticated;
grant execute on function public.platform_admin_get_audience_campaigns(integer) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname='sanad-admin-campaign-dispatch';
select cron.schedule('sanad-admin-campaign-dispatch','*/2 * * * *',$$select private.dispatch_due_admin_campaigns();$$);

commit;
