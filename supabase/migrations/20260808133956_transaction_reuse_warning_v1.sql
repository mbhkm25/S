-- SANAD Transaction Reuse Warning v1
-- User-facing enforcement applies ONLY to deterministic exact duplicates.
-- probable_duplicate remains observational and never blocks or redirects.

create or replace function private.operation_reuse_resolution(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested public.operations%rowtype;
  v_run private.operation_identity_shadow_runs%rowtype;
  v_canonical public.operations%rowtype;
  v_occurrence_count bigint := 1;
  v_is_exact boolean := false;
begin
  select * into v_requested
  from public.operations
  where id=p_operation_id;

  if not found then
    return jsonb_build_object('ok',false,'reason','operation_not_found');
  end if;

  select * into v_run
  from private.operation_identity_shadow_runs
  where operation_id=p_operation_id
    and identity_version=1
    and match_type='exact_duplicate'
    and canonical_operation_id is not null
    and canonical_operation_id<>p_operation_id
  order by evaluated_at desc,id desc
  limit 1;

  if v_run.id is not null then
    select * into v_canonical
    from public.operations
    where id=v_run.canonical_operation_id;

    if v_canonical.id is not null then
      v_is_exact := true;
      select count(*) into v_occurrence_count
      from private.operation_submissions s
      where s.submitted_operation_id=v_canonical.id
         or (s.canonical_operation_id=v_canonical.id and s.identity_match_type='exact_duplicate');
    end if;
  end if;

  if not v_is_exact then
    v_canonical := v_requested;
    select greatest(count(*),1) into v_occurrence_count
    from private.operation_submissions s
    where s.submitted_operation_id=v_requested.id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'is_exact_duplicate',v_is_exact,
    'match_type',case when v_is_exact then 'exact_duplicate' else coalesce(v_requested.identity_status,'pending') end,
    'requested_operation_id',v_requested.id,
    'requested_public_token',v_requested.public_token,
    'canonical_operation_id',v_canonical.id,
    'canonical_public_token',v_canonical.public_token,
    'canonical_token_status',v_canonical.token_status,
    'canonical_token_expires_at',v_canonical.token_expires_at,
    'canonical_available',(
      v_canonical.id is not null
      and coalesce(v_canonical.token_status,'active')='active'
      and (v_canonical.token_expires_at is null or v_canonical.token_expires_at>now())
    ),
    'first_registered_at',v_canonical.created_at,
    'occurrence_count',v_occurrence_count,
    'confidence',case when v_is_exact then v_run.confidence else v_requested.identity_confidence end,
    'strategy',case when v_is_exact then v_run.evidence->>'strategy' else v_requested.identity_evidence->>'strategy' end
  );
end;
$$;

revoke all on function private.operation_reuse_resolution(uuid) from public,anon,authenticated;

create or replace function public.get_operation_entry_decision(p_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_reuse jsonb;
  v_access_operation_id uuid;
  v_existing boolean := false;
  v_usage jsonb;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed',false,'reason','not_authenticated','requires_auth',true,'will_consume',false
    );
  end if;

  select * into v_operation
  from public.operations
  where public_token=p_public_token
  limit 1;

  if v_operation.id is null then
    return jsonb_build_object(
      'allowed',false,'reason','operation_not_found','requires_auth',false,'will_consume',false
    );
  end if;

  if v_operation.token_status is not null and v_operation.token_status<>'active' then
    return jsonb_build_object(
      'allowed',false,'reason','token_not_active','requires_auth',false,'will_consume',false
    );
  end if;

  if v_operation.token_expires_at is not null and v_operation.token_expires_at<=now() then
    return jsonb_build_object(
      'allowed',false,'reason','token_expired','requires_auth',false,'will_consume',false
    );
  end if;

  if not public.sanad_user_has_basic_profile(v_user) then
    return jsonb_build_object(
      'allowed',false,'reason','profile_incomplete','requires_profile',true,'will_consume',false
    );
  end if;

  v_reuse := private.operation_reuse_resolution(v_operation.id);
  v_access_operation_id := coalesce(nullif(v_reuse->>'canonical_operation_id','')::uuid,v_operation.id);

  select exists(
    select 1 from public.operation_access_logs l
    where l.user_id=v_user and l.operation_id=v_access_operation_id
  ) into v_existing;

  v_usage := public.get_my_operation_access_usage();

  if v_existing then
    return jsonb_build_object(
      'allowed',true,
      'reason',case when coalesce((v_reuse->>'is_exact_duplicate')::boolean,false)
                    then 'duplicate_previously_opened' else 'previously_opened' end,
      'will_consume',false,
      'usage',v_usage,
      'reuse',v_reuse || jsonb_build_object('access_will_consume',false)
    );
  end if;

  if coalesce((v_usage->>'remaining')::integer,0)<=0 then
    return jsonb_build_object(
      'allowed',false,'reason','access_limit_reached','requires_subscription',true,'will_consume',false,
      'usage',v_usage,
      'reuse',v_reuse || jsonb_build_object('access_will_consume',false)
    );
  end if;

  return jsonb_build_object(
    'allowed',true,
    'reason',case when coalesce((v_reuse->>'is_exact_duplicate')::boolean,false)
                  then 'duplicate_access_available' else 'new_access_available' end,
    'will_consume',true,
    'usage',v_usage,
    'reuse',v_reuse || jsonb_build_object('access_will_consume',true)
  );
end;
$$;

create or replace function public.open_operation_access_identity_core(p_public_token uuid, p_source text default 'link'::text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_requested public.operations%rowtype;
  v_access public.operations%rowtype;
  v_reuse jsonb;
  v_existing boolean := false;
  v_usage jsonb;
  v_result jsonb;
begin
  if v_user is null then
    return jsonb_build_object('allowed',false,'reason','not_authenticated','requires_auth',true);
  end if;

  select * into v_requested
  from public.operations
  where public_token=p_public_token
  limit 1;

  if v_requested.id is null then
    return jsonb_build_object('allowed',false,'reason','operation_not_found');
  end if;

  if v_requested.token_status is not null and v_requested.token_status<>'active' then
    return jsonb_build_object('allowed',false,'reason','token_not_active');
  end if;
  if v_requested.token_expires_at is not null and v_requested.token_expires_at<=now() then
    return jsonb_build_object('allowed',false,'reason','token_expired');
  end if;

  v_reuse := private.operation_reuse_resolution(v_requested.id);

  if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false)
     and not coalesce((v_reuse->>'canonical_available')::boolean,false) then
    return jsonb_build_object(
      'allowed',false,'reason','canonical_operation_unavailable','reuse',v_reuse
    );
  end if;

  if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
    select * into v_access
    from public.operations
    where id=nullif(v_reuse->>'canonical_operation_id','')::uuid;
  else
    v_access := v_requested;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_access.id::text,0));

  select exists(
    select 1 from public.operation_access_logs
    where user_id=v_user and operation_id=v_access.id
  ) into v_existing;

  v_usage := public.get_my_operation_access_usage();
  if not v_existing and coalesce((v_usage->>'remaining')::integer,0)<=0 then
    return jsonb_build_object(
      'allowed',false,'reason','access_limit_reached','requires_subscription',true,'usage',v_usage,
      'reuse',v_reuse || jsonb_build_object('access_will_consume',false)
    );
  end if;

  v_result := public.sanad_open_operation_access_legacy(v_access.public_token,p_source);

  if coalesce((v_result->>'allowed')::boolean,false) and v_result ? 'operation' then
    v_result := jsonb_set(v_result,'{operation,received_at}',coalesce(to_jsonb(v_access.received_at),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,received_timezone}',to_jsonb(coalesce(v_access.received_timezone,'Asia/Aden')),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date}',coalesce(to_jsonb(v_access.transaction_date),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time}',coalesce(to_jsonb(v_access.transaction_time),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_time_present}',coalesce(to_jsonb(v_access.transaction_time_present),'false'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_date_source}',coalesce(to_jsonb(v_access.transaction_date_source),'null'::jsonb),true);
    v_result := jsonb_set(v_result,'{operation,transaction_timezone}',coalesce(to_jsonb(v_access.transaction_timezone),'null'::jsonb),true);
  end if;

  v_result := jsonb_set(
    coalesce(v_result,jsonb_build_object('allowed',false,'reason','invalid_operation_payload')),
    '{usage}',coalesce(public.get_my_operation_access_usage(),'{}'::jsonb),true
  );

  return jsonb_set(
    v_result,
    '{reuse}',
    v_reuse || jsonb_build_object('access_will_consume',not v_existing),
    true
  );
end;
$$;

create or replace function public.get_business_payment_reuse_notices(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if not private.has_business_payment_permission(p_business_id,'view',v_uid) then
    raise exception 'payment_inbox_view_required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'operation_id',i.operation_id,
    'inbox_id',i.id,
    'is_exact_duplicate',true,
    'canonical_operation_id',c.id,
    'canonical_public_token',c.public_token,
    'first_registered_at',c.created_at,
    'occurrence_count',coalesce(occ.n,1),
    'canonical_inbox_id',ci.id,
    'canonical_inbox_status',ci.status,
    'canonical_claimed_by_name',cp.full_name,
    'canonical_completed_by_name',ep.full_name,
    'canonical_completed_at',ci.completed_at,
    'strategy',r.evidence->>'strategy',
    'confidence',r.confidence
  ) order by i.created_at desc),'[]'::jsonb)
  into v_items
  from public.business_payment_inbox i
  join private.operation_identity_shadow_runs r
    on r.operation_id=i.operation_id
   and r.identity_version=1
   and r.match_type='exact_duplicate'
   and r.canonical_operation_id is not null
   and r.canonical_operation_id<>i.operation_id
  join public.operations c on c.id=r.canonical_operation_id
  left join public.business_payment_inbox ci
    on ci.business_id=i.business_id and ci.operation_id=c.id
  left join public.profiles cp on cp.id=ci.claimed_by_user_id
  left join public.profiles ep on ep.id=ci.completed_by_user_id
  left join lateral (
    select count(*) n
    from private.operation_submissions s
    where s.submitted_operation_id=c.id
       or (s.canonical_operation_id=c.id and s.identity_match_type='exact_duplicate')
  ) occ on true
  where i.business_id=p_business_id;

  return jsonb_build_object('items',v_items,'contract_version',1);
end;
$$;

revoke all on function public.get_business_payment_reuse_notices(uuid) from public,anon;
grant execute on function public.get_business_payment_reuse_notices(uuid) to authenticated;

create or replace function private.guard_duplicate_payment_inbox_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reuse jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('claimed','completed') then return new; end if;

  v_reuse := private.operation_reuse_resolution(new.operation_id);
  if coalesce((v_reuse->>'is_exact_duplicate')::boolean,false) then
    raise exception 'duplicate_operation_requires_canonical'
      using errcode='P0001',
            detail=coalesce(v_reuse->>'canonical_operation_id','');
  end if;
  return new;
end;
$$;

revoke all on function private.guard_duplicate_payment_inbox_transition() from public,anon,authenticated;

drop trigger if exists business_payment_inbox_duplicate_guard on public.business_payment_inbox;
create trigger business_payment_inbox_duplicate_guard
before update of status on public.business_payment_inbox
for each row execute function private.guard_duplicate_payment_inbox_transition();

comment on function private.operation_reuse_resolution(uuid) is
  'Canonical reuse resolver. Only exact_duplicate is actionable; probable_duplicate is never redirected or blocked.';
comment on function public.get_business_payment_reuse_notices(uuid) is
  'Permission-filtered exact duplicate mapping for Payment Inbox UI. Does not expose probable matches.';
