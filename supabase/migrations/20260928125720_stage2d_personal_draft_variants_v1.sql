-- Extend the EXISTING versioned editor; no executor, normalizer, tables or ERP change.
begin;
create or replace function public.update_my_sanad_agent_action_draft_v2(
  p_action_id uuid, p_expected_version integer, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sanad_agent_actions%rowtype;
  v_contract jsonb;
  v_payload jsonb;
  v_review jsonb;
  v_fingerprint text;
  v_variant text;
  v_fields text[];
begin
  if v_uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception 'valid_expected_version_required' using errcode='22023';
  end if;
  select * into v_row from public.sanad_agent_actions
  where id=p_action_id and user_id=v_uid for update;
  if not found then raise exception 'agent_action_not_found' using errcode='P0002'; end if;
  if v_row.status<>'review' then raise exception 'agent_action_not_editable' using errcode='22023'; end if;
  if v_row.version<>p_expected_version then
    raise exception 'agent_action_version_conflict' using errcode='40001';
  end if;
  v_variant := v_row.payload->>'transaction_type';
  if v_row.action_type<>'personal_transaction' or coalesce(v_variant,'') not in ('expense','income','transfer')
     or v_row.business_id is not null then
    raise exception 'agent_action_edit_variant_not_supported' using errcode='22023';
  end if;
  -- Complete editable-field replacement, never a permissive merge of caller JSON.
  -- Missing optional values must be explicit null; unknown/scope/metadata keys fail closed.
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'invalid_action_payload' using errcode='22023';
  end if;
  v_fields := case when v_variant='transfer' then
    array['transaction_type','amount','currency','source_account_id','destination_account_id','description','transaction_at']
    else array['transaction_type','amount','currency','account_id','category_id','description','transaction_at'] end;
  if not (p_payload ?& v_fields)
     or exists(select 1 from jsonb_object_keys(p_payload) k where not (k=any(v_fields)))
     or p_payload->>'transaction_type' is distinct from v_variant then
    raise exception 'invalid_personal_edit_fields' using errcode='22023';
  end if;
  -- Validate before numeric(24,6) normalization: never silently round excess decimals.
  if coalesce(p_payload->>'amount','') !~ '^[0-9]{1,14}(\.[0-9]{1,6})?$' then
    raise exception 'invalid_action_amount' using errcode='22023';
  end if;
  if nullif(btrim(p_payload->>'transaction_at'),'') is null then
    raise exception 'invalid_action_transaction_at' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'description') not in ('string','null')
     or length(p_payload->>'description')>500 then
    raise exception 'action_note_too_long_or_missing' using errcode='22023';
  end if;
  v_contract := private.normalize_sanad_agent_action_v1(
    v_row.thread_id,v_row.action_type,p_payload,v_row.id,v_row.attachment_ids);
  v_payload := jsonb_set(v_contract->'payload','{metadata}',v_row.payload->'metadata');
  v_review := v_contract->'review';
  if v_payload->>'currency' is distinct from p_payload->>'currency' then
    raise exception 'action_account_currency_mismatch' using errcode='22023';
  end if;
  if not isfinite((v_payload->>'transaction_at')::timestamptz) then
    raise exception 'invalid_action_transaction_at' using errcode='22023';
  end if;
  if v_payload is not distinct from v_row.payload and v_review is not distinct from v_row.review then
    return to_jsonb(v_row);
  end if;
  v_fingerprint := md5(v_row.action_type||'|'||v_row.thread_id::text||'|'||(v_payload-'metadata')::text);
  if exists(select 1 from public.sanad_agent_actions a
    where a.user_id=v_uid and a.id<>v_row.id and a.fingerprint=v_fingerprint
      and a.status in ('review','approved','executing')) then
    raise exception 'identical_active_action_already_exists' using errcode='23505';
  end if;
  begin
    update public.sanad_agent_actions
    set payload=v_payload,review=v_review,fingerprint=v_fingerprint,version=version+1,updated_at=now()
    where id=v_row.id and user_id=v_uid and status='review' and version=p_expected_version
    returning * into v_row;
  exception when unique_violation then
    raise exception 'identical_active_action_already_exists' using errcode='23505';
  end;
  if not found then raise exception 'agent_action_concurrent_edit' using errcode='40001'; end if;
  insert into public.sanad_agent_action_events(action_id,user_id,event_type,data)
  values(v_row.id,v_uid,'edited',jsonb_build_object('version',v_row.version,'variant',v_variant,'source','canonical_edit'));
  update public.sanad_work_items
  set title=coalesce(nullif(v_review->>'title',''),'إجراء ينتظر اعتمادك'),
      summary=coalesce(nullif(v_review->>'summary',''),'راجع تفاصيل الإجراء قبل اعتماده.'),updated_at=now()
  where recipient_user_id=v_uid and source_type='sanad_agent_action' and source_id=v_row.id::text
    and dedupe_key='agent_action_review:'||v_row.id::text and status in ('open','in_progress');
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) from public,anon;
grant execute on function public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb) to authenticated;

create or replace function public.get_my_sanad_action_capabilities_v1(
  p_thread_id uuid
)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_thread public.sanad_agent_threads%rowtype;
 v_common jsonb;
 v_editor regprocedure := to_regprocedure('public.update_my_sanad_agent_action_draft_v2(uuid,integer,jsonb)');
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
 v_common := jsonb_build_object(
   'schema_version',1,
   'source','server_authorized',
   'thread_id',v_thread.id,
   'project_kind',v_thread.project_kind,
   'business_id',v_thread.business_id,
   'create_rpc','create_my_sanad_agent_action_draft_v1',
   'review_rpc','get_my_sanad_agent_action_v1',
   'approve_rpc','approve_my_sanad_agent_action_v1',
   'cancel_rpc','cancel_my_sanad_agent_action_v1',
   'approval_requires_expected_version',true,
   'form_edit_supported',false,
   'erp_write_supported',false
 );
 if v_thread.project_kind='personal' and v_thread.business_id is null then
   return v_common || jsonb_build_object('actions',jsonb_build_array(
     jsonb_build_object('id','personal_account_setup','action_type','personal_account_setup',
       'risk','approval_required','required_fields',jsonb_build_array('name','currency'),
       'optional_fields','[]'::jsonb,'form_edit_supported',false,
       'approval_effect','creates_personal_asset_account_zero_opening_balance'),
     jsonb_build_object('id','personal_category_setup','action_type','personal_category_setup',
       'risk','approval_required','required_fields',jsonb_build_array('name','kind'),
       'supported_variants',jsonb_build_array('income','expense'),
       'optional_fields','[]'::jsonb,'form_edit_supported',false,
       'approval_effect','creates_personal_category_only'),
     jsonb_build_object(
       'id','personal_income','action_type','personal_transaction','variant','income',
       'form_edit_supported',v_editor is not null and has_function_privilege('authenticated',v_editor,'EXECUTE'),
       'edit_rpc','update_my_sanad_agent_action_draft_v2',
       'editable_fields',jsonb_build_array('amount','currency','account_id','category_id','description','transaction_at'),
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','currency','account_id'),
       'optional_fields',jsonb_build_array('category_id','description','transaction_at'),
       'account_lookup','personal_owner_active_account_same_currency',
       'approval_effect','creates_personal_finance_transaction'),
     jsonb_build_object(
       'id','personal_expense','action_type','personal_transaction','variant','expense',
       'form_edit_supported',v_editor is not null and has_function_privilege('authenticated',v_editor,'EXECUTE'),
       'edit_rpc','update_my_sanad_agent_action_draft_v2',
       'editable_fields',jsonb_build_array('amount','currency','account_id','category_id','description','transaction_at'),
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','currency','account_id'),
       'optional_fields',jsonb_build_array('category_id','description','transaction_at'),
       'account_lookup','personal_owner_active_account_same_currency',
       'approval_effect','creates_personal_finance_transaction'),
     jsonb_build_object(
       'id','personal_transfer','action_type','personal_transaction','variant','transfer',
       'form_edit_supported',v_editor is not null and has_function_privilege('authenticated',v_editor,'EXECUTE'),
       'edit_rpc','update_my_sanad_agent_action_draft_v2',
       'editable_fields',jsonb_build_array('amount','currency','source_account_id','destination_account_id','description','transaction_at'),
       'risk','approval_required',
       'required_fields',jsonb_build_array('transaction_type','amount','source_account_id','destination_account_id'),
       'optional_fields',jsonb_build_array('description','transaction_at'),
       'account_lookup','personal_owner_active_accounts_same_currency',
       'approval_effect','creates_personal_finance_transaction')
   ));
 elsif v_thread.project_kind='business' and v_thread.business_id is not null
   and private.user_is_business_owner(v_thread.business_id,v_uid) then
   return v_common || jsonb_build_object('actions',jsonb_build_array(
     jsonb_build_object(
       'id','commercial_document','action_type','commercial_document_draft',
       'risk','approval_required',
       'supported_variants',jsonb_build_array(
         'quotation','sales_invoice','purchase_invoice',
         'receipt','payment','expense'),
       'required_fields',jsonb_build_array('business_id','document_type','currency','description_or_lines'),
       'optional_fields',jsonb_build_array(
         'party_id','document_number','document_date','due_date','notes'),
       'party_lookup','same_business_authorized_party',
       'approval_effect','creates_sanad_document_draft_only')
   ));
 end if;
 -- Unclassified, improperly bound, and non-owner business threads cannot
 -- obtain actionable descriptors. The underlying RPCs enforce authority again.
 return v_common || jsonb_build_object('actions','[]'::jsonb);
end;
$function$;
revoke all on function public.get_my_sanad_action_capabilities_v1(uuid)
 from public,anon;
grant execute on function public.get_my_sanad_action_capabilities_v1(uuid)
 to authenticated;
comment on function public.get_my_sanad_action_capabilities_v1(uuid) is
 'Stage 2D.1: conservative server-owned capability descriptions; canonical action RPCs retain all validation, ownership, draft version and execution authority.';


commit;
