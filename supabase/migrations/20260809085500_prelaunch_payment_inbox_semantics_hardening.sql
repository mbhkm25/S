-- Pre-launch hardening for payment inbox semantics.
-- 1) Exact duplicates must never be announced as a new payment.
-- 2) A claimed payment stays assigned until explicit completion/release/review action.
-- 3) The employee who completes a payment may keep private notes even when another
--    user was the first verifier of the canonical operation.

create or replace function private.notify_business_payment_inbox(p_inbox_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item public.business_payment_inbox%rowtype;
  v_business public.business_profiles%rowtype;
  v_operation public.operations%rowtype;
  v_user_id uuid;
  v_account_suffix text;
  v_is_exact_duplicate boolean := false;
  v_title text;
  v_body text;
  v_severity text := 'info';
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id;
  if not found then return; end if;
  select * into v_business from public.business_profiles where id=v_item.business_id;
  select * into v_operation from public.operations where id=v_item.operation_id;
  if v_operation.id is null or v_operation.public_token is null then return; end if;

  select exists(
    select 1
    from private.operation_identity_shadow_runs r
    where r.operation_id=v_item.operation_id
      and r.identity_version=1
      and r.match_type='exact_duplicate'
      and r.canonical_operation_id is not null
      and r.canonical_operation_id<>v_item.operation_id
  ) into v_is_exact_duplicate;

  v_account_suffix:=right(coalesce(v_operation.credited_account_normalized,v_operation.receiver_account_normalized,v_operation.receiver_account,''),4);

  if v_is_exact_duplicate then
    v_title:=concat('ورد إشعار مسجل سابقًا إلى ',v_business.name);
    v_body:=concat(
      coalesce(v_operation.amount::text,'—'),' ',coalesce(v_operation.currency,''),
      ' عبر ',coalesce(v_operation.financial_entity,'جهة مالية أخرى'),
      case when v_account_suffix<>'' then concat(' · الحساب …',v_account_suffix) else '' end,
      '. تعرف سند عليه كعملية مسجلة سابقًا؛ افتح الوارد لمراجعة العملية الأصلية.'
    );
    v_severity:='warning';
  else
    v_title:=concat('وردت دفعة جديدة إلى ',v_business.name);
    v_body:=concat(
      coalesce(v_operation.amount::text,'—'),' ',coalesce(v_operation.currency,''),
      ' عبر ',coalesce(v_operation.financial_entity,'جهة مالية أخرى'),
      case when v_account_suffix<>'' then concat(' · الحساب …',v_account_suffix) else '' end,
      '. راجع وارد المدفوعات.'
    );
  end if;

  for v_user_id in
    select v_business.owner_user_id
    union
    select m.user_id
    from public.business_team_members m
    where m.business_id=v_item.business_id
      and m.status='active'
      and private.has_business_payment_permission(v_item.business_id,'view',m.user_id)
  loop
    perform private.create_notification(
      v_user_id,
      'payment_inbox_new',
      'business',
      v_severity,
      v_title,
      v_body,
      'business_operations',
      jsonb_build_object(
        'business_id',v_item.business_id,
        'payment_inbox_id',v_item.id,
        'inbox_surface','payment-inbox',
        'inbox_view','new',
        'public_token',v_operation.public_token,
        'is_exact_duplicate',v_is_exact_duplicate
      ),
      null,
      v_item.business_id,
      v_item.operation_id,
      'business_payment_inbox',
      v_item.id::text,
      concat('payment_inbox_new:',v_item.id,':',v_user_id),
      jsonb_build_object(
        'payment_inbox_id',v_item.id,
        'business_id',v_item.business_id,
        'source_mode',v_item.source_mode,
        'match_score',v_item.match_score,
        'public_token',v_operation.public_token,
        'is_exact_duplicate',v_is_exact_duplicate
      ),
      now()+interval '30 days'
    );
  end loop;
end;
$function$;

create or replace function public.claim_business_payment_v2(
  p_inbox_id uuid,
  p_expected_row_version bigint,
  p_lease_seconds integer default 300,
  p_source text default 'payment_inbox'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_item public.business_payment_inbox%rowtype;
  v_source text:=private.payment_inbox_action_source(p_source);
  v_from text;
  v_owner_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_item from public.business_payment_inbox where id=p_inbox_id for update;
  if not found then raise exception 'payment_inbox_item_not_found'; end if;
  if not private.has_business_payment_permission(v_item.business_id,'claim',v_uid) then
    raise exception 'payment_inbox_claim_required' using errcode='42501';
  end if;

  -- Compatibility recovery for legacy finite leases. New claims are persistent.
  if v_item.status='claimed'
     and v_item.claim_expires_at is not null
     and v_item.claim_expires_at<>'infinity'::timestamptz
     and v_item.claim_expires_at<=now() then
    update public.business_payment_inbox
    set status='released',released_by_user_id=null,released_at=now(),release_reason='legacy_claim_expired',
        claimed_by_user_id=null,claimed_at=null,claim_expires_at=null,last_action_source='system',
        updated_at=now(),row_version=row_version+1
    where id=v_item.id returning * into v_item;
    perform private.record_business_payment_inbox_event(v_item.id,'expired_claim_released',null,'claimed','released','legacy_claim_expired','{}'::jsonb);
  end if;

  if v_item.status='claimed' and v_item.claimed_by_user_id<>v_uid then
    select full_name into v_owner_name from public.profiles where id=v_item.claimed_by_user_id;
    perform private.record_business_payment_inbox_event(
      v_item.id,'claim_conflict',v_uid,'claimed','claimed',null,
      jsonb_build_object('current_claimed_by_user_id',v_item.claimed_by_user_id,'row_version',v_item.row_version,'source',v_source)
    );
    return jsonb_build_object(
      'ok',false,'claimed',false,'reason','claim_race_lost','current_row_version',v_item.row_version,
      'claimed_by_user_id',v_item.claimed_by_user_id,'claimed_by_name',v_owner_name,'claim_expires_at',v_item.claim_expires_at
    );
  end if;

  if p_expected_row_version is not null and v_item.row_version<>p_expected_row_version then
    perform private.record_business_payment_inbox_event(
      v_item.id,'stale_action_rejected',v_uid,v_item.status,v_item.status,null,
      jsonb_build_object('action','claim','expected_row_version',p_expected_row_version,'current_row_version',v_item.row_version,'source',v_source)
    );
    return jsonb_build_object('ok',false,'claimed',false,'reason','stale_item','current_row_version',v_item.row_version,'status',v_item.status);
  end if;

  if v_item.status='claimed' and v_item.claimed_by_user_id=v_uid then
    update public.business_payment_inbox
    set claim_expires_at='infinity'::timestamptz,last_action_source=v_source,
        updated_at=now(),row_version=row_version+1
    where id=v_item.id returning * into v_item;
    perform private.record_business_payment_inbox_event(
      v_item.id,'claim_renewed',v_uid,'claimed','claimed',null,
      jsonb_build_object('lease_mode','explicit_release','source',v_source)
    );
    return jsonb_build_object('ok',true,'claimed',true,'renewed',true,'item',to_jsonb(v_item));
  end if;

  if v_item.status not in ('new','released') then
    return jsonb_build_object('ok',false,'claimed',false,'reason','not_claimable','status',v_item.status,'current_row_version',v_item.row_version);
  end if;

  v_from:=v_item.status;
  update public.business_payment_inbox
  set status='claimed',claimed_by_user_id=v_uid,claimed_at=now(),claim_expires_at='infinity'::timestamptz,
      claimed_source=v_source,released_by_user_id=null,released_at=null,release_reason=null,last_action_source=v_source,
      updated_at=now(),row_version=row_version+1
  where id=v_item.id and row_version=v_item.row_version
  returning * into v_item;

  if not found then return jsonb_build_object('ok',false,'claimed',false,'reason','claim_race_lost'); end if;
  perform private.record_business_payment_inbox_event(
    v_item.id,'claimed',v_uid,v_from,'claimed',null,
    jsonb_build_object('lease_mode','explicit_release','source',v_source)
  );
  return jsonb_build_object('ok',true,'claimed',true,'renewed',false,'item',to_jsonb(v_item));
end;
$function$;

-- Keep notes private to their author while allowing a business completer to create
-- and edit their own note even if a different user was the first verifier.
drop policy if exists operation_notes_insert_own_verifier on public.operation_notes;
create policy operation_notes_insert_own_participant
on public.operation_notes
for insert
to authenticated
with check (
  (select auth.uid())=author_user_id
  and (
    exists (
      select 1 from public.operation_user_links l
      where l.operation_id=operation_notes.operation_id
        and l.user_id=(select auth.uid())
        and l.relation_type='verifier'
    )
    or exists (
      select 1 from public.business_payment_inbox i
      where i.operation_id=operation_notes.operation_id
        and i.completed_by_user_id=(select auth.uid())
        and i.status='completed'
    )
  )
);

drop policy if exists operation_notes_update_own_verifier on public.operation_notes;
create policy operation_notes_update_own_participant
on public.operation_notes
for update
to authenticated
using ((select auth.uid())=author_user_id)
with check (
  (select auth.uid())=author_user_id
  and (
    exists (
      select 1 from public.operation_user_links l
      where l.operation_id=operation_notes.operation_id
        and l.user_id=(select auth.uid())
        and l.relation_type='verifier'
    )
    or exists (
      select 1 from public.business_payment_inbox i
      where i.operation_id=operation_notes.operation_id
        and i.completed_by_user_id=(select auth.uid())
        and i.status='completed'
    )
  )
);

revoke all on function private.notify_business_payment_inbox(uuid) from public, anon, authenticated;
grant execute on function public.claim_business_payment_v2(uuid,bigint,integer,text) to authenticated;
