begin;

create or replace function public.get_operation_operational_context(p_public_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_operation public.operations%rowtype;
  v_inbox public.business_payment_inbox%rowtype;
  v_business_name text;
  v_claimed_name text;
  v_completed_name text;
  v_supervisor boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_operation from public.operations where public_token=p_public_token and token_status='active' and (token_expires_at is null or token_expires_at>now());
  if not found then raise exception 'operation_not_found'; end if;
  if not coalesce((public.open_operation_access_semantic_core(p_public_token,'app')->>'allowed')::boolean,false) then raise exception 'operation_access_denied' using errcode='42501'; end if;
  select i.* into v_inbox from public.business_payment_inbox i where i.operation_id=v_operation.id and private.has_business_payment_permission(i.business_id,'view',v_uid) order by i.created_at desc limit 1;
  if v_inbox.id is not null then
    select name into v_business_name from public.business_profiles where id=v_inbox.business_id;
    select full_name into v_claimed_name from public.profiles where id=v_inbox.claimed_by_user_id;
    select full_name into v_completed_name from public.profiles where id=v_inbox.completed_by_user_id;
    v_supervisor := private.is_business_payment_supervisor(v_inbox.business_id,v_uid);
  end if;
  return jsonb_build_object('operation_id',v_operation.id,'public_token',v_operation.public_token,'transaction_datetime',v_operation.transaction_datetime,'received_at',v_operation.created_at,'inbox',case when v_inbox.id is null then null else jsonb_build_object('id',v_inbox.id,'business_id',v_inbox.business_id,'business_name',v_business_name,'status',v_inbox.status,'row_version',v_inbox.row_version,'claimed_by_user_id',v_inbox.claimed_by_user_id,'claimed_by_name',v_claimed_name,'completed_by_user_id',v_inbox.completed_by_user_id,'completed_by_name',v_completed_name,'completed_at',v_inbox.completed_at,'review_reason',v_inbox.review_reason,'is_mine',v_inbox.claimed_by_user_id=v_uid,'is_supervisor',v_supervisor,'permissions',jsonb_build_object('can_claim',v_inbox.status in ('new','released') and private.has_business_payment_permission(v_inbox.business_id,'claim',v_uid),'can_complete',v_inbox.status='claimed' and private.has_business_payment_permission(v_inbox.business_id,'complete',v_uid) and (v_inbox.claimed_by_user_id=v_uid or v_supervisor),'can_review',private.has_business_payment_permission(v_inbox.business_id,'review',v_uid),'can_view',true)) end,'contract_version',1,'read_only_open',true);
end;
$$;
revoke all on function public.get_operation_operational_context(uuid) from public,anon;
grant execute on function public.get_operation_operational_context(uuid) to authenticated;

update public.business_financial_accounts fa set verification_status='verified', verified_at=coalesce(verified_at,now()), updated_at=now() where fa.id in (select fi.financial_account_id from public.business_financial_identifiers fi where fi.identifier_value_normalized='254073867' and fi.status='active' and fi.routing_enabled=true);
update public.business_financial_identifiers set verification_status='verified', updated_at=now() where identifier_value_normalized='254073867' and status='active' and routing_enabled=true;

create or replace function private.notify_business_payment_inbox(p_inbox_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.business_payment_inbox%rowtype; v_business public.business_profiles%rowtype; v_operation public.operations%rowtype; v_user_id uuid; v_account_suffix text;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id; if not found then return; end if;
  select * into v_business from public.business_profiles where id=v_item.business_id;
  select * into v_operation from public.operations where id=v_item.operation_id;
  if v_operation.id is null or v_operation.public_token is null then return; end if;
  v_account_suffix := right(coalesce(v_operation.credited_account_normalized,v_operation.receiver_account_normalized,v_operation.receiver_account,''),4);
  for v_user_id in select v_business.owner_user_id union select m.user_id from public.business_team_members m where m.business_id=v_item.business_id and m.status='active' and private.has_business_payment_permission(v_item.business_id,'view',m.user_id)
  loop
    perform private.create_notification(v_user_id,'payment_inbox_new','business','info',concat('وردت دفعة جديدة إلى ',v_business.name),concat(coalesce(v_operation.amount::text,'—'),' ',coalesce(v_operation.currency,''),' عبر ',coalesce(v_operation.financial_entity,'جهة مالية أخرى'),case when v_account_suffix<>'' then concat(' · الحساب …',v_account_suffix) else '' end,'. راجع وارد المدفوعات.'),'business_operations',jsonb_build_object('business_id',v_item.business_id,'payment_inbox_id',v_item.id,'inbox_surface','payment-inbox','inbox_view','new','public_token',v_operation.public_token),null,v_item.business_id,v_item.operation_id,'business_payment_inbox',v_item.id::text,concat('payment_inbox_new:',v_item.id,':',v_user_id),jsonb_build_object('payment_inbox_id',v_item.id,'business_id',v_item.business_id,'source_mode',v_item.source_mode,'match_score',v_item.match_score,'public_token',v_operation.public_token),now()+interval '30 days');
  end loop;
end;$$;

create or replace function private.notify_business_payment_review_required(p_inbox_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.business_payment_inbox%rowtype; v_business public.business_profiles%rowtype; v_operation public.operations%rowtype; v_user_id uuid; v_account_suffix text;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id; if not found then return; end if;
  select * into v_business from public.business_profiles where id=v_item.business_id;
  select * into v_operation from public.operations where id=v_item.operation_id;
  if v_operation.id is null or v_operation.public_token is null then return; end if;
  v_account_suffix := right(coalesce(v_operation.credited_account_normalized,v_operation.receiver_account_normalized,v_operation.receiver_account,''),4);
  for v_user_id in select v_business.owner_user_id union select m.user_id from public.business_team_members m where m.business_id=v_item.business_id and m.status='active' and private.has_business_payment_permission(v_item.business_id,'review',m.user_id)
  loop
    perform private.create_notification(v_user_id,'payment_inbox_review_required','business','warning',concat('دفعة محتملة تحتاج مراجعة في ',v_business.name),concat('طابق سند رقم الحساب',case when v_account_suffix<>'' then concat(' …',v_account_suffix) else '' end,' مع النشاط، لكن توثيق الحساب غير مكتمل. راجع العملية قبل اعتمادها.'),'business_operations',jsonb_build_object('business_id',v_item.business_id,'payment_inbox_id',v_item.id,'inbox_surface','payment-inbox-admin','inbox_view','review','public_token',v_operation.public_token),null,v_item.business_id,v_item.operation_id,'business_payment_inbox_review',v_item.id::text,concat('payment_inbox_review_required:',v_item.id,':',v_user_id),jsonb_build_object('payment_inbox_id',v_item.id,'business_id',v_item.business_id,'source_mode',v_item.source_mode,'match_score',v_item.match_score,'public_token',v_operation.public_token),now()+interval '30 days');
  end loop;
end;$$;

commit;
