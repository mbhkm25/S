-- Stage 2D.2-B UI capability: same existing owner-scoped descriptor.
-- Common form support remains false; only expense advertises its proven v2 editor.
-- Fails closed before backend #413 installation or after its EXECUTE grant is revoked.
-- No records, policies, approval handlers or financial data are changed.
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
     jsonb_build_object(
       'id','personal_income','action_type','personal_transaction','variant','income',
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
