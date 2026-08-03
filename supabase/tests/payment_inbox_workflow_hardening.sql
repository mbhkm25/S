begin;

do $$
declare
  v_business_id uuid;
  v_owner_id uuid;
  v_member_id uuid;
  v_operation_id uuid;
  v_qr_operation_id uuid;
  v_inbox_id uuid;
  v_qr_inbox_id uuid;
  v_result jsonb;
  v_version bigint;
  v_count integer;
begin
  select bp.id,bp.owner_user_id,m.user_id
  into v_business_id,v_owner_id,v_member_id
  from public.business_profiles bp
  join public.business_team_members m on m.business_id=bp.id and m.status='active'
  where m.user_id<>bp.owner_user_id
    and private.has_business_payment_permission(bp.id,'claim',m.user_id)
    and private.has_business_payment_permission(bp.id,'complete',m.user_id)
  order by bp.created_at
  limit 1;

  if v_business_id is null then
    raise exception 'payment_inbox_test_fixture_requires_claim_and_complete_member';
  end if;

  insert into public.operations(
    source,submitted_by_user_id,submitted_by_name,status,ai_status,
    amount,currency,financial_entity,receiver_name,receiver_account
  ) values (
    'pwa_upload',v_owner_id,'Payment workflow test','ready','completed',
    12345,'YER','اختبار وارد المدفوعات','اختبار المستلم','TEST-ACCOUNT'
  ) returning id into v_operation_id;

  insert into public.business_payment_inbox(
    business_id,operation_id,source_mode,status,priority,routing_snapshot
  ) values (
    v_business_id,v_operation_id,'manual','new',50,'{"test":true}'::jsonb
  ) returning id into v_inbox_id;

  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);

  v_result:=public.claim_business_payment_v2(v_inbox_id,1,300,'payment_inbox');
  if coalesce((v_result->>'claimed')::boolean,false) is not true then
    raise exception 'owner_claim_failed:%',v_result;
  end if;
  v_version:=(v_result#>>'{item,row_version}')::bigint;

  perform set_config('request.jwt.claim.sub',v_member_id::text,true);
  v_result:=public.claim_business_payment_v2(v_inbox_id,1,300,'payment_inbox');
  if v_result->>'reason'<>'claim_race_lost' then
    raise exception 'concurrent_claim_must_lose:%',v_result;
  end if;

  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);
  v_result:=public.release_business_payment_v2(v_inbox_id,1,'stale test','admin');
  if v_result->>'reason'<>'stale_item' then
    raise exception 'stale_release_must_be_rejected:%',v_result;
  end if;

  v_result:=public.request_business_payment_review_v2(v_inbox_id,v_version,'تحتاج العملية إلى مراجعة اختبارية','payment_inbox');
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result#>>'{item,status}'<>'review_required' then
    raise exception 'review_request_failed:%',v_result;
  end if;
  v_version:=(v_result#>>'{item,row_version}')::bigint;

  v_result:=public.resume_business_payment_review_v2(v_inbox_id,v_version,v_member_id,'إعادة للعضو بعد المراجعة','admin');
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result#>>'{item,status}'<>'claimed'
     or (v_result#>>'{item,claimed_by_user_id}')::uuid<>v_member_id then
    raise exception 'review_resume_failed:%',v_result;
  end if;
  v_version:=(v_result#>>'{item,row_version}')::bigint;

  perform set_config('request.jwt.claim.sub',v_member_id::text,true);
  v_result:=public.complete_business_payment_v2(v_inbox_id,v_version,'اكتمل اختبار الصندوق','payment_inbox');
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result#>>'{inbox,status}'<>'completed' then
    raise exception 'payment_inbox_completion_failed:%',v_result;
  end if;

  select count(*) into v_count
  from public.business_operation_links
  where business_id=v_business_id and operation_id=v_operation_id and status='linked';
  if v_count<>1 then raise exception 'business_link_not_created'; end if;

  select count(*) into v_count
  from public.business_payment_inbox_events
  where inbox_id=v_inbox_id
    and event_type in ('claimed','claim_conflict','stale_action_rejected','review_required','review_resumed','completed');
  if v_count<6 then raise exception 'workflow_event_log_incomplete:%',v_count; end if;

  insert into public.operations(
    source,submitted_by_user_id,submitted_by_name,status,ai_status,
    amount,currency,financial_entity,receiver_name,receiver_account
  ) values (
    'pwa_upload',v_owner_id,'QR workflow test','ready','completed',
    54321,'SAR','اختبار QR','اختبار المستلم','QR-ACCOUNT'
  ) returning id into v_qr_operation_id;

  insert into public.business_payment_inbox(
    business_id,operation_id,source_mode,status,priority,routing_snapshot
  ) values (
    v_business_id,v_qr_operation_id,'manual','new',50,'{"test":true,"source":"qr"}'::jsonb
  ) returning id into v_qr_inbox_id;

  v_result:=public.complete_operation_workflow(
    v_qr_operation_id,null,v_business_id,null,'اكتمل عبر QR','qr_details'
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'qr_completion_failed:%',v_result;
  end if;

  select count(*) into v_count
  from public.business_payment_inbox
  where id=v_qr_inbox_id
    and operation_id=v_qr_operation_id
    and business_id=v_business_id
    and status='completed'
    and completed_by_user_id=v_member_id
    and completed_source='qr_details';
  if v_count<>1 then raise exception 'qr_did_not_update_same_inbox_record'; end if;

  perform set_config('request.jwt.claim.sub',v_owner_id::text,true);
  v_result:=public.get_business_payment_inbox_v2(v_business_id,'all',100,null,null);
  if (v_result#>>'{viewer,is_supervisor}')::boolean is not true then
    raise exception 'owner_must_be_supervisor';
  end if;

  perform set_config('request.jwt.claim.sub',v_member_id::text,true);
  begin
    perform public.get_business_payment_inbox_v2(v_business_id,'team_active',100,null,null);
    raise exception 'member_must_not_access_team_active';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

rollback;
