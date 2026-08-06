begin;

create schema if not exists private;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  category text not null,
  severity text not null default 'info',
  title text not null,
  body text not null,
  action_type text not null default 'none',
  action_payload jsonb not null default '{}'::jsonb,
  business_id uuid references public.business_profiles(id) on delete set null,
  operation_id uuid references public.operations(id) on delete set null,
  source_event_type text,
  source_event_id text,
  dedupe_key text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notifications_type_check check (
    notification_type in (
      'operation_received',
      'operation_analysis_completed',
      'operation_analysis_failed',
      'operation_needs_review',
      'operation_verified',
      'report_ready',
      'report_failed',
      'business_invitation_received',
      'business_invitation_accepted',
      'business_member_status_changed',
      'business_operation_linked',
      'business_review_approved',
      'business_review_rejected',
      'pro_payment_submitted',
      'pro_payment_approved',
      'pro_payment_rejected',
      'subscription_expiring',
      'subscription_expired',
      'system_announcement'
    )
  ),
  constraint notifications_category_check check (
    category in ('operations', 'reports', 'business', 'subscription', 'security', 'system')
  ),
  constraint notifications_severity_check check (
    severity in ('info', 'success', 'warning', 'error')
  ),
  constraint notifications_action_type_check check (
    action_type in (
      'none',
      'operation_details',
      'reports',
      'business_invitation',
      'business_manage',
      'business_team',
      'business_operations',
      'business_public_profile',
      'pro_payment',
      'subscription',
      'profile'
    )
  ),
  constraint notifications_type_length_check check (length(notification_type) between 1 and 100),
  constraint notifications_title_length_check check (length(title) between 1 and 160),
  constraint notifications_body_length_check check (length(body) between 1 and 1000),
  constraint notifications_dedupe_key_length_check check (length(dedupe_key) between 1 and 500),
  constraint notifications_source_event_type_length_check check (source_event_type is null or length(source_event_type) <= 100),
  constraint notifications_source_event_id_length_check check (source_event_id is null or length(source_event_id) <= 255),
  constraint notifications_action_payload_object_check check (jsonb_typeof(action_payload) = 'object'),
  constraint notifications_data_object_check check (jsonb_typeof(data) = 'object'),
  constraint notifications_expiry_check check (expires_at is null or expires_at > created_at)
);

create unique index if not exists uq_notifications_recipient_dedupe
  on public.notifications(recipient_user_id, dedupe_key);

create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_user_id, created_at desc, id desc);

create index if not exists idx_notifications_recipient_unread
  on public.notifications(recipient_user_id, created_at desc, id desc)
  where read_at is null and archived_at is null;

create index if not exists idx_notifications_recipient_category
  on public.notifications(recipient_user_id, category, created_at desc, id desc);

create index if not exists idx_notifications_operation
  on public.notifications(operation_id)
  where operation_id is not null;

create index if not exists idx_notifications_business
  on public.notifications(business_id)
  where business_id is not null;

create index if not exists idx_notifications_source_event
  on public.notifications(source_event_type, source_event_id)
  where source_event_id is not null;

drop trigger if exists trg_notifications_set_updated_at on public.notifications;
create trigger trg_notifications_set_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (recipient_user_id = (select auth.uid()));

revoke all on table public.notifications from anon;
revoke insert, update, delete on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;

create or replace function private.create_notification(
  p_recipient_user_id uuid,
  p_notification_type text,
  p_category text,
  p_severity text,
  p_title text,
  p_body text,
  p_action_type text default 'none',
  p_action_payload jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null,
  p_business_id uuid default null,
  p_operation_id uuid default null,
  p_source_event_type text default null,
  p_source_event_id text default null,
  p_dedupe_key text default null,
  p_data jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_created boolean := false;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id_required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_recipient_user_id
      and p.status = 'active'
  ) then
    raise exception 'recipient_not_found_or_inactive';
  end if;

  if p_notification_type is null or p_notification_type not in (
    'operation_received','operation_analysis_completed','operation_analysis_failed',
    'operation_needs_review','operation_verified','report_ready','report_failed',
    'business_invitation_received','business_invitation_accepted',
    'business_member_status_changed','business_operation_linked',
    'business_review_approved','business_review_rejected','pro_payment_submitted',
    'pro_payment_approved','pro_payment_rejected','subscription_expiring',
    'subscription_expired','system_announcement'
  ) then
    raise exception 'invalid_notification_type';
  end if;

  if p_category is null or p_category not in ('operations','reports','business','subscription','security','system') then
    raise exception 'invalid_notification_category';
  end if;

  if p_severity is null or p_severity not in ('info','success','warning','error') then
    raise exception 'invalid_notification_severity';
  end if;

  if p_action_type is null or p_action_type not in (
    'none','operation_details','reports','business_invitation','business_manage',
    'business_team','business_operations','business_public_profile','pro_payment',
    'subscription','profile'
  ) then
    raise exception 'invalid_notification_action_type';
  end if;

  if p_title is null or length(trim(p_title)) < 1 or length(p_title) > 160 then
    raise exception 'invalid_notification_title';
  end if;

  if p_body is null or length(trim(p_body)) < 1 or length(p_body) > 1000 then
    raise exception 'invalid_notification_body';
  end if;

  if p_dedupe_key is null or length(trim(p_dedupe_key)) < 1 or length(p_dedupe_key) > 500 then
    raise exception 'invalid_notification_dedupe_key';
  end if;

  if p_action_payload is null or jsonb_typeof(p_action_payload) <> 'object' then
    raise exception 'invalid_notification_action_payload';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_notification_data';
  end if;

  if p_source_event_type is not null and length(p_source_event_type) > 100 then
    raise exception 'source_event_type_too_long';
  end if;

  if p_source_event_id is not null and length(p_source_event_id) > 255 then
    raise exception 'source_event_id_too_long';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'invalid_notification_expiry';
  end if;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    notification_type,
    category,
    severity,
    title,
    body,
    action_type,
    action_payload,
    business_id,
    operation_id,
    source_event_type,
    source_event_id,
    dedupe_key,
    data,
    expires_at
  ) values (
    p_recipient_user_id,
    p_actor_user_id,
    p_notification_type,
    p_category,
    p_severity,
    trim(p_title),
    trim(p_body),
    p_action_type,
    p_action_payload,
    p_business_id,
    p_operation_id,
    p_source_event_type,
    p_source_event_id,
    trim(p_dedupe_key),
    p_data,
    p_expires_at
  )
  on conflict (recipient_user_id, dedupe_key) do nothing
  returning id into v_id;

  v_created := v_id is not null;

  if not v_created then
    select n.id into v_id
    from public.notifications n
    where n.recipient_user_id = p_recipient_user_id
      and n.dedupe_key = trim(p_dedupe_key)
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'notification_id', v_id,
    'deduplicated', not v_created
  );
end;
$$;

revoke all on function private.create_notification(
  uuid,text,text,text,text,text,text,jsonb,uuid,uuid,uuid,text,text,text,jsonb,timestamptz
) from public, anon, authenticated;
grant execute on function private.create_notification(
  uuid,text,text,text,text,text,text,jsonb,uuid,uuid,uuid,text,text,text,jsonb,timestamptz
) to service_role;

create or replace function public.service_create_notification(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  return private.create_notification(
    nullif(p_payload->>'recipient_user_id', '')::uuid,
    p_payload->>'notification_type',
    p_payload->>'category',
    coalesce(nullif(p_payload->>'severity', ''), 'info'),
    p_payload->>'title',
    p_payload->>'body',
    coalesce(nullif(p_payload->>'action_type', ''), 'none'),
    coalesce(p_payload->'action_payload', '{}'::jsonb),
    nullif(p_payload->>'actor_user_id', '')::uuid,
    nullif(p_payload->>'business_id', '')::uuid,
    nullif(p_payload->>'operation_id', '')::uuid,
    nullif(p_payload->>'source_event_type', ''),
    nullif(p_payload->>'source_event_id', ''),
    p_payload->>'dedupe_key',
    coalesce(p_payload->'data', '{}'::jsonb),
    nullif(p_payload->>'expires_at', '')::timestamptz
  );
end;
$$;

revoke all on function public.service_create_notification(jsonb) from public, anon, authenticated;
grant execute on function public.service_create_notification(jsonb) to service_role;

create or replace function public.get_my_notifications(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_unread_only boolean default false,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_items jsonb;
  v_has_more boolean := false;
  v_next_created_at timestamptz;
  v_next_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'invalid_notification_cursor';
  end if;

  if p_category is not null and p_category not in ('operations','reports','business','subscription','security','system') then
    raise exception 'invalid_notification_category';
  end if;

  with candidates as (
    select
      n.id,
      n.notification_type,
      n.category,
      n.severity,
      n.title,
      n.body,
      n.action_type,
      n.action_payload,
      n.business_id,
      n.operation_id,
      n.read_at,
      n.created_at
    from public.notifications n
    where n.recipient_user_id = v_user_id
      and n.archived_at is null
      and (n.expires_at is null or n.expires_at > now())
      and (not coalesce(p_unread_only, false) or n.read_at is null)
      and (p_category is null or n.category = p_category)
      and (
        p_before_created_at is null
        or (n.created_at, n.id) < (p_before_created_at, p_before_id)
      )
    order by n.created_at desc, n.id desc
    limit v_limit + 1
  ), numbered as (
    select c.*, row_number() over (order by c.created_at desc, c.id desc) as rn
    from candidates c
  ), page as (
    select * from numbered where rn <= v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'notification_type', p.notification_type,
      'category', p.category,
      'severity', p.severity,
      'title', p.title,
      'body', p.body,
      'action_type', p.action_type,
      'action_payload', p.action_payload,
      'business_id', p.business_id,
      'operation_id', p.operation_id,
      'read_at', p.read_at,
      'created_at', p.created_at
    ) order by p.created_at desc, p.id desc), '[]'::jsonb),
    exists(select 1 from numbered where rn = v_limit + 1),
    (select created_at from page order by created_at asc, id asc limit 1),
    (select id from page order by created_at asc, id asc limit 1)
  into v_items, v_has_more, v_next_created_at, v_next_id
  from page p;

  return jsonb_build_object(
    'items', v_items,
    'has_more', v_has_more,
    'next_cursor', case
      when v_has_more and v_next_id is not null then jsonb_build_object('created_at', v_next_created_at, 'id', v_next_id)
      else null
    end
  );
end;
$$;

create or replace function public.get_my_unread_notification_count()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::integer into v_count
  from public.notifications n
  where n.recipient_user_id = v_user_id
    and n.read_at is null
    and n.archived_at is null
    and (n.expires_at is null or n.expires_at > now());

  return v_count;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_read_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_user_id = v_user_id
  returning n.read_at into v_read_at;

  if v_read_at is null then
    return jsonb_build_object('ok', false, 'reason', 'notification_not_found');
  end if;

  return jsonb_build_object('ok', true, 'notification_id', p_notification_id, 'read_at', v_read_at);
end;
$$;

create or replace function public.mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications n
  set read_at = now()
  where n.recipient_user_id = v_user_id
    and n.read_at is null
    and n.archived_at is null
    and (n.expires_at is null or n.expires_at > now());

  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'affected_count', v_count);
end;
$$;

create or replace function public.archive_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_archived_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications n
  set
    archived_at = coalesce(n.archived_at, now()),
    read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_user_id = v_user_id
  returning n.archived_at into v_archived_at;

  if v_archived_at is null then
    return jsonb_build_object('ok', false, 'reason', 'notification_not_found');
  end if;

  return jsonb_build_object('ok', true, 'notification_id', p_notification_id, 'archived_at', v_archived_at);
end;
$$;

revoke all on function public.get_my_notifications(integer,timestamptz,uuid,boolean,text) from public, anon;
revoke all on function public.get_my_unread_notification_count() from public, anon;
revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
revoke all on function public.archive_notification(uuid) from public, anon;

grant execute on function public.get_my_notifications(integer,timestamptz,uuid,boolean,text) to authenticated;
grant execute on function public.get_my_unread_notification_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;;
