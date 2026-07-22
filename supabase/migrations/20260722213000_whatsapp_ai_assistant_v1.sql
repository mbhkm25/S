-- SANAD WhatsApp AI assistant v1
-- Durable, idempotent processing with controlled grounding and private memory.

create table if not exists public.sanad_assistant_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  model text not null default 'gemini-2.5-flash' check (model ~ '^[a-zA-Z0-9._-]{3,80}$'),
  temperature numeric(3,2) not null default 0.20 check (temperature between 0 and 1),
  recent_messages_limit integer not null default 12 check (recent_messages_limit between 4 and 30),
  search_results_limit integer not null default 5 check (search_results_limit between 1 and 10),
  rate_limit_per_minute integer not null default 12 check (rate_limit_per_minute between 3 and 60),
  audio_max_bytes integer not null default 16777216 check (audio_max_bytes between 1048576 and 26214400),
  memory_enabled boolean not null default true,
  prompt_version text not null default 'sanad-ar-v1',
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id)
);

insert into public.sanad_assistant_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.sanad_assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.sanad_whatsapp_contacts(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','paused','human_handoff','blocked')),
  locale text not null default 'ar-YE',
  preferred_governorate text,
  summary text check (summary is null or char_length(summary) <= 6000),
  summary_updated_at timestamptz,
  last_intent text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sanad_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sanad_assistant_conversations(id) on delete cascade,
  contact_id uuid not null references public.sanad_whatsapp_contacts(id) on delete cascade,
  external_message_id text unique,
  reply_to_message_id uuid references public.sanad_assistant_messages(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null check (message_type in ('text','audio','image','system')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','ignored','rate_limited')),
  body_text text check (body_text is null or char_length(body_text) <= 12000),
  transcript text check (transcript is null or char_length(transcript) <= 12000),
  media_id text,
  media_mime_type text,
  media_size_bytes integer check (media_size_bytes is null or media_size_bytes >= 0),
  intent text,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  model text,
  prompt_version text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  meta_timestamp timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sanad_assistant_memories (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sanad_assistant_conversations(id) on delete cascade,
  contact_id uuid not null references public.sanad_whatsapp_contacts(id) on delete cascade,
  memory_key text not null check (memory_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  category text not null check (category in ('preference','location','profile','goal')),
  value_text text not null check (char_length(trim(value_text)) between 1 and 500),
  confidence numeric(4,3) not null default 0.7 check (confidence between 0 and 1),
  source_message_id uuid references public.sanad_assistant_messages(id) on delete set null,
  status text not null default 'active' check (status in ('active','forgotten')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, memory_key)
);

create index if not exists sanad_assistant_messages_queue_idx
  on public.sanad_assistant_messages (status, next_attempt_at, created_at)
  where direction = 'inbound' and status in ('queued','failed');
create index if not exists sanad_assistant_messages_conversation_time_idx
  on public.sanad_assistant_messages (conversation_id, created_at desc);
create index if not exists sanad_assistant_messages_intent_idx
  on public.sanad_assistant_messages (intent, created_at desc) where intent is not null;
create index if not exists sanad_assistant_conversations_last_message_idx
  on public.sanad_assistant_conversations (last_message_at desc nulls last);
create index if not exists sanad_assistant_memories_active_idx
  on public.sanad_assistant_memories (conversation_id, updated_at desc)
  where status = 'active';

alter table public.sanad_assistant_settings enable row level security;
alter table public.sanad_assistant_conversations enable row level security;
alter table public.sanad_assistant_messages enable row level security;
alter table public.sanad_assistant_memories enable row level security;

revoke all on table public.sanad_assistant_settings from public, anon, authenticated;
revoke all on table public.sanad_assistant_conversations from public, anon, authenticated;
revoke all on table public.sanad_assistant_messages from public, anon, authenticated;
revoke all on table public.sanad_assistant_memories from public, anon, authenticated;
grant select, insert, update, delete on table public.sanad_assistant_settings to service_role;
grant select, insert, update, delete on table public.sanad_assistant_conversations to service_role;
grant select, insert, update, delete on table public.sanad_assistant_messages to service_role;
grant select, insert, update, delete on table public.sanad_assistant_memories to service_role;

create or replace function public.enqueue_sanad_assistant_message(
  p_phone text,
  p_message_id text,
  p_message_type text,
  p_body_text text default null,
  p_media_id text default null,
  p_media_mime_type text default null,
  p_meta_timestamp timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_contact public.sanad_whatsapp_contacts%rowtype;
  v_conversation public.sanad_assistant_conversations%rowtype;
  v_message public.sanad_assistant_messages%rowtype;
  v_settings public.sanad_assistant_settings%rowtype;
  v_recent_count integer;
begin
  if v_phone !~ '^967[0-9]{9}$' then raise exception 'invalid_yemen_phone'; end if;
  if nullif(trim(coalesce(p_message_id,'')), '') is null then raise exception 'message_id_required'; end if;
  if p_message_type not in ('text','audio') then raise exception 'unsupported_assistant_message_type'; end if;

  select * into v_settings from public.sanad_assistant_settings where singleton = true;
  select * into v_contact from public.sanad_whatsapp_contacts where phone_normalized = v_phone for update;
  if not found then raise exception 'whatsapp_contact_not_registered'; end if;

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
    v_conversation.id, v_contact.id, trim(p_message_id), 'inbound', p_message_type,
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
$$;

create or replace function public.claim_sanad_assistant_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_result jsonb;
begin
  with candidate as (
    select id from public.sanad_assistant_messages
    where id = p_message_id and direction = 'inbound'
      and status in ('queued','failed') and next_attempt_at <= now()
      and attempt_count < 5
    for update skip locked
  ), claimed as (
    update public.sanad_assistant_messages m
    set status='processing', attempt_count=m.attempt_count+1,
        processing_started_at=now(), updated_at=now(), error_code=null, error_message=null
    from candidate c where m.id=c.id returning m.*
  )
  select c.id, to_jsonb(c) into v_id, v_result from claimed c;
  if v_id is null then return null; end if;

  return v_result || jsonb_build_object(
    'contact', (select jsonb_build_object('phone',wc.phone_normalized,'wa_id',wc.wa_id,'display_name',wc.display_name,'linked_user_id',wc.linked_user_id)
      from public.sanad_whatsapp_contacts wc where wc.id=(v_result->>'contact_id')::uuid),
    'conversation', (select to_jsonb(sc) from public.sanad_assistant_conversations sc where sc.id=(v_result->>'conversation_id')::uuid),
    'settings', (select to_jsonb(s) - 'updated_by_user_id' from public.sanad_assistant_settings s where singleton=true),
    'memories', coalesce((select jsonb_agg(jsonb_build_object('key',memory_key,'category',category,'value',value_text,'confidence',confidence) order by updated_at desc)
      from public.sanad_assistant_memories where conversation_id=(v_result->>'conversation_id')::uuid and status='active' and (expires_at is null or expires_at>now())), '[]'::jsonb),
    'recent_messages', coalesce((select jsonb_agg(x.item order by x.created_at) from (
      select jsonb_build_object('direction',direction,'type',message_type,'text',coalesce(transcript,body_text),'intent',intent,'created_at',created_at) item, created_at
      from public.sanad_assistant_messages
      where conversation_id=(v_result->>'conversation_id')::uuid and id <> p_message_id and status='completed'
      order by created_at desc limit (select recent_messages_limit from public.sanad_assistant_settings where singleton=true)
    ) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_sanad_assistant_message(
  p_message_id uuid,
  p_response_text text,
  p_external_response_id text default null,
  p_transcript text default null,
  p_intent text default null,
  p_confidence numeric default null,
  p_tool_calls jsonb default '[]'::jsonb,
  p_model text default null,
  p_prompt_version text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_latency_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_in public.sanad_assistant_messages%rowtype; v_out public.sanad_assistant_messages%rowtype;
begin
  select * into v_in from public.sanad_assistant_messages where id=p_message_id for update;
  if not found or v_in.direction <> 'inbound' then raise exception 'assistant_message_not_found'; end if;

  update public.sanad_assistant_messages set
    status='completed', transcript=nullif(left(trim(coalesce(p_transcript,'')),12000),''),
    intent=nullif(trim(coalesce(p_intent,'')),''), confidence=p_confidence,
    tool_calls=coalesce(p_tool_calls,'[]'::jsonb), model=p_model, prompt_version=p_prompt_version,
    input_tokens=p_input_tokens, output_tokens=p_output_tokens, latency_ms=p_latency_ms,
    metadata=metadata || coalesce(p_metadata,'{}'::jsonb), completed_at=now(), updated_at=now()
  where id=p_message_id returning * into v_in;

  insert into public.sanad_assistant_messages (
    conversation_id,contact_id,external_message_id,reply_to_message_id,direction,message_type,status,
    body_text,intent,model,prompt_version,metadata,completed_at
  ) values (
    v_in.conversation_id,v_in.contact_id,nullif(trim(coalesce(p_external_response_id,'')),''),v_in.id,
    'outbound','text','completed',left(trim(p_response_text),12000),v_in.intent,p_model,p_prompt_version,
    coalesce(p_metadata,'{}'::jsonb),now()
  ) returning * into v_out;

  update public.sanad_assistant_conversations set
    last_intent=v_in.intent,last_message_at=now(),last_outbound_at=now(),updated_at=now()
  where id=v_in.conversation_id;

  return jsonb_build_object('inbound_id',v_in.id,'outbound_id',v_out.id);
end;
$$;

create or replace function public.fail_sanad_assistant_message(
  p_message_id uuid, p_error_code text, p_error_message text, p_retryable boolean default true
)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.sanad_assistant_messages set
    status=case when coalesce(p_retryable,false) and attempt_count<5 then 'failed' else 'ignored' end,
    next_attempt_at=case when coalesce(p_retryable,false) then now() + make_interval(secs => least(300, power(2,greatest(attempt_count,1))::integer * 10)) else next_attempt_at end,
    error_code=nullif(left(trim(coalesce(p_error_code,'')),120),''),
    error_message=nullif(left(trim(coalesce(p_error_message,'')),2000),''),updated_at=now()
  where id=p_message_id and direction='inbound';
end; $$;

create or replace function public.upsert_sanad_assistant_memory(
  p_conversation_id uuid, p_message_id uuid, p_memory_key text, p_category text,
  p_value_text text, p_confidence numeric default 0.7
)
returns void language plpgsql security definer set search_path='' as $$
declare v_contact_id uuid;
begin
  select contact_id into v_contact_id from public.sanad_assistant_conversations where id=p_conversation_id;
  if v_contact_id is null then raise exception 'conversation_not_found'; end if;
  insert into public.sanad_assistant_memories (conversation_id,contact_id,memory_key,category,value_text,confidence,source_message_id)
  values (p_conversation_id,v_contact_id,p_memory_key,p_category,left(trim(p_value_text),500),greatest(0,least(coalesce(p_confidence,0.7),1)),p_message_id)
  on conflict (conversation_id,memory_key) do update set category=excluded.category,value_text=excluded.value_text,
    confidence=excluded.confidence,source_message_id=excluded.source_message_id,status='active',expires_at=null,updated_at=now();
end; $$;

create or replace function public.forget_sanad_assistant_memory(p_conversation_id uuid, p_memory_key text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  update public.sanad_assistant_memories set status='forgotten',updated_at=now()
  where conversation_id=p_conversation_id and status='active'
    and (nullif(trim(coalesce(p_memory_key,'')),'') is null or memory_key=p_memory_key);
  get diagnostics v_count=row_count; return v_count;
end; $$;

create or replace function public.search_sanad_assistant_knowledge(
  p_query text default null, p_governorate text default null, p_limit integer default 5
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_query text:=nullif(trim(coalesce(p_query,'')),''); v_limit integer:=greatest(1,least(coalesce(p_limit,5),10));
declare v_directory jsonb; v_faq jsonb;
begin
  v_faq:=public.get_public_sanad_faq(null,v_query);
  v_directory:=public.get_public_business_directory(v_query,null,nullif(trim(coalesce(p_governorate,'')),''),v_limit,0);
  return jsonb_build_object(
    'faq',coalesce(v_faq->'items','[]'::jsonb),
    'directory',v_directory,
    'catalog_media',coalesce((select jsonb_agg(jsonb_build_object(
      'item_id',ci.id,'business_id',bp.id,'business_name',bp.name,'business_slug',bp.slug,
      'title',ci.title,'image_path',ci.image_paths->>0,'public_url','https://app.sanadflow.com/b/'||bp.slug
    ) order by ci.is_featured desc,ci.created_at desc)
    from public.business_catalog_items ci join public.business_profiles bp on bp.id=ci.business_id
    join public.business_community_settings s on s.singleton=true
    where s.phase not in ('prelaunch','maintenance') and bp.public_status='published' and ci.status='active'
      and jsonb_array_length(ci.image_paths)>0
      and (v_query is null or ci.title ilike '%'||v_query||'%' or ci.description ilike '%'||v_query||'%' or bp.name ilike '%'||v_query||'%')
      and (nullif(trim(coalesce(p_governorate,'')),'') is null or bp.governorate=trim(p_governorate))
    limit v_limit),'[]'::jsonb),
    'generated_at',now()
  );
end; $$;

create or replace function public.platform_admin_get_assistant_overview(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,50),150));
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'settings',(select to_jsonb(s)-'updated_by_user_id' from public.sanad_assistant_settings s where singleton=true),
    'stats',jsonb_build_object(
      'conversations',(select count(*) from public.sanad_assistant_conversations),
      'active_30d',(select count(*) from public.sanad_assistant_conversations where last_message_at>=now()-interval '30 days'),
      'inbound_messages',(select count(*) from public.sanad_assistant_messages where direction='inbound'),
      'audio_messages',(select count(*) from public.sanad_assistant_messages where direction='inbound' and message_type='audio'),
      'failed_messages',(select count(*) from public.sanad_assistant_messages where direction='inbound' and status in ('failed','ignored') and error_code is not null),
      'avg_latency_ms',(select coalesce(round(avg(latency_ms)),0) from public.sanad_assistant_messages where direction='inbound' and status='completed' and latency_ms is not null)),
    'intents',coalesce((select jsonb_agg(jsonb_build_object('intent',q.intent,'count',q.count) order by q.count desc) from (
      select coalesce(intent,'unknown') intent,count(*) count from public.sanad_assistant_messages
      where direction='inbound' and created_at>=now()-interval '30 days' group by coalesce(intent,'unknown') limit 12) q),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(to_jsonb(q) order by q.last_message_at desc nulls last) from (
      select c.id,c.status,c.last_intent,c.last_message_at,c.preferred_governorate,w.phone_normalized,w.display_name,w.linked_user_id,
        (select count(*) from public.sanad_assistant_messages m where m.conversation_id=c.id) message_count,
        (select coalesce(m.transcript,m.body_text) from public.sanad_assistant_messages m where m.conversation_id=c.id order by m.created_at desc limit 1) last_message
      from public.sanad_assistant_conversations c join public.sanad_whatsapp_contacts w on w.id=c.contact_id
      order by c.last_message_at desc nulls last limit v_limit) q),'[]'::jsonb),
    'generated_at',now());
end; $$;

create or replace function public.platform_admin_get_assistant_thread(p_conversation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'conversation',(select to_jsonb(c) from public.sanad_assistant_conversations c where c.id=p_conversation_id),
    'contact',(select to_jsonb(w)-'metadata' from public.sanad_whatsapp_contacts w join public.sanad_assistant_conversations c on c.contact_id=w.id where c.id=p_conversation_id),
    'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.sanad_assistant_messages m where m.conversation_id=p_conversation_id),'[]'::jsonb),
    'memories',coalesce((select jsonb_agg(to_jsonb(mm) order by mm.updated_at desc) from public.sanad_assistant_memories mm where mm.conversation_id=p_conversation_id and mm.status='active'),'[]'::jsonb));
end; $$;

create or replace function public.platform_admin_update_assistant_settings(p_payload jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  select to_jsonb(s) into v_before from public.sanad_assistant_settings s where singleton=true for update;
  update public.sanad_assistant_settings set
    enabled=coalesce((p_payload->>'enabled')::boolean,enabled),
    memory_enabled=coalesce((p_payload->>'memory_enabled')::boolean,memory_enabled),
    updated_by_user_id=auth.uid(),updated_at=now()
  where singleton=true returning to_jsonb(sanad_assistant_settings) into v_after;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'assistant_settings_updated','sanad_assistant_settings','singleton',trim(p_reason),v_before,v_after);
end; $$;

revoke all on function public.enqueue_sanad_assistant_message(text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.claim_sanad_assistant_message(uuid) from public,anon,authenticated;
revoke all on function public.complete_sanad_assistant_message(uuid,text,text,text,text,numeric,jsonb,text,text,integer,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.fail_sanad_assistant_message(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.upsert_sanad_assistant_memory(uuid,uuid,text,text,text,numeric) from public,anon,authenticated;
revoke all on function public.forget_sanad_assistant_memory(uuid,text) from public,anon,authenticated;
revoke all on function public.search_sanad_assistant_knowledge(text,text,integer) from public,anon,authenticated;
grant execute on function public.enqueue_sanad_assistant_message(text,text,text,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.claim_sanad_assistant_message(uuid) to service_role;
grant execute on function public.complete_sanad_assistant_message(uuid,text,text,text,text,numeric,jsonb,text,text,integer,integer,integer,jsonb) to service_role;
grant execute on function public.fail_sanad_assistant_message(uuid,text,text,boolean) to service_role;
grant execute on function public.upsert_sanad_assistant_memory(uuid,uuid,text,text,text,numeric) to service_role;
grant execute on function public.forget_sanad_assistant_memory(uuid,text) to service_role;
grant execute on function public.search_sanad_assistant_knowledge(text,text,integer) to service_role;

revoke all on function public.platform_admin_get_assistant_overview(integer) from public,anon;
revoke all on function public.platform_admin_get_assistant_thread(uuid) from public,anon;
revoke all on function public.platform_admin_update_assistant_settings(jsonb,text) from public,anon;
grant execute on function public.platform_admin_get_assistant_overview(integer) to authenticated;
grant execute on function public.platform_admin_get_assistant_thread(uuid) to authenticated;
grant execute on function public.platform_admin_update_assistant_settings(jsonb,text) to authenticated;

comment on table public.sanad_assistant_messages is 'Private idempotent WhatsApp assistant queue and transcript store.';
comment on table public.sanad_assistant_memories is 'Explicit non-sensitive long-term assistant facts; never store payment, password, OTP, or card data.';
comment on function public.search_sanad_assistant_knowledge(text,text,integer) is 'Service-role-only grounding endpoint; respects public launch and publication rules.';
