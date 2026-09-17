create or replace function public.get_my_finance_balances_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select jsonb_build_object(
    'accounts', coalesce(jsonb_agg(to_jsonb(q) order by q.currency, q.name), '[]'::jsonb),
    'generated_at', now()
  )
  into v_result
  from (
    select
      a.id,
      a.name,
      a.account_type,
      a.currency,
      a.system_role,
      a.status,
      coalesce(sum(
        case
          when a.account_type in ('asset','expense') then
            case when p.direction='debit' then p.amount else -p.amount end
          else
            case when p.direction='credit' then p.amount else -p.amount end
        end
      ) filter (where t.status='posted'), 0)::numeric(24,6) as balance
    from public.personal_finance_accounts a
    left join public.personal_finance_postings p
      on p.account_id=a.id and p.user_id=v_user
    left join public.personal_finance_transactions t
      on t.id=p.transaction_id and t.user_id=v_user
    where a.user_id=v_user
    group by a.id,a.name,a.account_type,a.currency,a.system_role,a.status
  ) q;

  return coalesce(v_result, jsonb_build_object('accounts','[]'::jsonb,'generated_at',now()));
end;
$function$;

revoke all on function public.get_my_finance_balances_v1() from public;
grant execute on function public.get_my_finance_balances_v1() to authenticated;

create or replace function public.get_my_budget_progress_v1(
  p_on_date date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  with recursive category_tree as (
    select b.id budget_id, c.id category_id
    from public.personal_finance_budgets b
    join public.personal_finance_categories c on c.id=b.category_id and c.user_id=v_user
    where b.user_id=v_user and b.status='active' and p_on_date between b.period_start and b.period_end
    union all
    select ct.budget_id, child.id
    from category_tree ct
    join public.personal_finance_categories child on child.parent_id=ct.category_id and child.user_id=v_user and child.status='active'
  ), spent as (
    select b.id budget_id,
      coalesce(sum(t.amount) filter (
        where t.status='posted'
          and t.transaction_type='expense'
          and t.currency=b.currency
          and t.transaction_at::date between b.period_start and b.period_end
          and (b.category_id is null or exists (
            select 1 from category_tree ct where ct.budget_id=b.id and ct.category_id=t.category_id
          ))
      ),0)::numeric(24,6) spent_amount
    from public.personal_finance_budgets b
    left join public.personal_finance_transactions t on t.user_id=v_user
    where b.user_id=v_user and b.status='active' and p_on_date between b.period_start and b.period_end
    group by b.id,b.currency,b.period_start,b.period_end,b.category_id
  )
  select jsonb_build_object(
    'on_date',p_on_date,
    'budgets',coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,
      'name',b.name,
      'category_id',b.category_id,
      'period_start',b.period_start,
      'period_end',b.period_end,
      'currency',b.currency,
      'budget_amount',b.amount,
      'spent_amount',s.spent_amount,
      'remaining_amount',greatest(b.amount-s.spent_amount,0),
      'usage_percent',case when b.amount=0 then 0 else round((s.spent_amount/b.amount)*100,2) end,
      'is_over_budget',s.spent_amount>b.amount
    ) order by b.period_end,b.name),'[]'::jsonb),
    'generated_at',now()
  ) into v_result
  from public.personal_finance_budgets b
  join spent s on s.budget_id=b.id
  where b.user_id=v_user and b.status='active' and p_on_date between b.period_start and b.period_end;

  return coalesce(v_result,jsonb_build_object('on_date',p_on_date,'budgets','[]'::jsonb,'generated_at',now()));
end;
$function$;

revoke all on function public.get_my_budget_progress_v1(date) from public;
grant execute on function public.get_my_budget_progress_v1(date) to authenticated;
