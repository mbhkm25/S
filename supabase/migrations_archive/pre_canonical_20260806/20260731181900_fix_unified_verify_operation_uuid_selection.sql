-- PostgreSQL does not provide min(uuid). Select the only accessible business
-- deterministically through an ordered UUID array while retaining the count guard.
create or replace function public.verify_operation(p_token uuid, p_note text default null)
returns table(
  operation_id uuid,
  status text,
  relation_type text,
  verified_by_user_id uuid,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_operation_id uuid;
  v_business_ids uuid[];
begin
  select o.id into v_operation_id
  from public.operations o
  where o.public_token=p_token
    and o.token_status='active'
    and (o.token_expires_at is null or o.token_expires_at>now());
  if not found then raise exception 'operation_not_found_or_token_expired'; end if;

  select coalesce(array_agg(distinct i.business_id order by i.business_id),'{}'::uuid[])
  into v_business_ids
  from public.business_payment_inbox i
  where i.operation_id=v_operation_id
    and private.has_business_payment_permission(i.business_id,'complete',auth.uid());

  v_result:=public.complete_operation_workflow(
    v_operation_id,
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
$$;
