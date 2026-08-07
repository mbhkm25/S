create or replace function public.get_report_payload_v2(p_report_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_operations jsonb;
begin
  v_payload := public.get_report_payload(p_report_request_id);

  select coalesce(
    jsonb_agg(
      op || jsonb_build_object(
        'file_available', (
          o.original_file_status = 'stored'
          and nullif(btrim(coalesce(o.file_path, '')), '') is not null
        ),
        'file_mime_type', o.file_mime_type,
        'file_original_name', o.file_original_name,
        'original_file_status', o.original_file_status,
        'notes_count', coalesce(n.notes_count, 0),
        'has_text_note', coalesce(n.has_text_note, false),
        'has_audio_note', coalesce(n.has_audio_note, false),
        'latest_note_at', n.latest_note_at
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_operations
  from jsonb_array_elements(coalesce(v_payload->'operations', '[]'::jsonb))
       with ordinality as items(op, ordinality)
  left join public.operations o
    on o.id = nullif(op->>'id', '')::uuid
  left join lateral (
    select
      count(*)::integer as notes_count,
      bool_or(onote.note_type = 'text' or nullif(btrim(coalesce(onote.text_content, '')), '') is not null) as has_text_note,
      bool_or(onote.note_type = 'audio' or nullif(btrim(coalesce(onote.audio_path, '')), '') is not null) as has_audio_note,
      max(onote.created_at) as latest_note_at
    from public.operation_notes onote
    where onote.operation_id = o.id
  ) n on true;

  return jsonb_set(
    v_payload,
    '{operations}',
    coalesce(v_operations, '[]'::jsonb),
    true
  );
end;
$function$;

comment on function public.get_report_payload_v2(uuid) is
'Builds the operations-v2 report payload with safe file metadata and note-presence indicators. It never exposes storage paths, buckets, signed URLs, note text, or audio paths.';