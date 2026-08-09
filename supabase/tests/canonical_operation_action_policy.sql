-- Regression: a token belonging to an exact duplicate may open the canonical
-- operation, and any verification mutation must target that same canonical row.
-- The transaction is rolled back so this test never changes fixture state.

begin;

do $test$
declare
  v_duplicate_id uuid;
  v_canonical_id uuid;
  v_token uuid;
  v_user_id uuid;
  v_returned_id uuid;
  v_policy jsonb;
begin
  select s.submitted_operation_id,
         s.canonical_operation_id,
         o.public_token,
         coalesce(o.submitted_by_user_id, c.submitted_by_user_id)
    into v_duplicate_id, v_canonical_id, v_token, v_user_id
  from private.operation_submissions s
  join public.operations o on o.id=s.submitted_operation_id
  join public.operations c on c.id=s.canonical_operation_id
  where s.identity_match_type='exact_duplicate'
    and s.canonical_operation_id is not null
    and s.submitted_operation_id<>s.canonical_operation_id
    and coalesce(o.token_status,'active')='active'
    and (o.token_expires_at is null or o.token_expires_at>now())
    and coalesce(o.submitted_by_user_id,c.submitted_by_user_id) is not null
  order by s.created_at desc
  limit 1;

  if v_duplicate_id is null then
    raise exception 'canonical_action_test_fixture_missing';
  end if;

  perform set_config('request.jwt.claim.sub',v_user_id::text,true);
  v_policy:=private.operation_action_policy(v_duplicate_id);

  if (v_policy->>'canonical_operation_id')::uuid <> v_canonical_id then
    raise exception 'policy_failed_to_resolve_canonical';
  end if;

  if coalesce((v_policy->>'is_exact_duplicate')::boolean,false) is not true then
    raise exception 'policy_failed_to_mark_exact_duplicate';
  end if;

  if coalesce((v_policy->>'can_verify')::boolean,false) is not true then
    raise exception 'policy_failed_to_allow_authenticated_verification';
  end if;

  select operation_id
    into v_returned_id
  from public.verify_operation(v_token,null)
  limit 1;

  if v_returned_id <> v_canonical_id then
    raise exception 'verify_operation_targeted_noncanonical: expected %, got %',
      v_canonical_id,v_returned_id;
  end if;
end;
$test$;

rollback;
