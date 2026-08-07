begin;

create or replace function private.notify_business_payment_inbox(p_inbox_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.business_payment_inbox%rowtype;
  v_business public.business_profiles%rowtype;
  v_operation public.operations%rowtype;
  v_user_id uuid;
begin
  select * into v_item
  from public.business_payment_inbox
  where id = p_inbox_id;

  if not found then
    return;
  end if;

  select * into v_business
  from public.business_profiles
  where id = v_item.business_id;

  select * into v_operation
  from public.operations
  where id = v_item.operation_id;

  if v_operation.id is null or v_operation.public_token is null then
    raise exception 'payment_inbox_operation_token_missing';
  end if;

  for v_user_id in
    select v_business.owner_user_id
    union
    select m.user_id
    from public.business_team_members m
    where m.business_id = v_item.business_id
      and m.status = 'active'
      and private.has_business_payment_permission(v_item.business_id, 'view', m.user_id)
  loop
    perform private.create_notification(
      v_user_id,
      'payment_inbox_new',
      'business',
      'info',
      'دفعة جديدة في وارد المدفوعات',
      concat(
        'وصلت عملية ',
        coalesce(v_operation.amount::text, '—'),
        ' ',
        coalesce(v_operation.currency, ''),
        ' إلى ',
        v_business.name,
        '.'
      ),
      'operation_details',
      jsonb_build_object(
        'operation_id', v_operation.id,
        'public_token', v_operation.public_token,
        'payment_inbox_id', v_item.id,
        'business_id', v_item.business_id,
        'source', 'notification'
      ),
      null,
      v_item.business_id,
      v_item.operation_id,
      'business_payment_inbox',
      v_item.id::text,
      concat('payment_inbox_new:', v_item.id, ':', v_user_id),
      jsonb_build_object(
        'payment_inbox_id', v_item.id,
        'source_mode', v_item.source_mode,
        'match_score', v_item.match_score,
        'public_token', v_operation.public_token
      ),
      now() + interval '30 days'
    );
  end loop;
end;
$$;

update public.notifications n
set action_type = 'operation_details',
    action_payload = jsonb_build_object(
      'operation_id', o.id,
      'public_token', o.public_token,
      'payment_inbox_id', coalesce(n.action_payload->>'payment_inbox_id', n.data->>'payment_inbox_id'),
      'business_id', n.business_id,
      'source', 'notification'
    ),
    data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object('public_token', o.public_token),
    updated_at = now()
from public.operations o
where n.notification_type = 'payment_inbox_new'
  and n.operation_id = o.id
  and o.public_token is not null
  and n.archived_at is null;

commit;
