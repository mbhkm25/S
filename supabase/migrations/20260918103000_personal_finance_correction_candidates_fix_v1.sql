-- Fix personal correction candidate aggregation: apply ordering/limit inside a subquery
-- before JSON aggregation so PostgreSQL does not reject the aggregate query.

create or replace function public.get_personal_finance_correction_candidates_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_obligations jsonb;
  v_transactions jsonb;
  v_reversible jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'obligation_type', o.obligation_type,
    'title', o.title,
    'original_amount', o.original_amount,
    'outstanding_amount', o.outstanding_amount,
    'currency', o.currency,
    'due_date', o.due_date,
    'party_id', o.party_id,
    'status', o.status
  ) order by o.due_date nulls last, o.created_at desc), '[]'::jsonb)
  into v_obligations
  from public.personal_finance_obligations o
  where o.user_id = v_user
    and o.status in ('open','partial')
    and o.outstanding_amount > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'transaction_type', x.transaction_type,
    'description', x.description,
    'transaction_at', x.transaction_at,
    'amount', x.amount,
    'used_amount', x.used_amount,
    'available_amount', x.amount - x.used_amount,
    'currency', x.currency,
    'party_id', x.party_id
  ) order by x.transaction_at desc), '[]'::jsonb)
  into v_transactions
  from (
    select
      t.id, t.transaction_type, t.description, t.transaction_at,
      t.amount, t.currency, t.party_id,
      coalesce(sum(s.amount) filter (where s.status='active'),0)::numeric as used_amount
    from public.personal_finance_transactions t
    left join public.personal_finance_obligation_settlements s
      on s.transaction_id=t.id and s.user_id=v_user
    where t.user_id=v_user
      and t.status='posted'
      and t.transaction_type in ('income','expense','settlement')
    group by t.id
    having t.amount - coalesce(sum(s.amount) filter (where s.status='active'),0) > 0
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'transaction_type', x.transaction_type,
    'description', x.description,
    'transaction_at', x.transaction_at,
    'amount', x.amount,
    'currency', x.currency
  ) order by x.transaction_at desc), '[]'::jsonb)
  into v_reversible
  from (
    select
      t.id, t.transaction_type, t.description, t.transaction_at, t.amount, t.currency
    from public.personal_finance_transactions t
    where t.user_id=v_user
      and t.status='posted'
      and not exists (
        select 1 from public.personal_finance_transaction_reversals r
        where r.user_id=v_user
          and (r.original_transaction_id=t.id or r.reversal_transaction_id=t.id)
      )
      and not exists (
        select 1 from public.personal_finance_obligation_settlements s
        where s.user_id=v_user and s.transaction_id=t.id and s.status='active'
      )
    order by t.transaction_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'contract_version', 1,
    'obligations', v_obligations,
    'transactions', v_transactions,
    'reversible_transactions', v_reversible
  );
end;
$function$;

revoke all on function public.get_personal_finance_correction_candidates_v1() from public, anon;
grant execute on function public.get_personal_finance_correction_candidates_v1() to authenticated;
