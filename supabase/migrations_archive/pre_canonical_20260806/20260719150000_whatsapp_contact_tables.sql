create table if not exists public.sanad_whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text not null unique check (phone_normalized ~ '^967[0-9]{9}$'),
  wa_id text,
  display_name text,
  linked_user_id uuid,
  registration_status text not null default 'whatsapp_only' check (registration_status in ('whatsapp_only','registered','profile_completed','pro_user','blocked')),
  onboarding_status text not null default 'not_sent' check (onboarding_status in ('not_sent','queued','sent','failed','install_page_visited','registration_started','registered')),
  transactional_status text not null default 'active' check (transactional_status in ('active','blocked')),
  marketing_status text not null default 'unknown' check (marketing_status in ('unknown','opted_in','opted_out')),
  welcome_message_version integer not null default 1 check (welcome_message_version > 0),
  welcome_message_sent_at timestamptz,
  welcome_message_id text,
  welcome_last_error text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_operation_at timestamptz,
  last_operation_at timestamptz,
  messages_count integer not null default 0 check (messages_count >= 0),
  supported_messages_count integer not null default 0 check (supported_messages_count >= 0),
  operations_count integer not null default 0 check (operations_count >= 0),
  acquisition_source text not null default 'whatsapp',
  metadata jsonb not null default '{}'::jsonb,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanad_whatsapp_contacts_linked_user_id_idx on public.sanad_whatsapp_contacts(linked_user_id) where linked_user_id is not null;
create index if not exists sanad_whatsapp_contacts_last_seen_at_idx on public.sanad_whatsapp_contacts(last_seen_at desc);
create index if not exists sanad_whatsapp_contacts_registration_status_idx on public.sanad_whatsapp_contacts(registration_status, last_seen_at desc);

create table if not exists public.sanad_whatsapp_contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.sanad_whatsapp_contacts(id) on delete cascade,
  event_type text not null,
  external_message_id text,
  operation_id uuid references public.operations(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sanad_whatsapp_contact_events_message_event_uidx on public.sanad_whatsapp_contact_events(event_type, external_message_id) where external_message_id is not null;
create index if not exists sanad_whatsapp_contact_events_contact_time_idx on public.sanad_whatsapp_contact_events(contact_id, occurred_at desc);
create index if not exists sanad_whatsapp_contact_events_operation_idx on public.sanad_whatsapp_contact_events(operation_id) where operation_id is not null;

alter table public.sanad_whatsapp_contacts enable row level security;
alter table public.sanad_whatsapp_contact_events enable row level security;
revoke all on table public.sanad_whatsapp_contacts from anon, authenticated;
revoke all on table public.sanad_whatsapp_contact_events from anon, authenticated;

comment on table public.sanad_whatsapp_contacts is 'Canonical WhatsApp-only contact record; not an authentication account.';
comment on table public.sanad_whatsapp_contact_events is 'Append-only lifecycle events for WhatsApp contacts; direct client access is denied.';
