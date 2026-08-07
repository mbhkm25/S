create or replace function private.validate_routing_benchmark_review_semantics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.operation_routing_shadow_runs%rowtype;
  v_corrected_account public.business_financial_accounts%rowtype;
begin
  select * into v_run
  from public.operation_routing_shadow_runs
  where id = new.shadow_run_id;
  if not found then raise exception 'shadow_run_not_found'; end if;

  if new.corrected_account_id is not null then
    select * into v_corrected_account
    from public.business_financial_accounts
    where id = new.corrected_account_id;
    if not found then raise exception 'corrected_account_not_found'; end if;
    if new.corrected_business_id is distinct from v_corrected_account.business_id then
      raise exception 'corrected_business_account_mismatch';
    end if;
    if new.corrected_financial_entity_code is not null
       and new.corrected_financial_entity_code is distinct from v_corrected_account.financial_entity_code then
      raise exception 'corrected_entity_account_mismatch';
    end if;
  end if;

  case new.routing_verdict
    when 'correct_match' then
      if v_run.matched_account_id is null then
        raise exception 'correct_match_requires_shadow_match';
      end if;
      if new.corrected_account_id is not null
         and new.corrected_account_id is distinct from v_run.matched_account_id then
        raise exception 'correct_match_conflicts_with_corrected_account';
      end if;
    when 'wrong_match' then
      if v_run.matched_account_id is null then
        raise exception 'wrong_match_requires_shadow_match';
      end if;
      if new.corrected_account_id is null then
        raise exception 'wrong_match_requires_corrected_account';
      end if;
      if new.corrected_account_id = v_run.matched_account_id then
        raise exception 'wrong_match_cannot_correct_to_same_account';
      end if;
    when 'correct_abstention' then
      if v_run.matched_account_id is not null then
        raise exception 'correct_abstention_requires_no_shadow_match';
      end if;
      if v_run.status not in ('skipped','insufficient_data','no_match') then
        raise exception 'correct_abstention_invalid_shadow_status';
      end if;
      if new.corrected_account_id is not null then
        raise exception 'correct_abstention_cannot_have_corrected_account';
      end if;
    when 'missed_match' then
      if v_run.matched_account_id is not null then
        raise exception 'missed_match_requires_no_shadow_match';
      end if;
      if new.corrected_account_id is null then
        raise exception 'missed_match_requires_corrected_account';
      end if;
    when 'ambiguous_case' then
      if v_run.status <> 'ambiguous' and v_run.candidate_count < 2 then
        raise exception 'ambiguous_case_requires_competing_candidates';
      end if;
    when 'unreviewable' then
      null;
    else
      raise exception 'invalid_routing_verdict';
  end case;

  return new;
end;
$$;

drop trigger if exists trg_validate_routing_benchmark_review_semantics
  on public.operation_routing_benchmark_reviews;
create trigger trg_validate_routing_benchmark_review_semantics
before insert or update of routing_verdict, corrected_account_id, corrected_business_id,
  corrected_financial_entity_code, shadow_run_id
on public.operation_routing_benchmark_reviews
for each row execute function private.validate_routing_benchmark_review_semantics();

revoke all on function private.validate_routing_benchmark_review_semantics() from public, anon, authenticated;
