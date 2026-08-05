begin;

create or replace function public.sanad_shadow_match_financial_identifier(
  p_financial_entity_code text,
  p_identifier_type text,
  p_identifier_value_normalized text,
  p_currency text default null
)
returns table (
  financial_account_id uuid,
  business_id uuid,
  financial_identifier_id uuid,
  identifier_type text,
  identifier_value_normalized text,
  identifier_currency text,
  is_primary boolean,
  account_holder_name_normalized text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id as financial_account_id,
    a.business_id,
    i.id as financial_identifier_id,
    i.identifier_type,
    i.identifier_value_normalized,
    i.currency as identifier_currency,
    i.is_primary,
    a.account_holder_name_normalized
  from public.business_financial_identifiers i
  join public.business_financial_accounts a
    on a.id = i.financial_account_id
  where lower(trim(a.financial_entity_code)) = lower(trim(p_financial_entity_code))
    and lower(trim(i.identifier_type)) = lower(trim(p_identifier_type))
    and i.identifier_value_normalized = p_identifier_value_normalized
    and (p_currency is null or i.currency is null or upper(i.currency) = upper(p_currency))
    and a.routing_enabled is true
    and a.verification_status = 'verified'
    and a.status = 'active'
    and i.routing_enabled is true
    and i.verification_status = 'verified'
    and i.status = 'active'
  order by i.is_primary desc, i.created_at asc;
$$;

comment on function public.sanad_shadow_match_financial_identifier(text, text, text, text)
is 'Internal shadow-only lookup for verified routable business financial identifiers. It does not mutate operations, payment inbox, or business routing state.';

revoke all on function public.sanad_shadow_match_financial_identifier(text, text, text, text) from public;
revoke all on function public.sanad_shadow_match_financial_identifier(text, text, text, text) from anon;
revoke all on function public.sanad_shadow_match_financial_identifier(text, text, text, text) from authenticated;
grant execute on function public.sanad_shadow_match_financial_identifier(text, text, text, text) to service_role;

commit;
