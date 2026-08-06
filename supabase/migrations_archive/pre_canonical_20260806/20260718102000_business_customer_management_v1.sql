-- Business customer management foundation.
-- Applied to production before the UI implementation and kept here as source of truth.

alter table public.business_customers
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists last_contacted_at timestamptz,
  add column if not exists contact_count integer not null default 0;

create table if not exists public.business_customer_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  customer_user_id uuid not null references public.profiles(id) on delete cascade,
  note_text text not null check (char_length(btrim(note_text)) between 1 and 2000),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_customer_communications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  customer_user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('in_app','whatsapp','manual')),
  communication_type text not null default 'message' check (communication_type in ('message','notification','offer','advertisement','follow_up')),
  title text,
  body text,
  delivery_status text not null default 'recorded' check (delivery_status in ('draft','queued','sent','delivered','opened','failed','recorded')),
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz
);

create index if not exists idx_business_customer_notes_customer_created
  on public.business_customer_notes (business_id, customer_user_id, created_at desc);
create index if not exists idx_business_customer_communications_customer_created
  on public.business_customer_communications (business_id, customer_user_id, created_at desc);
create index if not exists idx_business_customers_business_last_contacted
  on public.business_customers (business_id, last_contacted_at desc);

alter table public.business_customer_notes enable row level security;
alter table public.business_customer_communications enable row level security;

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
  if not exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then raise exception 'business_owner_required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'full_name', p.full_name,
    'phone', p.phone,
    'marketing_opt_in', bc.marketing_opt_in,
    'tags', bc.tags,
    'last_contacted_at', bc.last_contacted_at,
    'contact_count', bc.contact_count,
    'engagement_state', case
      when bc.created_at >= now() - interval '30 days' then 'new'
      when coalesce(bc.last_contacted_at, bc.created_at) < now() - interval '90 days' then 'inactive'
      else 'active'
    end
  ) order by coalesce(bc.last_contacted_at, bc.created_at) desc), '[]'::jsonb)
  into v_items
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.get_business_customer_detail(
  p_business_id uuid,
  p_customer_user_id uuid
)
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
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then raise exception 'business_owner_required'; end if;

  select jsonb_build_object(
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'full_name', p.full_name,
    'phone', p.phone,
    'marketing_opt_in', bc.marketing_opt_in,
    'tags', bc.tags,
    'last_contacted_at', bc.last_contacted_at,
    'contact_count', bc.contact_count
  ) into v_customer
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id and bc.user_id = p_customer_user_id;

  if v_customer is null then raise exception 'business_customer_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'note_text', n.note_text,
    'created_by_user_id', n.created_by_user_id,
    'created_by_name', p.full_name,
    'created_at', n.created_at,
    'updated_at', n.updated_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notes
  from public.business_customer_notes n
  left join public.profiles p on p.id = n.created_by_user_id
  where n.business_id = p_business_id and n.customer_user_id = p_customer_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'channel', c.channel,
    'communication_type', c.communication_type,
    'title', c.title,
    'body', c.body,
    'delivery_status', c.delivery_status,
    'created_at', c.created_at,
    'sent_at', c.sent_at,
    'opened_at', c.opened_at
  ) order by c.created_at desc), '[]'::jsonb)
  into v_communications
  from public.business_customer_communications c
  where c.business_id = p_business_id and c.customer_user_id = p_customer_user_id;

  return jsonb_build_object('customer', v_customer, 'notes', v_notes, 'communications', v_communications);
end;
$$;

create or replace function public.add_business_customer_note(
  p_business_id uuid,
  p_customer_user_id uuid,
  p_note_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then raise exception 'business_owner_required'; end if;
  if not exists (
    select 1 from public.business_customers bc
    where bc.business_id = p_business_id and bc.user_id = p_customer_user_id
  ) then raise exception 'business_customer_not_found'; end if;
  if p_note_text is null or char_length(btrim(p_note_text)) = 0 then raise exception 'note_text_required'; end if;

  insert into public.business_customer_notes (business_id, customer_user_id, note_text, created_by_user_id)
  values (p_business_id, p_customer_user_id, btrim(p_note_text), v_user_id)
  returning id into v_id;
  return v_id;
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
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_user_id or public.is_platform_admin(v_user_id))
  ) then raise exception 'business_owner_required'; end if;
  if not exists (
    select 1 from public.business_customers bc
    where bc.business_id = p_business_id and bc.user_id = p_customer_user_id
  ) then raise exception 'business_customer_not_found'; end if;
  if v_channel not in ('in_app','whatsapp','manual') then raise exception 'invalid_communication_channel'; end if;
  if v_type not in ('message','notification','offer','advertisement','follow_up') then raise exception 'invalid_communication_type'; end if;
  if v_status not in ('draft','queued','sent','delivered','opened','failed','recorded') then raise exception 'invalid_delivery_status'; end if;

  insert into public.business_customer_communications (
    business_id, customer_user_id, channel, communication_type, title, body,
    delivery_status, external_reference, metadata, created_by_user_id, sent_at
  ) values (
    p_business_id, p_customer_user_id, v_channel, v_type,
    nullif(btrim(p_title), ''), nullif(btrim(p_body), ''), v_status,
    nullif(btrim(p_external_reference), ''), coalesce(p_metadata, '{}'::jsonb),
    v_user_id, case when v_status in ('sent','delivered','opened','recorded') then now() else null end
  ) returning id into v_id;

  update public.business_customers
  set last_contacted_at = now(), contact_count = contact_count + 1, updated_at = now()
  where business_id = p_business_id and user_id = p_customer_user_id;

  return v_id;
end;
$$;

revoke all on function public.get_business_customer_detail(uuid, uuid) from public;
revoke all on function public.add_business_customer_note(uuid, uuid, text) from public;
revoke all on function public.record_business_customer_communication(uuid, uuid, text, text, text, text, text, text, jsonb) from public;

grant execute on function public.get_business_customer_detail(uuid, uuid) to authenticated;
grant execute on function public.add_business_customer_note(uuid, uuid, text) to authenticated;
grant execute on function public.record_business_customer_communication(uuid, uuid, text, text, text, text, text, text, jsonb) to authenticated;
