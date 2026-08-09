-- Centralize operation action routing on the canonical operation.
-- Exact duplicate/reused submissions remain accessible by their own token,
-- but all mutating verification actions are resolved server-side to the
-- canonical operation. Payment inbox rows continue to use their dedicated
-- reuse-resolution workflow.

create or replace function private.operation_action_policy(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_reuse jsonb;
  v_canonical public.operations%rowtype;
  v_canonical_id uuid;
  v_is_exact boolean := false;
  v_available boolean := false;
begin
  v_reuse := private.operation_reuse_resolution(p_operation_id);
  if coalesce((v_reuse->>'ok')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,
      'reason',coalesce(v_reuse->>'reason','operation_not_found'),
      'requested_operation_id',p_operation_id,
      'can_verify',false
    );
  end if;

  v_is_exact := coalesce((v_reuse->>'is_exact_duplicate')::boolean,false);
  v_canonical_id := nullif(v_reuse->>'canonical_operation_id','')::uuid;
  if v_canonical_id is null then
    return jsonb_build_object(
      'ok',false,
      'reason','canonical_operation_missing',
      'requested_operation_id',p_operation_id,
      'is_exact_duplicate',v_is_exact,
      'can_verify',false
    );
  end if;

  select * into v_canonical from public.operations where id=v_canonical_id;
  if not found then
    return jsonb_build_object(
      'ok',false,
      'reason','canonical_operation_missing',
      'requested_operation_id',p_operation_id,
      'canonical_operation_id',v_canonical_id,
      'is_exact_duplicate',v_is_exact,
      'can_verify',false
    );
  end if;

  v_available := coalesce(v_canonical.token_status,'active')='active'
    and (v_canonical.token_expires_at is null or v_canonical.token_expires_at>now());

  return jsonb_build_object(
    'ok',true,
    'requested_operation_id',p_operation_id,
    'canonical_operation_id',v_canonical.id,
    'is_canonical',p_operation_id=v_canonical.id,
    'is_exact_duplicate',v_is_exact,
    'match_type',v_reuse->>'match_type',
    'canonical_available',v_available,
    'canonical_status',v_canonical.status,
    'occurrence_count',coalesce((v_reuse->>'occurrence_count')::bigint,1),
    'can_verify',v_uid is not null and v_available,
    'verify_target_operation_id',case when v_uid is not null and v_available then v_canonical.id else null end,
    'reason',case
      when v_uid is null then 'not_authenticated'
      when not v_available then 'canonical_operation_unavailable'
      when v_is_exact then 'use_canonical_operation'
      else 'canonical_operation'
    end
  );
end;
$function$;

revoke all on function private.operation_action_policy(uuid) from public;

create or replace function public.complete_operation_workflow(
  p_operation_id uuid default null::uuid,
  p_token uuid default null::uuid,
  p_business_id uuid default null::uuid,
  p_inbox_id uuid default null::uuid,
  p_note text default null::text,
  p_source text default 'operation_details'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_operation_id uuid := p_operation_id;
  v_business_id uuid := p_business_id;
  v_inbox public.business_payment_inbox%rowtype;
  v_requested public.operations%rowtype;
  v_canonical public.operations%rowtype;
  v_reuse jsonb;
  v_effective_token uuid := p_token;
  v_source text := case
    when lower(trim(coalesce(p_source, ''))) in ('operation_details_runtime_v2','operation_details_runtime_v3','operation_details_runtime_v4')
      then 'operation_details'
    else lower(trim(coalesce(p_source, 'operation_details')))
  end;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if p_inbox_id is not null then
    select * into v_inbox
    from public.business_payment_inbox
    where id=p_inbox_id;
    if not found then raise exception 'payment_inbox_item_not_found'; end if;
    v_operation_id:=v_inbox.operation_id;
    v_business_id:=v_inbox.business_id;
  else
    if v_operation_id is not null then
      select * into v_requested from public.operations where id=v_operation_id;
      if not found then raise exception 'operation_not_found_or_token_expired'; end if;
      if p_token is not null and (
        v_requested.public_token<>p_token
        or coalesce(v_requested.token_status,'active')<>'active'
        or (v_requested.token_expires_at is not null and v_requested.token_expires_at<=now())
      ) then
        raise exception 'operation_token_mismatch' using errcode='42501';
      end if;
    elsif p_token is not null then
      select * into v_requested
      from public.operations
      where public_token=p_token
        and coalesce(token_status,'active')='active'
        and (token_expires_at is null or token_expires_at>now());
      if not found then raise exception 'operation_not_found_or_token_expired'; end if;
      v_operation_id:=v_requested.id;
    else
      raise exception 'operation_identifier_required';
    end if;

    v_reuse:=private.operation_reuse_resolution(v_operation_id);
    if coalesce((v_reuse->>'ok')::boolean,false) is not true then
      raise exception 'operation_reuse_resolution_failed';
    end if;
    if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
      if coalesce((v_reuse->>'canonical_available')::boolean,false) is not true then
        raise exception 'canonical_operation_unavailable';
      end if;
      select * into v_canonical
      from public.operations
      where id=nullif(v_reuse->>'canonical_operation_id','')::uuid;
      if not found then raise exception 'canonical_operation_missing'; end if;
      v_operation_id:=v_canonical.id;
      if p_token is not null then v_effective_token:=v_canonical.public_token; end if;
    end if;

    if v_business_id is not null then
      select * into v_inbox
      from public.business_payment_inbox
      where business_id=v_business_id and operation_id=v_operation_id;
    end if;
  end if;

  if v_business_id is not null
     and (v_inbox.id is null or v_inbox.status in ('new','released'))
     and not private.has_business_payment_permission(v_business_id,'claim',v_uid) then
    raise exception 'payment_inbox_claim_required' using errcode='42501';
  end if;

  return private.complete_operation_workflow_core(
    v_operation_id,v_effective_token,v_business_id,p_inbox_id,p_note,v_source
  );
end;
$function$;

create or replace function public.verify_operation(p_token uuid, p_note text default null::text)
returns table(operation_id uuid, status text, relation_type text, verified_by_user_id uuid, verified_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_requested_operation_id uuid;
  v_target_operation_id uuid;
  v_policy jsonb;
  v_business_ids uuid[];
begin
  select o.id into v_requested_operation_id
  from public.operations o
  where o.public_token=p_token
    and coalesce(o.token_status,'active')='active'
    and (o.token_expires_at is null or o.token_expires_at>now());
  if not found then raise exception 'operation_not_found_or_token_expired'; end if;

  v_policy:=private.operation_action_policy(v_requested_operation_id);
  if coalesce((v_policy->>'can_verify')::boolean,false) is not true then
    raise exception '%',coalesce(v_policy->>'reason','operation_not_verifiable') using errcode='42501';
  end if;
  v_target_operation_id:=nullif(v_policy->>'canonical_operation_id','')::uuid;

  select coalesce(array_agg(distinct i.business_id order by i.business_id),'{}'::uuid[])
  into v_business_ids
  from public.business_payment_inbox i
  where i.operation_id in (v_requested_operation_id,v_target_operation_id)
    and private.has_business_payment_permission(i.business_id,'complete',auth.uid());

  v_result:=public.complete_operation_workflow(
    v_requested_operation_id,
    p_token,
    case when cardinality(v_business_ids)=1 then v_business_ids[1] else null end,
    null,
    p_note,
    'qr_details'
  );

  operation_id:=(v_result->>'operation_id')::uuid;
  status:=v_result->>'operation_status';
  relation_type:='verifier';
  verified_by_user_id:=(v_result->>'verified_by_user_id')::uuid;
  verified_at:=(v_result->>'verified_at')::timestamptz;
  return next;
end;
$function$;

create or replace function public.open_operation_access(p_public_token uuid, p_source text default 'link'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_operation_id uuid;
  v_requested_operation_id uuid;
  v_conflict boolean;
  v_preview jsonb;
  v_policy jsonb;
begin
  v_payload:=public.open_operation_access_semantic_core(p_public_token,p_source);
  v_operation_id:=nullif(v_payload#>>'{operation,id}','')::uuid;
  if v_operation_id is null or not (v_payload#>'{operation,identity_projection}' is not null) then return v_payload; end if;

  select id into v_requested_operation_id from public.operations where public_token=p_public_token limit 1;
  if v_requested_operation_id is null then v_requested_operation_id:=v_operation_id; end if;
  v_policy:=private.operation_action_policy(v_requested_operation_id);

  v_conflict:=private.operation_identity_name_conflict(v_operation_id);
  select jsonb_build_object(
    'status',o.preview_status,'mime_type',o.preview_mime_type,'size',o.preview_size,
    'width',o.preview_width,'height',o.preview_height,'generated_at',o.preview_generated_at,
    'error',case when o.preview_status='failed' then 'preview_generation_failed' else null end,
    'available',o.preview_status='ready' and o.preview_path is not null
  ) into v_preview from public.operations o where o.id=v_operation_id;

  v_payload:=jsonb_set(v_payload,'{operation,identity_projection,has_name_conflict}',to_jsonb(coalesce(v_conflict,false)),true);
  v_payload:=jsonb_set(v_payload,'{operation,document_preview}',coalesce(v_preview,jsonb_build_object('status','not_required','available',false)),true);
  return jsonb_set(v_payload,'{operation,action_policy}',coalesce(v_policy,'{}'::jsonb),true);
end;
$function$;

create or replace function public.get_business_payment_inbox_v3(
  p_business_id uuid,
  p_view text default 'new'::text,
  p_limit integer default 50,
  p_before_created_at timestamptz default null::timestamptz,
  p_before_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_payload jsonb; v_items jsonb;
begin
  v_payload := public.get_business_payment_inbox_v2(p_business_id,p_view,p_limit,p_before_created_at,p_before_id);
  select coalesce(jsonb_agg(
    x.item || jsonb_build_object(
      'verified_by_user_id',o.verified_by_user_id,
      'verified_by_name',vp.full_name,
      'verified_at',o.verified_at,
      'action_policy',private.operation_action_policy(o.id)
    ) order by x.ord
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) with ordinality as x(item,ord)
  left join public.operations o on o.id=(x.item->>'operation_id')::uuid
  left join public.profiles vp on vp.id=o.verified_by_user_id;
  return jsonb_set(v_payload,'{items}',v_items,true)||jsonb_build_object('contract_version',4);
end;
$function$;
