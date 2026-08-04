begin;

create or replace function public.get_operation_media_preview_worker_token_internal()
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select token_value into v_token from private.sanad_worker_tokens where worker_name='operation_media_preview' and is_active=true;
  if v_token is null then raise exception 'preview_worker_token_missing'; end if;
  return v_token;
end;$$;
revoke all on function public.get_operation_media_preview_worker_token_internal() from public, anon, authenticated;
grant execute on function public.get_operation_media_preview_worker_token_internal() to service_role;

create or replace function private.notify_business_payment_review_required(p_inbox_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item public.business_payment_inbox%rowtype; v_business public.business_profiles%rowtype; v_operation public.operations%rowtype; v_user_id uuid;
begin
  select * into v_item from public.business_payment_inbox where id=p_inbox_id; if not found then return; end if;
  select * into v_business from public.business_profiles where id=v_item.business_id;
  select * into v_operation from public.operations where id=v_item.operation_id;
  if v_operation.id is null or v_operation.public_token is null then return; end if;
  for v_user_id in
    select v_business.owner_user_id union
    select m.user_id from public.business_team_members m where m.business_id=v_item.business_id and m.status='active' and private.has_business_payment_permission(v_item.business_id,'review',m.user_id)
  loop
    perform private.create_notification(v_user_id,'payment_inbox_review_required','business','warning','دفعة تحتاج مراجعة في وارد المدفوعات',concat('طابقت سند رقم الحساب مع ',v_business.name,'، لكن الحساب لم يُوثق بعد. راجع العملية قبل اعتمادها.'),'operation_details',jsonb_build_object('operation_id',v_operation.id,'public_token',v_operation.public_token,'payment_inbox_id',v_item.id,'business_id',v_item.business_id,'source','notification'),null,v_item.business_id,v_item.operation_id,'business_payment_inbox_review',v_item.id::text,concat('payment_inbox_review_required:',v_item.id,':',v_user_id),jsonb_build_object('payment_inbox_id',v_item.id,'source_mode',v_item.source_mode,'match_score',v_item.match_score,'public_token',v_operation.public_token),now()+interval '30 days');
  end loop;
end;$$;

create or replace function private.route_operation_by_exact_identifier(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_operation public.operations%rowtype; v_identifier text; v_business_id uuid; v_account_id uuid;
  v_account_verified text; v_identifier_verified text; v_candidate_count integer; v_inbox_id uuid; v_status text;
begin
  select * into v_operation from public.operations where id=p_operation_id;
  if not found or v_operation.ai_status<>'completed' then return jsonb_build_object('ok',false,'reason','analysis_not_completed'); end if;
  v_identifier:=coalesce(nullif(v_operation.credited_account_normalized,''),nullif(v_operation.receiver_account_normalized,''),nullif(v_operation.document_account_normalized,''));
  if v_identifier is null then return jsonb_build_object('ok',false,'reason','credited_identifier_missing'); end if;

  with candidates as (
    select distinct on (fa.business_id) fa.business_id,fa.id account_id,fa.verification_status account_verified,fi.verification_status identifier_verified
    from public.business_financial_identifiers fi
    join public.business_financial_accounts fa on fa.id=fi.financial_account_id
    where fi.identifier_value_normalized=v_identifier and fi.status='active' and fi.routing_enabled=true
      and fa.status='active' and fa.routing_enabled=true
      and (fi.currency is null or upper(fi.currency)=upper(coalesce(v_operation.currency,'')))
    order by fa.business_id,fi.is_primary desc,fi.created_at asc
  )
  select count(*),(array_agg(business_id))[1],(array_agg(account_id))[1],(array_agg(account_verified))[1],(array_agg(identifier_verified))[1]
  into v_candidate_count,v_business_id,v_account_id,v_account_verified,v_identifier_verified from candidates;

  if v_candidate_count<>1 or v_business_id is null then return jsonb_build_object('ok',false,'reason',case when v_candidate_count=0 then 'exact_identifier_not_found' else 'exact_identifier_ambiguous' end,'candidate_count',v_candidate_count); end if;
  select id,status into v_inbox_id,v_status from public.business_payment_inbox where business_id=v_business_id and operation_id=p_operation_id;
  if v_inbox_id is not null then return jsonb_build_object('ok',true,'created',false,'item_id',v_inbox_id,'status',v_status); end if;

  if v_account_verified='verified' and v_identifier_verified='verified' then
    v_inbox_id:=private.enqueue_business_payment_inbox_system(v_business_id,p_operation_id,null,v_account_id,'live',100,'exact_credited_identifier',jsonb_build_object('identifier',v_identifier,'entity_code',v_operation.financial_entity_code,'entity_mismatch_warning',v_operation.financial_entity_code is distinct from (select financial_entity_code from public.business_financial_accounts where id=v_account_id),'routing_precedence','exact_identifier_first'));
    v_status:='new';
  else
    insert into public.business_payment_inbox(business_id,operation_id,financial_account_id,source_mode,status,priority,match_score,match_strategy,routing_snapshot)
    values(v_business_id,p_operation_id,v_account_id,'canary','review_required',95,100,'exact_credited_identifier_unverified',jsonb_build_object('identifier',v_identifier,'entity_code',v_operation.financial_entity_code,'entity_mismatch_warning',true,'routing_precedence','exact_identifier_first','verification_required',true))
    returning id,status into v_inbox_id,v_status;
    perform private.record_business_payment_inbox_event(v_inbox_id,'enqueued',null,null,'review_required','financial_identifier_verification_required',jsonb_build_object('identifier',v_identifier,'match_strategy','exact_credited_identifier'));
    perform private.notify_business_payment_review_required(v_inbox_id);
  end if;
  return jsonb_build_object('ok',true,'created',true,'item_id',v_inbox_id,'status',v_status,'business_id',v_business_id,'financial_account_id',v_account_id);
end;$$;

create or replace function private.route_operation_by_exact_identifier_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ai_status='completed' and (tg_op='INSERT' or old.ai_status is distinct from new.ai_status or old.credited_account_normalized is distinct from new.credited_account_normalized or old.receiver_account_normalized is distinct from new.receiver_account_normalized or old.document_account_normalized is distinct from new.document_account_normalized or old.currency is distinct from new.currency) then
    perform private.route_operation_by_exact_identifier(new.id);
  end if;
  return new;
end;$$;

drop trigger if exists operations_exact_identifier_routing on public.operations;
create trigger operations_exact_identifier_routing after insert or update of ai_status,credited_account_normalized,receiver_account_normalized,document_account_normalized,currency on public.operations for each row execute function private.route_operation_by_exact_identifier_trigger();

do $$ declare r record; begin
  for r in select o.id from public.operations o where o.ai_status='completed' and o.created_at>=now()-interval '7 days' and not exists(select 1 from public.business_payment_inbox i where i.operation_id=o.id)
  loop perform private.route_operation_by_exact_identifier(r.id); end loop;
end;$$;

commit;
