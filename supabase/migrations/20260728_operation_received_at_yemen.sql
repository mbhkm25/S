alter table public.operations
  add column if not exists received_at timestamptz,
  add column if not exists received_timezone text;

update public.operations
set
  received_at = coalesce(received_at, created_at),
  received_timezone = coalesce(nullif(received_timezone, ''), 'Asia/Aden')
where received_at is null
   or received_timezone is null
   or received_timezone = '';

alter table public.operations
  alter column received_at set default now(),
  alter column received_at set not null,
  alter column received_timezone set default 'Asia/Aden',
  alter column received_timezone set not null;

alter table public.operations
  drop constraint if exists operations_received_timezone_check;

alter table public.operations
  add constraint operations_received_timezone_check
  check (received_timezone = 'Asia/Aden');

create index if not exists idx_operations_received_at
  on public.operations (received_at desc);

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
  v_received_at timestamptz;
  v_received_timezone text;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'requires_auth', true
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user::text || ':' || p_public_token::text, 0)
  );

  select id, received_at, received_timezone
    into v_operation, v_received_at, v_received_timezone
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

  if coalesce((v_result ->> 'allowed')::boolean, false) and v_result ? 'operation' then
    v_result := jsonb_set(
      v_result,
      '{operation,received_at}',
      to_jsonb(v_received_at),
      true
    );
    v_result := jsonb_set(
      v_result,
      '{operation,received_timezone}',
      to_jsonb(coalesce(v_received_timezone, 'Asia/Aden')),
      true
    );
  end if;

  return jsonb_set(
    v_result,
    '{usage}',
    public.get_my_operation_access_usage(),
    true
  );
end;
$function$;

comment on column public.operations.received_at is
  'Canonical timestamp when the operation notice reached SANAD. Stored as timestamptz and displayed in Asia/Aden.';

comment on column public.operations.received_timezone is
  'IANA timezone used for receipt-time presentation. Fixed to Asia/Aden for SANAD Yemen.';
