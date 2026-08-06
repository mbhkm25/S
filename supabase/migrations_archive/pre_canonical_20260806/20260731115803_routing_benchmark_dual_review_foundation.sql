-- Phase 4: independent dual review and adjudication for routing Benchmark.
-- This migration changes measurement only. It cannot create operational routing links.

create table public.routing_benchmark_reviewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('reviewer','adjudicator','both')),
  status text not null default 'active' check (status in ('active','inactive')),
  appointed_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routing_benchmark_reviewers enable row level security;
revoke all on public.routing_benchmark_reviewers from public, anon, authenticated;
create index routing_benchmark_reviewers_status_role_idx
  on public.routing_benchmark_reviewers(status, reviewer_role);

alter table public.operation_routing_benchmark_cases
  add column review_stage text not null default 'awaiting_primary'
    check (review_stage in ('awaiting_primary','awaiting_secondary','awaiting_adjudication','finalized')),
  add column primary_vote_id uuid,
  add column secondary_vote_id uuid,
  add column final_review_id uuid,
  add column disagreement_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(disagreement_fields) = 'array');

alter table public.operation_routing_benchmark_reviews
  add column resolution_method text not null default 'single'
    check (resolution_method in ('single','consensus','adjudicated')),
  add column source_vote_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_vote_ids) = 'array'),
  add column adjudicator_user_id uuid references public.profiles(id);

create table public.operation_routing_benchmark_votes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.operation_routing_benchmark_cases(id) on delete cascade,
  shadow_run_id uuid not null references public.operation_routing_shadow_runs(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  vote_order smallint not null check (vote_order in (1,2)),
  document_verdict text not null check (document_verdict in ('correct','incorrect','unreviewable')),
  entity_verdict text not null check (entity_verdict in ('correct','incorrect','unreviewable')),
  template_verdict text not null check (template_verdict in ('correct','incorrect','unreviewable')),
  direction_verdict text not null check (direction_verdict in ('correct','incorrect','unreviewable')),
  selected_operation_verdict text not null check (selected_operation_verdict in ('correct','incorrect','unreviewable')),
  identifier_roles_verdict text not null check (identifier_roles_verdict in ('correct','incorrect','unreviewable')),
  routing_verdict text not null check (
    routing_verdict in ('correct_match','wrong_match','correct_abstention','missed_match','ambiguous_case','unreviewable')
  ),
  corrected_financial_entity_code text references public.financial_entities(code),
  corrected_document_template text check (
    corrected_document_template is null
    or corrected_document_template in (
      'single_receipt','transaction_list','account_history','wallet_receipt',
      'transfer_receipt','statement','unknown'
    )
  ),
  corrected_transaction_direction text check (
    corrected_transaction_direction is null
    or corrected_transaction_direction in ('incoming','outgoing','internal','unknown')
  ),
  corrected_selected_operation_position smallint check (
    corrected_selected_operation_position is null
    or corrected_selected_operation_position between 1 and 100
  ),
  corrected_business_id uuid references public.business_profiles(id),
  corrected_account_id uuid references public.business_financial_accounts(id),
  error_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(error_codes)='array'),
  reviewer_notes text,
  analysis_snapshot jsonb not null check (jsonb_typeof(analysis_snapshot)='object'),
  routing_snapshot jsonb not null check (jsonb_typeof(routing_snapshot)='object'),
  decision_payload jsonb not null check (jsonb_typeof(decision_payload)='object'),
  decision_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (corrected_account_id is null and corrected_business_id is null)
    or (corrected_account_id is not null and corrected_business_id is not null)
  ),
  unique(case_id, vote_order),
  unique(case_id, reviewer_user_id)
);

alter table public.operation_routing_benchmark_votes enable row level security;
revoke all on public.operation_routing_benchmark_votes from public, anon, authenticated;

create index operation_routing_benchmark_votes_case_idx
  on public.operation_routing_benchmark_votes(case_id, vote_order);
create index operation_routing_benchmark_votes_reviewer_idx
  on public.operation_routing_benchmark_votes(reviewer_user_id, created_at desc);
create index operation_routing_benchmark_votes_account_idx
  on public.operation_routing_benchmark_votes(corrected_account_id)
  where corrected_account_id is not null;
create index operation_routing_benchmark_votes_business_idx
  on public.operation_routing_benchmark_votes(corrected_business_id)
  where corrected_business_id is not null;
create index operation_routing_benchmark_votes_entity_idx
  on public.operation_routing_benchmark_votes(corrected_financial_entity_code)
  where corrected_financial_entity_code is not null;

alter table public.operation_routing_benchmark_cases
  add constraint operation_routing_benchmark_cases_primary_vote_fkey
    foreign key (primary_vote_id) references public.operation_routing_benchmark_votes(id),
  add constraint operation_routing_benchmark_cases_secondary_vote_fkey
    foreign key (secondary_vote_id) references public.operation_routing_benchmark_votes(id),
  add constraint operation_routing_benchmark_cases_final_review_fkey
    foreign key (final_review_id) references public.operation_routing_benchmark_reviews(id);

create index operation_routing_benchmark_cases_review_stage_idx
  on public.operation_routing_benchmark_cases(review_stage, status, priority desc, created_at desc);
create index operation_routing_benchmark_cases_primary_vote_idx
  on public.operation_routing_benchmark_cases(primary_vote_id)
  where primary_vote_id is not null;
create index operation_routing_benchmark_cases_secondary_vote_idx
  on public.operation_routing_benchmark_cases(secondary_vote_id)
  where secondary_vote_id is not null;
create index operation_routing_benchmark_cases_final_review_idx
  on public.operation_routing_benchmark_cases(final_review_id)
  where final_review_id is not null;
create index operation_routing_benchmark_reviews_adjudicator_idx
  on public.operation_routing_benchmark_reviews(adjudicator_user_id, created_at desc)
  where adjudicator_user_id is not null;

create or replace function private.is_routing_benchmark_reviewer(
  p_user_id uuid default auth.uid(),
  p_require_adjudicator boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin(p_user_id)
  or exists (
    select 1
    from public.routing_benchmark_reviewers r
    join public.profiles p on p.id=r.user_id
    where r.user_id=p_user_id
      and r.status='active'
      and p.status='active'
      and (
        (not p_require_adjudicator and r.reviewer_role in ('reviewer','both'))
        or (p_require_adjudicator and r.reviewer_role in ('adjudicator','both'))
      )
  );
$$;

revoke all on function private.is_routing_benchmark_reviewer(uuid,boolean) from public;

create or replace function private.routing_benchmark_decision_payload(
  p_document_verdict text,
  p_entity_verdict text,
  p_template_verdict text,
  p_direction_verdict text,
  p_selected_operation_verdict text,
  p_identifier_roles_verdict text,
  p_routing_verdict text,
  p_corrected_financial_entity_code text,
  p_corrected_document_template text,
  p_corrected_transaction_direction text,
  p_corrected_selected_operation_position smallint,
  p_corrected_account_id uuid
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'document_verdict',p_document_verdict,
    'entity_verdict',p_entity_verdict,
    'template_verdict',p_template_verdict,
    'direction_verdict',p_direction_verdict,
    'selected_operation_verdict',p_selected_operation_verdict,
    'identifier_roles_verdict',p_identifier_roles_verdict,
    'routing_verdict',p_routing_verdict,
    'corrected_financial_entity_code',p_corrected_financial_entity_code,
    'corrected_document_template',p_corrected_document_template,
    'corrected_transaction_direction',p_corrected_transaction_direction,
    'corrected_selected_operation_position',p_corrected_selected_operation_position,
    'corrected_account_id',p_corrected_account_id
  );
$$;

revoke all on function private.routing_benchmark_decision_payload(
  text,text,text,text,text,text,text,text,text,text,smallint,uuid
) from public;

create or replace function private.routing_benchmark_disagreement_fields(
  p_first jsonb,
  p_second jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select coalesce(jsonb_agg(field_name order by field_name),'[]'::jsonb)
  from (values
    ('document_verdict',p_first->'document_verdict',p_second->'document_verdict'),
    ('entity_verdict',p_first->'entity_verdict',p_second->'entity_verdict'),
    ('template_verdict',p_first->'template_verdict',p_second->'template_verdict'),
    ('direction_verdict',p_first->'direction_verdict',p_second->'direction_verdict'),
    ('selected_operation_verdict',p_first->'selected_operation_verdict',p_second->'selected_operation_verdict'),
    ('identifier_roles_verdict',p_first->'identifier_roles_verdict',p_second->'identifier_roles_verdict'),
    ('routing_verdict',p_first->'routing_verdict',p_second->'routing_verdict'),
    ('corrected_financial_entity_code',p_first->'corrected_financial_entity_code',p_second->'corrected_financial_entity_code'),
    ('corrected_document_template',p_first->'corrected_document_template',p_second->'corrected_document_template'),
    ('corrected_transaction_direction',p_first->'corrected_transaction_direction',p_second->'corrected_transaction_direction'),
    ('corrected_selected_operation_position',p_first->'corrected_selected_operation_position',p_second->'corrected_selected_operation_position'),
    ('corrected_account_id',p_first->'corrected_account_id',p_second->'corrected_account_id')
  ) as compared(field_name,first_value,second_value)
  where first_value is distinct from second_value;
$$;

revoke all on function private.routing_benchmark_disagreement_fields(jsonb,jsonb) from public;

create trigger trg_validate_routing_benchmark_vote_semantics
before insert or update of
  routing_verdict,
  corrected_account_id,
  corrected_business_id,
  corrected_financial_entity_code,
  shadow_run_id
on public.operation_routing_benchmark_votes
for each row execute function private.validate_routing_benchmark_review_semantics();

create or replace function public.get_my_routing_benchmark_access()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'allowed',private.is_routing_benchmark_reviewer(auth.uid(),false)
      or private.is_routing_benchmark_reviewer(auth.uid(),true),
    'can_review',private.is_routing_benchmark_reviewer(auth.uid(),false),
    'can_adjudicate',private.is_routing_benchmark_reviewer(auth.uid(),true),
    'is_platform_admin',public.is_platform_admin(auth.uid()),
    'reviewer_role',coalesce(
      (select r.reviewer_role
       from public.routing_benchmark_reviewers r
       where r.user_id=auth.uid() and r.status='active'),
      case when public.is_platform_admin(auth.uid()) then 'both' else null end
    ),
    'active_reviewer_count',(
      select count(*)::integer
      from public.profiles p
      where p.status='active'
        and (
          public.is_platform_admin(p.id)
          or exists(
            select 1
            from public.routing_benchmark_reviewers r
            where r.user_id=p.id
              and r.status='active'
              and r.reviewer_role in ('reviewer','both')
          )
        )
    ),
    'active_adjudicator_count',(
      select count(*)::integer
      from public.profiles p
      where p.status='active'
        and (
          public.is_platform_admin(p.id)
          or exists(
            select 1
            from public.routing_benchmark_reviewers r
            where r.user_id=p.id
              and r.status='active'
              and r.reviewer_role in ('adjudicator','both')
          )
        )
    )
  );
$$;

revoke all on function public.get_my_routing_benchmark_access() from public;
grant execute on function public.get_my_routing_benchmark_access() to authenticated;

create or replace function public.platform_admin_search_routing_benchmark_reviewer_candidates(
  p_query text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text:=lower(nullif(trim(coalesce(p_query,'')),''));
  v_limit integer:=least(greatest(coalesce(p_limit,30),1),100);
  v_results jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.id,
    'full_name',p.full_name,
    'phone',p.phone,
    'status',p.status,
    'global_role',p.global_role,
    'reviewer_role',r.reviewer_role,
    'reviewer_status',r.status
  ) order by (r.status='active') desc nulls last,p.full_name nulls last,p.created_at desc),'[]'::jsonb)
  into v_results
  from (
    select p.*
    from public.profiles p
    where p.status='active'
      and (
        v_query is null
        or lower(coalesce(p.full_name,'')) like '%'||v_query||'%'
        or lower(coalesce(p.phone,'')) like '%'||v_query||'%'
        or lower(coalesce(p.email,'')) like '%'||v_query||'%'
      )
    order by p.created_at desc
    limit v_limit
  ) p
  left join public.routing_benchmark_reviewers r on r.user_id=p.id;

  return jsonb_build_object('results',v_results);
end;
$$;

revoke all on function public.platform_admin_search_routing_benchmark_reviewer_candidates(text,integer) from public;
grant execute on function public.platform_admin_search_routing_benchmark_reviewer_candidates(text,integer) to authenticated;

create or replace function public.platform_admin_set_routing_benchmark_reviewer(
  p_user_id uuid,
  p_reviewer_role text,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
  v_before jsonb;
  v_after public.routing_benchmark_reviewers%rowtype;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'platform_admin_required' using errcode='42501';
  end if;
  if length(coalesce(v_reason,''))<5 then raise exception 'admin_reason_required'; end if;
  if p_reviewer_role not in ('reviewer','adjudicator','both') then raise exception 'invalid_reviewer_role'; end if;
  if p_status not in ('active','inactive') then raise exception 'invalid_reviewer_status'; end if;
  if not exists(
    select 1 from public.profiles p where p.id=p_user_id and p.status='active'
  ) then
    raise exception 'reviewer_profile_not_active';
  end if;

  select to_jsonb(r) into v_before
  from public.routing_benchmark_reviewers r
  where r.user_id=p_user_id;

  insert into public.routing_benchmark_reviewers(
    user_id,reviewer_role,status,appointed_by_user_id,updated_at
  ) values (
    p_user_id,p_reviewer_role,p_status,auth.uid(),now()
  )
  on conflict(user_id) do update
  set reviewer_role=excluded.reviewer_role,
      status=excluded.status,
      appointed_by_user_id=auth.uid(),
      updated_at=now()
  returning * into v_after;

  insert into public.platform_admin_audit_log(
    actor_user_id,action,target_type,target_id,reason,before_data,after_data
  ) values (
    auth.uid(),'routing_benchmark_reviewer_updated','profile',p_user_id::text,
    v_reason,v_before,to_jsonb(v_after)
  );

  return jsonb_build_object('ok',true,'reviewer',to_jsonb(v_after));
end;
$$;

revoke all on function public.platform_admin_set_routing_benchmark_reviewer(uuid,text,text,text) from public;
grant execute on function public.platform_admin_set_routing_benchmark_reviewer(uuid,text,text,text) to authenticated;

create or replace function private.finalize_routing_benchmark_case(
  p_case_id uuid,
  p_decision jsonb,
  p_resolution_method text,
  p_source_vote_ids jsonb,
  p_adjudicator_user_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_reviewer_notes text default null
)
returns public.operation_routing_benchmark_reviews
language plpgsql
security definer
set search_path=''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_run public.operation_routing_shadow_runs%rowtype;
  v_operation public.operations%rowtype;
  v_old_review public.operation_routing_benchmark_reviews%rowtype;
  v_new_review public.operation_routing_benchmark_reviews%rowtype;
  v_revision integer;
  v_corrected_account_id uuid:=nullif(p_decision->>'corrected_account_id','')::uuid;
  v_corrected_business_id uuid;
  v_analysis_snapshot jsonb;
  v_routing_snapshot jsonb;
begin
  if p_resolution_method not in ('consensus','adjudicated') then
    raise exception 'invalid_resolution_method';
  end if;

  select * into v_case
  from public.operation_routing_benchmark_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;

  select * into v_run
  from public.operation_routing_shadow_runs
  where id=v_case.shadow_run_id;

  select * into v_operation
  from public.operations
  where id=v_case.operation_id;

  if v_corrected_account_id is not null then
    select business_id into v_corrected_business_id
    from public.business_financial_accounts
    where id=v_corrected_account_id;
    if not found then raise exception 'corrected_account_not_found'; end if;
  end if;

  v_analysis_snapshot:=jsonb_build_object(
    'analysis_contract_version',v_operation.analysis_contract_version,
    'analysis_prompt_version',v_operation.analysis_prompt_version,
    'financial_entity',v_operation.financial_entity,
    'financial_entity_code',v_operation.financial_entity_code,
    'document_template',v_operation.document_template,
    'document_template_confidence',v_operation.document_template_confidence,
    'transaction_type',v_operation.transaction_type,
    'transaction_direction',v_operation.transaction_direction,
    'transaction_direction_confidence',v_operation.transaction_direction_confidence,
    'amount',v_operation.amount,
    'currency',v_operation.currency,
    'sender_name',v_operation.sender_name,
    'sender_account',v_operation.sender_account,
    'receiver_name',v_operation.receiver_name,
    'receiver_account',v_operation.receiver_account,
    'document_account',v_operation.document_account,
    'credited_account',v_operation.credited_account,
    'debited_account',v_operation.debited_account,
    'merchant_point',v_operation.merchant_point,
    'reference_number',v_operation.reference_number,
    'multiple_operations_present',v_operation.multiple_operations_present,
    'selected_operation_position',v_operation.selected_operation_position,
    'field_confidences',v_operation.field_confidences,
    'field_evidence',v_operation.field_evidence
  );

  v_routing_snapshot:=jsonb_build_object(
    'shadow_run_id',v_run.id,
    'algorithm_version',v_run.algorithm_version,
    'status',v_run.status,
    'matched_business_id',v_run.matched_business_id,
    'matched_account_id',v_run.matched_account_id,
    'match_score',v_run.match_score,
    'match_strategy',v_run.match_strategy,
    'candidate_count',v_run.candidate_count,
    'candidates',v_run.candidates,
    'evidence',v_run.evidence,
    'reason_codes',v_run.reason_codes
  );

  select * into v_old_review
  from public.operation_routing_benchmark_reviews
  where case_id=p_case_id and superseded_at is null
  for update;

  select coalesce(max(revision),0)+1
  into v_revision
  from public.operation_routing_benchmark_reviews
  where case_id=p_case_id;

  insert into public.operation_routing_benchmark_reviews(
    case_id,shadow_run_id,operation_id,reviewer_user_id,revision,
    document_verdict,entity_verdict,template_verdict,direction_verdict,
    selected_operation_verdict,identifier_roles_verdict,routing_verdict,
    corrected_financial_entity_code,corrected_document_template,
    corrected_transaction_direction,corrected_selected_operation_position,
    corrected_business_id,corrected_account_id,error_codes,reviewer_notes,
    analysis_snapshot,routing_snapshot,resolution_method,source_vote_ids,
    adjudicator_user_id
  ) values (
    v_case.id,v_case.shadow_run_id,v_case.operation_id,p_actor_user_id,v_revision,
    p_decision->>'document_verdict',p_decision->>'entity_verdict',
    p_decision->>'template_verdict',p_decision->>'direction_verdict',
    p_decision->>'selected_operation_verdict',p_decision->>'identifier_roles_verdict',
    p_decision->>'routing_verdict',
    nullif(p_decision->>'corrected_financial_entity_code',''),
    nullif(p_decision->>'corrected_document_template',''),
    nullif(p_decision->>'corrected_transaction_direction',''),
    nullif(p_decision->>'corrected_selected_operation_position','')::smallint,
    v_corrected_business_id,v_corrected_account_id,'[]'::jsonb,
    left(nullif(trim(coalesce(p_reviewer_notes,'')),''),2000),
    v_analysis_snapshot,v_routing_snapshot,p_resolution_method,
    coalesce(p_source_vote_ids,'[]'::jsonb),p_adjudicator_user_id
  ) returning * into v_new_review;

  if v_old_review.id is not null then
    update public.operation_routing_benchmark_reviews
    set superseded_at=now(),superseded_by_review_id=v_new_review.id
    where id=v_old_review.id;
  end if;

  update public.operation_routing_benchmark_cases
  set status='reviewed',
      review_stage='finalized',
      final_review_id=v_new_review.id,
      reviewed_at=now(),
      claimed_by_user_id=null,
      claimed_at=null,
      claim_expires_at=null,
      updated_at=now()
  where id=v_case.id;

  insert into public.platform_admin_audit_log(
    actor_user_id,action,target_type,target_id,reason,before_data,after_data
  ) values (
    p_actor_user_id,
    case when p_resolution_method='consensus'
      then 'routing_benchmark_consensus_finalized'
      else 'routing_benchmark_adjudicated'
    end,
    'operation_routing_benchmark_case',v_case.id::text,p_reason,
    case when v_old_review.id is null then null
      else jsonb_build_object('review_id',v_old_review.id,'revision',v_old_review.revision)
    end,
    jsonb_build_object(
      'review_id',v_new_review.id,
      'revision',v_new_review.revision,
      'resolution_method',p_resolution_method,
      'source_vote_ids',p_source_vote_ids,
      'adjudicator_user_id',p_adjudicator_user_id,
      'routing_verdict',v_new_review.routing_verdict
    )
  );

  return v_new_review;
end;
$$;

revoke all on function private.finalize_routing_benchmark_case(
  uuid,jsonb,text,jsonb,uuid,uuid,text,text
) from public;

create or replace function public.platform_admin_claim_routing_benchmark_case(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
  v_primary_reviewer uuid;
  v_secondary_reviewer uuid;
begin
  if not(
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  select * into v_case
  from public.operation_routing_benchmark_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;

  if v_case.status in ('reviewed','excluded') or v_case.review_stage='finalized' then
    raise exception 'benchmark_case_closed';
  end if;

  if v_case.primary_vote_id is not null then
    select reviewer_user_id into v_primary_reviewer
    from public.operation_routing_benchmark_votes
    where id=v_case.primary_vote_id;
  end if;
  if v_case.secondary_vote_id is not null then
    select reviewer_user_id into v_secondary_reviewer
    from public.operation_routing_benchmark_votes
    where id=v_case.secondary_vote_id;
  end if;

  if v_case.review_stage='awaiting_primary'
     and not private.is_routing_benchmark_reviewer(auth.uid(),false) then
    raise exception 'primary_reviewer_permission_required' using errcode='42501';
  elsif v_case.review_stage='awaiting_secondary' then
    if not private.is_routing_benchmark_reviewer(auth.uid(),false) then
      raise exception 'secondary_reviewer_permission_required' using errcode='42501';
    end if;
    if auth.uid()=v_primary_reviewer then
      raise exception 'independent_secondary_reviewer_required' using errcode='42501';
    end if;
  elsif v_case.review_stage='awaiting_adjudication' then
    if not private.is_routing_benchmark_reviewer(auth.uid(),true) then
      raise exception 'adjudicator_permission_required' using errcode='42501';
    end if;
    if auth.uid() in (v_primary_reviewer,v_secondary_reviewer) then
      raise exception 'independent_adjudicator_required' using errcode='42501';
    end if;
  end if;

  if v_case.status='in_review'
     and v_case.claimed_by_user_id is distinct from auth.uid()
     and v_case.claim_expires_at>now() then
    raise exception 'benchmark_case_claimed_by_another_reviewer';
  end if;

  update public.operation_routing_benchmark_cases
  set status='in_review',
      claimed_by_user_id=auth.uid(),
      claimed_at=now(),
      claim_expires_at=now()+interval '30 minutes',
      updated_at=now()
  where id=p_case_id
  returning * into v_case;

  return jsonb_build_object(
    'ok',true,
    'case_id',v_case.id,
    'status',v_case.status,
    'review_stage',v_case.review_stage,
    'claim_expires_at',v_case.claim_expires_at
  );
end;
$$;

revoke all on function public.platform_admin_claim_routing_benchmark_case(uuid) from public;
grant execute on function public.platform_admin_claim_routing_benchmark_case(uuid) to authenticated;

create or replace function public.platform_admin_release_routing_benchmark_case(
  p_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_case public.operation_routing_benchmark_cases%rowtype;
begin
  if not(
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  select * into v_case
  from public.operation_routing_benchmark_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'benchmark_case_not_found'; end if;

  if v_case.status<>'in_review' then
    return jsonb_build_object(
      'ok',true,'case_id',v_case.id,'status',v_case.status,'review_stage',v_case.review_stage
    );
  end if;

  if v_case.claimed_by_user_id is distinct from auth.uid()
     and v_case.claim_expires_at>now() then
    raise exception 'benchmark_case_claimed_by_another_reviewer';
  end if;

  update public.operation_routing_benchmark_cases
  set status='pending',
      claimed_by_user_id=null,
      claimed_at=null,
      claim_expires_at=null,
      updated_at=now()
  where id=p_case_id;

  return jsonb_build_object(
    'ok',true,'case_id',p_case_id,'status','pending','review_stage',v_case.review_stage
  );
end;
$$;

revoke all on function public.platform_admin_release_routing_benchmark_case(uuid) from public;
grant execute on function public.platform_admin_release_routing_benchmark_case(uuid) to authenticated;

-- The final review state machine is reasserted in the transition-fix migration.
-- The initial definition is intentionally omitted here to keep the historical fix
-- as the single source of truth for the write contract.

create or replace function public.platform_admin_search_routing_benchmark_accounts(
  p_query text default null,
  p_entity_code text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_query text:=lower(nullif(trim(coalesce(p_query,'')),''));
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_results jsonb;
begin
  if not(
    private.is_routing_benchmark_reviewer(auth.uid(),false)
    or private.is_routing_benchmark_reviewer(auth.uid(),true)
  ) then
    raise exception 'routing_benchmark_reviewer_required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,
    'business_id',a.business_id,
    'business_name',bp.name,
    'account_holder_name',a.account_holder_name,
    'account_label',a.account_label,
    'financial_entity_code',a.financial_entity_code,
    'financial_entity_name',fe.display_name_ar,
    'verification_status',a.verification_status,
    'routing_enabled',a.routing_enabled,
    'identifiers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'type',i.identifier_type,
        'value',i.identifier_value,
        'currency',i.currency,
        'is_primary',i.is_primary
      ) order by i.is_primary desc,i.created_at)
      from public.business_financial_identifiers i
      where i.financial_account_id=a.id and i.status='active'
    ),'[]'::jsonb)
  ) order by bp.name,a.account_label nulls last,a.account_holder_name nulls last),'[]'::jsonb)
  into v_results
  from (
    select a.*
    from public.business_financial_accounts a
    join public.business_profiles bp_filter on bp_filter.id=a.business_id
    where a.status='active'
      and (p_entity_code is null or p_entity_code='' or a.financial_entity_code=p_entity_code)
      and (
        v_query is null
        or lower(coalesce(bp_filter.name,'')) like '%'||v_query||'%'
        or lower(coalesce(a.account_holder_name,'')) like '%'||v_query||'%'
        or lower(coalesce(a.account_label,'')) like '%'||v_query||'%'
        or exists(
          select 1
          from public.business_financial_identifiers i_search
          where i_search.financial_account_id=a.id
            and i_search.status='active'
            and lower(i_search.identifier_value) like '%'||v_query||'%'
        )
      )
    order by a.routing_enabled desc,
             a.verification_status='verified' desc,
             a.updated_at desc
    limit v_limit
  ) a
  join public.business_profiles bp on bp.id=a.business_id
  join public.financial_entities fe on fe.code=a.financial_entity_code;

  return jsonb_build_object(
    'query',p_query,
    'entity_code',p_entity_code,
    'results',v_results
  );
end;
$$;

revoke all on function public.platform_admin_search_routing_benchmark_accounts(text,text,integer) from public;
grant execute on function public.platform_admin_search_routing_benchmark_accounts(text,text,integer) to authenticated;

update public.operation_routing_benchmark_cases c
set review_stage='finalized',
    final_review_id=r.id
from public.operation_routing_benchmark_reviews r
where r.case_id=c.id
  and r.superseded_at is null
  and c.status='reviewed';
