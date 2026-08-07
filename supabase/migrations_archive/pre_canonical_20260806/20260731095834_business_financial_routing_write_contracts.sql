-- Canonical and backward-compatible write contracts for business financial accounts.

create or replace function public.write_business_financial_account(
  p_business_id uuid,
  p_account_id uuid,
  p_legacy_account_id text,
  p_financial_entity_code text,
  p_financial_entity_raw text,
  p_account_holder_name text,
  p_account_label text,
  p_is_multicurrency boolean,
  p_identifiers jsonb,
  p_routing_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account_id uuid := p_account_id;
  v_created boolean := false;
  v_identifier jsonb;
  v_identifier_type text;
  v_identifier_value text;
  v_currency text;
  v_items jsonb;
  v_item jsonb;
  v_legacy_account_id text := nullif(btrim(coalesce(p_legacy_account_id, '')), '');
  v_entity_routing_enabled boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.business_profiles bp
  where bp.id = p_business_id
    and (bp.owner_user_id = v_uid or public.is_platform_admin(v_uid))
  for update;

  if not found then
    raise exception 'business_owner_required';
  end if;

  select fe.routing_enabled into v_entity_routing_enabled
  from public.financial_entities fe
  where fe.code = p_financial_entity_code
    and fe.status = 'active';

  if not found then
    raise exception 'invalid_financial_entity';
  end if;

  if p_financial_entity_code = 'other'
     and nullif(btrim(coalesce(p_financial_entity_raw, '')), '') is null then
    raise exception 'financial_entity_raw_required';
  end if;

  if jsonb_typeof(coalesce(p_identifiers, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_identifiers, '[]'::jsonb)) = 0 then
    raise exception 'financial_identifier_required';
  end if;

  if jsonb_array_length(p_identifiers) > 20 then
    raise exception 'too_many_financial_identifiers';
  end if;

  if v_account_id is not null then
    perform 1
    from public.business_financial_accounts a
    where a.id = v_account_id
      and a.business_id = p_business_id
    for update;

    if not found then
      raise exception 'financial_account_not_found';
    end if;
  else
    v_account_id := gen_random_uuid();
    v_created := true;
  end if;

  insert into public.business_financial_accounts (
    id,
    business_id,
    legacy_account_id,
    financial_entity_code,
    financial_entity_raw,
    account_holder_name,
    account_label,
    is_multicurrency,
    routing_enabled,
    verification_status,
    verified_at,
    verified_by_user_id,
    status,
    metadata,
    created_by_user_id
  ) values (
    v_account_id,
    p_business_id,
    coalesce(v_legacy_account_id, 'acc_' || replace(v_account_id::text, '-', '')),
    p_financial_entity_code,
    case
      when p_financial_entity_code = 'other' then nullif(btrim(p_financial_entity_raw), '')
      else null
    end,
    nullif(btrim(coalesce(p_account_holder_name, '')), ''),
    nullif(btrim(coalesce(p_account_label, '')), ''),
    coalesce(p_is_multicurrency, false),
    coalesce(p_routing_enabled, true) and coalesce(v_entity_routing_enabled, false),
    'unverified',
    null,
    null,
    'active',
    jsonb_build_object('last_write_source', 'business_financial_account_rpc'),
    v_uid
  )
  on conflict (id) do update
  set financial_entity_code = excluded.financial_entity_code,
      financial_entity_raw = excluded.financial_entity_raw,
      account_holder_name = excluded.account_holder_name,
      account_label = excluded.account_label,
      is_multicurrency = excluded.is_multicurrency,
      routing_enabled = excluded.routing_enabled,
      verification_status = 'unverified',
      verified_at = null,
      verified_by_user_id = null,
      status = 'active',
      metadata = public.business_financial_accounts.metadata || excluded.metadata,
      updated_at = now();

  update public.business_financial_identifiers
  set status = 'archived',
      routing_enabled = false,
      updated_at = now()
  where financial_account_id = v_account_id
    and status = 'active';

  for v_identifier in
    select value from jsonb_array_elements(p_identifiers)
  loop
    v_identifier_type := nullif(btrim(coalesce(v_identifier->>'identifier_type', '')), '');
    v_identifier_value := nullif(btrim(coalesce(v_identifier->>'identifier_value', '')), '');
    v_currency := nullif(upper(btrim(coalesce(v_identifier->>'currency', ''))), '');

    if v_identifier_type is null
       or v_identifier_type not in (
         'account_number', 'wallet_number', 'customer_line', 'merchant_point',
         'terminal_number', 'phone_number', 'iban', 'other'
       ) then
      raise exception 'invalid_financial_identifier_type';
    end if;

    if v_identifier_value is null
       or public.normalize_financial_identifier(v_identifier_value) is null then
      raise exception 'invalid_financial_identifier_value';
    end if;

    if v_currency is not null and v_currency not in ('YER', 'SAR', 'USD') then
      raise exception 'invalid_financial_identifier_currency';
    end if;

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
    ) values (
      v_account_id,
      v_identifier_type,
      v_identifier_value,
      v_currency,
      coalesce((v_identifier->>'is_primary')::boolean, false),
      (coalesce(p_routing_enabled, true) and coalesce(v_entity_routing_enabled, false))
        and coalesce((v_identifier->>'routing_enabled')::boolean, true),
      'unverified',
      'active',
      jsonb_build_object('source', 'business_financial_account_rpc')
    );
  end loop;

  insert into public.business_financial_account_events (
    business_id,
    financial_account_id,
    event_type,
    actor_user_id,
    snapshot,
    metadata
  )
  select
    p_business_id,
    v_account_id,
    case when v_created then 'created' else 'updated' end,
    v_uid,
    to_jsonb(a) || jsonb_build_object(
      'identifiers', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
        from public.business_financial_identifiers i
        where i.financial_account_id = a.id
          and i.status = 'active'
      ), '[]'::jsonb)
    ),
    jsonb_build_object('source', 'business_financial_account_rpc')
  from public.business_financial_accounts a
  where a.id = v_account_id;

  perform public.sync_business_financial_accounts_legacy_cache(p_business_id);
  v_items := public.business_financial_accounts_json(p_business_id, false);

  select entry.value into v_item
  from jsonb_array_elements(v_items) entry(value)
  where entry.value->>'account_id' = v_account_id::text
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'item', v_item,
    'items', v_items,
    'account_id', v_account_id
  );
end;
$$;

create or replace function public.upsert_business_financial_account_v2(
  p_business_id uuid,
  p_financial_entity_code text,
  p_account_id uuid default null,
  p_financial_entity_raw text default null,
  p_account_holder_name text default null,
  p_account_label text default null,
  p_is_multicurrency boolean default false,
  p_identifiers jsonb default '[]'::jsonb,
  p_routing_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.write_business_financial_account(
    p_business_id,
    p_account_id,
    null,
    p_financial_entity_code,
    p_financial_entity_raw,
    p_account_holder_name,
    p_account_label,
    p_is_multicurrency,
    p_identifiers,
    p_routing_enabled
  );
end;
$$;

create or replace function public.upsert_business_financial_account(
  p_business_id uuid,
  p_account_id text default null,
  p_name text default null,
  p_is_multicurrency boolean default false,
  p_account_number text default null,
  p_accounts jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity_code text;
  v_entity_raw text;
  v_account_uuid uuid;
  v_identifiers jsonb;
  v_legacy_id text := nullif(btrim(coalesce(p_account_id, '')), '');
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'account_name_required';
  end if;

  v_entity_code := public.resolve_financial_entity_code(p_name);

  if v_entity_code is null then
    v_entity_code := 'other';
    v_entity_raw := btrim(p_name);
  elsif v_entity_code = 'other' then
    v_entity_raw := btrim(p_name);
  end if;

  if v_legacy_id is not null then
    select a.id into v_account_uuid
    from public.business_financial_accounts a
    where a.business_id = p_business_id
      and (a.legacy_account_id = v_legacy_id or a.id::text = v_legacy_id)
    limit 1;
  end if;

  if coalesce(p_is_multicurrency, false) then
    if jsonb_typeof(coalesce(p_accounts, '{}'::jsonb)) <> 'object' then
      raise exception 'multicurrency_accounts_object_required';
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'identifier_type', 'account_number',
        'identifier_value', e.value,
        'currency', upper(e.key),
        'is_primary', true,
        'routing_enabled', true
      ) order by case upper(e.key) when 'YER' then 1 when 'SAR' then 2 when 'USD' then 3 else 9 end
    ), '[]'::jsonb)
    into v_identifiers
    from jsonb_each_text(coalesce(p_accounts, '{}'::jsonb)) e
    where upper(e.key) in ('YER', 'SAR', 'USD')
      and nullif(btrim(e.value), '') is not null;
  else
    if nullif(btrim(coalesce(p_account_number, '')), '') is null then
      raise exception 'account_number_required';
    end if;

    v_identifiers := jsonb_build_array(jsonb_build_object(
      'identifier_type', 'account_number',
      'identifier_value', btrim(p_account_number),
      'currency', null,
      'is_primary', true,
      'routing_enabled', true
    ));
  end if;

  return public.write_business_financial_account(
    p_business_id,
    v_account_uuid,
    v_legacy_id,
    v_entity_code,
    v_entity_raw,
    null,
    null,
    coalesce(p_is_multicurrency, false),
    v_identifiers,
    true
  );
end;
$$;

create or replace function public.delete_business_financial_account(
  p_business_id uuid,
  p_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.business_financial_accounts%rowtype;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  perform 1
  from public.business_profiles bp
  where bp.id = p_business_id
    and (bp.owner_user_id = v_uid or public.is_platform_admin(v_uid))
  for update;

  if not found then
    raise exception 'business_owner_required';
  end if;

  select a.* into v_account
  from public.business_financial_accounts a
  where a.business_id = p_business_id
    and (a.legacy_account_id = p_account_id or a.id::text = p_account_id)
    and a.status <> 'archived'
  for update;

  if not found then
    raise exception 'financial_account_not_found';
  end if;

  insert into public.business_financial_account_events (
    business_id,
    financial_account_id,
    event_type,
    actor_user_id,
    snapshot,
    metadata
  ) values (
    p_business_id,
    v_account.id,
    'archived',
    v_uid,
    to_jsonb(v_account) || jsonb_build_object(
      'identifiers', coalesce((
        select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
        from public.business_financial_identifiers i
        where i.financial_account_id = v_account.id
          and i.status = 'active'
      ), '[]'::jsonb)
    ),
    jsonb_build_object('source', 'delete_business_financial_account')
  );

  update public.business_financial_accounts
  set status = 'archived',
      routing_enabled = false,
      updated_at = now()
  where id = v_account.id;

  update public.business_financial_identifiers
  set status = 'archived',
      routing_enabled = false,
      updated_at = now()
  where financial_account_id = v_account.id
    and status = 'active';

  perform public.sync_business_financial_accounts_legacy_cache(p_business_id);
  v_items := public.business_financial_accounts_json(p_business_id, false);

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.write_business_financial_account(uuid, uuid, text, text, text, text, text, boolean, jsonb, boolean) from public, anon, authenticated;

revoke all on function public.upsert_business_financial_account_v2(uuid, text, uuid, text, text, text, boolean, jsonb, boolean) from public, anon;
grant execute on function public.upsert_business_financial_account_v2(uuid, text, uuid, text, text, text, boolean, jsonb, boolean) to authenticated;

revoke all on function public.upsert_business_financial_account(uuid, text, text, boolean, text, jsonb) from public, anon;
grant execute on function public.upsert_business_financial_account(uuid, text, text, boolean, text, jsonb) to authenticated;

revoke all on function public.delete_business_financial_account(uuid, text) from public, anon;
grant execute on function public.delete_business_financial_account(uuid, text) to authenticated;

comment on function public.upsert_business_financial_account_v2(uuid, text, uuid, text, text, text, boolean, jsonb, boolean) is
  'Canonical management RPC for normalized business financial accounts and identifiers.';
comment on function public.upsert_business_financial_account(uuid, text, text, boolean, text, jsonb) is
  'Backward-compatible wrapper for the pre-routing financial account UI contract.';
