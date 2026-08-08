begin;

do $$
declare
  v_exact record;
  v_probable record;
  v_reuse jsonb;
begin
  if to_regprocedure('private.operation_reuse_resolution(uuid)') is null then
    raise exception 'operation reuse resolver missing';
  end if;

  if to_regprocedure('public.get_business_payment_reuse_notices(uuid)') is null then
    raise exception 'payment reuse notices RPC missing';
  end if;

  if has_function_privilege('authenticated','private.operation_reuse_resolution(uuid)','EXECUTE') then
    raise exception 'authenticated must not execute private reuse resolver';
  end if;

  if not has_function_privilege('authenticated','public.get_business_payment_reuse_notices(uuid)','EXECUTE') then
    raise exception 'authenticated must execute payment reuse notices RPC';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname='business_payment_inbox_duplicate_guard' and not tgisinternal
  ) then
    raise exception 'duplicate payment inbox guard missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname='operations_identity_serialization_before_write' and not tgisinternal
  ) then
    raise exception 'identity serialization trigger missing';
  end if;

  select operation_id,canonical_operation_id into v_exact
  from private.operation_identity_shadow_runs
  where identity_version=1
    and match_type='exact_duplicate'
    and canonical_operation_id is not null
  order by evaluated_at desc,id desc
  limit 1;

  if v_exact.operation_id is not null then
    v_reuse := private.operation_reuse_resolution(v_exact.operation_id);
    if not coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
      raise exception 'exact duplicate is not actionable';
    end if;
    if nullif(v_reuse->>'canonical_operation_id','')::uuid is distinct from v_exact.canonical_operation_id then
      raise exception 'canonical mismatch';
    end if;
  end if;

  select operation_id into v_probable
  from private.operation_identity_shadow_runs
  where identity_version=1 and match_type='probable_duplicate'
  order by evaluated_at desc,id desc
  limit 1;

  if v_probable.operation_id is not null then
    v_reuse := private.operation_reuse_resolution(v_probable.operation_id);
    if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
      raise exception 'probable duplicate leaked into enforcement';
    end if;
  end if;
end $$;

do $$
declare
  v_entry text;
  v_open text;
begin
  select pg_get_functiondef('public.get_operation_entry_decision(uuid)'::regprocedure) into v_entry;
  select pg_get_functiondef('public.open_operation_access_identity_core(uuid,text)'::regprocedure) into v_open;

  if position('operation_reuse_resolution' in v_entry)=0
     or position('canonical_operation_id' in v_entry)=0 then
    raise exception 'entry decision is not canonical-aware';
  end if;

  if position('operation_reuse_resolution' in v_open)=0
     or position('v_access.public_token' in v_open)=0 then
    raise exception 'open access does not redirect exact duplicates to canonical operation';
  end if;
end $$;

rollback;
