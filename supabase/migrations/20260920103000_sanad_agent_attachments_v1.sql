-- SANAD Agent Attachments v1
-- Private user-owned files, deterministic analysis state and draft/link suggestions.
-- No financial operation write is performed by this migration.

create table if not exists public.sanad_agent_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid not null references public.sanad_agent_threads(id) on delete cascade,
  business_id uuid null,
  storage_bucket text not null default 'sanad-agent-attachments',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  status text not null default 'uploaded'
    check (status in ('uploaded','analyzing','ready','failed','deleted')),
  analysis jsonb null,
  matches jsonb not null default '{}'::jsonb,
  suggestion jsonb null,
  model text null,
  error_code text null,
  analyzed_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_bucket, storage_path)
);

create index if not exists sanad_agent_attachments_thread_idx
  on public.sanad_agent_attachments(user_id, thread_id, created_at desc);

create index if not exists sanad_agent_attachments_ready_idx
  on public.sanad_agent_attachments(user_id, status, created_at desc)
  where status = 'ready';

alter table public.sanad_agent_attachments enable row level security;

drop policy if exists sanad_agent_attachments_own_select on public.sanad_agent_attachments;
create policy sanad_agent_attachments_own_select
on public.sanad_agent_attachments
for select
to authenticated
using ((select auth.uid()) = user_id and status <> 'deleted');

revoke all on table public.sanad_agent_attachments from public,anon,authenticated;
grant select on table public.sanad_agent_attachments to authenticated;
grant select,insert,update,delete on table public.sanad_agent_attachments to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'sanad-agent-attachments',
  'sanad-agent-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/json',
    'text/plain',
    'text/csv',
    'text/rtf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/bmp'
  ]::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=20971520,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sanad_agent_attachments_storage_insert on storage.objects;
create policy sanad_agent_attachments_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='sanad-agent-attachments'
  and coalesce(array_length(storage.foldername(name),1),0) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.sanad_agent_threads t
    where t.id::text = (storage.foldername(name))[2]
      and t.user_id = (select auth.uid())
      and t.status='active'
  )
);

drop policy if exists sanad_agent_attachments_storage_select on storage.objects;
create policy sanad_agent_attachments_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id='sanad-agent-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

drop policy if exists sanad_agent_attachments_storage_delete on storage.objects;
create policy sanad_agent_attachments_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='sanad-agent-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create or replace function public.create_my_sanad_agent_attachment_v1(
  p_thread_id uuid,
  p_business_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_thread public.sanad_agent_threads%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid and status='active';

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  if p_business_id is distinct from v_thread.business_id then
    raise exception 'attachment_business_context_mismatch' using errcode='22023';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 20971520 then
    raise exception 'attachment_file_size_invalid' using errcode='22023';
  end if;

  if p_mime_type not in (
    'application/pdf','application/json','text/plain','text/csv','text/rtf',
    'image/jpeg','image/png','image/webp','image/bmp'
  ) then
    raise exception 'attachment_mime_type_unsupported' using errcode='22023';
  end if;

  if split_part(p_storage_path,'/',1) <> v_uid::text
     or split_part(p_storage_path,'/',2) <> p_thread_id::text then
    raise exception 'attachment_storage_path_invalid' using errcode='22023';
  end if;

  insert into public.sanad_agent_attachments(
    id,user_id,thread_id,business_id,storage_path,file_name,mime_type,file_size
  ) values (
    v_id,v_uid,p_thread_id,p_business_id,left(p_storage_path,1000),
    left(p_file_name,300),p_mime_type,p_file_size
  );

  return v_id;
end;
$$;

create or replace function public.get_my_sanad_agent_attachment_v1(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_attachments%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_row
  from public.sanad_agent_attachments
  where id=p_attachment_id and user_id=v_uid and status <> 'deleted';

  if not found then
    raise exception 'agent_attachment_not_found' using errcode='P0002';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.list_my_sanad_agent_attachments_v1(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.sanad_agent_threads
    where id=p_thread_id and user_id=v_uid
  ) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(a) order by a.created_at,a.id)
    from public.sanad_agent_attachments a
    where a.thread_id=p_thread_id
      and a.user_id=v_uid
      and a.status <> 'deleted'
  ),'[]'::jsonb);
end;
$$;

create or replace function public.delete_my_sanad_agent_attachment_v1(p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_attachments%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_row
  from public.sanad_agent_attachments
  where id=p_attachment_id and user_id=v_uid and status <> 'deleted'
  for update;

  if not found then
    raise exception 'agent_attachment_not_found' using errcode='P0002';
  end if;

  update public.sanad_agent_attachments
  set status='deleted',deleted_at=now(),updated_at=now()
  where id=p_attachment_id;

  return jsonb_build_object(
    'id',v_row.id,
    'storage_bucket',v_row.storage_bucket,
    'storage_path',v_row.storage_path
  );
end;
$$;

alter table public.sanad_agent_messages
  add column if not exists attachment_ids uuid[] not null default '{}'::uuid[];

create or replace function public.save_sanad_agent_turn_v2(
  p_user_id uuid,
  p_thread_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_response jsonb,
  p_tool_trace jsonb,
  p_request_id uuid,
  p_model text,
  p_thinking_level text,
  p_business_id uuid default null,
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_thread public.sanad_agent_threads%rowtype;
  v_user_message_id uuid := gen_random_uuid();
  v_assistant_message_id uuid := gen_random_uuid();
  v_title text;
  v_attachment_ids uuid[] := coalesce(p_attachment_ids,'{}'::uuid[]);
begin
  if p_user_id is null or p_thread_id is null then
    raise exception 'user_and_thread_required' using errcode='22023';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=p_user_id
  for update;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  if v_thread.status <> 'active' then
    raise exception 'agent_thread_archived' using errcode='22023';
  end if;

  if cardinality(v_attachment_ids) > 5 then
    raise exception 'too_many_attachments' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(v_attachment_ids) x(id)
    left join public.sanad_agent_attachments a
      on a.id=x.id
     and a.user_id=p_user_id
     and a.thread_id=p_thread_id
     and a.status='ready'
    where a.id is null
  ) then
    raise exception 'attachment_not_ready_or_not_owned' using errcode='22023';
  end if;

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,role,content,request_id,attachment_ids
  ) values (
    v_user_message_id,p_thread_id,p_user_id,'user',
    left(coalesce(p_user_message,''),20000),p_request_id,v_attachment_ids
  );

  insert into public.sanad_agent_messages(
    id,thread_id,user_id,role,content,response,tool_trace,request_id,model,thinking_level
  ) values (
    v_assistant_message_id,p_thread_id,p_user_id,'assistant',
    left(coalesce(p_assistant_message,''),30000),
    coalesce(p_response,'{}'::jsonb),
    coalesce(p_tool_trace,'[]'::jsonb),
    p_request_id,
    left(nullif(coalesce(p_model,''),''),120),
    case when p_thinking_level in ('low','medium','high') then p_thinking_level else null end
  );

  v_title := case
    when v_thread.title='محادثة جديدة' and v_thread.message_count=0
      then left(regexp_replace(coalesce(nullif(btrim(p_user_message),''),'محادثة جديدة'),E'\\s+',' ','g'),64)
    else v_thread.title
  end;

  update public.sanad_agent_threads
  set title=v_title,
      business_id=coalesce(p_business_id,business_id),
      last_message_at=now(),
      message_count=message_count+2,
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object(
    'thread_id',p_thread_id,
    'user_message_id',v_user_message_id,
    'assistant_message_id',v_assistant_message_id,
    'title',v_title,
    'attachment_ids',to_jsonb(v_attachment_ids)
  );
end;
$$;

create or replace function public.get_my_sanad_agent_thread_v1(
  p_thread_id uuid,
  p_message_limit integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.sanad_agent_threads%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_message_limit,120),300));
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=p_thread_id and user_id=v_uid;

  if not found then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return jsonb_build_object(
    'thread',jsonb_build_object(
      'id',v_thread.id,
      'business_id',v_thread.business_id,
      'title',v_thread.title,
      'status',v_thread.status,
      'summary',v_thread.summary,
      'last_message_at',v_thread.last_message_at,
      'message_count',v_thread.message_count,
      'created_at',v_thread.created_at,
      'updated_at',v_thread.updated_at
    ),
    'messages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',m.id,
          'role',m.role,
          'content',m.content,
          'response',m.response,
          'tool_trace',m.tool_trace,
          'request_id',m.request_id,
          'model',m.model,
          'thinking_level',m.thinking_level,
          'is_starred',m.is_starred,
          'rating',m.rating,
          'rating_updated_at',m.rating_updated_at,
          'attachment_ids',to_jsonb(m.attachment_ids),
          'created_at',m.created_at
        )
        order by m.created_at,m.id
      )
      from (
        select *
        from public.sanad_agent_messages
        where thread_id=v_thread.id and user_id=v_uid
        order by created_at desc,id desc
        limit v_limit
      ) m
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_my_sanad_agent_attachment_v1(uuid,uuid,text,text,text,bigint) from public,anon;
revoke all on function public.get_my_sanad_agent_attachment_v1(uuid) from public,anon;
revoke all on function public.list_my_sanad_agent_attachments_v1(uuid) from public,anon;
revoke all on function public.delete_my_sanad_agent_attachment_v1(uuid) from public,anon;
revoke all on function public.save_sanad_agent_turn_v2(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) from public,anon,authenticated;

grant execute on function public.create_my_sanad_agent_attachment_v1(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.get_my_sanad_agent_attachment_v1(uuid) to authenticated;
grant execute on function public.list_my_sanad_agent_attachments_v1(uuid) to authenticated;
grant execute on function public.delete_my_sanad_agent_attachment_v1(uuid) to authenticated;
grant execute on function public.save_sanad_agent_turn_v2(uuid,uuid,text,text,jsonb,jsonb,uuid,text,text,uuid,uuid[]) to service_role;
