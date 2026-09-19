-- Fix multi-currency personal finance dashboard aggregation used by SANAD Financial and SANAD Assistant.
-- Previous implementation grouped inside a scalar subquery, which raised "more than one row returned"
-- whenever a user had more than one currency.

create or replace function public.get_my_finance_dashboard_v1(
  p_from date default date_trunc('month', now())::date,
  p_to date default current_date
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
  if p_to < p_from then
    raise exception 'invalid_date_range';
  end if;

  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'cashflow_by_currency', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.currency)
      from (
        select
          t.currency,
          coalesce(sum(t.amount) filter (where t.transaction_type='income'),0) as income,
          coalesce(sum(t.amount) filter (where t.transaction_type='expense'),0) as expense,
          coalesce(sum(
            case
              when t.transaction_type='income' then t.amount
              when t.transaction_type='expense' then -t.amount
              else 0
            end
          ),0) as net
        from public.personal_finance_transactions t
        where t.user_id=v_user
          and t.status='posted'
          and t.transaction_at::date between p_from and p_to
        group by t.currency
      ) x
    ), '[]'::jsonb),
    'accounts', (
      select count(*)
      from public.personal_finance_accounts a
      where a.user_id=v_user and a.status='active'
    ),
    'open_obligations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.currency)
      from (
        select
          o.currency,
          coalesce(sum(o.outstanding_amount) filter (where o.obligation_type='payable'),0) as payable,
          coalesce(sum(o.outstanding_amount) filter (where o.obligation_type='receivable'),0) as receivable
        from public.personal_finance_obligations o
        where o.user_id=v_user
          and o.status in ('open','partial')
        group by o.currency
      ) x
    ), '[]'::jsonb),
    'due_soon_count', (
      select count(*)
      from public.personal_finance_obligations o
      where o.user_id=v_user
        and o.status in ('open','partial')
        and o.due_date between current_date and current_date + 7
    ),
    'active_budgets', (
      select count(*)
      from public.personal_finance_budgets b
      where b.user_id=v_user
        and b.status='active'
        and current_date between b.period_start and b.period_end
    ),
    'active_goals', (
      select count(*)
      from public.personal_finance_goals g
      where g.user_id=v_user and g.status='active'
    ),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_my_finance_dashboard_v1(date,date) from public;
grant execute on function public.get_my_finance_dashboard_v1(date,date) to authenticated;
