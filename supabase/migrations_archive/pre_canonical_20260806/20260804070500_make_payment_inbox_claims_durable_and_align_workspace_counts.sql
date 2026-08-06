create or replace function private.enforce_durable_business_payment_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'claimed' then
    new.claim_expires_at := 'infinity'::timestamptz;
  elsif new.status <> 'claimed' then
    new.claim_expires_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_durable_business_payment_claim() from public, anon, authenticated;

drop trigger if exists enforce_durable_business_payment_claim on public.business_payment_inbox;
create trigger enforce_durable_business_payment_claim
before insert or update of status, claim_expires_at
on public.business_payment_inbox
for each row
execute function private.enforce_durable_business_payment_claim();

with latest_claim as (
  select distinct on (e.inbox_id)
    e.inbox_id,
    e.actor_user_id,
    e.created_at
  from public.business_payment_inbox_events e
  where e.event_type in ('claimed','reassigned','review_resumed')
    and e.actor_user_id is not null
  order by e.inbox_id, e.created_at desc, e.id desc
)
update public.business_payment_inbox i
set status = 'claimed',
    claimed_by_user_id = lc.actor_user_id,
    claimed_at = coalesce(i.claimed_at, lc.created_at),
    claim_expires_at = 'infinity'::timestamptz,
    released_by_user_id = null,
    released_at = null,
    release_reason = null,
    last_action_source = coalesce(i.last_action_source, 'system'),
    updated_at = now(),
    row_version = i.row_version + 1
from latest_claim lc
where i.id = lc.inbox_id
  and i.status = 'released'
  and i.release_reason = 'claim_expired';

create or replace function public.get_my_business_workspaces()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'business_id', bp.id,
        'business_name', bp.name,
        'slug', bp.slug,
        'is_owner', bp.owner_user_id = v_uid,
        'membership_status', case when bp.owner_user_id = v_uid then 'active' else member.status end,
        'membership_role', case when bp.owner_user_id = v_uid then 'owner' else member.membership_role end,
        'job_title', case when bp.owner_user_id = v_uid then 'مالك النشاط' else member.job_title end,
        'permissions', jsonb_build_object(
          'view', private.has_business_payment_permission(bp.id, 'view', v_uid),
          'claim', private.has_business_payment_permission(bp.id, 'claim', v_uid),
          'complete', private.has_business_payment_permission(bp.id, 'complete', v_uid),
          'release', private.has_business_payment_permission(bp.id, 'release', v_uid),
          'reassign', private.has_business_payment_permission(bp.id, 'reassign', v_uid),
          'review', private.has_business_payment_permission(bp.id, 'review', v_uid)
        ),
        'counts', jsonb_build_object(
          'new', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id and i.status in ('new','released'))
          else 0 end,
          'mine', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id
               and i.status = 'claimed'
               and i.claimed_by_user_id = v_uid
               and i.claim_expires_at > now())
          else 0 end,
          'team_active', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id
               and i.status = 'claimed'
               and i.claim_expires_at > now())
          else 0 end,
          'review_required', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id and i.status = 'review_required')
          else 0 end,
          'completed_today', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id
               and i.status = 'completed'
               and i.completed_at >= date_trunc('day', now()))
          else 0 end,
          'open_total', case when private.has_business_payment_permission(bp.id, 'view', v_uid) then
            (select count(*) from public.business_payment_inbox i
             where i.business_id = bp.id
               and i.status in ('new','released','claimed','review_required'))
          else 0 end
        )
      )
      order by bp.name
    ),
    '[]'::jsonb
  ) into v_items
  from public.business_profiles bp
  left join lateral (
    select m.status, m.membership_role, m.job_title, m.permissions
    from public.business_team_members m
    where m.business_id = bp.id
      and m.user_id = v_uid
      and m.status = 'active'
    order by m.updated_at desc, m.id desc
    limit 1
  ) member on true
  where bp.owner_user_id = v_uid
     or member.status = 'active';

  return jsonb_build_object(
    'items', v_items,
    'workspace_count', jsonb_array_length(v_items),
    'contract_version', 2
  );
end;
$$;

revoke all on function public.get_my_business_workspaces() from public;
grant execute on function public.get_my_business_workspaces() to authenticated;