begin;

-- This test is intentionally transactional and leaves no persistent data.
-- It must run after the payment inbox hardening migrations.

do $$
declare
  v_business_id uuid;
  v_owner_id uuid;
  v_member_id uuid;
  v_operation_id uuid := gen_random_uuid();
  v_inbox_id uuid;
  v_result jsonb;
begin
  select business.id,business.owner_user_id
    into v_business_id,v_owner_id
  from public.business_profiles business
  where exists(
    select 1 from public.business_team_members member
    where member.business_id=business.id and member.status='active'
  )
  order by business.created_at
  limit 1;

  if v_business_id is null then
    raise notice 'No business with active team members; member operation test skipped.';
    return;
  end if;

  select member.user_id into v_member_id
  from public.business_team_members member
  where member.business_id=v_business_id and member.status='active'
  order by member.created_at
  limit 1;

  insert into public.operations(
    id,public_token,source,file_bucket,status,ai_status,amount,currency,
    financial_entity,summary,analysis_contract_version
  ) values (
    v_operation_id,gen_random_uuid(),'system_test','operation-files','ready','completed',1250,'YER',
    'جهة اختبار','عملية اختبار سجل عضو الفريق',2
  );

  insert into public.business_payment_inbox(
    business_id,operation_id,source_mode,status,priority,routing_snapshot,
    claimed_by_user_id,claimed_at,claim_expires_at,claimed_source,last_action_source
  ) values (
    v_business_id,v_operation_id,'manual','claimed',50,'{}'::jsonb,
    v_member_id,now(),now()+interval '5 minutes','payment_inbox','payment_inbox'
  ) returning id into v_inbox_id;

  perform private.record_business_payment_inbox_event(
    v_inbox_id,'claimed',v_member_id,'new','claimed',null,
    jsonb_build_object('source','payment_inbox','test',true)
  );

  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);

  v_result := public.get_business_team_member_operations_v2(
    v_business_id,v_member_id,'all',50,0
  );

  if jsonb_array_length(v_result->'items')<1 then
    raise exception 'member_operations_v2_missing_claimed_operation';
  end if;

  if coalesce((v_result#>>'{summary,claimed_count}')::integer,0)<1 then
    raise exception 'member_operations_v2_claim_summary_missing';
  end if;

  if not exists(
    select 1
    from jsonb_array_elements(v_result->'items') item
    where item->>'operation_id'=v_operation_id::text
      and item->>'current_status'='claimed'
      and (item#>>'{contribution,claimed}')::boolean
      and item#>>'{current_assignee,user_id}'=v_member_id::text
  ) then
    raise exception 'member_operations_v2_current_state_mismatch';
  end if;

  v_result := public.get_business_team_member_operations_v2(
    v_business_id,v_member_id,'in_progress',50,0
  );

  if not exists(
    select 1 from jsonb_array_elements(v_result->'items') item
    where item->>'operation_id'=v_operation_id::text
  ) then
    raise exception 'member_operations_v2_in_progress_filter_failed';
  end if;
end;
$$;

rollback;
