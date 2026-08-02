begin;

create or replace function public.get_business_team_member_operations_v2(
  p_business_id uuid,
  p_member_user_id uuid,
  p_activity_type text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_member jsonb;
  v_items jsonb;
  v_summary jsonb;
  v_can_supervise boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if p_activity_type not in ('all','in_progress','completed','review_required','released','linked') then
    raise exception 'invalid_activity_type';
  end if;

  v_can_supervise :=
    exists(
      select 1
      from public.business_profiles business
      where business.id=p_business_id
        and (business.owner_user_id=v_user_id or public.is_platform_admin(v_user_id))
    )
    or private.has_business_payment_permission(p_business_id,'reassign',v_user_id)
    or private.has_business_payment_permission(p_business_id,'review',v_user_id);

  if not v_can_supervise then
    raise exception 'business_payment_supervision_required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'membership_id', member.id,
    'user_id', member.user_id,
    'status', member.status,
    'job_title', coalesce(member.job_title,member.label),
    'full_name', profile.full_name,
    'phone', profile.phone,
    'joined_at', member.created_at
  )
  into v_member
  from public.business_team_members member
  join public.profiles profile on profile.id=member.user_id
  where member.business_id=p_business_id
    and member.user_id=p_member_user_id
    and member.status<>'removed';

  if v_member is null then
    raise exception 'team_member_not_found';
  end if;

  with member_event_rows as (
    select
      event.inbox_id,
      event.operation_id,
      event.event_type,
      event.actor_user_id,
      event.from_status,
      event.to_status,
      event.reason,
      event.metadata,
      event.created_at,
      case
        when event.actor_user_id=p_member_user_id then true
        when event.event_type='reassigned'
          and nullif(event.metadata->>'assigned_to_user_id','')::uuid=p_member_user_id then true
        else false
      end as belongs_to_member
    from public.business_payment_inbox_events event
    where event.business_id=p_business_id
  ), relevant_operations as (
    select distinct source.operation_id
    from (
      select event.operation_id
      from member_event_rows event
      where event.belongs_to_member
      union all
      select inbox.operation_id
      from public.business_payment_inbox inbox
      where inbox.business_id=p_business_id
        and (inbox.claimed_by_user_id=p_member_user_id or inbox.completed_by_user_id=p_member_user_id)
      union all
      select link.operation_id
      from public.business_operation_links link
      where link.business_id=p_business_id
        and link.status='linked'
        and (link.linked_by_user_id=p_member_user_id or link.verified_by_user_id=p_member_user_id)
      union all
      select user_link.operation_id
      from public.operation_user_links user_link
      where user_link.user_id=p_member_user_id
        and user_link.relation_type='verifier'
    ) source
  ), operation_rows as (
    select
      operation.id as operation_id,
      operation.public_token,
      operation.created_at as operation_created_at,
      operation.status as operation_status,
      operation.ai_status,
      operation.summary,
      operation.financial_entity,
      operation.financial_entity_code,
      operation.transaction_type,
      operation.amount,
      operation.currency,
      operation.reference_number,
      operation.transaction_datetime,
      inbox.id as inbox_id,
      inbox.status as inbox_status,
      inbox.row_version,
      inbox.claimed_by_user_id,
      claimed_profile.full_name as claimed_by_name,
      inbox.claimed_at,
      inbox.claim_expires_at,
      inbox.completed_by_user_id,
      completed_profile.full_name as completed_by_name,
      inbox.completed_at,
      inbox.completed_source,
      inbox.last_action_source,
      coalesce(link.linked_by_user_id=p_member_user_id,false) as linked_by_member,
      coalesce(link.verified_by_user_id=p_member_user_id,false) as verified_by_member,
      link.created_at as linked_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'event_type', event.event_type,
          'from_status', event.from_status,
          'to_status', event.to_status,
          'reason', event.reason,
          'metadata', event.metadata,
          'created_at', event.created_at,
          'actor_user_id', event.actor_user_id,
          'actor_name', actor.full_name,
          'is_member_action', event.actor_user_id=p_member_user_id,
          'assigned_to_member', event.event_type='reassigned'
            and nullif(event.metadata->>'assigned_to_user_id','')::uuid=p_member_user_id
        ) order by event.created_at asc)
        from member_event_rows event
        left join public.profiles actor on actor.id=event.actor_user_id
        where event.operation_id=operation.id
          and event.belongs_to_member
      ),'[]'::jsonb) as member_events,
      coalesce((
        select max(event.created_at)
        from member_event_rows event
        where event.operation_id=operation.id and event.belongs_to_member
      ),link.created_at,operation.created_at) as latest_member_activity_at,
      exists(
        select 1 from member_event_rows event
        where event.operation_id=operation.id
          and event.belongs_to_member
          and event.event_type in ('claimed','reassigned')
      ) as member_claimed,
      exists(
        select 1 from member_event_rows event
        where event.operation_id=operation.id
          and event.actor_user_id=p_member_user_id
          and event.event_type='completed'
      ) or inbox.completed_by_user_id=p_member_user_id as member_completed,
      exists(
        select 1 from member_event_rows event
        where event.operation_id=operation.id
          and event.actor_user_id=p_member_user_id
          and event.event_type='review_requested'
      ) as member_requested_review,
      exists(
        select 1 from member_event_rows event
        where event.operation_id=operation.id
          and event.actor_user_id=p_member_user_id
          and event.event_type in ('released','expired_claim_released')
      ) as member_released
    from relevant_operations relevant
    join public.operations operation on operation.id=relevant.operation_id
    left join public.business_payment_inbox inbox
      on inbox.business_id=p_business_id and inbox.operation_id=operation.id
    left join public.profiles claimed_profile on claimed_profile.id=inbox.claimed_by_user_id
    left join public.profiles completed_profile on completed_profile.id=inbox.completed_by_user_id
    left join public.business_operation_links link
      on link.business_id=p_business_id and link.operation_id=operation.id and link.status='linked'
  ), filtered as (
    select *
    from operation_rows row
    where p_activity_type='all'
      or (p_activity_type='in_progress' and row.inbox_status='claimed' and row.claimed_by_user_id=p_member_user_id)
      or (p_activity_type='completed' and row.member_completed)
      or (p_activity_type='review_required' and row.member_requested_review)
      or (p_activity_type='released' and row.member_released)
      or (p_activity_type='linked' and (row.linked_by_member or row.verified_by_member))
  ), page as (
    select *
    from filtered
    order by latest_member_activity_at desc,operation_id desc
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'operation_id', page.operation_id,
    'inbox_id', page.inbox_id,
    'current_status', coalesce(page.inbox_status,page.operation_status),
    'row_version', page.row_version,
    'current_assignee', case when page.claimed_by_user_id is null then null else jsonb_build_object(
      'user_id',page.claimed_by_user_id,
      'name',page.claimed_by_name,
      'claimed_at',page.claimed_at,
      'claim_expires_at',page.claim_expires_at
    ) end,
    'completed_by', case when page.completed_by_user_id is null then null else jsonb_build_object(
      'user_id',page.completed_by_user_id,
      'name',page.completed_by_name,
      'completed_at',page.completed_at,
      'source',coalesce(page.completed_source,page.last_action_source)
    ) end,
    'contribution',jsonb_build_object(
      'claimed',page.member_claimed,
      'completed',page.member_completed,
      'requested_review',page.member_requested_review,
      'released',page.member_released,
      'linked',page.linked_by_member,
      'verified',page.verified_by_member
    ),
    'member_events',page.member_events,
    'latest_member_activity_at',page.latest_member_activity_at,
    'operation',jsonb_build_object(
      'id',page.operation_id,
      'public_token',page.public_token,
      'created_at',page.operation_created_at,
      'status',page.operation_status,
      'ai_status',page.ai_status,
      'summary',page.summary,
      'financial_entity',page.financial_entity,
      'financial_entity_code',page.financial_entity_code,
      'transaction_type',page.transaction_type,
      'amount',page.amount,
      'currency',page.currency,
      'reference_number',page.reference_number,
      'transaction_datetime',page.transaction_datetime
    )
  ) order by page.latest_member_activity_at desc),'[]'::jsonb)
  into v_items
  from page;

  with member_events as (
    select event.*
    from public.business_payment_inbox_events event
    where event.business_id=p_business_id
      and (
        event.actor_user_id=p_member_user_id
        or (
          event.event_type='reassigned'
          and nullif(event.metadata->>'assigned_to_user_id','')::uuid=p_member_user_id
        )
      )
  ), claim_times as (
    select operation_id,min(created_at) as claimed_at
    from member_events
    where event_type in ('claimed','reassigned')
    group by operation_id
  ), completion_times as (
    select operation_id,min(created_at) as completed_at
    from member_events
    where event_type='completed' and actor_user_id=p_member_user_id
    group by operation_id
  )
  select jsonb_build_object(
    'claimed_count',(select count(distinct operation_id) from member_events where event_type in ('claimed','reassigned')),
    'completed_count',(select count(distinct operation_id) from member_events where event_type='completed' and actor_user_id=p_member_user_id),
    'in_progress_count',(select count(*) from public.business_payment_inbox where business_id=p_business_id and status='claimed' and claimed_by_user_id=p_member_user_id),
    'review_requested_count',(select count(distinct operation_id) from member_events where event_type='review_requested' and actor_user_id=p_member_user_id),
    'released_count',(select count(distinct operation_id) from member_events where event_type in ('released','expired_claim_released') and actor_user_id=p_member_user_id),
    'linked_count',(select count(*) from public.business_operation_links where business_id=p_business_id and status='linked' and linked_by_user_id=p_member_user_id),
    'verified_count',(select count(*) from public.business_operation_links where business_id=p_business_id and status='linked' and verified_by_user_id=p_member_user_id),
    'average_completion_seconds',(
      select round(avg(extract(epoch from (completion.completed_at-claim.claimed_at))))::bigint
      from claim_times claim
      join completion_times completion using(operation_id)
      where completion.completed_at>=claim.claimed_at
    ),
    'last_activity_at',(select max(created_at) from member_events)
  ) into v_summary;

  return jsonb_build_object(
    'member',v_member,
    'summary',v_summary,
    'items',v_items,
    'limit',v_limit,
    'offset',v_offset,
    'activity_type',p_activity_type,
    'supervision',true
  );
end;
$$;

revoke all on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) to authenticated;

commit;
