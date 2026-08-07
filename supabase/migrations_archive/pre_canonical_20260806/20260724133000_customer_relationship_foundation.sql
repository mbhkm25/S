-- Customer relationship lifecycle foundation
-- Gives customers control over their relationship and communication preferences,
-- while preserving an auditable history for business management.

alter table public.business_customers
  drop constraint if exists business_customers_status_check;

alter table public.business_customers
  add constraint business_customers_status_check
  check (status in (
    'active',
    'paused_by_customer',
    'left_by_customer',
    'removed_by_business',
    'blocked_by_business'
  ));

alter table public.business_customers
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists end_reason_code text,
  add column if not exists end_reason_text text,
  add column if not exists in_app_notifications_enabled boolean not null default true,
  add column if not exists whatsapp_service_enabled boolean not null default true,
  add column if not exists whatsapp_marketing_enabled boolean not null default false,
  add column if not exists preferences_updated_at timestamptz;

alter table public.business_customers
  drop constraint if exists business_customers_end_reason_text_check;
alter table public.business_customers
  add constraint business_customers_end_reason_text_check
  check (end_reason_text is null or char_length(btrim(end_reason_text)) <= 500);

create index if not exists idx_business_customers_user_relationship
  on public.business_customers(user_id, status, updated_at desc);

create table if not exists public.business_customer_relationship_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  customer_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'joined',
    'reactivated',
    'paused_by_customer',
    'left_by_customer',
    'removed_by_business',
    'blocked_by_business',
    'preferences_updated'
  )),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer','business','platform','system')),
  previous_status text,
  new_status text,
  reason_code text,
  reason_text text check (reason_text is null or char_length(btrim(reason_text)) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_business_customer_relationship_events_customer
  on public.business_customer_relationship_events(business_id, customer_user_id, created_at desc);

alter table public.business_customer_relationship_events enable row level security;

drop policy if exists business_customer_relationship_events_select_context
  on public.business_customer_relationship_events;
create policy business_customer_relationship_events_select_context
  on public.business_customer_relationship_events
  for select to authenticated
  using (
    customer_user_id = auth.uid()
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = business_id and bp.owner_user_id = auth.uid()
    )
    or public.is_platform_admin(auth.uid())
  );

create or replace function public.can_access_business_customers(
  p_business_id uuid,
  p_required_permission text default 'customers.view'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_profiles bp
    where bp.id = p_business_id
      and bp.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.business_team_members tm
    where tm.business_id = p_business_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and (
        tm.membership_role in ('owner','manager')
        or coalesce((tm.permissions ->> p_required_permission)::boolean, false)
        or coalesce((tm.permissions ->> 'customers.manage')::boolean, false)
      )
  )
  or public.is_platform_admin(auth.uid());
$$;

revoke all on function public.can_access_business_customers(uuid,text) from public;
grant execute on function public.can_access_business_customers(uuid,text) to authenticated;

create or replace function public.join_business_as_customer(
  p_business_id uuid,
  p_source text default 'profile'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business public.business_profiles%rowtype;
  v_existing public.business_customers%rowtype;
  v_customer public.business_customers%rowtype;
  v_source text := coalesce(p_source, 'profile');
  v_event text := 'joined';
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_source not in ('profile','community','qr','invite','manual_request','public_profile') then v_source := 'profile'; end if;

  select * into v_business
  from public.business_profiles
  where id = p_business_id and public_status = 'published';
  if not found then raise exception 'business_not_published'; end if;

  select * into v_existing
  from public.business_customers
  where business_id = p_business_id and user_id = v_user_id;

  if found and v_existing.status = 'blocked_by_business' then
    raise exception 'customer_blocked_by_business';
  end if;

  if found and v_existing.status = 'removed_by_business' then
    raise exception 'business_rejoin_approval_required';
  end if;

  if found then v_event := 'reactivated'; end if;

  insert into public.business_customers (
    business_id, user_id, status, source,
    ended_at, ended_by_user_id, end_reason_code, end_reason_text
  ) values (
    p_business_id, v_user_id, 'active', v_source,
    null, null, null, null
  )
  on conflict (business_id, user_id) do update set
    status = 'active',
    source = excluded.source,
    ended_at = null,
    ended_by_user_id = null,
    end_reason_code = null,
    end_reason_text = null,
    updated_at = now()
  returning * into v_customer;

  insert into public.business_customer_relationship_events (
    business_id, customer_user_id, event_type, actor_user_id, actor_role,
    previous_status, new_status, metadata
  ) values (
    p_business_id, v_user_id, v_event, v_user_id, 'customer',
    v_existing.status, 'active', jsonb_build_object('source', v_source)
  );

  return jsonb_build_object('ok', true, 'customer', to_jsonb(v_customer));
end;
$$;

create or replace function public.get_my_business_relationship_detail(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select jsonb_build_object(
    'relationship', jsonb_build_object(
      'id', bc.id,
      'business_id', bc.business_id,
      'status', bc.status,
      'source', bc.source,
      'joined_at', bc.created_at,
      'updated_at', bc.updated_at,
      'ended_at', bc.ended_at,
      'end_reason_code', bc.end_reason_code,
      'in_app_notifications_enabled', bc.in_app_notifications_enabled,
      'whatsapp_service_enabled', bc.whatsapp_service_enabled,
      'whatsapp_marketing_enabled', bc.whatsapp_marketing_enabled,
      'preferences_updated_at', bc.preferences_updated_at
    ),
    'business', jsonb_build_object(
      'id', bp.id,
      'name', bp.name,
      'slug', bp.slug,
      'whatsapp', bp.whatsapp,
      'public_status', bp.public_status,
      'profile_image_path', bp.profile_image_path,
      'logo_path', bp.logo_path
    ),
    'data_scope', jsonb_build_object(
      'visible_to_business', jsonb_build_array(
        'اسمك في سند', 'رقم هاتفك المسجل', 'تاريخ ومصدر ارتباطك',
        'العمليات التي ربطتها بالنشاط', 'تفضيلات التواصل الخاصة بهذا النشاط'
      ),
      'not_visible_to_business', jsonb_build_array(
        'كلمة المرور ورموز الدخول', 'عملياتك لدى أنشطة أخرى',
        'ملاحظاتك الخاصة', 'ملفاتك غير المرتبطة بالنشاط'
      )
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'actor_role', e.actor_role,
        'previous_status', e.previous_status,
        'new_status', e.new_status,
        'reason_code', e.reason_code,
        'created_at', e.created_at
      ) order by e.created_at desc)
      from public.business_customer_relationship_events e
      where e.business_id = bc.business_id and e.customer_user_id = bc.user_id
    ), '[]'::jsonb)
  ) into v_result
  from public.business_customers bc
  join public.business_profiles bp on bp.id = bc.business_id
  where bc.business_id = p_business_id and bc.user_id = v_user_id;

  if v_result is null then raise exception 'business_relationship_not_found'; end if;
  return v_result;
end;
$$;

create or replace function public.update_my_business_contact_preferences(
  p_business_id uuid,
  p_in_app_notifications_enabled boolean,
  p_whatsapp_service_enabled boolean,
  p_whatsapp_marketing_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer public.business_customers%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  update public.business_customers
  set in_app_notifications_enabled = coalesce(p_in_app_notifications_enabled, in_app_notifications_enabled),
      whatsapp_service_enabled = coalesce(p_whatsapp_service_enabled, whatsapp_service_enabled),
      whatsapp_marketing_enabled = coalesce(p_whatsapp_marketing_enabled, whatsapp_marketing_enabled),
      marketing_opt_in = coalesce(p_whatsapp_marketing_enabled, whatsapp_marketing_enabled),
      preferences_updated_at = now(),
      updated_at = now()
  where business_id = p_business_id and user_id = v_user_id
  returning * into v_customer;

  if not found then raise exception 'business_relationship_not_found'; end if;

  insert into public.business_customer_relationship_events (
    business_id, customer_user_id, event_type, actor_user_id, actor_role,
    previous_status, new_status, metadata
  ) values (
    p_business_id, v_user_id, 'preferences_updated', v_user_id, 'customer',
    v_customer.status, v_customer.status,
    jsonb_build_object(
      'in_app_notifications_enabled', v_customer.in_app_notifications_enabled,
      'whatsapp_service_enabled', v_customer.whatsapp_service_enabled,
      'whatsapp_marketing_enabled', v_customer.whatsapp_marketing_enabled
    )
  );

  return jsonb_build_object('ok', true, 'relationship', to_jsonb(v_customer));
end;
$$;

create or replace function public.leave_business_as_customer(
  p_business_id uuid,
  p_reason_code text default null,
  p_reason_text text default null,
  p_disable_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous text;
  v_customer public.business_customers%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_reason_text is not null and char_length(btrim(p_reason_text)) > 500 then raise exception 'reason_too_long'; end if;

  select status into v_previous
  from public.business_customers
  where business_id = p_business_id and user_id = v_user_id
  for update;
  if not found then raise exception 'business_relationship_not_found'; end if;

  if p_disable_only then
    update public.business_customers
    set in_app_notifications_enabled = false,
        whatsapp_service_enabled = false,
        whatsapp_marketing_enabled = false,
        marketing_opt_in = false,
        preferences_updated_at = now(),
        updated_at = now()
    where business_id = p_business_id and user_id = v_user_id
    returning * into v_customer;

    insert into public.business_customer_relationship_events (
      business_id, customer_user_id, event_type, actor_user_id, actor_role,
      previous_status, new_status, reason_code, reason_text, metadata
    ) values (
      p_business_id, v_user_id, 'preferences_updated', v_user_id, 'customer',
      v_previous, v_previous, p_reason_code, nullif(btrim(p_reason_text), ''),
      '{"all_communications_disabled":true}'::jsonb
    );
  else
    update public.business_customers
    set status = 'left_by_customer',
        ended_at = now(),
        ended_by_user_id = v_user_id,
        end_reason_code = nullif(btrim(p_reason_code), ''),
        end_reason_text = nullif(btrim(p_reason_text), ''),
        marketing_opt_in = false,
        whatsapp_marketing_enabled = false,
        updated_at = now()
    where business_id = p_business_id and user_id = v_user_id
    returning * into v_customer;

    insert into public.business_customer_relationship_events (
      business_id, customer_user_id, event_type, actor_user_id, actor_role,
      previous_status, new_status, reason_code, reason_text
    ) values (
      p_business_id, v_user_id, 'left_by_customer', v_user_id, 'customer',
      v_previous, 'left_by_customer', p_reason_code, nullif(btrim(p_reason_text), '')
    );
  end if;

  return jsonb_build_object('ok', true, 'relationship', to_jsonb(v_customer));
end;
$$;

create or replace function public.update_business_customer_relationship_status(
  p_business_id uuid,
  p_customer_user_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous text;
  v_next text;
  v_event text;
  v_actor_role text := 'business';
  v_customer public.business_customers%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.can_access_business_customers(p_business_id, 'customers.manage') then raise exception 'business_customer_manage_required'; end if;
  if p_reason is not null and char_length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;

  select status into v_previous
  from public.business_customers
  where business_id = p_business_id and user_id = p_customer_user_id
  for update;
  if not found then raise exception 'business_customer_not_found'; end if;

  case lower(coalesce(p_action,''))
    when 'remove' then v_next := 'removed_by_business'; v_event := 'removed_by_business';
    when 'block' then v_next := 'blocked_by_business'; v_event := 'blocked_by_business';
    when 'reactivate' then v_next := 'active'; v_event := 'reactivated';
    else raise exception 'invalid_customer_relationship_action';
  end case;

  if public.is_platform_admin(v_user_id) then v_actor_role := 'platform'; end if;

  update public.business_customers
  set status = v_next,
      ended_at = case when v_next = 'active' then null else now() end,
      ended_by_user_id = case when v_next = 'active' then null else v_user_id end,
      end_reason_text = case when v_next = 'active' then null else nullif(btrim(p_reason), '') end,
      end_reason_code = case when v_next = 'active' then null else p_action end,
      marketing_opt_in = case when v_next = 'active' then marketing_opt_in else false end,
      whatsapp_marketing_enabled = case when v_next = 'active' then whatsapp_marketing_enabled else false end,
      updated_at = now()
  where business_id = p_business_id and user_id = p_customer_user_id
  returning * into v_customer;

  insert into public.business_customer_relationship_events (
    business_id, customer_user_id, event_type, actor_user_id, actor_role,
    previous_status, new_status, reason_code, reason_text
  ) values (
    p_business_id, p_customer_user_id, v_event, v_user_id, v_actor_role,
    v_previous, v_next, p_action, nullif(btrim(p_reason), '')
  );

  return jsonb_build_object('ok', true, 'relationship', to_jsonb(v_customer));
end;
$$;

create or replace function public.get_business_customers(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.can_access_business_customers(p_business_id, 'customers.view') then raise exception 'business_customer_view_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'ended_at', bc.ended_at,
    'full_name', p.full_name,
    'phone', p.phone,
    'marketing_opt_in', bc.marketing_opt_in,
    'in_app_notifications_enabled', bc.in_app_notifications_enabled,
    'whatsapp_service_enabled', bc.whatsapp_service_enabled,
    'whatsapp_marketing_enabled', bc.whatsapp_marketing_enabled,
    'tags', bc.tags,
    'last_contacted_at', bc.last_contacted_at,
    'contact_count', bc.contact_count,
    'engagement_state', case
      when bc.created_at >= now() - interval '30 days' then 'new'
      when coalesce(bc.last_contacted_at, bc.created_at) < now() - interval '90 days' then 'not_contacted_recently'
      else 'contacted_recently'
    end
  ) order by
      case when bc.status = 'active' then 0 else 1 end,
      coalesce(bc.last_contacted_at, bc.created_at) desc), '[]'::jsonb)
  into v_items
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.get_business_customer_detail(p_business_id uuid, p_customer_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer jsonb;
  v_notes jsonb;
  v_communications jsonb;
  v_events jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.can_access_business_customers(p_business_id, 'customers.view') then raise exception 'business_customer_view_required'; end if;

  select jsonb_build_object(
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'ended_at', bc.ended_at,
    'end_reason_code', bc.end_reason_code,
    'end_reason_text', bc.end_reason_text,
    'full_name', p.full_name,
    'phone', p.phone,
    'marketing_opt_in', bc.marketing_opt_in,
    'in_app_notifications_enabled', bc.in_app_notifications_enabled,
    'whatsapp_service_enabled', bc.whatsapp_service_enabled,
    'whatsapp_marketing_enabled', bc.whatsapp_marketing_enabled,
    'tags', bc.tags,
    'last_contacted_at', bc.last_contacted_at,
    'contact_count', bc.contact_count
  ) into v_customer
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id and bc.user_id = p_customer_user_id;

  if v_customer is null then raise exception 'business_customer_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'note_text', n.note_text,
    'created_by_user_id', n.created_by_user_id,
    'created_by_name', p.full_name,
    'created_at', n.created_at, 'updated_at', n.updated_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notes
  from public.business_customer_notes n
  left join public.profiles p on p.id = n.created_by_user_id
  where n.business_id = p_business_id and n.customer_user_id = p_customer_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'channel', c.channel,
    'communication_type', c.communication_type,
    'title', c.title, 'body', c.body,
    'delivery_status', c.delivery_status,
    'created_at', c.created_at, 'sent_at', c.sent_at, 'opened_at', c.opened_at
  ) order by c.created_at desc), '[]'::jsonb)
  into v_communications
  from public.business_customer_communications c
  where c.business_id = p_business_id and c.customer_user_id = p_customer_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'event_type', e.event_type,
    'actor_role', e.actor_role,
    'previous_status', e.previous_status,
    'new_status', e.new_status,
    'reason_code', e.reason_code,
    'reason_text', e.reason_text,
    'created_at', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from public.business_customer_relationship_events e
  where e.business_id = p_business_id and e.customer_user_id = p_customer_user_id;

  return jsonb_build_object(
    'customer', v_customer,
    'notes', v_notes,
    'communications', v_communications,
    'relationship_events', v_events
  );
end;
$$;

create or replace function public.record_business_customer_communication(
  p_business_id uuid,
  p_customer_user_id uuid,
  p_channel text,
  p_communication_type text,
  p_title text default null,
  p_body text default null,
  p_delivery_status text default 'recorded',
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_channel text := lower(coalesce(p_channel, ''));
  v_type text := lower(coalesce(p_communication_type, ''));
  v_status text := lower(coalesce(p_delivery_status, 'recorded'));
  v_counts_as_contact boolean := false;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.can_access_business_customers(p_business_id, 'customers.contact') then raise exception 'business_customer_contact_required'; end if;
  if not exists (
    select 1 from public.business_customers bc
    where bc.business_id = p_business_id and bc.user_id = p_customer_user_id and bc.status = 'active'
  ) then raise exception 'active_business_customer_required'; end if;
  if v_channel not in ('in_app','whatsapp','manual') then raise exception 'invalid_communication_channel'; end if;
  if v_type not in ('message','notification','offer','advertisement','follow_up','whatsapp_opened') then raise exception 'invalid_communication_type'; end if;
  if v_status not in ('draft','queued','sent','delivered','opened','failed','recorded') then raise exception 'invalid_delivery_status'; end if;

  v_counts_as_contact := v_type <> 'whatsapp_opened' and v_status in ('sent','delivered','opened','recorded');

  insert into public.business_customer_communications (
    business_id, customer_user_id, channel, communication_type,
    title, body, delivery_status, external_reference, metadata,
    created_by_user_id, sent_at
  ) values (
    p_business_id, p_customer_user_id, v_channel, v_type,
    nullif(btrim(p_title), ''), nullif(btrim(p_body), ''), v_status,
    nullif(btrim(p_external_reference), ''), coalesce(p_metadata, '{}'::jsonb),
    v_user_id,
    case when v_status in ('sent','delivered','opened','recorded') then now() else null end
  ) returning id into v_id;

  if v_counts_as_contact then
    update public.business_customers
    set last_contacted_at = now(), contact_count = contact_count + 1, updated_at = now()
    where business_id = p_business_id and user_id = p_customer_user_id;
  end if;

  return v_id;
end;
$$;

alter table public.business_customer_communications
  drop constraint if exists business_customer_communications_communication_type_check;
alter table public.business_customer_communications
  add constraint business_customer_communications_communication_type_check
  check (communication_type in ('message','notification','offer','advertisement','follow_up','whatsapp_opened'));

create or replace function public.get_user_business_contexts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owned jsonb;
  v_team jsonb;
  v_customers jsonb;
  v_invitations jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select coalesce(jsonb_agg(to_jsonb(bp) order by bp.created_at desc), '[]'::jsonb)
  into v_owned from public.business_profiles bp where bp.owner_user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', tm.id, 'status', tm.status,
    'membership_role', tm.membership_role, 'job_title', tm.job_title,
    'permissions', tm.permissions, 'label', coalesce(tm.job_title, tm.label),
    'business', jsonb_build_object(
      'id', bp.id, 'name', bp.name, 'slug', bp.slug,
      'category_id', bp.category_id, 'governorate', bp.governorate,
      'city', bp.city, 'whatsapp', bp.whatsapp, 'description', bp.description,
      'logo_path', bp.logo_path, 'profile_image_path', bp.profile_image_path,
      'cover_image_path', bp.cover_image_path, 'public_status', bp.public_status,
      'verification_status', bp.verification_status,
      'whatsapp_catalog_url', bp.whatsapp_catalog_url
    )
  ) order by tm.created_at desc), '[]'::jsonb)
  into v_team
  from public.business_team_members tm
  join public.business_profiles bp on bp.id = tm.business_id
  where tm.user_id = v_user_id and tm.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id', bc.id,
    'status', bc.status,
    'source', bc.source,
    'joined_at', bc.created_at,
    'ended_at', bc.ended_at,
    'in_app_notifications_enabled', bc.in_app_notifications_enabled,
    'whatsapp_service_enabled', bc.whatsapp_service_enabled,
    'whatsapp_marketing_enabled', bc.whatsapp_marketing_enabled,
    'business', jsonb_build_object(
      'id', bp.id, 'name', bp.name, 'slug', bp.slug,
      'category_id', bp.category_id, 'governorate', bp.governorate,
      'city', bp.city, 'whatsapp', bp.whatsapp, 'description', bp.description,
      'logo_path', bp.logo_path, 'profile_image_path', bp.profile_image_path,
      'cover_image_path', bp.cover_image_path,
      'gallery_paths', coalesce(bp.gallery_paths, '[]'::jsonb),
      'working_hours', coalesce(bp.working_hours, '{}'::jsonb),
      'contact_links', coalesce(bp.contact_links, '{}'::jsonb),
      'public_status', bp.public_status,
      'verification_status', bp.verification_status,
      'whatsapp_catalog_url', bp.whatsapp_catalog_url,
      'profile_sections', jsonb_build_object(
        'services', coalesce(bp.profile_sections->'services', '[]'::jsonb),
        'financial_accounts', coalesce(bp.profile_sections->'financial_accounts', '[]'::jsonb),
        'reviews', coalesce(bp.profile_sections->'reviews', '[]'::jsonb)
      )
    )
  ) order by bc.created_at desc), '[]'::jsonb)
  into v_customers
  from public.business_customers bc
  join public.business_profiles bp on bp.id = bc.business_id
  where bc.user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', bi.id, 'business_id', bi.business_id,
    'business_name', bp.name, 'invitation_type', bi.invitation_type,
    'status', bi.status, 'label', bi.label, 'token', bi.token,
    'created_at', bi.created_at, 'expires_at', bi.expires_at
  ) order by bi.created_at desc), '[]'::jsonb)
  into v_invitations
  from public.business_invitations bi
  join public.business_profiles bp on bp.id = bi.business_id
  left join public.profiles p on p.id = v_user_id
  where bi.status = 'pending' and bi.expires_at > now()
    and (bi.invited_user_id = v_user_id or bi.invited_phone = p.phone);

  return jsonb_build_object(
    'owned_businesses', v_owned,
    'team_businesses', v_team,
    'customer_businesses', v_customers,
    'pending_invitations', v_invitations
  );
end;
$$;

revoke all on function public.get_my_business_relationship_detail(uuid) from public;
revoke all on function public.update_my_business_contact_preferences(uuid,boolean,boolean,boolean) from public;
revoke all on function public.leave_business_as_customer(uuid,text,text,boolean) from public;
revoke all on function public.update_business_customer_relationship_status(uuid,uuid,text,text) from public;

grant execute on function public.get_my_business_relationship_detail(uuid) to authenticated;
grant execute on function public.update_my_business_contact_preferences(uuid,boolean,boolean,boolean) to authenticated;
grant execute on function public.leave_business_as_customer(uuid,text,text,boolean) to authenticated;
grant execute on function public.update_business_customer_relationship_status(uuid,uuid,text,text) to authenticated;
