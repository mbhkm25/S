begin;

create or replace function public.refresh_business_financial_accounts_projection(
  p_business_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_business_id is null then
    return;
  end if;

  perform public.sync_business_financial_accounts_legacy_cache(p_business_id);
end;
$$;

create or replace function public.business_financial_account_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_business_financial_accounts_projection(old.business_id);
    return old;
  end if;

  perform public.refresh_business_financial_accounts_projection(new.business_id);

  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id then
    perform public.refresh_business_financial_accounts_projection(old.business_id);
  end if;

  return new;
end;
$$;

create or replace function public.business_financial_identifier_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_previous_business_id uuid;
begin
  if tg_op <> 'DELETE' then
    select a.business_id
      into v_business_id
    from public.business_financial_accounts a
    where a.id = new.financial_account_id;
  end if;

  if tg_op <> 'INSERT' then
    select a.business_id
      into v_previous_business_id
    from public.business_financial_accounts a
    where a.id = old.financial_account_id;
  end if;

  perform public.refresh_business_financial_accounts_projection(v_business_id);

  if v_previous_business_id is distinct from v_business_id then
    perform public.refresh_business_financial_accounts_projection(v_previous_business_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_business_financial_accounts_public_projection
  on public.business_financial_accounts;

create trigger trg_business_financial_accounts_public_projection
after insert or update or delete on public.business_financial_accounts
for each row execute function public.business_financial_account_projection_trigger();

drop trigger if exists trg_business_financial_identifiers_public_projection
  on public.business_financial_identifiers;

create trigger trg_business_financial_identifiers_public_projection
after insert or update or delete on public.business_financial_identifiers
for each row execute function public.business_financial_identifier_projection_trigger();

-- Rebuild every compatibility projection from the normalized source of truth.
do $$
declare
  v_business_id uuid;
begin
  for v_business_id in
    select distinct a.business_id
    from public.business_financial_accounts a
  loop
    perform public.refresh_business_financial_accounts_projection(v_business_id);
  end loop;
end;
$$;

comment on function public.refresh_business_financial_accounts_projection(uuid) is
  'Rebuilds the public-safe financial accounts projection from normalized business financial accounts and identifiers.';

comment on trigger trg_business_financial_accounts_public_projection
  on public.business_financial_accounts is
  'Keeps the public business profile financial accounts projection synchronized with the normalized source of truth.';

comment on trigger trg_business_financial_identifiers_public_projection
  on public.business_financial_identifiers is
  'Keeps the public business profile financial accounts projection synchronized when identifiers change.';

revoke all on function public.refresh_business_financial_accounts_projection(uuid) from public, anon, authenticated;
revoke all on function public.business_financial_account_projection_trigger() from public, anon, authenticated;
revoke all on function public.business_financial_identifier_projection_trigger() from public, anon, authenticated;

commit;
