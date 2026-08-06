-- Harden registration -> WhatsApp identity linking and assistant retry recovery.

alter table public.sanad_assistant_tool_executions
  drop constraint if exists sanad_assistant_tool_executions_output_check;

alter table public.sanad_assistant_tool_executions
  add constraint sanad_assistant_tool_executions_output_check
  check (jsonb_typeof(output) in ('object','array'));

create or replace function public.reconcile_pending_phone_from_whatsapp(
  p_phone text,
  p_wa_id text default null,
  p_display_name text default null,
  p_external_message_id text default null,
  p_message_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_candidate public.profiles%rowtype;
  v_claim public.phone_verification_claims%rowtype;
  v_count integer;
  v_conflict_user uuid;
begin
  if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;

  select user_id into v_conflict_user
  from public.verified_phone_identities
  where phone_normalized=v_phone
  limit 1;

  if v_conflict_user is null then
    select id into v_conflict_user from public.profiles where phone=v_phone limit 1;
  end if;

  if v_conflict_user is not null then
    update public.sanad_whatsapp_contacts
      set linked_user_id=v_conflict_user,
          registration_status='profile_completed',
          onboarding_status='registered',
          updated_at=now()
    where phone_normalized=v_phone;

    update public.sanad_assistant_conversations c
      set linked_user_id=v_conflict_user,updated_at=now()
    where c.contact_id in (
      select id from public.sanad_whatsapp_contacts where phone_normalized=v_phone
    );

    return jsonb_build_object('ok',true,'status','already_verified','user_id',v_conflict_user);
  end if;

  select count(*) into v_count
  from public.profiles
  where pending_phone=v_phone
    and status='active'
    and phone_verification_status in ('pending','unverified','expired');

  if v_count=0 then
    return jsonb_build_object('ok',true,'status','no_pending_account');
  end if;

  if v_count>1 then
    update public.phone_verification_claims
      set status='conflict',last_error='multiple_pending_accounts_for_phone',updated_at=now()
    where phone_normalized=v_phone
      and status in ('queued','sending','sent','failed','expired');
    return jsonb_build_object('ok',false,'status','ambiguous_pending_accounts','candidate_count',v_count);
  end if;

  select * into v_candidate
  from public.profiles
  where pending_phone=v_phone
    and status='active'
    and phone_verification_status in ('pending','unverified','expired')
  order by updated_at desc,created_at desc
  limit 1
  for update;

  select * into v_claim
  from public.phone_verification_claims
  where user_id=v_candidate.id
    and phone_normalized=v_phone
    and status not in ('rejected','conflict','cancelled','verified')
  order by created_at desc
  limit 1
  for update;

  update public.profiles
  set phone=v_phone,
      pending_phone=null,
      phone_verification_status='verified',
      phone_verified_at=coalesce(phone_verified_at,p_message_at,now()),
      phone_verification_updated_at=now(),
      profile_completed_at=coalesce(
        profile_completed_at,
        case when full_name is not null and governorate is not null then now() else null end
      ),
      updated_at=now()
  where id=v_candidate.id;

  insert into public.verified_phone_identities(
    phone_normalized,user_id,verified_at,verification_method,claim_id,metadata
  ) values (
    v_phone,v_candidate.id,coalesce(p_message_at,now()),'whatsapp_button',v_claim.id,
    jsonb_build_object(
      'source','whatsapp_inbound_auto_reconcile',
      'wa_id',p_wa_id,
      'display_name',p_display_name,
      'external_message_id',p_external_message_id
    )
  )
  on conflict(phone_normalized) do update
  set user_id=excluded.user_id,
      verified_at=excluded.verified_at,
      verification_method=excluded.verification_method,
      claim_id=coalesce(excluded.claim_id,public.verified_phone_identities.claim_id),
      metadata=public.verified_phone_identities.metadata||excluded.metadata,
      updated_at=now();

  update public.phone_verification_claims
  set status=case when id=v_claim.id then 'verified' else 'cancelled' end,
      verified_at=case when id=v_claim.id then coalesce(p_message_at,now()) else verified_at end,
      responded_at=case when id=v_claim.id then coalesce(p_message_at,now()) else responded_at end,
      response_message_id=case when id=v_claim.id then coalesce(p_external_message_id,response_message_id) else response_message_id end,
      last_error=case when id=v_claim.id then null else coalesce(last_error,'superseded_by_verified_claim') end,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reconciled_from_whatsapp_at',now())
  where (user_id=v_candidate.id or phone_normalized=v_phone)
    and status in ('queued','sending','sent','failed','expired');

  update auth.users
  set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object(
        'phone',v_phone,'phone_verified',true,'profile_completed',true
      ),
      updated_at=now()
  where id=v_candidate.id;

  update public.sanad_whatsapp_contacts
  set linked_user_id=v_candidate.id,
      registration_status='profile_completed',
      onboarding_status='registered',
      transactional_status='active',
      blocked_at=null,
      updated_at=now()
  where phone_normalized=v_phone;

  update public.sanad_assistant_conversations c
  set linked_user_id=v_candidate.id,updated_at=now()
  where c.contact_id in (
    select id from public.sanad_whatsapp_contacts where phone_normalized=v_phone
  );

  return jsonb_build_object(
    'ok',true,'status','verified_from_inbound','user_id',v_candidate.id,'claim_id',v_claim.id
  );
end;
$$;

-- This wrapper is called by WhatsApp intake before contact registration.
-- Keep the original event-counting behavior while reconciling pending identity first.
create or replace function public.register_whatsapp_inbound(
  p_phone text,p_wa_id text,p_display_name text,p_message_id text,
  p_message_type text,p_supported boolean,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_contact_inserted boolean := false;
  v_event_inserted boolean := false;
  v_rows integer := 0;
  v_event_type text := case when coalesce(p_supported,false) then 'supported_message_received' else 'unsupported_message_received' end;
  v_linked_user_id uuid;
  v_reconcile jsonb;
begin
  if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;

  v_reconcile := public.reconcile_pending_phone_from_whatsapp(
    v_phone,p_wa_id,p_display_name,p_message_id,now()
  );

  select coalesce(v.user_id,p.id) into v_linked_user_id
  from (select v_phone phone) x
  left join public.verified_phone_identities v on v.phone_normalized=x.phone
  left join public.profiles p on p.phone=x.phone
  limit 1;

  insert into public.sanad_whatsapp_contacts(
    phone_normalized,wa_id,display_name,linked_user_id,
    registration_status,onboarding_status,metadata
  ) values (
    v_phone,nullif(trim(p_wa_id),''),nullif(trim(p_display_name),''),v_linked_user_id,
    case when v_linked_user_id is not null then 'profile_completed' else 'whatsapp_only' end,
    case when v_linked_user_id is not null then 'registered' else 'not_sent' end,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('identity_reconcile',coalesce(v_reconcile,'{}'::jsonb))
  )
  on conflict(phone_normalized) do nothing
  returning * into v_contact;

  if found then
    v_contact_inserted := true;
  else
    select * into v_contact
    from public.sanad_whatsapp_contacts
    where phone_normalized=v_phone
    for update;
  end if;

  insert into public.sanad_whatsapp_contact_events(
    contact_id,event_type,external_message_id,metadata
  ) values (
    v_contact.id,v_event_type,nullif(trim(p_message_id),''),
    jsonb_build_object(
      'message_type',nullif(trim(p_message_type),''),
      'supported',coalesce(p_supported,false)
    )||coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(event_type,external_message_id)
    where external_message_id is not null
  do nothing;

  get diagnostics v_rows=row_count;
  v_event_inserted := v_rows>0;

  update public.sanad_whatsapp_contacts
  set wa_id=coalesce(nullif(trim(p_wa_id),''),wa_id),
      display_name=coalesce(nullif(trim(p_display_name),''),display_name),
      linked_user_id=coalesce(v_linked_user_id,linked_user_id),
      registration_status=case when coalesce(v_linked_user_id,linked_user_id) is not null then 'profile_completed' else registration_status end,
      onboarding_status=case when coalesce(v_linked_user_id,linked_user_id) is not null then 'registered' else onboarding_status end,
      last_seen_at=case when v_event_inserted then now() else last_seen_at end,
      messages_count=messages_count+case when v_event_inserted then 1 else 0 end,
      supported_messages_count=supported_messages_count+case when v_event_inserted and coalesce(p_supported,false) then 1 else 0 end,
      metadata=metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('identity_reconcile',coalesce(v_reconcile,'{}'::jsonb)),
      updated_at=now()
  where id=v_contact.id
  returning * into v_contact;

  update public.sanad_assistant_conversations
  set linked_user_id=coalesce(linked_user_id,v_contact.linked_user_id),updated_at=now()
  where contact_id=v_contact.id;

  return jsonb_build_object(
    'contact_id',v_contact.id,
    'phone_normalized',v_contact.phone_normalized,
    'is_first_contact',v_contact_inserted,
    'is_duplicate_message',not v_event_inserted,
    'registration_status',v_contact.registration_status,
    'onboarding_status',v_contact.onboarding_status,
    'linked_user_id',v_contact.linked_user_id,
    'identity_reconcile',v_reconcile
  );
end;
$$;

create or replace function public.fail_sanad_assistant_message(
  p_message_id uuid,p_error_code text,p_error_message text,p_retryable boolean default true
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.sanad_assistant_messages
  set status=case when coalesce(p_retryable,false) and attempt_count<3 then 'queued' else 'failed' end,
      attempt_count=attempt_count+1,
      next_attempt_at=case when coalesce(p_retryable,false) and attempt_count<3
        then now()+make_interval(secs=>least(300,30*(attempt_count+1))) else null end,
      processing_started_at=null,
      error_code=left(coalesce(nullif(trim(p_error_code),''),'assistant_processing_failed'),200),
      error_message=left(coalesce(nullif(trim(p_error_message),''),'assistant processing failed'),2000),
      updated_at=now(),
      metadata=metadata||jsonb_build_object('last_failure_at',now(),'retryable',coalesce(p_retryable,false))
  where id=p_message_id and direction='inbound';
end;
$$;

create or replace function public.recover_stale_sanad_assistant_messages()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  update public.sanad_assistant_messages
  set status=case when attempt_count<3 then 'queued' else 'failed' end,
      attempt_count=attempt_count+1,
      next_attempt_at=case when attempt_count<3 then now() else null end,
      processing_started_at=null,
      error_code='assistant_worker_timeout',
      error_message='Recovered stale assistant processing lease',
      updated_at=now(),
      metadata=metadata||jsonb_build_object(
        'recovered_at',now(),
        'recovery_source','recover_stale_sanad_assistant_messages'
      )
  where direction='inbound'
    and status='processing'
    and processing_started_at<now()-interval '3 minutes';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create table if not exists private.sanad_internal_runtime_tokens(
  token_name text primary key,
  token_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.sanad_internal_runtime_tokens(token_name,token_value)
values('assistant_retry_dispatch',encode(gen_random_bytes(32),'hex'))
on conflict(token_name) do nothing;

create or replace function public.get_assistant_retry_dispatch_token()
returns text
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  return (
    select token_value
    from private.sanad_internal_runtime_tokens
    where token_name='assistant_retry_dispatch'
  );
end;
$$;

create or replace function public.claim_due_sanad_assistant_message()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  select id into v_id
  from public.sanad_assistant_messages
  where direction='inbound'
    and status='queued'
    and coalesce(next_attempt_at,now())<=now()
  order by created_at asc
  for update skip locked
  limit 1;
  return v_id;
end;
$$;

create or replace function private.dispatch_due_sanad_assistant_message()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare v_token text;v_request_id bigint;
begin
  select token_value into v_token
  from private.sanad_internal_runtime_tokens
  where token_name='assistant_retry_dispatch';

  if v_token is null then return null; end if;

  select net.http_post(
    url:='https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-v3-assistant-retry-worker',
    headers:=jsonb_build_object(
      'content-type','application/json',
      'x-sanad-retry-token',v_token
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=55000
  ) into v_request_id;

  return v_request_id;
end;
$$;

select cron.schedule(
  'recover-stale-sanad-assistant',
  '*/2 * * * *',
  'select public.recover_stale_sanad_assistant_messages();'
)
where not exists(
  select 1 from cron.job
  where command='select public.recover_stale_sanad_assistant_messages();'
);

select cron.schedule(
  'dispatch-sanad-assistant-retries',
  '* * * * *',
  'select private.dispatch_due_sanad_assistant_message();'
)
where not exists(
  select 1 from cron.job
  where command='select private.dispatch_due_sanad_assistant_message();'
);