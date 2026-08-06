do $$
declare
  v_definition text;
begin
  -- Defensive consolidation in case historical monthly duplicates exist.
  with ranked as (
    select
      id,
      user_id,
      operation_id,
      row_number() over (
        partition by user_id, operation_id
        order by first_accessed_at asc, created_at asc, id asc
      ) as rn,
      sum(access_count) over (partition by user_id, operation_id) as merged_access_count,
      max(last_accessed_at) over (partition by user_id, operation_id) as merged_last_accessed_at,
      max(updated_at) over (partition by user_id, operation_id) as merged_updated_at
    from public.operation_access_logs
  )
  update public.operation_access_logs l
  set
    access_count = r.merged_access_count,
    last_accessed_at = r.merged_last_accessed_at,
    updated_at = greatest(l.updated_at, r.merged_updated_at),
    metadata = l.metadata || jsonb_build_object('lifetime_access_consolidated', true)
  from ranked r
  where l.id = r.id
    and r.rn = 1;

  with ranked as (
    select
      id,
      row_number() over (
        partition by user_id, operation_id
        order by first_accessed_at asc, created_at asc, id asc
      ) as rn
    from public.operation_access_logs
  )
  delete from public.operation_access_logs l
  using ranked r
  where l.id = r.id
    and r.rn > 1;

  drop index if exists public.uq_operation_access_unique_monthly;
  create unique index if not exists uq_operation_access_unique_lifetime
    on public.operation_access_logs (user_id, operation_id);

  -- Keep the existing payload contract, but make prior access lifetime-based and
  -- make the modern wrapper the sole quota authority.
  select pg_get_functiondef('public.sanad_open_operation_access_legacy(uuid,text)'::regprocedure)
    into v_definition;

  v_definition := regexp_replace(
    v_definition,
    'and l\.operation_id = v_operation\.id\s+and l\.access_month = v_month',
    'and l.operation_id = v_operation.id'
  );

  v_definition := replace(
    v_definition,
    'إعادة فتح نفس العملية في نفس الشهر لا تستهلك رصيدًا جديدًا.',
    'إعادة فتح نفس العملية في أي وقت لا تستهلك رصيدًا جديدًا.'
  );

  v_definition := regexp_replace(
    v_definition,
    'if coalesce\(v_used, 0\) >= coalesce\(v_limit, 50\) then',
    'if false then'
  );

  execute v_definition;
end;
$$;

create or replace function public.open_operation_access(
  p_public_token uuid,
  p_source text default 'link'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_operation uuid;
  v_existing boolean := false;
  v_usage jsonb;
  v_result jsonb;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'requires_auth', true
    );
  end if;

  -- Serialize concurrent attempts for the same user and operation token so a
  -- double click or parallel browser request cannot consume twice.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_public_token::text, 0)
  );

  select id
    into v_operation
  from public.operations
  where public_token = p_public_token
  limit 1;

  if v_operation is not null then
    select exists(
      select 1
      from public.operation_access_logs
      where user_id = v_user
        and operation_id = v_operation
    ) into v_existing;
  end if;

  v_usage := public.get_my_operation_access_usage();

  if not v_existing and coalesce((v_usage ->> 'remaining')::integer, 0) <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'access_limit_reached',
      'requires_subscription', true,
      'usage', v_usage
    );
  end if;

  v_result := public.sanad_open_operation_access_legacy(p_public_token, p_source);

  return jsonb_set(
    v_result,
    '{usage}',
    public.get_my_operation_access_usage(),
    true
  );
end;
$function$;

grant execute on function public.open_operation_access(uuid, text) to authenticated;
revoke execute on function public.open_operation_access(uuid, text) from anon;
