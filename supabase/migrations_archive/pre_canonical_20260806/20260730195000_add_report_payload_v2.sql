-- Enrich report operations with safe file metadata for interactive PDF reports.
-- No storage bucket/path or signed URL is exposed in the report payload.

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
        'original_file_status', o.original_file_status
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_operations
  from jsonb_array_elements(coalesce(v_payload->'operations', '[]'::jsonb))
       with ordinality as items(op, ordinality)
  left join public.operations o
    on o.id = nullif(op->>'id', '')::uuid;

  return jsonb_set(
    v_payload,
    '{operations}',
    coalesce(v_operations, '[]'::jsonb),
    true
  );
end;
$function$;

revoke all on function public.get_report_payload_v2(uuid) from public;
grant execute on function public.get_report_payload_v2(uuid) to service_role;

comment on function public.get_report_payload_v2(uuid) is
  'Returns the existing report payload enriched with safe original-file availability metadata. Storage paths and signed URLs are intentionally excluded.';
