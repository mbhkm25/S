-- Routing Benchmark dual-review integration test.
-- Run against a seeded environment. Every mutation is rolled back.

begin;

-- Test-only role assignments. These profiles and cases exist in the production
-- fixture used when this migration was validated. Replace the UUIDs when running
-- against another seeded environment.
insert into public.routing_benchmark_reviewers(
  user_id,reviewer_role,status,appointed_by_user_id
)
values
  ('16c56b09-9ba4-4120-b535-72603f5b6450','both','active','17a7ed7b-52ae-4407-a6f0-2e290d067048'),
  ('b30f2b3a-4416-4b37-88c6-7cffb43f6b05','reviewer','active','17a7ed7b-52ae-4407-a6f0-2e290d067048'),
  ('94965dc7-536a-4c22-adff-4ed5f91dc8d8','adjudicator','active','17a7ed7b-52ae-4407-a6f0-2e290d067048')
on conflict(user_id) do update
set reviewer_role=excluded.reviewer_role,
    status=excluded.status,
    updated_at=now();

create temporary table dual_review_test_state(
  before_links bigint
) on commit drop;

insert into dual_review_test_state
select count(*) from public.business_operation_links;

-- 1. Primary vote.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16c56b09-9ba4-4120-b535-72603f5b6450',
  true
);

select public.platform_admin_claim_routing_benchmark_case(
  '84fce464-6cdf-485c-8c5c-1449819ba4a3'
);

select public.platform_admin_review_routing_benchmark_case(
  '84fce464-6cdf-485c-8c5c-1449819ba4a3',
  'unreviewable','unreviewable','unreviewable','unreviewable',
  'unreviewable','unreviewable','correct_abstention',
  null,null,null,null,null,'[]'::jsonb,
  'اختبار الحكم الأول المستقل',
  'اختبار دورة المراجعة الثنائية'
);

reset role;

do $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_votes integer;
begin
  select * into v_case
  from public.operation_routing_benchmark_cases
  where id='84fce464-6cdf-485c-8c5c-1449819ba4a3';

  select count(*) into v_votes
  from public.operation_routing_benchmark_votes
  where case_id=v_case.id;

  if v_case.review_stage<>'awaiting_secondary'
     or v_case.status<>'pending'
     or v_votes<>1 then
    raise exception 'primary_vote_transition_failed';
  end if;
end;
$$;

-- 2. The same reviewer cannot submit the secondary vote.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16c56b09-9ba4-4120-b535-72603f5b6450',
  true
);

do $$
begin
  begin
    perform public.platform_admin_claim_routing_benchmark_case(
      '84fce464-6cdf-485c-8c5c-1449819ba4a3'
    );
    raise exception 'same_reviewer_was_allowed_as_secondary';
  exception when insufficient_privilege then
    if sqlerrm not like '%independent_secondary_reviewer_required%' then
      raise;
    end if;
  end;
end;
$$;

reset role;

-- 3. Independent secondary review is blind and matching votes finalize by consensus.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b30f2b3a-4416-4b37-88c6-7cffb43f6b05',
  true
);

do $$
declare
  v_detail jsonb;
begin
  v_detail:=public.platform_admin_get_routing_benchmark_case(
    '84fce464-6cdf-485c-8c5c-1449819ba4a3'
  );

  if jsonb_array_length(v_detail->'visible_votes')<>0 then
    raise exception 'secondary_review_not_blind';
  end if;

  if coalesce(
    (v_detail->'review_progress'->>'can_submit')::boolean,
    false
  ) is not true then
    raise exception 'secondary_cannot_submit';
  end if;
end;
$$;

select public.platform_admin_claim_routing_benchmark_case(
  '84fce464-6cdf-485c-8c5c-1449819ba4a3'
);

select public.platform_admin_review_routing_benchmark_case(
  '84fce464-6cdf-485c-8c5c-1449819ba4a3',
  'unreviewable','unreviewable','unreviewable','unreviewable',
  'unreviewable','unreviewable','correct_abstention',
  null,null,null,null,null,'[]'::jsonb,
  'اختبار الحكم الثاني المطابق',
  'اختبار اتفاق مراجعين مستقلين'
);

reset role;

do $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_votes integer;
  v_method text;
begin
  select * into v_case
  from public.operation_routing_benchmark_cases
  where id='84fce464-6cdf-485c-8c5c-1449819ba4a3';

  select count(*) into v_votes
  from public.operation_routing_benchmark_votes
  where case_id=v_case.id;

  select resolution_method into v_method
  from public.operation_routing_benchmark_reviews
  where id=v_case.final_review_id;

  if v_case.review_stage<>'finalized'
     or v_case.status<>'reviewed'
     or v_votes<>2
     or v_method<>'consensus' then
    raise exception 'consensus_finalization_failed';
  end if;
end;
$$;

-- 4. Independent disagreement waits for adjudication and does not count yet.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16c56b09-9ba4-4120-b535-72603f5b6450',
  true
);

select public.platform_admin_claim_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6'
);

select public.platform_admin_review_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6',
  'unreviewable','unreviewable','unreviewable','unreviewable',
  'unreviewable','unreviewable','correct_abstention',
  null,null,null,null,null,'[]'::jsonb,
  'اختبار حكم أول قبل التعارض',
  'اختبار مسار التعارض'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b30f2b3a-4416-4b37-88c6-7cffb43f6b05',
  true
);

select public.platform_admin_claim_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6'
);

select public.platform_admin_review_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6',
  'unreviewable','unreviewable','unreviewable','unreviewable',
  'unreviewable','unreviewable','unreviewable',
  null,null,null,null,null,'["poor_image"]'::jsonb,
  'اختبار حكم ثان مختلف',
  'اختبار اكتشاف التعارض'
);

reset role;

do $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_final integer;
begin
  select * into v_case
  from public.operation_routing_benchmark_cases
  where id='63f23b8a-ef5a-4468-90c1-125d1befb3c6';

  select count(*) into v_final
  from public.operation_routing_benchmark_reviews
  where case_id=v_case.id and superseded_at is null;

  if v_case.review_stage<>'awaiting_adjudication'
     or v_case.status<>'pending'
     or v_final<>0
     or not(v_case.disagreement_fields ? 'routing_verdict') then
    raise exception 'disagreement_transition_failed';
  end if;
end;
$$;

-- 5. A participating reviewer cannot adjudicate even when their role supports it.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16c56b09-9ba4-4120-b535-72603f5b6450',
  true
);

do $$
begin
  begin
    perform public.platform_admin_claim_routing_benchmark_case(
      '63f23b8a-ef5a-4468-90c1-125d1befb3c6'
    );
    raise exception 'participating_reviewer_was_allowed_to_adjudicate';
  exception when insufficient_privilege then
    if sqlerrm not like '%independent_adjudicator_required%' then
      raise;
    end if;
  end;
end;
$$;

reset role;

-- 6. Independent adjudicator sees both votes and creates the final truth.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '94965dc7-536a-4c22-adff-4ed5f91dc8d8',
  true
);

do $$
declare
  v_detail jsonb;
begin
  v_detail:=public.platform_admin_get_routing_benchmark_case(
    '63f23b8a-ef5a-4468-90c1-125d1befb3c6'
  );

  if jsonb_array_length(v_detail->'visible_votes')<>2 then
    raise exception 'adjudicator_cannot_see_both_votes';
  end if;

  if coalesce(
    (v_detail->'review_progress'->>'can_submit')::boolean,
    false
  ) is not true then
    raise exception 'adjudicator_cannot_submit';
  end if;
end;
$$;

select public.platform_admin_claim_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6'
);

select public.platform_admin_review_routing_benchmark_case(
  '63f23b8a-ef5a-4468-90c1-125d1befb3c6',
  'unreviewable','unreviewable','unreviewable','unreviewable',
  'unreviewable','unreviewable','correct_abstention',
  null,null,null,null,null,'[]'::jsonb,
  'حسم مستقل لصالح الامتناع الصحيح',
  'اختبار حسم التعارض مستقلًا'
);

reset role;

do $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_review public.operation_routing_benchmark_reviews%rowtype;
  v_before bigint;
  v_after bigint;
begin
  select * into v_case
  from public.operation_routing_benchmark_cases
  where id='63f23b8a-ef5a-4468-90c1-125d1befb3c6';

  select * into v_review
  from public.operation_routing_benchmark_reviews
  where id=v_case.final_review_id;

  if v_case.review_stage<>'finalized'
     or v_case.status<>'reviewed'
     or v_review.resolution_method<>'adjudicated'
     or v_review.adjudicator_user_id<>'94965dc7-536a-4c22-adff-4ed5f91dc8d8'::uuid then
    raise exception 'adjudication_finalization_failed';
  end if;

  select before_links into v_before from dual_review_test_state;
  select count(*) into v_after from public.business_operation_links;

  if v_after<>v_before then
    raise exception 'benchmark_created_business_operation_link';
  end if;
end;
$$;

select jsonb_build_object(
  'result','routing_benchmark_dual_review_passed_rolled_back',
  'consensus_case','84fce464-6cdf-485c-8c5c-1449819ba4a3',
  'adjudicated_case','63f23b8a-ef5a-4468-90c1-125d1befb3c6',
  'activation_allowed',false
) as result;

rollback;
