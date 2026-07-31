-- Refine event-source projection and expose unified workflow read models.

create or replace function private.mirror_business_payment_event_to_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(new.metadata ->> 'source', ''), 'payment_inbox');
begin
  update public.business_payment_inbox
  set last_action_source = v_source,
      claimed_source = case
        when new.event_type in ('claimed','reassigned') then v_source
        when new.event_type = 'claim_renewed' then coalesce(claimed_source,v_source)
        else claimed_source
      end,
      completed_source = case
        when new.event_type = 'completed' then v_source
        else completed_source
      end
  where id = new.inbox_id;

  insert into public.operation_events(
    operation_id,event_type,actor_user_id,metadata,source
  ) values (
    new.operation_id,
    'business_payment_' || new.event_type,
    new.actor_user_id,
    jsonb_build_object(
      'inbox_event_id',new.id,
      'inbox_id',new.inbox_id,
      'business_id',new.business_id,
      'from_status',new.from_status,
      'to_status',new.to_status,
      'reason',new.reason,
      'details',coalesce(new.metadata,'{}'::jsonb)
    ),
    v_source
  );
  return new;
end;
$$;

create or replace function public.get_business_payment_inbox(
  p_business_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_items jsonb;
  v_has_more boolean;
  v_next_created timestamptz;
  v_next_id uuid;
begin
  if not private.has_business_payment_permission(p_business_id,'view',auth.uid()) then
    raise exception 'payment_inbox_view_required' using errcode='42501';
  end if;
  if p_status is not null and p_status not in ('new','claimed','completed','released','review_required','rejected','cancelled') then
    raise exception 'invalid_payment_inbox_status';
  end if;
  if (p_before_created_at is null)<>(p_before_id is null) then
    raise exception 'invalid_payment_inbox_cursor';
  end if;

  perform private.expire_business_payment_claims(p_business_id);

  with rows as (
    select i.*,o.public_token,o.amount,o.currency,o.financial_entity,o.financial_entity_code,
      o.receiver_name,o.receiver_account,o.merchant_point,o.reference_number,o.transaction_datetime,
      bp.name as business_name,fa.account_label,fa.account_holder_name,
      cp.full_name as claimed_by_name,ep.full_name as completed_by_name
    from public.business_payment_inbox i
    join public.operations o on o.id=i.operation_id
    join public.business_profiles bp on bp.id=i.business_id
    left join public.business_financial_accounts fa on fa.id=i.financial_account_id
    left join public.profiles cp on cp.id=i.claimed_by_user_id
    left join public.profiles ep on ep.id=i.completed_by_user_id
    where i.business_id=p_business_id
      and (p_status is null or i.status=p_status)
      and (p_status is distinct from 'claimed' or i.claimed_by_user_id=auth.uid())
      and (p_before_created_at is null or (i.created_at,i.id)<(p_before_created_at,p_before_id))
    order by i.created_at desc,i.id desc
    limit v_limit+1
  ), numbered as (
    select *,row_number() over(order by created_at desc,id desc) rn from rows
  ), page as (
    select * from numbered where rn<=v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'business_id',p.business_id,'business_name',p.business_name,
    'operation_id',p.operation_id,'public_token',p.public_token,
    'status',p.status,'source_mode',p.source_mode,'priority',p.priority,
    'match_score',p.match_score,'match_strategy',p.match_strategy,
    'amount',p.amount,'currency',p.currency,'financial_entity',p.financial_entity,
    'financial_entity_code',p.financial_entity_code,'receiver_name',p.receiver_name,
    'receiver_account',p.receiver_account,'merchant_point',p.merchant_point,
    'reference_number',p.reference_number,'transaction_datetime',p.transaction_datetime,
    'financial_account_id',p.financial_account_id,'account_label',p.account_label,
    'account_holder_name',p.account_holder_name,
    'claimed_by_user_id',p.claimed_by_user_id,'claimed_by_name',p.claimed_by_name,
    'claimed_at',p.claimed_at,'claim_expires_at',p.claim_expires_at,
    'claimed_source',p.claimed_source,
    'completed_by_user_id',p.completed_by_user_id,'completed_by_name',p.completed_by_name,
    'completed_at',p.completed_at,'completion_note',p.completion_note,
    'completed_source',p.completed_source,'last_action_source',p.last_action_source,
    'created_at',p.created_at,'updated_at',p.updated_at,'row_version',p.row_version
  ) order by p.created_at desc,p.id desc),'[]'::jsonb),
  exists(select 1 from numbered where rn=v_limit+1),
  (select created_at from page order by created_at asc,id asc limit 1),
  (select id from page order by created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created,v_next_id
  from page p;

  return jsonb_build_object(
    'items',v_items,
    'has_more',coalesce(v_has_more,false),
    'next_cursor',case when v_has_more then jsonb_build_object('created_at',v_next_created,'id',v_next_id) else null end,
    'permissions',jsonb_build_object(
      'claim',private.has_business_payment_permission(p_business_id,'claim',auth.uid()),
      'complete',private.has_business_payment_permission(p_business_id,'complete',auth.uid()),
      'release',private.has_business_payment_permission(p_business_id,'release',auth.uid()),
      'reassign',private.has_business_payment_permission(p_business_id,'reassign',auth.uid()),
      'review',private.has_business_payment_permission(p_business_id,'review',auth.uid())
    )
  );
end;
$$;

create or replace function public.get_operation_workflow_timeline(
  p_token uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_operation public.operations%rowtype;
  v_allowed boolean;
  v_items jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_operation from public.operations
  where public_token=p_token and token_status='active'
    and (token_expires_at is null or token_expires_at>now());
  if not found then raise exception 'operation_not_found_or_token_expired'; end if;

  select (
    v_operation.submitted_by_user_id=auth.uid()
    or exists(select 1 from public.operation_user_links l where l.operation_id=v_operation.id and l.user_id=auth.uid())
    or exists(select 1 from public.business_payment_inbox i where i.operation_id=v_operation.id and private.has_business_payment_permission(i.business_id,'view',auth.uid()))
  ) into v_allowed;
  if not coalesce(v_allowed,false) then raise exception 'operation_workflow_access_denied' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'event_type',e.event_type,
    'actor_user_id',e.actor_user_id,
    'actor_name',p.full_name,
    'source',coalesce(e.source,'system'),
    'metadata',coalesce(e.metadata,'{}'::jsonb),
    'created_at',e.created_at
  ) order by e.created_at desc,e.id desc),'[]'::jsonb)
  into v_items
  from (
    select * from public.operation_events
    where operation_id=v_operation.id
    order by created_at desc,id desc
    limit v_limit
  ) e
  left join public.profiles p on p.id=e.actor_user_id;

  return jsonb_build_object('operation_id',v_operation.id,'items',v_items);
end;
$$;

revoke all on function public.get_operation_workflow_timeline(uuid,integer) from public;
revoke all on function public.get_operation_workflow_timeline(uuid,integer) from anon;
grant execute on function public.get_operation_workflow_timeline(uuid,integer) to authenticated;

comment on function public.get_operation_workflow_timeline(uuid,integer) is
  'Unified audit timeline for one operation across verification, business linking and payment-inbox actions.';
