-- Migrate legacy JSON financial accounts into the normalized routing model.
-- Keep profile_sections.financial_accounts as a public-safe compatibility cache.

update public.financial_entities
set aliases = case code
  when 'alomqy_mobile' then '["العمقي","ALOMQY","Al Omqy","شركة العمقي","العمقي واخوانه"]'::jsonb
  when 'albusaery_mobile' then '["البسيري","ALBUSAERY","Al Busaery"]'::jsonb
  when 'bcash_wallet' then '["بي كاش","B Cash","BCash"]'::jsonb
  when 'kuraimi_sar' then '["كريمي سعودي","Kuraimi SAR"]'::jsonb
  when 'kuraimi_yer' then '["كريمي يمني","Kuraimi YER"]'::jsonb
  when 'kuraimi_haseb' then '["حاسب","كريمي حاسب","Haseb","Haseb Payment"]'::jsonb
  when 'bin_dowal_exchange' then '["بن دول","شركة بن دول للصرافة","Bin Dowal Exchange"]'::jsonb
  when 'bin_dowal_pay' then '["Bin Dowal Pay"]'::jsonb
  when 'm_floos' then '["ام فلوس","M Floos","M-Floos"]'::jsonb
  when 'aden_cash' then '["Aden Cash"]'::jsonb
  when 'alqutaibi' then '["Al Qutaibi","Qutaibi"]'::jsonb
  when 'almehdar' then '["Al Mehdar","Mehdar"]'::jsonb
  else aliases
end,
updated_at = now();

create or replace function public.resolve_financial_entity_code(p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select fe.code
  from public.financial_entities fe
  where fe.status = 'active'
    and (
      fe.code = btrim(coalesce(p_value, ''))
      or fe.display_name_normalized = public.normalize_financial_name(p_value)
      or exists (
        select 1
        from jsonb_array_elements_text(fe.aliases) alias(value)
        where public.normalize_financial_name(alias.value) = public.normalize_financial_name(p_value)
      )
    )
  order by
    case
      when fe.code = btrim(coalesce(p_value, '')) then 0
      when fe.display_name_normalized = public.normalize_financial_name(p_value) then 1
      else 2
    end,
    fe.sort_order
  limit 1;
$$;

create or replace function public.business_financial_accounts_json(
  p_business_id uuid,
  p_public boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(a.legacy_account_id, a.id::text),
        'name', case
          when a.financial_entity_code = 'other'
            then coalesce(nullif(a.financial_entity_raw, ''), fe.display_name_ar)
          else fe.display_name_ar
        end,
        'financial_entity_code', a.financial_entity_code,
        'financial_entity_raw', a.financial_entity_raw,
        'account_holder_name', a.account_holder_name,
        'account_label', a.account_label,
        'is_multicurrency', a.is_multicurrency,
        'account_number', case
          when not a.is_multicurrency then (
            select i.identifier_value
            from public.business_financial_identifiers i
            where i.financial_account_id = a.id
              and i.status = 'active'
            order by i.is_primary desc, i.created_at, i.id
            limit 1
          )
          else null
        end,
        'accounts', case
          when a.is_multicurrency then jsonb_strip_nulls(jsonb_build_object(
            'YER', (
              select i.identifier_value
              from public.business_financial_identifiers i
              where i.financial_account_id = a.id
                and i.status = 'active'
                and i.currency = 'YER'
              order by i.is_primary desc, i.created_at, i.id
              limit 1
            ),
            'SAR', (
              select i.identifier_value
              from public.business_financial_identifiers i
              where i.financial_account_id = a.id
                and i.status = 'active'
                and i.currency = 'SAR'
              order by i.is_primary desc, i.created_at, i.id
              limit 1
            ),
            'USD', (
              select i.identifier_value
              from public.business_financial_identifiers i
              where i.financial_account_id = a.id
                and i.status = 'active'
                and i.currency = 'USD'
              order by i.is_primary desc, i.created_at, i.id
              limit 1
            )
          ))
          else null
        end
      ) || case
        when p_public then '{}'::jsonb
        else jsonb_build_object(
          'account_id', a.id,
          'routing_enabled', a.routing_enabled,
          'verification_status', a.verification_status,
          'identifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'identifier_type', i.identifier_type,
                'identifier_value', i.identifier_value,
                'currency', i.currency,
                'is_primary', i.is_primary,
                'routing_enabled', i.routing_enabled,
                'verification_status', i.verification_status
              ) order by i.is_primary desc, i.created_at, i.id
            )
            from public.business_financial_identifiers i
            where i.financial_account_id = a.id
              and i.status = 'active'
          ), '[]'::jsonb)
        )
      end
      order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from public.business_financial_accounts a
  join public.financial_entities fe on fe.code = a.financial_entity_code
  where a.business_id = p_business_id
    and a.status = 'active';
$$;

create or replace function public.sync_business_financial_accounts_legacy_cache(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  v_items := public.business_financial_accounts_json(p_business_id, true);

  update public.business_profiles bp
  set profile_sections = jsonb_set(
        coalesce(bp.profile_sections, '{}'::jsonb),
        '{financial_accounts}',
        v_items,
        true
      ),
      updated_at = now()
  where bp.id = p_business_id;
end;
$$;

with legacy as (
  select
    bp.id as business_id,
    bp.owner_user_id,
    item,
    coalesce(
      nullif(item->>'id', ''),
      'legacy_' || md5(bp.id::text || '|' || item::text)
    ) as legacy_account_id,
    public.resolve_financial_entity_code(item->>'name') as resolved_code
  from public.business_profiles bp
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(bp.profile_sections->'financial_accounts') = 'array'
        then bp.profile_sections->'financial_accounts'
      else '[]'::jsonb
    end
  ) item
)
insert into public.business_financial_accounts (
  business_id,
  legacy_account_id,
  financial_entity_code,
  financial_entity_raw,
  is_multicurrency,
  routing_enabled,
  verification_status,
  status,
  metadata,
  created_by_user_id
)
select
  l.business_id,
  l.legacy_account_id,
  coalesce(l.resolved_code, 'other'),
  case
    when l.resolved_code is null or l.resolved_code = 'other'
      then nullif(btrim(l.item->>'name'), '')
    else null
  end,
  coalesce((l.item->>'is_multicurrency')::boolean, false),
  true,
  'unverified',
  'active',
  jsonb_build_object('migration_source', 'business_profiles.profile_sections.financial_accounts'),
  l.owner_user_id
from legacy l
on conflict (business_id, legacy_account_id) where legacy_account_id is not null do nothing;

with legacy as (
  select
    bp.id as business_id,
    item,
    coalesce(
      nullif(item->>'id', ''),
      'legacy_' || md5(bp.id::text || '|' || item::text)
    ) as legacy_account_id
  from public.business_profiles bp
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(bp.profile_sections->'financial_accounts') = 'array'
        then bp.profile_sections->'financial_accounts'
      else '[]'::jsonb
    end
  ) item
), candidates as (
  select
    a.id as financial_account_id,
    'account_number'::text as identifier_type,
    nullif(btrim(l.item->>'account_number'), '') as identifier_value,
    null::text as currency,
    true as is_primary
  from legacy l
  join public.business_financial_accounts a
    on a.business_id = l.business_id
   and a.legacy_account_id = l.legacy_account_id
  where not coalesce((l.item->>'is_multicurrency')::boolean, false)

  union all

  select
    a.id,
    'account_number'::text,
    nullif(btrim(e.value), ''),
    upper(e.key),
    true
  from legacy l
  join public.business_financial_accounts a
    on a.business_id = l.business_id
   and a.legacy_account_id = l.legacy_account_id
  cross join lateral jsonb_each_text(
    case
      when jsonb_typeof(l.item->'accounts') = 'object' then l.item->'accounts'
      else '{}'::jsonb
    end
  ) e
  where coalesce((l.item->>'is_multicurrency')::boolean, false)
    and upper(e.key) in ('YER', 'SAR', 'USD')
)
insert into public.business_financial_identifiers (
  financial_account_id,
  identifier_type,
  identifier_value,
  currency,
  is_primary,
  routing_enabled,
  verification_status,
  status,
  metadata
)
select
  c.financial_account_id,
  c.identifier_type,
  c.identifier_value,
  c.currency,
  c.is_primary,
  true,
  'unverified',
  'active',
  jsonb_build_object('migration_source', 'legacy_financial_account_json')
from candidates c
where c.identifier_value is not null
  and public.normalize_financial_identifier(c.identifier_value) is not null
on conflict do nothing;

insert into public.business_financial_account_events (
  business_id,
  financial_account_id,
  event_type,
  actor_user_id,
  snapshot,
  metadata
)
select
  a.business_id,
  a.id,
  'migrated',
  a.created_by_user_id,
  to_jsonb(a),
  jsonb_build_object('source', 'legacy_financial_account_json')
from public.business_financial_accounts a
where a.metadata->>'migration_source' = 'business_profiles.profile_sections.financial_accounts'
  and not exists (
    select 1
    from public.business_financial_account_events e
    where e.financial_account_id = a.id
      and e.event_type = 'migrated'
  );

select public.sync_business_financial_accounts_legacy_cache(bp.id)
from public.business_profiles bp
where exists (
  select 1
  from public.business_financial_accounts a
  where a.business_id = bp.id
);

create or replace function public.get_financial_entities()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', fe.code,
    'display_name_ar', fe.display_name_ar,
    'routing_enabled', fe.routing_enabled,
    'sort_order', fe.sort_order
  ) order by fe.sort_order, fe.display_name_ar), '[]'::jsonb)
  from public.financial_entities fe
  where fe.status = 'active';
$$;

create or replace function public.get_business_financial_accounts(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.business_profiles bp
    where bp.id = p_business_id
      and (bp.owner_user_id = v_uid or public.is_platform_admin(v_uid))
  ) then
    raise exception 'business_owner_required';
  end if;

  return jsonb_build_object(
    'business_id', p_business_id,
    'items', public.business_financial_accounts_json(p_business_id, false)
  );
end;
$$;

revoke all on function public.resolve_financial_entity_code(text) from public, anon, authenticated;
revoke all on function public.business_financial_accounts_json(uuid, boolean) from public, anon, authenticated;
revoke all on function public.sync_business_financial_accounts_legacy_cache(uuid) from public, anon, authenticated;

revoke all on function public.get_financial_entities() from public, anon;
grant execute on function public.get_financial_entities() to authenticated;

revoke all on function public.get_business_financial_accounts(uuid) from public, anon;
grant execute on function public.get_business_financial_accounts(uuid) to authenticated;

comment on function public.resolve_financial_entity_code(text) is
  'Resolves exact prompt values and approved aliases to the canonical financial entity code.';
comment on function public.business_financial_accounts_json(uuid, boolean) is
  'Projects normalized financial accounts into the legacy UI/public profile contract.';
