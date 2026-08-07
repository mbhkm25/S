-- Knowledge file upload and ingestion foundation.
-- Applied to Supabase project hudbzlgclghlhazlduas on 2026-07-25.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sanad-knowledge-files', 'sanad-knowledge-files', false, 26214400,
  array[
    'application/pdf','text/plain','text/markdown','text/csv','text/html','application/json',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png','image/jpeg','image/webp'
  ]::text[]
)
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.sanad_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sanad_knowledge_sources(id) on delete cascade,
  bucket_id text not null default 'sanad-knowledge-files',
  object_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  checksum_sha256 text,
  processing_status text not null default 'uploaded' check (processing_status in ('uploaded','processing','ready_for_review','failed','approved','published')),
  extracted_text text,
  extraction_summary text,
  extraction_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_metadata)='object'),
  processing_error text,
  uploaded_by_user_id uuid references public.profiles(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sanad_knowledge_files_source_idx on public.sanad_knowledge_files(source_id,created_at desc);
create index if not exists sanad_knowledge_files_status_idx on public.sanad_knowledge_files(processing_status,updated_at desc);
create trigger sanad_knowledge_files_updated_at before update on public.sanad_knowledge_files for each row execute function public.set_sanad_knowledge_updated_at();

alter table public.sanad_knowledge_files enable row level security;
revoke all on table public.sanad_knowledge_files from anon,authenticated;
grant all on table public.sanad_knowledge_files to service_role;

create policy "platform admins manage knowledge files"
on storage.objects for all to authenticated
using (bucket_id='sanad-knowledge-files' and public.is_current_platform_admin())
with check (bucket_id='sanad-knowledge-files' and public.is_current_platform_admin());

create or replace function public.platform_admin_register_knowledge_file(
  p_title text,p_original_name text,p_mime_type text,p_size_bytes bigint,p_object_path text,p_reason text default 'رفع ملف معرفة'
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_source_id uuid; v_file_id uuid; v_code text;
begin
  if not public.is_current_platform_admin() then raise exception 'platform_admin_required'; end if;
  if length(trim(coalesce(p_title,'')))<2 then raise exception 'title_required'; end if;
  if length(trim(coalesce(p_original_name,'')))<1 then raise exception 'file_name_required'; end if;
  if length(trim(coalesce(p_object_path,'')))<5 then raise exception 'object_path_required'; end if;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>26214400 then raise exception 'invalid_file_size'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'reason_required'; end if;
  v_code:='DOC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.sanad_knowledge_sources(source_code,source_type,title,description,knowledge_scope,status,visibility,authority_level,language,metadata,created_by_user_id,updated_by_user_id)
  values(v_code,'document',trim(p_title),'ملف معرفة مرفوع بانتظار استخراج النص والمراجعة.','platform_official','draft','assistant_public',2,'ar',jsonb_build_object('ingestion','file_upload','original_name',p_original_name),v_actor,v_actor)
  returning id into v_source_id;
  insert into public.sanad_knowledge_files(source_id,bucket_id,object_path,original_name,mime_type,size_bytes,processing_status,uploaded_by_user_id)
  values(v_source_id,'sanad-knowledge-files',trim(p_object_path),trim(p_original_name),trim(p_mime_type),p_size_bytes,'uploaded',v_actor)
  returning id into v_file_id;
  insert into public.sanad_knowledge_references(source_id,platform,reference_type,external_id,label,is_primary,metadata)
  values(v_source_id,'storage','document_file',v_file_id::text,trim(p_original_name),true,jsonb_build_object('bucket_id','sanad-knowledge-files','object_path',trim(p_object_path),'mime_type',trim(p_mime_type),'size_bytes',p_size_bytes));
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,after_data)
  values(v_actor,'knowledge_file_registered','sanad_knowledge_file',v_file_id::text,p_reason,jsonb_build_object('source_id',v_source_id,'source_code',v_code,'object_path',p_object_path,'mime_type',p_mime_type,'size_bytes',p_size_bytes));
  return jsonb_build_object('ok',true,'source_id',v_source_id,'source_code',v_code,'file_id',v_file_id,'processing_status','uploaded');
end;
$$;

create or replace function public.platform_admin_get_knowledge_files(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_current_platform_admin() then raise exception 'platform_admin_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (
    select f.id,f.source_id,s.source_code,s.title,s.status as source_status,f.original_name,f.mime_type,f.size_bytes,f.processing_status,f.extraction_summary,f.processing_error,f.processed_at,f.created_at,f.updated_at
    from public.sanad_knowledge_files f join public.sanad_knowledge_sources s on s.id=f.source_id order by f.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
  ) q),'[]'::jsonb);
end;
$$;

create or replace function public.complete_sanad_knowledge_file_processing(
  p_file_id uuid,p_extracted_text text,p_summary text,p_metadata jsonb default '{}'::jsonb,p_error text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_file public.sanad_knowledge_files%rowtype; v_chunk text; v_index integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_file from public.sanad_knowledge_files where id=p_file_id for update;
  if v_file.id is null then raise exception 'knowledge_file_not_found'; end if;
  if p_error is not null then
    update public.sanad_knowledge_files set processing_status='failed',processing_error=left(p_error,2000),processed_at=now() where id=p_file_id;
    return jsonb_build_object('ok',false,'status','failed');
  end if;
  update public.sanad_knowledge_files set processing_status='ready_for_review',extracted_text=coalesce(p_extracted_text,''),extraction_summary=nullif(trim(coalesce(p_summary,'')),''),extraction_metadata=coalesce(p_metadata,'{}'::jsonb),processing_error=null,processed_at=now() where id=p_file_id;
  delete from public.sanad_knowledge_units where source_id=v_file.source_id;
  for v_chunk in select trim(value) from regexp_split_to_table(coalesce(p_extracted_text,''),E'\n\s*\n+') value where length(trim(value))>0 loop
    insert into public.sanad_knowledge_units(source_id,unit_type,heading,content,summary,keywords,intent_tags,audience_tags,channel_tags,chunk_index,metadata)
    values(v_file.source_id,'document_section',case when v_index=0 then nullif(trim(coalesce(p_summary,'')),'') else null end,left(v_chunk,12000),case when v_index=0 then nullif(trim(coalesce(p_summary,'')),'') else null end,'{}','{}','{}',array['whatsapp','app'],v_index,jsonb_build_object('knowledge_file_id',p_file_id,'auto_extracted',true));
    v_index:=v_index+1; exit when v_index>=120;
  end loop;
  if v_index=0 and length(trim(coalesce(p_extracted_text,'')))>0 then
    insert into public.sanad_knowledge_units(source_id,unit_type,content,chunk_index,metadata)
    values(v_file.source_id,'document_section',left(trim(p_extracted_text),12000),0,jsonb_build_object('knowledge_file_id',p_file_id,'auto_extracted',true));
    v_index:=1;
  end if;
  update public.sanad_knowledge_sources set description=coalesce(nullif(trim(coalesce(p_summary,'')),''),description),updated_at=now() where id=v_file.source_id;
  return jsonb_build_object('ok',true,'status','ready_for_review','units_created',v_index,'source_id',v_file.source_id);
end;
$$;

revoke all on function public.platform_admin_register_knowledge_file(text,text,text,bigint,text,text) from public,anon;
revoke all on function public.platform_admin_get_knowledge_files(integer) from public,anon;
revoke all on function public.complete_sanad_knowledge_file_processing(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.platform_admin_register_knowledge_file(text,text,text,bigint,text,text) to authenticated,service_role;
grant execute on function public.platform_admin_get_knowledge_files(integer) to authenticated,service_role;
grant execute on function public.complete_sanad_knowledge_file_processing(uuid,text,text,jsonb,text) to service_role;

notify pgrst,'reload schema';
commit;
