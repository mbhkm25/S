-- Move the implementation behind a non-user-callable private function, then
-- expose a guarded command that preserves separate claim/complete permissions.

alter function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text)
  set schema private;
alter function private.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text)
  rename to complete_operation_workflow_core;

revoke all on function private.complete_operation_workflow_core(uuid,uuid,uuid,uuid,text,text) from public;
revoke all on function private.complete_operation_workflow_core(uuid,uuid,uuid,uuid,text,text) from anon;
revoke all on function private.complete_operation_workflow_core(uuid,uuid,uuid,uuid,text,text) from authenticated;

create or replace function public.complete_operation_workflow(
  p_operation_id uuid default null,
  p_token uuid default null,
  p_business_id uuid default null,
  p_inbox_id uuid default null,
  p_note text default null,
  p_source text default 'operation_details'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_operation_id uuid:=p_operation_id;
  v_business_id uuid:=p_business_id;
  v_inbox public.business_payment_inbox%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  if p_inbox_id is not null then
    select * into v_inbox
    from public.business_payment_inbox
    where id=p_inbox_id;
    if not found then raise exception 'payment_inbox_item_not_found'; end if;
    v_operation_id:=v_inbox.operation_id;
    v_business_id:=v_inbox.business_id;
  elsif v_business_id is not null then
    if v_operation_id is null and p_token is not null then
      select id into v_operation_id
      from public.operations
      where public_token=p_token
        and token_status='active'
        and (token_expires_at is null or token_expires_at>now());
    end if;
    if v_operation_id is not null then
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
    p_operation_id,p_token,p_business_id,p_inbox_id,p_note,p_source
  );
end;
$$;

revoke all on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) from public;
revoke all on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) from anon;
grant execute on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) to authenticated;

comment on function public.complete_operation_workflow(uuid,uuid,uuid,uuid,text,text) is
  'Guarded atomic operation command. Implicitly claiming a new/released business payment requires payments.claim; completion requires payments.complete in the private core.';
