begin;

update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 26214400
where id = 'sanad-knowledge-files';

create or replace function public.platform_admin_register_knowledge_file(
  p_title text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_object_path text,
  p_reason text default 'رفع ملف معرفة'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_source_id uuid;
  v_file_id uuid;
  v_code text;
  v_extension text;
  v_allowed_extensions constant text[] := array[
    'pdf','doc','docx','xls','xlsx','ppt','pptx','md','markdown','txt','csv','html','htm','json','png','jpg','jpeg','webp'
  ];
begin
  if not public.is_current_platform_admin() then raise exception 'platform_admin_required'; end if;
  if length(trim(coalesce(p_title,''))) < 2 then raise exception 'title_required'; end if;
  if length(trim(coalesce(p_original_name,''))) < 1 then raise exception 'file_name_required'; end if;
  if length(trim(coalesce(p_object_path,''))) < 5 then raise exception 'object_path_required'; end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 26214400 then raise exception 'invalid_file_size'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'reason_required'; end if;

  v_extension := lower(regexp_replace(p_original_name, '^.*\.', ''));
  if v_extension = lower(p_original_name) or not (v_extension = any(v_allowed_extensions)) then
    raise exception 'unsupported_file_extension';
  end if;

  if p_object_path like '/%' or p_object_path like '%..%' then
    raise exception 'invalid_object_path';
  end if;

  v_code := 'DOC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.sanad_knowledge_sources(
    source_code, source_type, title, description, knowledge_scope, status,
    visibility, authority_level, language, metadata,
    created_by_user_id, updated_by_user_id
  ) values (
    v_code, 'document', trim(p_title),
    'ملف معرفة مرفوع بانتظار استخراج النص والمراجعة.',
    'platform_official', 'draft', 'assistant_public', 2, 'ar',
    jsonb_build_object(
      'ingestion','file_upload',
      'original_name',p_original_name,
      'extension',v_extension,
      'reported_mime_type',coalesce(nullif(trim(p_mime_type),''),'application/octet-stream')
    ),
    v_actor, v_actor
  ) returning id into v_source_id;

  insert into public.sanad_knowledge_files(
    source_id, bucket_id, object_path, original_name, mime_type,
    size_bytes, processing_status, uploaded_by_user_id
  ) values (
    v_source_id, 'sanad-knowledge-files', trim(p_object_path), trim(p_original_name),
    coalesce(nullif(trim(p_mime_type),''),'application/octet-stream'),
    p_size_bytes, 'uploaded', v_actor
  ) returning id into v_file_id;

  insert into public.sanad_knowledge_references(
    source_id, platform, reference_type, external_id, label, is_primary, metadata
  ) values (
    v_source_id, 'storage', 'document_file', v_file_id::text,
    trim(p_original_name), true,
    jsonb_build_object(
      'bucket_id','sanad-knowledge-files',
      'object_path',trim(p_object_path),
      'mime_type',coalesce(nullif(trim(p_mime_type),''),'application/octet-stream'),
      'extension',v_extension,
      'size_bytes',p_size_bytes
    )
  );

  insert into public.platform_admin_audit_log(
    actor_user_id, action, target_type, target_id, reason, after_data
  ) values (
    v_actor, 'knowledge_file_registered', 'sanad_knowledge_file', v_file_id::text,
    p_reason,
    jsonb_build_object(
      'source_id',v_source_id,'source_code',v_code,'object_path',p_object_path,
      'mime_type',coalesce(nullif(trim(p_mime_type),''),'application/octet-stream'),
      'extension',v_extension,'size_bytes',p_size_bytes
    )
  );

  return jsonb_build_object(
    'ok',true,
    'source_id',v_source_id,
    'source_code',v_code,
    'file_id',v_file_id,
    'processing_status','uploaded'
  );
end;
$$;

revoke all on function public.platform_admin_register_knowledge_file(text,text,text,bigint,text,text) from public,anon;
grant execute on function public.platform_admin_register_knowledge_file(text,text,text,bigint,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
