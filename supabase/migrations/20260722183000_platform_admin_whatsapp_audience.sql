-- Platform administration for WhatsApp-only SANAD users.
-- Keeps direct client access closed and exposes only audited admin RPCs.

create unique index if not exists sanad_whatsapp_contact_events_operation_event_uidx
  on public.sanad_whatsapp_contact_events (event_type, operation_id)
  where operation_id is not null;

create table if not exists public.sanad_whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  purpose text not null default 'install_app'
    check (purpose in ('install_app', 'service_update', 'transactional_notice')),
  template_name text not null check (template_name ~ '^[a-z0-9_]{1,512}$'),
  template_language text not null default 'ar' check (template_language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  template_parameters jsonb not null default '[]'::jsonb check (jsonb_typeof(template_parameters) = 'array'),
  audience_filter jsonb not null default '{}'::jsonb check (jsonb_typeof(audience_filter) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  total_recipients integer not null default 0 check (total_recipients >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  read_count integer not null default 0 check (read_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid not null references public.profiles(id),
  queued_by uuid references public.profiles(id),
  admin_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.sanad_whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sanad_whatsapp_campaigns(id) on delete cascade,
  contact_id uuid not null references public.sanad_whatsapp_contacts(id) on delete restrict,
  phone_normalized text not null check (phone_normalized ~ '^967[0-9]{9}$'),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  external_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists sanad_whatsapp_campaigns_status_created_idx
  on public.sanad_whatsapp_campaigns (status, created_at desc);
create index if not exists sanad_whatsapp_campaign_recipients_claim_idx
  on public.sanad_whatsapp_campaign_recipients (campaign_id, created_at)
  where status = 'pending';
create unique index if not exists sanad_whatsapp_campaign_recipients_message_uidx
  on public.sanad_whatsapp_campaign_recipients (external_message_id)
  where external_message_id is not null;
create index if not exists sanad_whatsapp_contacts_marketing_active_idx
  on public.sanad_whatsapp_contacts (registration_status, last_seen_at desc)
  where marketing_status = 'opted_in' and transactional_status = 'active';

alter table public.sanad_whatsapp_campaigns enable row level security;
alter table public.sanad_whatsapp_campaign_recipients enable row level security;
revoke all on table public.sanad_whatsapp_campaigns from public, anon, authenticated;
revoke all on table public.sanad_whatsapp_campaign_recipients from public, anon, authenticated;

comment on table public.sanad_whatsapp_campaigns is
  'Audited WhatsApp template campaigns. Marketing campaigns are limited to explicitly opted-in contacts.';
comment on table public.sanad_whatsapp_campaign_recipients is
  'Immutable campaign audience snapshot and per-recipient delivery state.';

-- Backfill the canonical audience from all historical WhatsApp operations.
with source_operations as (
  select
    regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g') as phone,
    (array_agg(nullif(trim(o.submitted_by_name), '') order by o.created_at desc)
      filter (where nullif(trim(o.submitted_by_name), '') is not null))[1] as display_name,
    min(o.created_at) as first_seen_at,
    max(o.created_at) as last_seen_at
  from public.operations o
  where (o.source = 'whatsapp' or o.upload_origin = 'whatsapp')
  group by regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g')
)
insert into public.sanad_whatsapp_contacts (
  phone_normalized, wa_id, display_name, first_seen_at, last_seen_at,
  first_operation_at, last_operation_at, acquisition_source, metadata
)
select phone, phone, display_name, first_seen_at, last_seen_at,
       first_seen_at, last_seen_at, 'whatsapp', jsonb_build_object('historical_backfill', true)
from source_operations
where phone ~ '^967[0-9]{9}$'
on conflict (phone_normalized) do update
set display_name = coalesce(public.sanad_whatsapp_contacts.display_name, excluded.display_name),
    first_seen_at = least(public.sanad_whatsapp_contacts.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.sanad_whatsapp_contacts.last_seen_at, excluded.last_seen_at),
    first_operation_at = least(coalesce(public.sanad_whatsapp_contacts.first_operation_at, excluded.first_operation_at), excluded.first_operation_at),
    last_operation_at = greatest(coalesce(public.sanad_whatsapp_contacts.last_operation_at, excluded.last_operation_at), excluded.last_operation_at),
    metadata = public.sanad_whatsapp_contacts.metadata || jsonb_build_object('historical_backfill', true),
    updated_at = now();

insert into public.sanad_whatsapp_contact_events (
  contact_id, event_type, external_message_id, operation_id, occurred_at, metadata
)
select c.id, 'supported_message_received',
       nullif(o.storage_metadata->>'meta_message_id', ''), o.id, o.created_at,
       jsonb_build_object('message_type', coalesce(o.storage_metadata->>'whatsapp_message_type', 'historical_media'), 'supported', true, 'historical_backfill', true)
from public.operations o
join public.sanad_whatsapp_contacts c
  on c.phone_normalized = regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g')
where o.source = 'whatsapp' or o.upload_origin = 'whatsapp'
on conflict do nothing;

insert into public.sanad_whatsapp_contact_events (
  contact_id, event_type, external_message_id, operation_id, occurred_at, metadata
)
select c.id, 'operation_created',
       nullif(o.storage_metadata->>'meta_message_id', ''), o.id, o.created_at,
       jsonb_build_object('source', 'whatsapp', 'historical_backfill', true)
from public.operations o
join public.sanad_whatsapp_contacts c
  on c.phone_normalized = regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g')
where o.source = 'whatsapp' or o.upload_origin = 'whatsapp'
on conflict do nothing;

with counters as (
  select c.id,
    count(*) filter (where e.event_type in ('supported_message_received', 'unsupported_message_received'))::integer as messages_count,
    count(*) filter (where e.event_type = 'supported_message_received')::integer as supported_count,
    count(*) filter (where e.event_type = 'operation_created')::integer as operations_count,
    min(e.occurred_at) filter (where e.event_type = 'operation_created') as first_operation_at,
    max(e.occurred_at) filter (where e.event_type = 'operation_created') as last_operation_at
  from public.sanad_whatsapp_contacts c
  left join public.sanad_whatsapp_contact_events e on e.contact_id = c.id
  group by c.id
)
update public.sanad_whatsapp_contacts c
set messages_count = x.messages_count,
    supported_messages_count = x.supported_count,
    operations_count = x.operations_count,
    first_operation_at = x.first_operation_at,
    last_operation_at = x.last_operation_at,
    updated_at = now()
from counters x
where x.id = c.id;

update public.sanad_whatsapp_contacts c
set linked_user_id = p.id,
    registration_status = case
      when exists (
        select 1 from public.user_subscriptions s
        where s.user_id = p.id and s.status = 'active'
          and (s.current_period_end is null or s.current_period_end > now())
      ) then 'pro_user'
      else 'registered'
    end,
    onboarding_status = 'registered',
    updated_at = now()
from public.profiles p
where c.linked_user_id is null
  and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = c.phone_normalized;

create or replace function public.platform_admin_get_whatsapp_overview(
  p_limit integer default 75,
  p_search text default null,
  p_registration_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 75), 1), 150);
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_registration text := nullif(trim(coalesce(p_registration_status, '')), '');
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'stats', jsonb_build_object(
      'contacts', (select count(*) from public.sanad_whatsapp_contacts),
      'whatsapp_only', (select count(*) from public.sanad_whatsapp_contacts where registration_status = 'whatsapp_only'),
      'registered', (select count(*) from public.sanad_whatsapp_contacts where linked_user_id is not null),
      'marketing_opted_in', (select count(*) from public.sanad_whatsapp_contacts where marketing_status = 'opted_in' and transactional_status = 'active'),
      'messages', (select coalesce(sum(messages_count), 0) from public.sanad_whatsapp_contacts),
      'operations', (select coalesce(sum(operations_count), 0) from public.sanad_whatsapp_contacts),
      'active_30d', (select count(*) from public.sanad_whatsapp_contacts where last_seen_at >= now() - interval '30 days')
    ),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_seen_at desc)
      from (
        select c.id, c.phone_normalized, c.display_name, c.linked_user_id,
               c.registration_status, c.onboarding_status, c.transactional_status,
               c.marketing_status, c.first_seen_at, c.last_seen_at,
               c.first_operation_at, c.last_operation_at, c.messages_count,
               c.supported_messages_count, c.operations_count, c.blocked_at,
               p.full_name as linked_user_name
        from public.sanad_whatsapp_contacts c
        left join public.profiles p on p.id = c.linked_user_id
        where (v_registration is null or c.registration_status = v_registration)
          and (v_search is null
            or lower(coalesce(c.display_name, '')) like '%' || v_search || '%'
            or c.phone_normalized like '%' || regexp_replace(v_search, '[^0-9]', '', 'g') || '%'
            or lower(coalesce(p.full_name, '')) like '%' || v_search || '%')
        order by c.last_seen_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select c.id, c.name, c.purpose, c.template_name, c.template_language,
               c.template_parameters, c.audience_filter, c.status,
               c.total_recipients, c.pending_count, c.sent_count,
               c.delivered_count, c.read_count, c.failed_count,
               c.admin_reason, c.created_at, c.queued_at, c.started_at, c.completed_at,
               p.full_name as created_by_name
        from public.sanad_whatsapp_campaigns c
        left join public.profiles p on p.id = c.created_by
        order by c.created_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.platform_admin_get_whatsapp_contact_details(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_contact public.sanad_whatsapp_contacts%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  select * into v_contact from public.sanad_whatsapp_contacts where id = p_contact_id;
  if not found then raise exception 'whatsapp_contact_not_found'; end if;
  return jsonb_build_object(
    'contact', to_jsonb(v_contact),
    'events', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
      from (
        select e.id, e.event_type, e.external_message_id, e.operation_id,
               e.occurred_at, e.metadata
        from public.sanad_whatsapp_contact_events e
        where e.contact_id = p_contact_id
        order by e.occurred_at desc limit 100
      ) x
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.platform_admin_set_whatsapp_contact_status(
  p_contact_id uuid,
  p_transactional_status text default null,
  p_marketing_status text default null,
  p_reason text default null,
  p_consent_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.sanad_whatsapp_contacts%rowtype;
  v_after public.sanad_whatsapp_contacts%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;
  if p_transactional_status is not null and p_transactional_status not in ('active', 'blocked') then raise exception 'invalid_transactional_status'; end if;
  if p_marketing_status is not null and p_marketing_status not in ('unknown', 'opted_in', 'opted_out') then raise exception 'invalid_marketing_status'; end if;
  if p_marketing_status = 'opted_in' and length(trim(coalesce(p_consent_source, ''))) < 3 then raise exception 'consent_source_required'; end if;

  select * into v_before from public.sanad_whatsapp_contacts where id = p_contact_id for update;
  if not found then raise exception 'whatsapp_contact_not_found'; end if;

  update public.sanad_whatsapp_contacts
  set transactional_status = coalesce(p_transactional_status, transactional_status),
      marketing_status = coalesce(p_marketing_status, marketing_status),
      registration_status = case
        when coalesce(p_transactional_status, transactional_status) = 'blocked' then 'blocked'
        when registration_status = 'blocked' and linked_user_id is not null then 'registered'
        when registration_status = 'blocked' then 'whatsapp_only'
        else registration_status end,
      blocked_at = case when coalesce(p_transactional_status, transactional_status) = 'blocked' then now() else null end,
      metadata = metadata || case when p_marketing_status is not null then jsonb_build_object(
        'marketing_consent_source', nullif(trim(p_consent_source), ''),
        'marketing_status_updated_at', now(), 'marketing_status_updated_by', auth.uid()
      ) else '{}'::jsonb end,
      updated_at = now()
  where id = p_contact_id returning * into v_after;

  insert into public.sanad_whatsapp_contact_events (contact_id, event_type, metadata)
  values (p_contact_id, 'admin_status_changed', jsonb_build_object(
    'transactional_status', v_after.transactional_status,
    'marketing_status', v_after.marketing_status,
    'reason', trim(p_reason), 'actor_user_id', auth.uid(),
    'consent_source', nullif(trim(p_consent_source), '')
  ));
  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data, after_data)
  values (auth.uid(), 'whatsapp_contact_status_changed', 'whatsapp_contact', p_contact_id::text,
          trim(p_reason), to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$function$;

create or replace function public.platform_admin_create_whatsapp_campaign(
  p_name text,
  p_purpose text,
  p_template_name text,
  p_template_language text default 'ar',
  p_template_parameters jsonb default '[]'::jsonb,
  p_audience_filter jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'campaign_name_required'; end if;
  if p_purpose not in ('install_app', 'service_update', 'transactional_notice') then raise exception 'invalid_campaign_purpose'; end if;
  if trim(coalesce(p_template_name, '')) !~ '^[a-z0-9_]{1,512}$' then raise exception 'invalid_meta_template_name'; end if;
  if jsonb_typeof(coalesce(p_template_parameters, '[]'::jsonb)) <> 'array' then raise exception 'invalid_template_parameters'; end if;
  if jsonb_typeof(coalesce(p_audience_filter, '{}'::jsonb)) <> 'object' then raise exception 'invalid_audience_filter'; end if;
  insert into public.sanad_whatsapp_campaigns
    (name, purpose, template_name, template_language, template_parameters, audience_filter, created_by)
  values (trim(p_name), p_purpose, trim(p_template_name), coalesce(nullif(trim(p_template_language), ''), 'ar'),
          coalesce(p_template_parameters, '[]'::jsonb), coalesce(p_audience_filter, '{}'::jsonb), auth.uid())
  returning id into v_id;
  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, after_data)
  values (auth.uid(), 'whatsapp_campaign_created', 'whatsapp_campaign', v_id::text,
          'إنشاء مسودة حملة واتساب', jsonb_build_object('name', trim(p_name), 'purpose', p_purpose, 'template_name', trim(p_template_name)));
  return v_id;
end;
$function$;

create or replace function public.platform_admin_queue_whatsapp_campaign(p_campaign_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign public.sanad_whatsapp_campaigns%rowtype;
  v_count integer;
  v_registration text;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;
  select * into v_campaign from public.sanad_whatsapp_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'whatsapp_campaign_not_found'; end if;
  if v_campaign.status <> 'draft' then raise exception 'campaign_not_draft'; end if;
  v_registration := nullif(trim(v_campaign.audience_filter->>'registration_status'), '');

  insert into public.sanad_whatsapp_campaign_recipients (campaign_id, contact_id, phone_normalized)
  select v_campaign.id, c.id, c.phone_normalized
  from public.sanad_whatsapp_contacts c
  where c.transactional_status = 'active'
    and c.marketing_status = 'opted_in'
    and (v_registration is null or c.registration_status = v_registration)
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'no_opted_in_recipients'; end if;

  update public.sanad_whatsapp_campaigns
  set status = 'queued', total_recipients = v_count, pending_count = v_count,
      queued_by = auth.uid(), admin_reason = trim(p_reason), queued_at = now(), updated_at = now()
  where id = p_campaign_id returning * into v_campaign;
  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, after_data)
  values (auth.uid(), 'whatsapp_campaign_queued', 'whatsapp_campaign', p_campaign_id::text,
          trim(p_reason), jsonb_build_object('recipients', v_count, 'template_name', v_campaign.template_name));
  return jsonb_build_object('campaign_id', p_campaign_id, 'status', 'queued', 'recipient_count', v_count);
end;
$function$;

create or replace function public.platform_admin_cancel_whatsapp_campaign(p_campaign_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_campaign public.sanad_whatsapp_campaigns%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'admin_reason_required'; end if;
  select * into v_campaign from public.sanad_whatsapp_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'whatsapp_campaign_not_found'; end if;
  if v_campaign.status not in ('draft', 'queued', 'processing') then raise exception 'campaign_not_cancellable'; end if;
  update public.sanad_whatsapp_campaign_recipients set status = 'skipped', updated_at = now()
  where campaign_id = p_campaign_id and status = 'pending';
  update public.sanad_whatsapp_campaigns set status = 'cancelled', pending_count = 0,
    admin_reason = trim(p_reason), completed_at = now(), updated_at = now()
  where id = p_campaign_id;
  insert into public.platform_admin_audit_log
    (actor_user_id, action, target_type, target_id, reason, before_data)
  values (auth.uid(), 'whatsapp_campaign_cancelled', 'whatsapp_campaign', p_campaign_id::text, trim(p_reason), to_jsonb(v_campaign));
  return jsonb_build_object('campaign_id', p_campaign_id, 'status', 'cancelled');
end;
$function$;

create or replace function public.claim_whatsapp_campaign_batch(p_campaign_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_result jsonb;
begin
  update public.sanad_whatsapp_campaign_recipients
  set status = 'pending', claimed_at = null, updated_at = now()
  where campaign_id = p_campaign_id and status = 'sending' and claimed_at < now() - interval '10 minutes';

  with claimed as (
    select r.id
    from public.sanad_whatsapp_campaign_recipients r
    join public.sanad_whatsapp_campaigns c on c.id = r.campaign_id
    join public.sanad_whatsapp_contacts contact on contact.id = r.contact_id
    where r.campaign_id = p_campaign_id and r.status = 'pending'
      and c.status in ('queued', 'processing')
      and contact.transactional_status = 'active' and contact.marketing_status = 'opted_in'
    order by r.created_at
    for update of r skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), updated as (
    update public.sanad_whatsapp_campaign_recipients r
    set status = 'sending', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
    from claimed where r.id = claimed.id
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_id', u.id, 'campaign_id', u.campaign_id, 'contact_id', u.contact_id,
    'phone', u.phone_normalized, 'template_name', c.template_name,
    'template_language', c.template_language, 'template_parameters', c.template_parameters
  )), '[]'::jsonb) into v_result
  from updated u join public.sanad_whatsapp_campaigns c on c.id = u.campaign_id;

  update public.sanad_whatsapp_campaigns set status = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_campaign_id and jsonb_array_length(v_result) > 0 and status = 'queued';
  return v_result;
end;
$function$;

create or replace function public.mark_whatsapp_campaign_recipient_result(
  p_recipient_id uuid,
  p_status text,
  p_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_campaign_id uuid; v_contact_id uuid;
begin
  if p_status not in ('sent', 'failed', 'skipped') then raise exception 'invalid_campaign_recipient_result'; end if;
  update public.sanad_whatsapp_campaign_recipients
  set status = p_status, external_message_id = coalesce(nullif(trim(p_message_id), ''), external_message_id),
      last_error = nullif(trim(p_error), ''), sent_at = case when p_status = 'sent' then now() else sent_at end,
      failed_at = case when p_status = 'failed' then now() else failed_at end, updated_at = now()
  where id = p_recipient_id and status = 'sending'
  returning campaign_id, contact_id into v_campaign_id, v_contact_id;
  if not found then raise exception 'campaign_recipient_not_claimed'; end if;
  insert into public.sanad_whatsapp_contact_events (contact_id, event_type, external_message_id, metadata)
  values (v_contact_id, 'campaign_' || p_status, nullif(trim(p_message_id), ''),
          jsonb_build_object('campaign_id', v_campaign_id, 'error', nullif(trim(p_error), '')))
  on conflict do nothing;
  perform public.refresh_whatsapp_campaign_counts(v_campaign_id);
  return jsonb_build_object('recipient_id', p_recipient_id, 'status', p_status, 'campaign_id', v_campaign_id);
end;
$function$;

create or replace function public.refresh_whatsapp_campaign_counts(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_pending integer; v_sending integer;
begin
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'sending')
  into v_pending, v_sending from public.sanad_whatsapp_campaign_recipients where campaign_id = p_campaign_id;
  update public.sanad_whatsapp_campaigns c
  set pending_count = v_pending + v_sending,
      sent_count = x.sent_count, delivered_count = x.delivered_count,
      read_count = x.read_count, failed_count = x.failed_count,
      status = case when v_pending + v_sending = 0 and c.status in ('queued', 'processing')
                    then case when x.failed_count = c.total_recipients then 'failed' else 'completed' end
                    else c.status end,
      completed_at = case when v_pending + v_sending = 0 then coalesce(c.completed_at, now()) else c.completed_at end,
      updated_at = now()
  from (
    select count(*) filter (where status in ('sent','delivered','read'))::integer as sent_count,
           count(*) filter (where status in ('delivered','read'))::integer as delivered_count,
           count(*) filter (where status = 'read')::integer as read_count,
           count(*) filter (where status = 'failed')::integer as failed_count
    from public.sanad_whatsapp_campaign_recipients where campaign_id = p_campaign_id
  ) x where c.id = p_campaign_id;
end;
$function$;

create or replace function public.apply_whatsapp_campaign_delivery_status(
  p_message_id text,
  p_status text,
  p_event_at timestamptz default now(),
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_recipient public.sanad_whatsapp_campaign_recipients%rowtype; v_status text := lower(trim(coalesce(p_status,'')));
begin
  if v_status not in ('sent','delivered','read','failed') then raise exception 'invalid_delivery_status'; end if;
  select * into v_recipient from public.sanad_whatsapp_campaign_recipients where external_message_id = p_message_id for update;
  if not found then return jsonb_build_object('matched', false); end if;
  update public.sanad_whatsapp_campaign_recipients
  set status = case
        when status = 'read' then 'read'
        when status = 'delivered' and v_status = 'sent' then 'delivered'
        else v_status end,
      sent_at = case when v_status = 'sent' then coalesce(sent_at, p_event_at) else sent_at end,
      delivered_at = case when v_status = 'delivered' then coalesce(delivered_at, p_event_at) else delivered_at end,
      read_at = case when v_status = 'read' then coalesce(read_at, p_event_at) else read_at end,
      failed_at = case when v_status = 'failed' then coalesce(failed_at, p_event_at) else failed_at end,
      last_error = case when v_status = 'failed' then concat_ws(': ', nullif(p_error_code,''), nullif(p_error_message,'')) else last_error end,
      updated_at = now()
  where id = v_recipient.id;
  perform public.refresh_whatsapp_campaign_counts(v_recipient.campaign_id);
  return jsonb_build_object('matched', true, 'recipient_id', v_recipient.id, 'campaign_id', v_recipient.campaign_id, 'status', v_status);
end;
$function$;

revoke all on function public.platform_admin_get_whatsapp_overview(integer,text,text) from public, anon;
revoke all on function public.platform_admin_get_whatsapp_contact_details(uuid) from public, anon;
revoke all on function public.platform_admin_set_whatsapp_contact_status(uuid,text,text,text,text) from public, anon;
revoke all on function public.platform_admin_create_whatsapp_campaign(text,text,text,text,jsonb,jsonb) from public, anon;
revoke all on function public.platform_admin_queue_whatsapp_campaign(uuid,text) from public, anon;
revoke all on function public.platform_admin_cancel_whatsapp_campaign(uuid,text) from public, anon;
grant execute on function public.platform_admin_get_whatsapp_overview(integer,text,text) to authenticated;
grant execute on function public.platform_admin_get_whatsapp_contact_details(uuid) to authenticated;
grant execute on function public.platform_admin_set_whatsapp_contact_status(uuid,text,text,text,text) to authenticated;
grant execute on function public.platform_admin_create_whatsapp_campaign(text,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.platform_admin_queue_whatsapp_campaign(uuid,text) to authenticated;
grant execute on function public.platform_admin_cancel_whatsapp_campaign(uuid,text) to authenticated;

revoke all on function public.claim_whatsapp_campaign_batch(uuid,integer) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_campaign_recipient_result(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.refresh_whatsapp_campaign_counts(uuid) from public, anon, authenticated;
revoke all on function public.apply_whatsapp_campaign_delivery_status(text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_campaign_batch(uuid,integer) to service_role;
grant execute on function public.mark_whatsapp_campaign_recipient_result(uuid,text,text,text) to service_role;
grant execute on function public.refresh_whatsapp_campaign_counts(uuid) to service_role;
grant execute on function public.apply_whatsapp_campaign_delivery_status(text,text,timestamptz,text,text) to service_role;
