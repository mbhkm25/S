-- Prevent authenticated clients from forging analyzed/verified operation state.
-- Browser/PWA clients may only create stored, pending-analysis intake records
-- from their own operation-files path. Analysis, routing, and verification remain
-- server-owned transitions.

create or replace function private.enforce_authenticated_operation_intake()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_mime text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_profile
  from public.profiles
  where id=v_uid and status='active';
  if not found then
    raise exception 'profile_not_found_or_inactive' using errcode='42501';
  end if;

  if new.submitted_by_user_id is distinct from v_uid then
    raise exception 'operation_submitter_mismatch' using errcode='42501';
  end if;

  if new.source not in ('pwa_upload','share_target') then
    raise exception 'invalid_authenticated_operation_source' using errcode='42501';
  end if;

  new.upload_origin := 'pwa';
  new.submitted_by_user_id := v_uid;
  new.submitted_by_name := v_profile.full_name;
  new.submitted_by_phone := coalesce(v_profile.phone,v_profile.pending_phone);

  if coalesce(new.file_bucket,'operation-files') <> 'operation-files' then
    raise exception 'invalid_operation_file_bucket' using errcode='42501';
  end if;
  new.file_bucket := 'operation-files';

  if new.file_path is null
     or left(new.file_path,length(v_uid::text)+1) <> v_uid::text||'/'
     or position('..' in new.file_path) > 0 then
    raise exception 'invalid_operation_file_path' using errcode='42501';
  end if;

  v_mime := lower(split_part(coalesce(new.file_mime_type,''),';',1));
  if v_mime not in ('image/jpeg','image/png','image/webp','application/pdf') then
    raise exception 'unsupported_operation_file_type' using errcode='42501';
  end if;
  new.file_mime_type := v_mime;

  if new.file_size is null or new.file_size <= 0 or new.file_size > 52428800 then
    raise exception 'invalid_operation_file_size' using errcode='42501';
  end if;

  -- Server-owned identity and lifecycle fields. A signed-in client may only create
  -- a stored, pending-analysis intake record. Analysis/routing/verification flows
  -- are the only paths allowed to promote it afterwards.
  new.id := gen_random_uuid();
  new.public_token := gen_random_uuid();
  new.token_status := 'active';
  new.token_expires_at := null;
  new.storage_metadata := '{}'::jsonb;
  new.file_sha256 := null;
  new.original_file_status := 'stored';
  new.qr_status := 'created';
  new.status := 'stored';
  new.ai_status := 'pending';
  new.ai_model := null;
  new.ai_error := null;
  new.raw_ai_json := '{}'::jsonb;
  new.summary := null;
  new.structured_data := '{}'::jsonb;
  new.financial_entity := null;
  new.transaction_type := null;
  new.amount := null;
  new.currency := null;
  new.reference_number := null;
  new.transaction_datetime := null;
  new.confidence_score := null;
  new.ai_confidence_score := null;
  new.sanad_confidence_score := null;
  new.sanad_risk_level := 'unknown';
  new.sanad_review_status := 'not_required';
  new.sanad_time_check := '{}'::jsonb;
  new.sanad_warnings := '[]'::jsonb;
  new.sanad_attention_points := '[]'::jsonb;
  new.visual_integrity_notes := '[]'::jsonb;
  new.missing_fields := '[]'::jsonb;
  new.possible_fraud := false;
  new.verified_by_user_id := null;
  new.verified_at := null;
  new.verification_note := null;
  new.raw_webhook_json := '{}'::jsonb;
  new.created_at := now();
  new.updated_at := now();
  new.transaction_date := null;
  new.transaction_time := null;
  new.transaction_time_present := false;
  new.transaction_date_source := null;
  new.transaction_timezone := null;
  new.received_at := now();
  new.received_timezone := 'Asia/Aden';
  new.analysis_contract_version := 1;
  new.analysis_prompt_version := null;
  new.analysis_completed_at := null;
  new.financial_entity_code := null;
  new.document_template := null;
  new.document_template_confidence := null;
  new.transaction_direction := null;
  new.transaction_direction_confidence := null;
  new.sender_name := null;
  new.receiver_name := null;
  new.sender_account := null;
  new.receiver_account := null;
  new.sender_identifier_type := null;
  new.receiver_identifier_type := null;
  new.document_account := null;
  new.credited_account := null;
  new.debited_account := null;
  new.merchant_point := null;
  new.multiple_operations_present := false;
  new.selected_operation_position := null;
  new.field_confidences := '{}'::jsonb;
  new.field_evidence := '{}'::jsonb;
  new.sender_name_normalized := null;
  new.receiver_name_normalized := null;
  new.sender_account_normalized := null;
  new.receiver_account_normalized := null;
  new.document_account_normalized := null;
  new.credited_account_normalized := null;
  new.debited_account_normalized := null;
  new.merchant_point_normalized := null;
  new.preview_status := 'pending';
  new.preview_bucket := null;
  new.preview_path := null;
  new.preview_mime_type := null;
  new.preview_size := null;
  new.preview_width := null;
  new.preview_height := null;
  new.preview_generated_at := null;
  new.preview_error := null;
  new.preview_source_sha256 := null;
  new.preview_attempt_count := 0;
  new.pipeline_run_id := null;
  new.identity_version := 1;
  new.normalized_reference_number := null;
  new.transaction_identity_key := null;
  new.transaction_fingerprint := null;
  new.identity_status := 'pending';
  new.identity_confidence := null;
  new.identity_evidence := '{}'::jsonb;
  new.identity_evaluated_at := null;

  if new.client_upload_metadata is null or jsonb_typeof(new.client_upload_metadata) <> 'object' then
    new.client_upload_metadata := '{}'::jsonb;
  end if;

  return new;
end;
$function$;

drop trigger if exists a00_authenticated_operation_intake_guard on public.operations;
create trigger a00_authenticated_operation_intake_guard
before insert on public.operations
for each row execute function private.enforce_authenticated_operation_intake();

revoke all on function private.enforce_authenticated_operation_intake() from public, anon, authenticated;
