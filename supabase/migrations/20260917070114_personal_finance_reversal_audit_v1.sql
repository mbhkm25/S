create table public.personal_finance_transaction_reversals (
  original_transaction_id uuid not null,
  reversal_transaction_id uuid not null,
  user_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now(),
  primary key (original_transaction_id, user_id),
  unique (reversal_transaction_id, user_id),
  constraint personal_finance_transaction_reversals_distinct_check
    check (original_transaction_id <> reversal_transaction_id),
  constraint personal_finance_transaction_reversals_original_fk
    foreign key (original_transaction_id, user_id)
    references public.personal_finance_transactions(id, user_id)
    on delete restrict,
  constraint personal_finance_transaction_reversals_reversal_fk
    foreign key (reversal_transaction_id, user_id)
    references public.personal_finance_transactions(id, user_id)
    on delete restrict
);

create index personal_finance_transaction_reversals_user_created_idx
  on public.personal_finance_transaction_reversals (user_id, created_at desc);

alter table public.personal_finance_transaction_reversals enable row level security;

create policy personal_finance_transaction_reversals_select_own
on public.personal_finance_transaction_reversals for select to authenticated
using ((select auth.uid()) = user_id);

create policy personal_finance_transaction_reversals_insert_own
on public.personal_finance_transaction_reversals for insert to authenticated
with check ((select auth.uid()) = user_id);

revoke all on public.personal_finance_transaction_reversals from public, anon, authenticated;
grant select, insert on public.personal_finance_transaction_reversals to authenticated;

create or replace function public.personal_finance_posting_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_user_id uuid;
  v_status text;
  v_account_currency text;
  v_account_status text;
  v_reversal_of uuid;
begin
  v_transaction_id := coalesce(new.transaction_id, old.transaction_id);
  v_user_id := coalesce(new.user_id, old.user_id);

  select t.status into v_status
  from public.personal_finance_transactions t
  where t.id = v_transaction_id and t.user_id = v_user_id;

  if v_status = 'posted' then
    raise exception 'postings of a posted personal finance transaction are immutable';
  end if;

  if tg_op <> 'DELETE' then
    select a.currency, a.status
      into v_account_currency, v_account_status
    from public.personal_finance_accounts a
    where a.id = new.account_id
      and a.user_id = new.user_id;

    if v_account_currency is null then
      raise exception 'invalid personal finance account';
    end if;
    if v_account_currency <> new.currency then
      raise exception 'posting currency must match account currency';
    end if;

    if v_account_status <> 'active' then
      begin
        select nullif(t.metadata->>'reversal_of','')::uuid
          into v_reversal_of
        from public.personal_finance_transactions t
        where t.id = new.transaction_id
          and t.user_id = new.user_id;
      exception when others then
        v_reversal_of := null;
      end;

      if v_reversal_of is null or not exists (
        select 1
        from public.personal_finance_postings p
        where p.transaction_id = v_reversal_of
          and p.user_id = new.user_id
          and p.account_id = new.account_id
          and p.currency = new.currency
      ) then
        raise exception 'archived personal finance account is only allowed for a documented reversal';
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.personal_finance_reversal_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_original public.personal_finance_transactions%rowtype;
  v_reversal public.personal_finance_transactions%rowtype;
begin
  select * into v_original
  from public.personal_finance_transactions t
  where t.id = new.original_transaction_id
    and t.user_id = new.user_id;

  select * into v_reversal
  from public.personal_finance_transactions t
  where t.id = new.reversal_transaction_id
    and t.user_id = new.user_id;

  if v_original.id is null or v_reversal.id is null then
    raise exception 'invalid reversal transaction relationship';
  end if;
  if v_original.status <> 'posted' or v_reversal.status <> 'posted' then
    raise exception 'reversal requires posted transactions';
  end if;
  if v_reversal.transaction_type <> 'adjustment' then
    raise exception 'reversal transaction must be an adjustment';
  end if;
  if v_original.amount <> v_reversal.amount or v_original.currency <> v_reversal.currency then
    raise exception 'reversal amount and currency must match the original transaction';
  end if;
  if v_reversal.metadata->>'reversal_of' is distinct from new.original_transaction_id::text then
    raise exception 'reversal metadata does not reference the original transaction';
  end if;
  if exists (
    select 1
    from public.personal_finance_transaction_reversals r
    where r.reversal_transaction_id = new.original_transaction_id
      and r.user_id = new.user_id
  ) then
    raise exception 'a reversal transaction cannot itself be reversed';
  end if;

  if exists (
    (
      select p.account_id,
             case when p.direction = 'debit' then 'credit' else 'debit' end as direction,
             p.amount, p.currency, p.exchange_rate
      from public.personal_finance_postings p
      where p.transaction_id = new.original_transaction_id
        and p.user_id = new.user_id
      except all
      select p.account_id, p.direction, p.amount, p.currency, p.exchange_rate
      from public.personal_finance_postings p
      where p.transaction_id = new.reversal_transaction_id
        and p.user_id = new.user_id
    )
    union all
    (
      select p.account_id, p.direction, p.amount, p.currency, p.exchange_rate
      from public.personal_finance_postings p
      where p.transaction_id = new.reversal_transaction_id
        and p.user_id = new.user_id
      except all
      select p.account_id,
             case when p.direction = 'debit' then 'credit' else 'debit' end as direction,
             p.amount, p.currency, p.exchange_rate
      from public.personal_finance_postings p
      where p.transaction_id = new.original_transaction_id
        and p.user_id = new.user_id
    )
  ) then
    raise exception 'reversal postings must exactly invert the original postings';
  end if;

  return new;
end;
$$;

create trigger personal_finance_transaction_reversals_guard
before insert on public.personal_finance_transaction_reversals
for each row execute function public.personal_finance_reversal_guard_v1();

create or replace function public.reverse_personal_finance_transaction_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_original_id uuid;
  v_reason text := btrim(coalesce(p_command->>'reason',''));
  v_reversal_at timestamptz := coalesce(nullif(p_command->>'transaction_at','')::timestamptz, now());
  v_original public.personal_finance_transactions%rowtype;
  v_reversal_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  begin
    v_original_id := nullif(p_command->>'transaction_id','')::uuid;
  exception when others then
    raise exception 'invalid transaction_id';
  end;

  if v_original_id is null then
    raise exception 'transaction_id is required';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'reversal reason must be between 5 and 500 characters';
  end if;

  select * into v_original
  from public.personal_finance_transactions t
  where t.id = v_original_id
    and t.user_id = v_user_id
    and t.status = 'posted'
  for update;

  if v_original.id is null then
    raise exception 'posted personal finance transaction not found';
  end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.reversal_transaction_id = v_original_id
      and r.user_id = v_user_id
  ) then
    raise exception 'a reversal transaction cannot itself be reversed';
  end if;
  if exists (
    select 1 from public.personal_finance_transaction_reversals r
    where r.original_transaction_id = v_original_id
      and r.user_id = v_user_id
  ) then
    raise exception 'personal finance transaction is already reversed';
  end if;

  insert into public.personal_finance_transactions(
    id, user_id, transaction_type, transaction_at, description, category_id,
    amount, currency, status, source, metadata
  ) values (
    v_reversal_id,
    v_user_id,
    'adjustment',
    v_reversal_at,
    left('عكس قيد: ' || coalesce(v_original.description, v_original.transaction_type), 500),
    null,
    v_original.amount,
    v_original.currency,
    'draft',
    'manual',
    jsonb_build_object(
      'contract_version', 1,
      'reversal_of', v_original.id,
      'reversal_reason', v_reason,
      'original_transaction_type', v_original.transaction_type,
      'original_source', v_original.source
    )
  );

  insert into public.personal_finance_postings(
    transaction_id, user_id, account_id, direction, amount, currency, exchange_rate, metadata
  )
  select
    v_reversal_id,
    v_user_id,
    p.account_id,
    case when p.direction = 'debit' then 'credit' else 'debit' end,
    p.amount,
    p.currency,
    p.exchange_rate,
    jsonb_build_object('reversal_of_posting_id', p.id)
  from public.personal_finance_postings p
  where p.transaction_id = v_original_id
    and p.user_id = v_user_id
  order by p.id;

  update public.personal_finance_transactions
  set status = 'posted'
  where id = v_reversal_id
    and user_id = v_user_id;

  insert into public.personal_finance_transaction_reversals(
    original_transaction_id, reversal_transaction_id, user_id, reason
  ) values (
    v_original_id, v_reversal_id, v_user_id, v_reason
  );

  return jsonb_build_object(
    'contract_version', 1,
    'original_transaction_id', v_original_id,
    'reversal_transaction_id', v_reversal_id,
    'reason', v_reason,
    'status', 'posted'
  );
end;
$$;

create or replace function public.get_my_financial_transaction_v1(p_transaction_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'contract_version', 1,
    'transaction', jsonb_build_object(
      'id', t.id,
      'transaction_type', t.transaction_type,
      'transaction_at', t.transaction_at,
      'description', t.description,
      'amount', t.amount,
      'currency', t.currency,
      'status', t.status,
      'source', t.source,
      'category_id', t.category_id,
      'category_name', c.name,
      'metadata', t.metadata,
      'created_at', t.created_at
    ),
    'postings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'account_id', p.account_id,
        'account_name', a.name,
        'account_type', a.account_type,
        'account_status', a.status,
        'direction', p.direction,
        'amount', p.amount,
        'currency', p.currency,
        'exchange_rate', p.exchange_rate,
        'created_at', p.created_at
      ) order by p.created_at, p.id)
      from public.personal_finance_postings p
      join public.personal_finance_accounts a
        on a.id = p.account_id and a.user_id = p.user_id
      where p.transaction_id = t.id
        and p.user_id = t.user_id
    ), '[]'::jsonb),
    'source_operations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'operation_id', l.operation_id,
        'public_token', o.public_token,
        'link_role', l.link_role,
        'link_source', l.link_source,
        'linked_at', l.created_at,
        'amount', o.amount,
        'currency', o.currency,
        'status', o.status,
        'financial_entity', o.financial_entity
      ) order by l.created_at, l.operation_id)
      from public.personal_finance_operation_links l
      join public.operations o on o.id = l.operation_id
      where l.personal_finance_transaction_id = t.id
        and l.user_id = t.user_id
    ), '[]'::jsonb),
    'reversal', (
      select jsonb_build_object(
        'reversal_transaction_id', r.reversal_transaction_id,
        'reason', r.reason,
        'created_at', r.created_at
      )
      from public.personal_finance_transaction_reversals r
      where r.original_transaction_id = t.id
        and r.user_id = t.user_id
    ),
    'reverses', (
      select jsonb_build_object(
        'original_transaction_id', r.original_transaction_id,
        'reason', r.reason,
        'created_at', r.created_at
      )
      from public.personal_finance_transaction_reversals r
      where r.reversal_transaction_id = t.id
        and r.user_id = t.user_id
    )
  )
  from public.personal_finance_transactions t
  left join public.personal_finance_categories c
    on c.id = t.category_id and c.user_id = t.user_id
  where t.id = p_transaction_id
    and t.user_id = (select auth.uid());
$$;

create or replace function public.get_my_financial_activity_v1(p_limit integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'contract_version', 2,
    'items', coalesce(jsonb_agg(to_jsonb(x) order by x.transaction_at desc, x.id desc), '[]'::jsonb)
  )
  from (
    select
      t.id,
      t.transaction_type,
      t.transaction_at,
      t.description,
      t.amount,
      t.currency,
      t.source,
      t.category_id,
      c.name as category_name,
      (ro.original_transaction_id is not null) as is_reversed,
      ro.reversal_transaction_id as reversed_by_transaction_id,
      (rr.reversal_transaction_id is not null) as is_reversal,
      rr.original_transaction_id as reverses_transaction_id,
      coalesce(ro.reason, rr.reason) as reversal_reason
    from public.personal_finance_transactions t
    left join public.personal_finance_categories c
      on c.id = t.category_id and c.user_id = t.user_id
    left join public.personal_finance_transaction_reversals ro
      on ro.original_transaction_id = t.id and ro.user_id = t.user_id
    left join public.personal_finance_transaction_reversals rr
      on rr.reversal_transaction_id = t.id and rr.user_id = t.user_id
    where t.user_id = (select auth.uid())
      and t.status = 'posted'
    order by t.transaction_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x;
$$;

create or replace function public.get_my_financial_home_v1()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now()) as period_start,
           date_trunc('month', now()) + interval '1 month' as period_end
  ), summary as (
    select
      t.currency,
      coalesce(sum(t.amount) filter (where t.transaction_type = 'income'), 0)::numeric(20,6) as income,
      coalesce(sum(t.amount) filter (where t.transaction_type = 'expense'), 0)::numeric(20,6) as expense
    from public.personal_finance_transactions t, bounds b
    where t.user_id = (select auth.uid())
      and t.status = 'posted'
      and t.transaction_at >= b.period_start
      and t.transaction_at < b.period_end
      and not exists (
        select 1
        from public.personal_finance_transaction_reversals r
        where r.original_transaction_id = t.id
          and r.user_id = t.user_id
      )
    group by t.currency
  ), recent as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_at desc, r.id desc), '[]'::jsonb) as items
    from (
      select
        t.id, t.transaction_type, t.transaction_at, t.description, t.amount, t.currency, t.source, t.category_id,
        (ro.original_transaction_id is not null) as is_reversed,
        ro.reversal_transaction_id as reversed_by_transaction_id,
        (rr.reversal_transaction_id is not null) as is_reversal,
        rr.original_transaction_id as reverses_transaction_id,
        coalesce(ro.reason, rr.reason) as reversal_reason
      from public.personal_finance_transactions t
      left join public.personal_finance_transaction_reversals ro
        on ro.original_transaction_id = t.id and ro.user_id = t.user_id
      left join public.personal_finance_transaction_reversals rr
        on rr.reversal_transaction_id = t.id and rr.user_id = t.user_id
      where t.user_id = (select auth.uid())
        and t.status = 'posted'
      order by t.transaction_at desc, t.id desc
      limit 8
    ) r
  )
  select jsonb_build_object(
    'contract_version', 3,
    'period_start', b.period_start,
    'period_end', b.period_end,
    'summary_by_currency', coalesce((select jsonb_agg(to_jsonb(s) order by s.currency) from summary s), '[]'::jsonb),
    'accounts', public.get_my_financial_accounts_v1(),
    'recent_activity', recent.items,
    'unlinked_operations_count', (
      select count(*)
      from public.operations o
      where o.submitted_by_user_id = (select auth.uid())
        and not exists (
          select 1
          from public.personal_finance_operation_links l
          where l.operation_id = o.id
            and l.user_id = (select auth.uid())
            and l.link_role = 'source'
        )
    )
  )
  from bounds b cross join recent;
$$;

revoke all on function public.reverse_personal_finance_transaction_v1(jsonb) from public, anon;
revoke all on function public.get_my_financial_transaction_v1(uuid) from public, anon;
grant execute on function public.reverse_personal_finance_transaction_v1(jsonb) to authenticated;
grant execute on function public.get_my_financial_transaction_v1(uuid) to authenticated;
