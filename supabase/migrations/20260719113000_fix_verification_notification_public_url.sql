create or replace function public.get_verification_notification_payload(
  p_operation_id uuid default null::uuid,
  p_public_token uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_operation public.operations%rowtype;
  v_uploader record;
  v_verifier record;
  v_verified_profile record;
  v_verifier_name text;
  v_verifier_phone text;
  v_payload jsonb;
begin
  if p_operation_id is null and p_public_token is null then
    raise exception 'missing_operation_identifier';
  end if;

  select *
  into v_operation
  from public.operations o
  where
    (p_operation_id is not null and o.id = p_operation_id)
    or
    (p_public_token is not null and o.public_token = p_public_token)
  limit 1;

  if v_operation.id is null then
    raise exception 'operation_not_found';
  end if;

  if v_operation.status <> 'verified' then
    raise exception 'operation_not_verified';
  end if;

  select
    l.phone,
    l.user_id,
    coalesce(
      p.full_name,
      l.metadata->>'sender_name',
      l.metadata->>'full_name',
      l.phone
    ) as display_name
  into v_uploader
  from public.operation_user_links l
  left join public.profiles p on p.id = l.user_id
  where
    l.operation_id = v_operation.id
    and l.relation_type = 'uploader'
    and l.phone is not null
  order by l.created_at asc
  limit 1;

  if v_uploader.phone is null then
    raise exception 'uploader_phone_not_found';
  end if;

  select
    l.phone,
    l.user_id,
    coalesce(
      p.full_name,
      l.metadata->>'sender_name',
      l.metadata->>'full_name',
      l.phone
    ) as display_name
  into v_verifier
  from public.operation_user_links l
  left join public.profiles p on p.id = l.user_id
  where
    l.operation_id = v_operation.id
    and l.relation_type = 'verifier'
  order by l.created_at desc
  limit 1;

  select
    p.full_name,
    p.phone
  into v_verified_profile
  from public.profiles p
  where p.id = v_operation.verified_by_user_id
  limit 1;

  v_verifier_name := coalesce(
    v_verifier.display_name,
    v_verified_profile.full_name,
    v_verifier.phone,
    v_verified_profile.phone,
    'مستخدم سند'
  );

  v_verifier_phone := coalesce(
    v_verifier.phone,
    v_verified_profile.phone
  );

  v_payload := jsonb_build_object(
    'operation', jsonb_build_object(
      'id', v_operation.id,
      'public_token', v_operation.public_token,
      'status', v_operation.status,
      'ai_status', v_operation.ai_status,
      'summary', coalesce(
        v_operation.summary,
        v_operation.structured_data->>'summary',
        v_operation.raw_ai_json->>'summary'
      ),
      'financial_entity', v_operation.financial_entity,
      'transaction_type', v_operation.transaction_type,
      'amount', v_operation.amount,
      'currency', v_operation.currency,
      'reference_number', v_operation.reference_number,
      'verified_at', v_operation.verified_at,
      'verified_by_user_id', v_operation.verified_by_user_id,
      'created_at', v_operation.created_at
    ),
    'uploader', jsonb_build_object(
      'phone', v_uploader.phone,
      'user_id', v_uploader.user_id,
      'display_name', v_uploader.display_name
    ),
    'verifier', jsonb_build_object(
      'phone', v_verifier_phone,
      'user_id', coalesce(v_verifier.user_id, v_operation.verified_by_user_id),
      'display_name', v_verifier_name
    ),
    'verification_url',
      'https://app.sanadflow.com/v/' || v_operation.public_token
  );

  return v_payload;
end;
$function$;

revoke execute on function public.get_verification_notification_payload(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.get_verification_notification_payload(uuid, uuid)
to service_role;
