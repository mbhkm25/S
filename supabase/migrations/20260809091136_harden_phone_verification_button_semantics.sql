create or replace function private.apply_phone_verification_button_response(
  p_phone text,
  p_body_text text,
  p_message_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := private.normalize_sanad_phone(p_phone);
  v_text text := lower(trim(coalesce(p_body_text,'')));
  v_decision text;
  v_claim public.phone_verification_claims%rowtype;
  v_existing_user uuid;
begin
  if nullif(trim(coalesce(p_message_id,'')),'') is null then
    raise exception 'response_message_id_required';
  end if;

  select * into v_claim
  from public.phone_verification_claims
  where phone_normalized=v_phone
    and status in ('sent','sending')
  order by created_at desc
  limit 1
  for update;

  if v_claim.id is null then
    return jsonb_build_object('handled',false,'reason','no_actionable_claim');
  end if;

  if v_claim.response_message_id=p_message_id then
    return jsonb_build_object('handled',true,'ok',true,'duplicate',true,'status',v_claim.status,'claim_id',v_claim.id);
  end if;

  if v_claim.expires_at<=now() then
    update public.phone_verification_claims
    set status='expired',response_token_hash=null,updated_at=now()
    where id=v_claim.id;
    update public.profiles
    set phone_verification_status='expired',phone_verification_updated_at=now(),updated_at=now()
    where id=v_claim.user_id and pending_phone=v_phone and phone is null;
    return jsonb_build_object('handled',true,'ok',false,'status','expired','claim_id',v_claim.id);
  end if;

  v_text:=regexp_replace(v_text,'[[:space:]،,!.]+',' ','g');
  if v_text ~ '^(نعم|ايوه|أيوه|ايوا|أجل)( |$)' then
    v_decision:='yes';
  elsif v_text ~ '^(لا|كلا)( |$)' then
    v_decision:='no';
  else
    return jsonb_build_object('handled',false,'reason','unrecognized_verification_button','claim_id',v_claim.id);
  end if;

  if v_decision='no' then
    update public.phone_verification_claims
    set status='rejected',responded_at=now(),rejected_at=now(),response_message_id=p_message_id,
        response_token_hash=null,metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now()
    where id=v_claim.id;

    update public.profiles
    set pending_phone=null,
        phone_verification_status=case when phone is null then 'rejected' else 'verified' end,
        phone_verification_updated_at=now(),updated_at=now()
    where id=v_claim.user_id and pending_phone=v_phone;

    insert into public.phone_verification_events(claim_id,user_id,event_type,external_message_id,metadata)
    values(v_claim.id,v_claim.user_id,'ownership_rejected_button',p_message_id,
           coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('decision_source','signed_whatsapp_button'));

    return jsonb_build_object('handled',true,'ok',true,'status','rejected','claim_id',v_claim.id,'decision','no');
  end if;

  select user_id into v_existing_user
  from public.verified_phone_identities
  where phone_normalized=v_phone
  for update;

  if v_existing_user is not null and v_existing_user<>v_claim.user_id then
    update public.phone_verification_claims
    set status='conflict',responded_at=now(),response_message_id=p_message_id,response_token_hash=null,
        metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('requires_account_recovery',true),updated_at=now()
    where id=v_claim.id;

    update public.profiles
    set phone_verification_status='conflict',phone_verification_updated_at=now(),updated_at=now()
    where id=v_claim.user_id and pending_phone=v_phone;

    insert into public.phone_verification_events(claim_id,user_id,event_type,external_message_id,metadata)
    values(v_claim.id,v_claim.user_id,'verified_phone_conflict_button',p_message_id,
           jsonb_build_object('requires_account_recovery',true,'decision_source','signed_whatsapp_button'));

    return jsonb_build_object('handled',true,'ok',true,'status','conflict','claim_id',v_claim.id,'requires_account_recovery',true);
  end if;

  insert into public.verified_phone_identities(phone_normalized,user_id,verified_at,verification_method,claim_id,metadata)
  values(v_phone,v_claim.user_id,now(),'whatsapp_button',v_claim.id,
         coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('decision_source','signed_whatsapp_button'))
  on conflict(phone_normalized) do update
  set verified_at=excluded.verified_at,
      verification_method=excluded.verification_method,
      claim_id=excluded.claim_id,
      metadata=coalesce(public.verified_phone_identities.metadata,'{}'::jsonb)||excluded.metadata,
      updated_at=now()
  where public.verified_phone_identities.user_id=excluded.user_id;

  update public.profiles
  set phone=v_phone,pending_phone=null,phone_verification_status='verified',
      phone_verified_at=now(),phone_verification_updated_at=now(),
      profile_completed_at=case
        when nullif(trim(full_name),'') is not null and nullif(trim(governorate),'') is not null
          then coalesce(profile_completed_at,now())
        else profile_completed_at
      end,
      updated_at=now()
  where id=v_claim.user_id;

  update public.phone_verification_claims
  set status='verified',responded_at=now(),verified_at=now(),response_message_id=p_message_id,
      response_token_hash=null,metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now()
  where id=v_claim.id;

  update public.sanad_whatsapp_contacts
  set linked_user_id=v_claim.user_id,registration_status='registered',onboarding_status='registered',updated_at=now()
  where phone_normalized=v_phone;

  update public.sanad_assistant_conversations c
  set linked_user_id=v_claim.user_id,updated_at=now()
  where c.contact_id in(select id from public.sanad_whatsapp_contacts where phone_normalized=v_phone);

  insert into public.phone_verification_events(claim_id,user_id,event_type,external_message_id,metadata)
  values(v_claim.id,v_claim.user_id,'ownership_verified_button',p_message_id,
         coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('decision_source','signed_whatsapp_button'));

  return jsonb_build_object('handled',true,'ok',true,'status','verified','claim_id',v_claim.id,'user_id',v_claim.user_id,'decision','yes');
end;
$function$;

revoke all on function private.apply_phone_verification_button_response(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.apply_phone_verification_button_response(text,text,text,jsonb) to service_role;

create or replace function public.register_whatsapp_inbound(p_phone text, p_wa_id text, p_display_name text, p_message_id text, p_message_type text, p_supported boolean, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
 v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 v_contact public.sanad_whatsapp_contacts%rowtype;
 v_contact_inserted boolean:=false;
 v_event_inserted boolean:=false;
 v_rows int:=0;
 v_event_type text:=case when coalesce(p_supported,false) then 'supported_message_received' else 'unsupported_message_received' end;
 v_linked_user_id uuid;
 v_reconcile jsonb;
 v_should_welcome boolean:=false;
 v_message_type text:=lower(trim(coalesce(p_message_type,'')));
begin
 if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;

 if v_message_type in ('button','interactive') then
   v_reconcile:=jsonb_build_object('ok',true,'status','deferred_interactive_verification');
 else
   v_reconcile:=public.reconcile_pending_phone_from_whatsapp(v_phone,p_wa_id,p_display_name,p_message_id,now());
 end if;

 select coalesce(v.user_id,p.id) into v_linked_user_id
 from (select v_phone phone) x
 left join public.verified_phone_identities v on v.phone_normalized=x.phone
 left join public.profiles p on p.phone=x.phone limit 1;

 insert into public.sanad_whatsapp_contacts(phone_normalized,wa_id,display_name,linked_user_id,registration_status,onboarding_status,metadata)
 values(v_phone,nullif(trim(p_wa_id),''),nullif(trim(p_display_name),''),v_linked_user_id,
   case when v_linked_user_id is not null then 'profile_completed' else 'whatsapp_only' end,
   case when v_linked_user_id is not null then 'registered' else 'queued' end,
   coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('identity_reconcile',coalesce(v_reconcile,'{}'::jsonb)))
 on conflict(phone_normalized) do nothing returning * into v_contact;
 if found then v_contact_inserted:=true; else select * into v_contact from public.sanad_whatsapp_contacts where phone_normalized=v_phone for update; end if;

 insert into public.sanad_whatsapp_contact_events(contact_id,event_type,external_message_id,metadata)
 values(v_contact.id,v_event_type,nullif(trim(p_message_id),''),jsonb_build_object('message_type',nullif(trim(p_message_type),''),'supported',coalesce(p_supported,false))||coalesce(p_metadata,'{}'::jsonb))
 on conflict(event_type,external_message_id) where external_message_id is not null do nothing;
 get diagnostics v_rows=row_count; v_event_inserted:=v_rows>0;

 v_should_welcome := v_event_inserted
   and v_linked_user_id is null
   and v_contact.welcome_message_sent_at is null
   and v_contact.transactional_status='active'
   and v_contact.onboarding_status in ('not_sent','failed','queued');

 update public.sanad_whatsapp_contacts set
   wa_id=coalesce(nullif(trim(p_wa_id),''),wa_id),
   display_name=coalesce(nullif(trim(p_display_name),''),display_name),
   linked_user_id=coalesce(v_linked_user_id,linked_user_id),
   registration_status=case when coalesce(v_linked_user_id,linked_user_id) is not null then 'profile_completed' else registration_status end,
   onboarding_status=case
     when coalesce(v_linked_user_id,linked_user_id) is not null then 'registered'
     when v_should_welcome then 'queued'
     else onboarding_status end,
   last_seen_at=case when v_event_inserted then now() else last_seen_at end,
   messages_count=messages_count+case when v_event_inserted then 1 else 0 end,
   supported_messages_count=supported_messages_count+case when v_event_inserted and coalesce(p_supported,false) then 1 else 0 end,
   metadata=metadata||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('identity_reconcile',coalesce(v_reconcile,'{}'::jsonb)),updated_at=now()
 where id=v_contact.id returning * into v_contact;

 if v_should_welcome then
   insert into public.sanad_whatsapp_contact_events(contact_id,event_type,metadata)
   values(v_contact.id,'welcome_queued',jsonb_build_object('queued_by','first_inbound','message_id',p_message_id,'message_type',p_message_type,'version',v_contact.welcome_message_version));
 end if;

 update public.sanad_assistant_conversations set linked_user_id=coalesce(linked_user_id,v_contact.linked_user_id),updated_at=now() where contact_id=v_contact.id;
 return jsonb_build_object('contact_id',v_contact.id,'phone_normalized',v_contact.phone_normalized,'is_first_contact',v_contact_inserted,'is_duplicate_message',not v_event_inserted,'registration_status',v_contact.registration_status,'onboarding_status',v_contact.onboarding_status,'linked_user_id',v_contact.linked_user_id,'identity_reconcile',v_reconcile,'should_send_welcome',v_should_welcome);
end;
$function$;

create or replace function public.enqueue_sanad_assistant_message(p_phone text, p_message_id text, p_message_type text, p_body_text text default null, p_media_id text default null, p_media_mime_type text default null, p_meta_timestamp timestamptz default null, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_conversation public.sanad_assistant_conversations%rowtype;
  v_message public.sanad_assistant_messages%rowtype;
  v_settings public.sanad_assistant_settings%rowtype;
  v_recent_count integer;
  v_phone_verification jsonb;
  v_message_type text:=lower(trim(coalesce(p_message_type,'')));
begin
  if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;
  if nullif(trim(coalesce(p_message_id,'')), '') is null then raise exception 'message_id_required'; end if;
  if v_message_type not in ('text','audio','button','interactive') then raise exception 'unsupported_assistant_message_type'; end if;

  select * into v_contact from public.sanad_whatsapp_contacts where phone_normalized = v_phone for update;
  if not found then raise exception 'whatsapp_contact_not_registered'; end if;

  if v_message_type in ('button','interactive') then
    v_phone_verification:=private.apply_phone_verification_button_response(
      v_phone,p_body_text,p_message_id,
      coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('message_type',v_message_type,'source','sanad-v3-whatsapp-intake')
    );
    if coalesce((v_phone_verification->>'handled')::boolean,false) then
      return jsonb_build_object(
        'message_id',null,
        'conversation_id',null,
        'status','handled',
        'duplicate',coalesce((v_phone_verification->>'duplicate')::boolean,false),
        'phone_verification',v_phone_verification
      );
    end if;
  end if;

  select * into v_settings from public.sanad_assistant_settings where singleton = true;

  insert into public.sanad_assistant_conversations (contact_id, linked_user_id, last_message_at, last_inbound_at)
  values (v_contact.id, v_contact.linked_user_id, now(), now())
  on conflict (contact_id) do update set
    linked_user_id = coalesce(public.sanad_assistant_conversations.linked_user_id, excluded.linked_user_id),
    last_message_at = excluded.last_message_at,
    last_inbound_at = excluded.last_inbound_at,
    updated_at = now()
  returning * into v_conversation;

  select count(*) into v_recent_count
  from public.sanad_assistant_messages m
  where m.contact_id = v_contact.id and m.direction = 'inbound'
    and m.created_at >= now() - interval '1 minute';

  insert into public.sanad_assistant_messages (
    conversation_id, contact_id, external_message_id, direction, message_type, status,
    body_text, media_id, media_mime_type, meta_timestamp, metadata
  ) values (
    v_conversation.id, v_contact.id, trim(p_message_id), 'inbound', v_message_type,
    case
      when not coalesce(v_settings.enabled, false) then 'ignored'
      when v_contact.transactional_status = 'blocked' or v_conversation.status in ('paused','blocked') then 'ignored'
      when v_recent_count >= v_settings.rate_limit_per_minute then 'rate_limited'
      else 'queued'
    end,
    nullif(left(trim(coalesce(p_body_text,'')),12000),''), nullif(trim(coalesce(p_media_id,'')),''),
    nullif(trim(coalesce(p_media_mime_type,'')),''), p_meta_timestamp, coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (external_message_id) do update set external_message_id = excluded.external_message_id
  returning * into v_message;

  return jsonb_build_object(
    'message_id', v_message.id,
    'conversation_id', v_conversation.id,
    'status', v_message.status,
    'duplicate', v_message.created_at < now() - interval '1 second'
  );
end;
$function$;
