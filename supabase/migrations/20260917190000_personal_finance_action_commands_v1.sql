create or replace function public.create_personal_finance_budget_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_command->>'name',''));
  v_category uuid;
  v_start date;
  v_end date;
  v_amount numeric(24,6);
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid_budget_name'; end if;
  begin v_category := nullif(p_command->>'category_id','')::uuid; exception when others then raise exception 'invalid_category_id'; end;
  begin v_start := (p_command->>'period_start')::date; exception when others then raise exception 'invalid_period_start'; end;
  begin v_end := (p_command->>'period_end')::date; exception when others then raise exception 'invalid_period_end'; end;
  begin v_amount := (p_command->>'amount')::numeric(24,6); exception when others then raise exception 'invalid_budget_amount'; end;
  if v_start is null or v_end is null or v_end < v_start then raise exception 'invalid_budget_period'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'budget_amount_must_be_positive'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if v_category is not null and not exists (
    select 1 from public.personal_finance_categories c
    where c.id=v_category and c.user_id=v_user and c.status='active' and c.kind='expense'
  ) then raise exception 'invalid_expense_category'; end if;

  insert into public.personal_finance_budgets(user_id,name,category_id,period_start,period_end,amount,currency,status,metadata)
  values(v_user,v_name,v_category,v_start,v_end,v_amount,v_currency,'active',coalesce(p_command->'metadata','{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'budget_id',v_id,'status','active','name',v_name,'amount',v_amount,'currency',v_currency,'period_start',v_start,'period_end',v_end);
end;
$function$;

revoke all on function public.create_personal_finance_budget_v1(jsonb) from public;
grant execute on function public.create_personal_finance_budget_v1(jsonb) to authenticated;

create or replace function public.create_personal_finance_obligation_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_party uuid;
  v_type text := lower(btrim(coalesce(p_command->>'obligation_type','')));
  v_title text := btrim(coalesce(p_command->>'title',''));
  v_amount numeric(24,6);
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_due date;
  v_notes text := nullif(btrim(coalesce(p_command->>'notes','')),'');
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_type not in ('payable','receivable') then raise exception 'invalid_obligation_type'; end if;
  if char_length(v_title) < 1 or char_length(v_title) > 160 then raise exception 'invalid_obligation_title'; end if;
  begin v_party := nullif(p_command->>'party_id','')::uuid; exception when others then raise exception 'invalid_party_id'; end;
  begin v_amount := (p_command->>'amount')::numeric(24,6); exception when others then raise exception 'invalid_obligation_amount'; end;
  begin v_due := nullif(p_command->>'due_date','')::date; exception when others then raise exception 'invalid_due_date'; end;
  if v_amount is null or v_amount <= 0 then raise exception 'obligation_amount_must_be_positive'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if v_party is not null and not exists (
    select 1 from public.personal_finance_parties p where p.id=v_party and p.user_id=v_user and p.status='active'
  ) then raise exception 'invalid_party'; end if;

  insert into public.personal_finance_obligations(user_id,party_id,obligation_type,title,original_amount,outstanding_amount,currency,due_date,status,notes,metadata)
  values(v_user,v_party,v_type,v_title,v_amount,v_amount,v_currency,v_due,'open',v_notes,coalesce(p_command->'metadata','{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'obligation_id',v_id,'status','open','obligation_type',v_type,'title',v_title,'outstanding_amount',v_amount,'currency',v_currency,'due_date',v_due);
end;
$function$;

revoke all on function public.create_personal_finance_obligation_v1(jsonb) from public;
grant execute on function public.create_personal_finance_obligation_v1(jsonb) to authenticated;

create or replace function public.create_personal_finance_goal_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_command->>'name',''));
  v_amount numeric(24,6);
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_target_date date;
  v_account uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid_goal_name'; end if;
  begin v_amount := (p_command->>'target_amount')::numeric(24,6); exception when others then raise exception 'invalid_goal_amount'; end;
  begin v_target_date := nullif(p_command->>'target_date','')::date; exception when others then raise exception 'invalid_target_date'; end;
  begin v_account := nullif(p_command->>'linked_account_id','')::uuid; exception when others then raise exception 'invalid_account_id'; end;
  if v_amount is null or v_amount <= 0 then raise exception 'goal_amount_must_be_positive'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if v_account is not null and not exists (
    select 1 from public.personal_finance_accounts a where a.id=v_account and a.user_id=v_user and a.status='active' and a.system_role is null and a.currency=v_currency
  ) then raise exception 'invalid_goal_account'; end if;

  insert into public.personal_finance_goals(user_id,name,target_amount,current_amount,currency,target_date,linked_account_id,status,metadata)
  values(v_user,v_name,v_amount,0,v_currency,v_target_date,v_account,'active',coalesce(p_command->'metadata','{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'goal_id',v_id,'status','active','name',v_name,'target_amount',v_amount,'currency',v_currency,'target_date',v_target_date);
end;
$function$;

revoke all on function public.create_personal_finance_goal_v1(jsonb) from public;
grant execute on function public.create_personal_finance_goal_v1(jsonb) to authenticated;
