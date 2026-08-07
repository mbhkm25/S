create table public.business_payment_inbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  routing_shadow_run_id uuid references public.operation_routing_shadow_runs(id) on delete set null,
  financial_account_id uuid references public.business_financial_accounts(id) on delete set null,
  source_mode text not null default 'shadow' check (source_mode in ('shadow','canary','live','manual')),
  status text not null default 'new' check (status in ('new','claimed','completed','released','review_required','rejected','cancelled')),
  priority smallint not null default 50 check (priority between 0 and 100),
  match_score numeric check (match_score is null or (match_score >= 0 and match_score <= 1)),
  match_strategy text,
  routing_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(routing_snapshot)='object'),
  claimed_by_user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completion_note text,
  released_by_user_id uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  release_reason text,
  rejected_by_user_id uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  unique(business_id, operation_id),
  check ((claimed_by_user_id is null and claimed_at is null and claim_expires_at is null) or (claimed_by_user_id is not null and claimed_at is not null and claim_expires_at is not null)),
  check ((completed_by_user_id is null and completed_at is null) or (completed_by_user_id is not null and completed_at is not null)),
  check ((released_by_user_id is null and released_at is null) or (released_by_user_id is not null and released_at is not null)),
  check ((rejected_by_user_id is null and rejected_at is null) or (rejected_by_user_id is not null and rejected_at is not null))
);

create table public.business_payment_inbox_events (
  id bigserial primary key,
  inbox_id uuid not null references public.business_payment_inbox(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  operation_id uuid not null references public.operations(id) on delete cascade,
  event_type text not null check (event_type in ('enqueued','claimed','claim_renewed','released','completed','rejected','cancelled','reassigned','expired_claim_released')),
  actor_user_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);

create index business_payment_inbox_queue_idx on public.business_payment_inbox(business_id,status,priority desc,created_at desc,id desc);
create index business_payment_inbox_claim_idx on public.business_payment_inbox(business_id,claimed_by_user_id,status,claim_expires_at) where claimed_by_user_id is not null;
create index business_payment_inbox_operation_idx on public.business_payment_inbox(operation_id);
create index business_payment_inbox_routing_run_idx on public.business_payment_inbox(routing_shadow_run_id) where routing_shadow_run_id is not null;
create index business_payment_inbox_account_idx on public.business_payment_inbox(financial_account_id) where financial_account_id is not null;
create index business_payment_inbox_completed_by_idx on public.business_payment_inbox(completed_by_user_id) where completed_by_user_id is not null;
create index business_payment_inbox_released_by_idx on public.business_payment_inbox(released_by_user_id) where released_by_user_id is not null;
create index business_payment_inbox_rejected_by_idx on public.business_payment_inbox(rejected_by_user_id) where rejected_by_user_id is not null;
create index business_payment_inbox_events_inbox_idx on public.business_payment_inbox_events(inbox_id,created_at desc);
create index business_payment_inbox_events_business_idx on public.business_payment_inbox_events(business_id,created_at desc);
create index business_payment_inbox_events_operation_idx on public.business_payment_inbox_events(operation_id);
create index business_payment_inbox_events_actor_idx on public.business_payment_inbox_events(actor_user_id) where actor_user_id is not null;

alter table public.business_payment_inbox enable row level security;
alter table public.business_payment_inbox_events enable row level security;
revoke all on public.business_payment_inbox from public, anon, authenticated;
revoke all on public.business_payment_inbox_events from public, anon, authenticated;
grant select on public.business_payment_inbox to authenticated;

create or replace function private.has_business_payment_permission(p_business_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.business_profiles bp
    where bp.id=p_business_id and bp.owner_user_id=p_user_id
  ) or exists(
    select 1 from public.business_team_members m
    join public.profiles p on p.id=m.user_id and p.status='active'
    where m.business_id=p_business_id and m.user_id=p_user_id and m.status='active'
      and (
        case p_permission
          when 'view' then m.membership_role in ('manager','cashier')
          when 'claim' then m.membership_role in ('manager','cashier')
          when 'complete' then m.membership_role in ('manager','cashier')
          when 'release' then m.membership_role in ('manager','cashier')
          when 'reassign' then m.membership_role='manager'
          when 'review' then m.membership_role='manager'
          else false
        end
        or coalesce((m.permissions #>> array['payments',p_permission])::boolean,false)
        or coalesce((m.permissions ->> ('payments.'||p_permission))::boolean,false)
      )
  );
$$;
revoke all on function private.has_business_payment_permission(uuid,text,uuid) from public;

create policy business_payment_inbox_select_member on public.business_payment_inbox
for select to authenticated
using (private.has_business_payment_permission(business_id,'view',(select auth.uid())));

create or replace function private.record_business_payment_inbox_event(
  p_inbox_id uuid,p_event_type text,p_actor_user_id uuid,p_from_status text,p_to_status text,p_reason text default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  insert into public.business_payment_inbox_events(inbox_id,business_id,operation_id,event_type,actor_user_id,from_status,to_status,reason,metadata)
  values(v_item.id,v_item.business_id,v_item.operation_id,p_event_type,p_actor_user_id,p_from_status,p_to_status,left(nullif(trim(coalesce(p_reason,'')),''),500),coalesce(p_metadata,'{}'::jsonb));
end;$$;
revoke all on function private.record_business_payment_inbox_event(uuid,text,uuid,text,text,text,jsonb) from public;

create or replace function private.expire_business_payment_claims(p_business_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0; v_row record;
begin
  for v_row in
    update public.business_payment_inbox i
      set status='released',released_by_user_id=null,released_at=now(),release_reason='claim_expired',
          claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,updated_at=now(),row_version=row_version+1
    where i.status='claimed' and i.claim_expires_at<=now() and (p_business_id is null or i.business_id=p_business_id)
    returning i.id
  loop
    perform private.record_business_payment_inbox_event(v_row.id,'expired_claim_released',null,'claimed','released','claim_expired','{}'::jsonb);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;$$;
revoke all on function private.expire_business_payment_claims(uuid) from public;
grant execute on function private.expire_business_payment_claims(uuid) to service_role;

create or replace function private.notify_business_payment_inbox(p_inbox_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_business public.business_profiles%rowtype; v_operation public.operations%rowtype; v_user_id uuid;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id;
  if not found then return; end if;
  select * into v_business from public.business_profiles where id=v_item.business_id;
  select * into v_operation from public.operations where id=v_item.operation_id;
  for v_user_id in
    select v_business.owner_user_id
    union
    select m.user_id from public.business_team_members m
    where m.business_id=v_item.business_id and m.status='active' and private.has_business_payment_permission(v_item.business_id,'view',m.user_id)
  loop
    perform private.create_notification(
      v_user_id,'payment_inbox_new','business','info','دفعة جديدة في وارد المدفوعات',
      concat('وصلت عملية ',coalesce(v_operation.amount::text,'—'),' ',coalesce(v_operation.currency,''),' إلى ',v_business.name,'.'),
      'business_manage',jsonb_build_object('business_id',v_item.business_id,'payment_inbox_id',v_item.id),null,v_item.business_id,v_item.operation_id,
      'business_payment_inbox',v_item.id::text,concat('payment_inbox_new:',v_item.id,':',v_user_id),
      jsonb_build_object('payment_inbox_id',v_item.id,'source_mode',v_item.source_mode,'match_score',v_item.match_score),now()+interval '30 days'
    );
  end loop;
end;$$;
revoke all on function private.notify_business_payment_inbox(uuid) from public;

create or replace function private.enqueue_business_payment_inbox(
  p_business_id uuid,p_operation_id uuid,p_routing_shadow_run_id uuid default null,p_financial_account_id uuid default null,
  p_source_mode text default 'shadow',p_priority smallint default 50,p_match_score numeric default null,p_match_strategy text default null,p_routing_snapshot jsonb default '{}'::jsonb,p_notify boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_created boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_source_mode not in ('shadow','canary','live','manual') then raise exception 'invalid_source_mode'; end if;
  if not exists(select 1 from public.business_profiles where id=p_business_id) then raise exception 'business_not_found'; end if;
  if not exists(select 1 from public.operations where id=p_operation_id) then raise exception 'operation_not_found'; end if;
  insert into public.business_payment_inbox(business_id,operation_id,routing_shadow_run_id,financial_account_id,source_mode,status,priority,match_score,match_strategy,routing_snapshot)
  values(p_business_id,p_operation_id,p_routing_shadow_run_id,p_financial_account_id,p_source_mode,case when p_source_mode='shadow' then 'review_required' else 'new' end,least(greatest(coalesce(p_priority,50),0),100),p_match_score,left(nullif(trim(coalesce(p_match_strategy,'')),''),120),coalesce(p_routing_snapshot,'{}'::jsonb))
  on conflict(business_id,operation_id) do nothing returning * into v_item;
  v_created:=v_item.id is not null;
  if not v_created then select * into v_item from public.business_payment_inbox where business_id=p_business_id and operation_id=p_operation_id; end if;
  if v_created then
    perform private.record_business_payment_inbox_event(v_item.id,'enqueued',null,null,v_item.status,null,jsonb_build_object('source_mode',p_source_mode));
    if p_notify and p_source_mode in ('canary','live','manual') then perform private.notify_business_payment_inbox(v_item.id); end if;
  end if;
  return jsonb_build_object('ok',true,'created',v_created,'item_id',v_item.id,'status',v_item.status,'source_mode',v_item.source_mode);
end;$$;
revoke all on function private.enqueue_business_payment_inbox(uuid,uuid,uuid,uuid,text,smallint,numeric,text,jsonb,boolean) from public;
grant execute on function private.enqueue_business_payment_inbox(uuid,uuid,uuid,uuid,text,smallint,numeric,text,jsonb,boolean) to service_role;

create or replace function public.get_my_business_payment_inbox_contexts()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id',bp.id,'business_name',bp.name,'slug',bp.slug,'is_owner',bp.owner_user_id=auth.uid(),
    'permissions',jsonb_build_object(
      'view',private.has_business_payment_permission(bp.id,'view',auth.uid()),
      'claim',private.has_business_payment_permission(bp.id,'claim',auth.uid()),
      'complete',private.has_business_payment_permission(bp.id,'complete',auth.uid()),
      'release',private.has_business_payment_permission(bp.id,'release',auth.uid()),
      'reassign',private.has_business_payment_permission(bp.id,'reassign',auth.uid()),
      'review',private.has_business_payment_permission(bp.id,'review',auth.uid())
    ),
    'counts',jsonb_build_object(
      'new',(select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='new'),
      'mine',(select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='claimed' and i.claimed_by_user_id=auth.uid() and i.claim_expires_at>now()),
      'review_required',(select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='review_required'),
      'completed_today',(select count(*) from public.business_payment_inbox i where i.business_id=bp.id and i.status='completed' and i.completed_at>=date_trunc('day',now()))
    )
  ) order by bp.name),'[]'::jsonb) into v_items
  from public.business_profiles bp
  where private.has_business_payment_permission(bp.id,'view',auth.uid());
  return jsonb_build_object('items',v_items);
end;$$;
revoke all on function public.get_my_business_payment_inbox_contexts() from public;
grant execute on function public.get_my_business_payment_inbox_contexts() to authenticated;

create or replace function public.get_business_payment_inbox(
  p_business_id uuid,p_status text default null,p_limit integer default 50,p_before_created_at timestamptz default null,p_before_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,50),1),100); v_items jsonb; v_has_more boolean; v_next_created timestamptz; v_next_id uuid;
begin
  if not private.has_business_payment_permission(p_business_id,'view',auth.uid()) then raise exception 'payment_inbox_view_required' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('new','claimed','completed','released','review_required','rejected','cancelled') then raise exception 'invalid_payment_inbox_status'; end if;
  if (p_before_created_at is null)<>(p_before_id is null) then raise exception 'invalid_payment_inbox_cursor'; end if;
  perform private.expire_business_payment_claims(p_business_id);
  with rows as (
    select i.*,o.public_token,o.amount,o.currency,o.financial_entity,o.financial_entity_code,o.receiver_name,o.receiver_account,o.merchant_point,o.reference_number,o.transaction_datetime,
      bp.name as business_name,fa.account_label,fa.account_holder_name,p.full_name as claimed_by_name
    from public.business_payment_inbox i
    join public.operations o on o.id=i.operation_id
    join public.business_profiles bp on bp.id=i.business_id
    left join public.business_financial_accounts fa on fa.id=i.financial_account_id
    left join public.profiles p on p.id=i.claimed_by_user_id
    where i.business_id=p_business_id and (p_status is null or i.status=p_status)
      and (p_before_created_at is null or (i.created_at,i.id)<(p_before_created_at,p_before_id))
    order by i.priority desc,i.created_at desc,i.id desc limit v_limit+1
  ), numbered as (select *,row_number() over(order by priority desc,created_at desc,id desc) rn from rows), page as (select * from numbered where rn<=v_limit)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'business_id',p.business_id,'business_name',p.business_name,'operation_id',p.operation_id,'public_token',p.public_token,
    'status',p.status,'source_mode',p.source_mode,'priority',p.priority,'match_score',p.match_score,'match_strategy',p.match_strategy,
    'amount',p.amount,'currency',p.currency,'financial_entity',p.financial_entity,'financial_entity_code',p.financial_entity_code,
    'receiver_name',p.receiver_name,'receiver_account',p.receiver_account,'merchant_point',p.merchant_point,'reference_number',p.reference_number,'transaction_datetime',p.transaction_datetime,
    'financial_account_id',p.financial_account_id,'account_label',p.account_label,'account_holder_name',p.account_holder_name,
    'claimed_by_user_id',p.claimed_by_user_id,'claimed_by_name',p.claimed_by_name,'claimed_at',p.claimed_at,'claim_expires_at',p.claim_expires_at,
    'completed_at',p.completed_at,'created_at',p.created_at,'updated_at',p.updated_at,'row_version',p.row_version
  ) order by p.priority desc,p.created_at desc,p.id desc),'[]'::jsonb),
  exists(select 1 from numbered where rn=v_limit+1),
  (select created_at from page order by priority asc,created_at asc,id asc limit 1),(select id from page order by priority asc,created_at asc,id asc limit 1)
  into v_items,v_has_more,v_next_created,v_next_id from page p;
  return jsonb_build_object('items',v_items,'has_more',coalesce(v_has_more,false),'next_cursor',case when v_has_more then jsonb_build_object('created_at',v_next_created,'id',v_next_id) else null end,
    'permissions',jsonb_build_object('claim',private.has_business_payment_permission(p_business_id,'claim',auth.uid()),'complete',private.has_business_payment_permission(p_business_id,'complete',auth.uid()),'release',private.has_business_payment_permission(p_business_id,'release',auth.uid()),'reassign',private.has_business_payment_permission(p_business_id,'reassign',auth.uid()),'review',private.has_business_payment_permission(p_business_id,'review',auth.uid())));
end;$$;
revoke all on function public.get_business_payment_inbox(uuid,text,integer,timestamptz,uuid) from public;
grant execute on function public.get_business_payment_inbox(uuid,text,integer,timestamptz,uuid) to authenticated;

create or replace function public.claim_business_payment(p_inbox_id uuid,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_lease integer:=least(greatest(coalesce(p_lease_seconds,300),60),900); v_from text;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'claim',auth.uid()) then raise exception 'payment_inbox_claim_required' using errcode='42501'; end if;
  if v_item.status='claimed' and v_item.claimed_by_user_id=auth.uid() and v_item.claim_expires_at>now() then
    update public.business_payment_inbox set claim_expires_at=now()+make_interval(secs=>v_lease),updated_at=now(),row_version=row_version+1 where id=p_inbox_id returning * into v_item;
    perform private.record_business_payment_inbox_event(v_item.id,'claim_renewed',auth.uid(),'claimed','claimed',null,jsonb_build_object('lease_seconds',v_lease));
    return jsonb_build_object('ok',true,'claimed',true,'renewed',true,'item',to_jsonb(v_item));
  end if;
  if v_item.status='claimed' and v_item.claim_expires_at<=now() then perform private.expire_business_payment_claims(v_item.business_id); select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; end if;
  if v_item.status not in ('new','released') then return jsonb_build_object('ok',false,'claimed',false,'reason','not_claimable','status',v_item.status); end if;
  v_from:=v_item.status;
  update public.business_payment_inbox set status='claimed',claimed_by_user_id=auth.uid(),claimed_at=now(),claim_expires_at=now()+make_interval(secs=>v_lease),released_by_user_id=null,released_at=null,release_reason=null,updated_at=now(),row_version=row_version+1 where id=p_inbox_id and status=v_from returning * into v_item;
  if not found then return jsonb_build_object('ok',false,'claimed',false,'reason','claim_race_lost'); end if;
  perform private.record_business_payment_inbox_event(v_item.id,'claimed',auth.uid(),v_from,'claimed',null,jsonb_build_object('lease_seconds',v_lease));
  return jsonb_build_object('ok',true,'claimed',true,'renewed',false,'item',to_jsonb(v_item));
end;$$;
revoke all on function public.claim_business_payment(uuid,integer) from public;
grant execute on function public.claim_business_payment(uuid,integer) to authenticated;

create or replace function public.heartbeat_business_payment_claim(p_inbox_id uuid,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_lease integer:=least(greatest(coalesce(p_lease_seconds,300),60),900);
begin
  update public.business_payment_inbox set claim_expires_at=now()+make_interval(secs=>v_lease),updated_at=now(),row_version=row_version+1
  where id=p_inbox_id and status='claimed' and claimed_by_user_id=auth.uid() and claim_expires_at>now() returning * into v_item;
  if not found then return jsonb_build_object('ok',false,'renewed',false,'reason','claim_not_owned_or_expired'); end if;
  perform private.record_business_payment_inbox_event(v_item.id,'claim_renewed',auth.uid(),'claimed','claimed',null,jsonb_build_object('lease_seconds',v_lease));
  return jsonb_build_object('ok',true,'renewed',true,'claim_expires_at',v_item.claim_expires_at,'row_version',v_item.row_version);
end;$$;
revoke all on function public.heartbeat_business_payment_claim(uuid,integer) from public;
grant execute on function public.heartbeat_business_payment_claim(uuid,integer) to authenticated;

create or replace function public.release_business_payment(p_inbox_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if length(coalesce(v_reason,''))<3 then raise exception 'release_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'release',auth.uid()) then raise exception 'payment_inbox_release_required' using errcode='42501'; end if;
  if v_item.status<>'claimed' then raise exception 'payment_not_claimed'; end if;
  if v_item.claimed_by_user_id<>auth.uid() and not private.has_business_payment_permission(v_item.business_id,'reassign',auth.uid()) then raise exception 'payment_claim_owned_by_another_user' using errcode='42501'; end if;
  update public.business_payment_inbox set status='released',released_by_user_id=auth.uid(),released_at=now(),release_reason=left(v_reason,500),claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,updated_at=now(),row_version=row_version+1 where id=p_inbox_id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'released',auth.uid(),'claimed','released',v_reason,'{}'::jsonb);
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;$$;
revoke all on function public.release_business_payment(uuid,text) from public;
grant execute on function public.release_business_payment(uuid,text) to authenticated;

create or replace function public.complete_business_payment(p_inbox_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'complete',auth.uid()) then raise exception 'payment_inbox_complete_required' using errcode='42501'; end if;
  if v_item.status<>'claimed' then raise exception 'payment_not_claimed'; end if;
  if v_item.claimed_by_user_id<>auth.uid() and not private.has_business_payment_permission(v_item.business_id,'reassign',auth.uid()) then raise exception 'payment_claim_owned_by_another_user' using errcode='42501'; end if;
  update public.business_payment_inbox set status='completed',completed_by_user_id=auth.uid(),completed_at=now(),completion_note=left(v_note,1000),claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,updated_at=now(),row_version=row_version+1 where id=p_inbox_id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'completed',auth.uid(),'claimed','completed',v_note,'{}'::jsonb);
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;$$;
revoke all on function public.complete_business_payment(uuid,text) from public;
grant execute on function public.complete_business_payment(uuid,text) to authenticated;

create or replace function public.reject_business_payment(p_inbox_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),''); v_from text;
begin
  if length(coalesce(v_reason,''))<5 then raise exception 'rejection_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'review',auth.uid()) then raise exception 'payment_inbox_review_required' using errcode='42501'; end if;
  if v_item.status in ('completed','rejected','cancelled') then raise exception 'payment_inbox_item_closed'; end if;
  v_from:=v_item.status;
  update public.business_payment_inbox set status='rejected',rejected_by_user_id=auth.uid(),rejected_at=now(),rejection_reason=left(v_reason,500),claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,updated_at=now(),row_version=row_version+1 where id=p_inbox_id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'rejected',auth.uid(),v_from,'rejected',v_reason,'{}'::jsonb);
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;$$;
revoke all on function public.reject_business_payment(uuid,text) from public;
grant execute on function public.reject_business_payment(uuid,text) to authenticated;

create or replace function public.reassign_business_payment(p_inbox_id uuid,p_user_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.business_payment_inbox%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),''); v_from text;
begin
  if length(coalesce(v_reason,''))<5 then raise exception 'reassign_reason_required'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update; if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'reassign',auth.uid()) then raise exception 'payment_inbox_reassign_required' using errcode='42501'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'claim',p_user_id) then raise exception 'target_user_cannot_claim'; end if;
  if v_item.status in ('completed','rejected','cancelled','review_required') then raise exception 'payment_not_reassignable'; end if;
  v_from:=v_item.status;
  update public.business_payment_inbox set status='claimed',claimed_by_user_id=p_user_id,claimed_at=now(),claim_expires_at=now()+interval '5 minutes',updated_at=now(),row_version=row_version+1 where id=p_inbox_id returning * into v_item;
  perform private.record_business_payment_inbox_event(v_item.id,'reassigned',auth.uid(),v_from,'claimed',v_reason,jsonb_build_object('assigned_to_user_id',p_user_id));
  return jsonb_build_object('ok',true,'item',to_jsonb(v_item));
end;$$;
revoke all on function public.reassign_business_payment(uuid,uuid,text) from public;
grant execute on function public.reassign_business_payment(uuid,uuid,text) to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (notification_type = any(array[
 'operation_received','operation_analysis_completed','operation_analysis_failed','operation_needs_review','operation_verified','report_requested','report_ready','report_failed',
 'business_invitation_received','business_invitation_accepted','business_member_status_changed','business_operation_linked','business_review_approved','business_review_rejected',
 'pro_payment_submitted','pro_payment_approved','pro_payment_rejected','subscription_expiring','subscription_expired','system_announcement',
 'payment_inbox_new','payment_inbox_claimed','payment_inbox_completed','payment_inbox_released','payment_inbox_review_required'
]));

create or replace function private.create_notification(p_recipient_user_id uuid,p_notification_type text,p_category text,p_severity text,p_title text,p_body text,p_action_type text default 'none',p_action_payload jsonb default '{}'::jsonb,p_actor_user_id uuid default null,p_business_id uuid default null,p_operation_id uuid default null,p_source_event_type text default null,p_source_event_id text default null,p_dedupe_key text default null,p_data jsonb default '{}'::jsonb,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_created boolean:=false;
begin
  if p_recipient_user_id is null then raise exception 'recipient_user_id_required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_recipient_user_id and p.status='active') then raise exception 'recipient_not_found_or_inactive'; end if;
  if p_notification_type is null or p_notification_type not in ('operation_received','operation_analysis_completed','operation_analysis_failed','operation_needs_review','operation_verified','report_requested','report_ready','report_failed','business_invitation_received','business_invitation_accepted','business_member_status_changed','business_operation_linked','business_review_approved','business_review_rejected','pro_payment_submitted','pro_payment_approved','pro_payment_rejected','subscription_expiring','subscription_expired','system_announcement','payment_inbox_new','payment_inbox_claimed','payment_inbox_completed','payment_inbox_released','payment_inbox_review_required') then raise exception 'invalid_notification_type'; end if;
  if p_category is null or p_category not in ('operations','reports','business','subscription','security','system') then raise exception 'invalid_notification_category'; end if;
  if p_severity is null or p_severity not in ('info','success','warning','error') then raise exception 'invalid_notification_severity'; end if;
  if p_action_type is null or p_action_type not in ('none','operation_details','reports','business_invitation','business_manage','business_team','business_operations','business_public_profile','pro_payment','subscription','profile') then raise exception 'invalid_notification_action_type'; end if;
  if p_title is null or length(trim(p_title))<1 or length(p_title)>160 then raise exception 'invalid_notification_title'; end if;
  if p_body is null or length(trim(p_body))<1 or length(p_body)>1000 then raise exception 'invalid_notification_body'; end if;
  if p_dedupe_key is null or length(trim(p_dedupe_key))<1 or length(p_dedupe_key)>500 then raise exception 'invalid_notification_dedupe_key'; end if;
  if p_action_payload is null or jsonb_typeof(p_action_payload)<>'object' then raise exception 'invalid_notification_action_payload'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_notification_data'; end if;
  if p_source_event_type is not null and length(p_source_event_type)>100 then raise exception 'source_event_type_too_long'; end if;
  if p_source_event_id is not null and length(p_source_event_id)>255 then raise exception 'source_event_id_too_long'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'invalid_notification_expiry'; end if;
  insert into public.notifications(recipient_user_id,actor_user_id,notification_type,category,severity,title,body,action_type,action_payload,business_id,operation_id,source_event_type,source_event_id,dedupe_key,data,expires_at)
  values(p_recipient_user_id,p_actor_user_id,p_notification_type,p_category,p_severity,trim(p_title),trim(p_body),p_action_type,p_action_payload,p_business_id,p_operation_id,p_source_event_type,p_source_event_id,trim(p_dedupe_key),p_data,p_expires_at)
  on conflict(recipient_user_id,dedupe_key) do nothing returning id into v_id;
  v_created:=v_id is not null;
  if not v_created then select id into v_id from public.notifications where recipient_user_id=p_recipient_user_id and dedupe_key=trim(p_dedupe_key) limit 1; end if;
  return jsonb_build_object('ok',true,'created',v_created,'notification_id',v_id,'deduplicated',not v_created);
end;$$;
revoke all on function private.create_notification(uuid,text,text,text,text,text,text,jsonb,uuid,uuid,uuid,text,text,text,jsonb,timestamptz) from public;

alter table public.business_payment_inbox replica identity full;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='business_payment_inbox') then
    alter publication supabase_realtime add table public.business_payment_inbox;
  end if;
exception when undefined_object then null; end $$;
