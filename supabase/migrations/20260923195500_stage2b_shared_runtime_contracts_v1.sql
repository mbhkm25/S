-- Stage 2B Runtime R1 / Shared Conversation Runtime Data Contracts v1
-- Participant-aware attachments, private message-change broadcast, and user Work Item realtime authorization.

create or replace function private.sanad_thread_id_from_attachment_object_v1(
  p_name text
)
returns uuid
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_parts text[];
  v_thread text;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts,1),0) < 2 then
    return null;
  end if;

  v_thread := v_parts[2];
  if v_thread is null or v_thread !~ '^[0-9a-fA-F-]{36}$' then
    return null;
  end if;

  return v_thread::uuid;
exception when invalid_text_representation then
  return null;
end;
$function$;

revoke all on function private.sanad_thread_id_from_attachment_object_v1(text) from public,anon;
grant execute on function private.sanad_thread_id_from_attachment_object_v1(text) to authenticated,service_role;

create or replace function public.create_my_sanad_agent_attachment_v2(
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
set search_path to ''
as $function$
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
  where id=p_thread_id and status='active';

  if not found or not private.can_write_sanad_agent_thread_v2(p_thread_id,v_uid) then
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
$function$;

create or replace function public.get_my_sanad_agent_attachment_v2(
  p_attachment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_attachments%rowtype;
  v_name text;
  v_avatar text;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_row
  from public.sanad_agent_attachments
  where id=p_attachment_id and status <> 'deleted';

  if not found or not private.can_access_sanad_agent_thread_v2(v_row.thread_id,v_uid) then
    raise exception 'agent_attachment_not_found' using errcode='P0002';
  end if;

  select full_name,avatar_path into v_name,v_avatar
  from public.profiles
  where id=v_row.user_id;

  return to_jsonb(v_row) || jsonb_build_object(
    'uploader_name',v_name,
    'uploader_avatar_path',v_avatar,
    'is_mine',v_row.user_id=v_uid
  );
end;
$function$;

create or replace function public.list_my_sanad_agent_attachments_v2(
  p_thread_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.can_access_sanad_agent_thread_v2(p_thread_id,v_uid) then
    raise exception 'agent_thread_not_found' using errcode='P0002';
  end if;

  return coalesce((
    select jsonb_agg(
      to_jsonb(a) || jsonb_build_object(
        'uploader_name',pr.full_name,
        'uploader_avatar_path',pr.avatar_path,
        'is_mine',a.user_id=v_uid
      )
      order by a.created_at,a.id
    )
    from public.sanad_agent_attachments a
    left join public.profiles pr on pr.id=a.user_id
    where a.thread_id=p_thread_id
      and a.status <> 'deleted'
  ),'[]'::jsonb);
end;
$function$;

revoke all on function public.create_my_sanad_agent_attachment_v2(uuid,uuid,text,text,text,bigint) from public,anon;
revoke all on function public.get_my_sanad_agent_attachment_v2(uuid) from public,anon;
revoke all on function public.list_my_sanad_agent_attachments_v2(uuid) from public,anon;

grant execute on function public.create_my_sanad_agent_attachment_v2(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.get_my_sanad_agent_attachment_v2(uuid) to authenticated;
grant execute on function public.list_my_sanad_agent_attachments_v2(uuid) to authenticated;

drop policy if exists sanad_agent_attachments_storage_insert on storage.objects;
create policy sanad_agent_attachments_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='sanad-agent-attachments'
  and coalesce(array_length(storage.foldername(name),1),0) >= 2
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.can_write_sanad_agent_thread_v2(
    private.sanad_thread_id_from_attachment_object_v1(name),
    (select auth.uid())
  )
);

drop policy if exists sanad_agent_attachments_storage_select on storage.objects;
create policy sanad_agent_attachments_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id='sanad-agent-attachments'
  and private.can_access_sanad_agent_thread_v2(
    private.sanad_thread_id_from_attachment_object_v1(name),
    (select auth.uid())
  )
);

-- Keep DELETE restricted to the uploader/owner of the storage object.
drop policy if exists sanad_agent_attachments_storage_delete on storage.objects;
create policy sanad_agent_attachments_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='sanad-agent-attachments'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text
);

create or replace function private.broadcast_sanad_agent_message_change_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'thread_id',new.thread_id,
        'message_id',new.id,
        'sequence_no',new.sequence_no,
        'role',new.role,
        'author_user_id',new.author_user_id,
        'created_at',new.created_at
      ),
      'message.changed',
      'sanad-thread:'||new.thread_id::text,
      true
    );
  exception when others then
    raise warning 'sanad_thread_message_realtime_broadcast_failed: %',sqlerrm;
  end;

  return new;
end;
$function$;

revoke all on function private.broadcast_sanad_agent_message_change_v1() from public,anon,authenticated;

drop trigger if exists sanad_agent_message_private_broadcast_v1
  on public.sanad_agent_messages;
create trigger sanad_agent_message_private_broadcast_v1
after insert on public.sanad_agent_messages
for each row
execute function private.broadcast_sanad_agent_message_change_v1();

drop policy if exists "sanad user receives private work changes" on realtime.messages;
create policy "sanad user receives private work changes"
on realtime.messages
for select
to authenticated
using (
  extension in ('broadcast','presence')
  and (select realtime.topic())='user:'||(select auth.uid())::text
);

comment on function public.create_my_sanad_agent_attachment_v2(uuid,uuid,text,text,text,bigint) is
'Participant-aware attachment creation. Owner/member may attach; viewer is read-only.';
comment on function public.get_my_sanad_agent_attachment_v2(uuid) is
'Participant-aware attachment read for active thread participants.';
comment on function public.list_my_sanad_agent_attachments_v2(uuid) is
'Lists all non-deleted attachments visible to an active thread participant.';
comment on function private.broadcast_sanad_agent_message_change_v1() is
'Best-effort private broadcast used to invalidate/reload shared conversation state. Broadcast failure never rolls back message persistence.';
