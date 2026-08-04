begin;

create or replace function public.get_operation_details_runtime(p_public_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_inbox public.business_payment_inbox%rowtype;
  v_business_name text;
  v_account_holder text;
  v_account_verification text;
  v_claimed_name text;
  v_completed_name text;
  v_verified_name text;
  v_supervisor boolean := false;
  v_has_access boolean := false;
  v_transaction_at timestamptz;
  v_received_at timestamptz;
  v_delta_seconds bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_operation
  from public.operations
  where public_token = p_public_token
    and token_status = 'active'
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    raise exception 'operation_not_found';
  end if;

  select (
    v_operation.submitted_by_user_id = v_uid
    or exists (
      select 1 from public.operation_access_logs l
      where l.operation_id = v_operation.id and l.user_id = v_uid
    )
    or exists (
      select 1 from public.operation_user_links ul
      where ul.operation_id = v_operation.id and ul.user_id = v_uid
    )
    or exists (
      select 1 from public.business_payment_inbox i
      where i.operation_id = v_operation.id
        and private.has_business_payment_permission(i.business_id,'view',v_uid)
    )
  ) into v_has_access;

  if not coalesce(v_has_access,false) then
    raise exception 'operation_access_denied' using errcode='42501';
  end if;

  select i.* into v_inbox
  from public.business_payment_inbox i
  where i.operation_id = v_operation.id
    and private.has_business_payment_permission(i.business_id,'view',v_uid)
  order by i.created_at desc
  limit 1;

  if v_inbox.id is not null then
    select bp.name into v_business_name
    from public.business_profiles bp where bp.id = v_inbox.business_id;

    select bfa.account_holder_name, bfa.verification_status
      into v_account_holder, v_account_verification
    from public.business_financial_accounts bfa
    where bfa.id = v_inbox.financial_account_id;

    select p.full_name into v_claimed_name
    from public.profiles p where p.id = v_inbox.claimed_by_user_id;

    select p.full_name into v_completed_name
    from public.profiles p where p.id = v_inbox.completed_by_user_id;

    v_supervisor := private.is_business_payment_supervisor(v_inbox.business_id,v_uid);
  end if;

  select p.full_name into v_verified_name
  from public.profiles p where p.id = v_operation.verified_by_user_id;

  v_transaction_at := v_operation.transaction_datetime;
  if v_transaction_at is null and v_operation.transaction_date is not null then
    v_transaction_at := (
      v_operation.transaction_date::text || ' ' || coalesce(v_operation.transaction_time::text,'00:00:00')
    )::timestamp at time zone coalesce(v_operation.transaction_timezone,'Asia/Aden');
  end if;

  v_received_at := coalesce(v_operation.received_at,v_operation.created_at);
  if v_transaction_at is not null and v_received_at is not null then
    v_delta_seconds := extract(epoch from (v_received_at-v_transaction_at))::bigint;
  end if;

  return jsonb_build_object(
    'contract_version',2,
    'read_only',true,
    'operation',jsonb_build_object(
      'id',v_operation.id,
      'public_token',v_operation.public_token,
      'status',v_operation.status,
      'ai_status',v_operation.ai_status,
      'financial_entity',v_operation.financial_entity,
      'financial_entity_code',v_operation.financial_entity_code,
      'amount',v_operation.amount,
      'currency',v_operation.currency,
      'receiver_name',coalesce(v_account_holder,v_operation.receiver_name),
      'receiver_name_raw',v_operation.receiver_name,
      'receiver_account',coalesce(v_operation.credited_account_normalized,v_operation.receiver_account_normalized,v_operation.receiver_account,v_operation.document_account_normalized,v_operation.document_account),
      'reference_number',v_operation.reference_number,
      'summary',v_operation.summary,
      'confidence_score',coalesce(v_operation.sanad_confidence_score,v_operation.ai_confidence_score,v_operation.confidence_score),
      'risk_level',v_operation.sanad_risk_level,
      'review_status',v_operation.sanad_review_status,
      'warnings',coalesce(v_operation.sanad_warnings,'[]'::jsonb),
      'attention_points',coalesce(v_operation.sanad_attention_points,'[]'::jsonb)
    ),
    'timing',jsonb_build_object(
      'transaction_at',v_transaction_at,
      'transaction_date_source',v_operation.transaction_date_source,
      'transaction_time_present',coalesce(v_operation.transaction_time_present,false),
      'transaction_timezone',coalesce(v_operation.transaction_timezone,'Asia/Aden'),
      'received_at',v_received_at,
      'received_timezone',coalesce(v_operation.received_timezone,'Asia/Aden'),
      'delta_seconds',v_delta_seconds
    ),
    'document',jsonb_build_object(
      'original_mime_type',v_operation.file_mime_type,
      'original_name',v_operation.file_original_name,
      'original_size',v_operation.file_size,
      'original_status',v_operation.original_file_status,
      'preview_status',v_operation.preview_status,
      'preview_mime_type',v_operation.preview_mime_type,
      'preview_size',v_operation.preview_size,
      'preview_width',v_operation.preview_width,
      'preview_height',v_operation.preview_height,
      'preview_generated_at',v_operation.preview_generated_at,
      'preview_error',v_operation.preview_error,
      'preview_attempt_count',v_operation.preview_attempt_count,
      'preview_source_sha256',v_operation.preview_source_sha256,
      'preview_pipeline_version',coalesce(v_operation.storage_metadata->>'preview_pipeline_version','legacy')
    ),
    'inbox',case when v_inbox.id is null then null else jsonb_build_object(
      'id',v_inbox.id,
      'business_id',v_inbox.business_id,
      'business_name',v_business_name,
      'financial_account_id',v_inbox.financial_account_id,
      'financial_account_holder',v_account_holder,
      'financial_account_verification',v_account_verification,
      'status',v_inbox.status,
      'row_version',v_inbox.row_version,
      'priority',v_inbox.priority,
      'match_score',v_inbox.match_score,
      'match_strategy',v_inbox.match_strategy,
      'claimed_by_user_id',v_inbox.claimed_by_user_id,
      'claimed_by_name',v_claimed_name,
      'claimed_at',v_inbox.claimed_at,
      'completed_by_user_id',v_inbox.completed_by_user_id,
      'completed_by_name',v_completed_name,
      'completed_at',v_inbox.completed_at,
      'review_reason',v_inbox.review_reason,
      'is_mine',v_inbox.claimed_by_user_id = v_uid,
      'is_supervisor',v_supervisor,
      'permissions',jsonb_build_object(
        'can_view',true,
        'can_claim',v_inbox.status in ('new','released') and private.has_business_payment_permission(v_inbox.business_id,'claim',v_uid),
        'can_complete',(
          (v_inbox.status in ('new','released') and private.has_business_payment_permission(v_inbox.business_id,'complete',v_uid))
          or (v_inbox.status='claimed' and private.has_business_payment_permission(v_inbox.business_id,'complete',v_uid) and (v_inbox.claimed_by_user_id=v_uid or v_supervisor))
        ),
        'can_review',private.has_business_payment_permission(v_inbox.business_id,'review',v_uid),
        'can_release',v_inbox.status='claimed' and (v_inbox.claimed_by_user_id=v_uid or v_supervisor)
      )
    ) end,
    'verification',jsonb_build_object(
      'verified_by_user_id',v_operation.verified_by_user_id,
      'verified_by_name',v_verified_name,
      'verified_at',v_operation.verified_at,
      'verification_note',v_operation.verification_note
    )
  );
end;
$$;

revoke all on function public.get_operation_details_runtime(uuid) from public,anon;
grant execute on function public.get_operation_details_runtime(uuid) to authenticated;

comment on function public.get_operation_details_runtime(uuid) is
'Operation Details Runtime v2 read contract. Stable and side-effect-free; never records access or mutates inbox state.';

commit;
