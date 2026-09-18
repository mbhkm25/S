create or replace function public.create_personal_finance_party_v1(p_command jsonb)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_command->>'display_name',''));
  v_type text := lower(btrim(coalesce(p_command->>'party_type','person')));
  v_phone text := nullif(btrim(coalesce(p_command->>'phone','')),'');
  v_email text := nullif(btrim(coalesce(p_command->>'email','')),'');
  v_notes text := nullif(btrim(coalesce(p_command->>'notes','')),'');
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid_party_name'; end if;
  if v_type not in ('person','business','household','other') then raise exception 'invalid_party_type'; end if;
  if v_phone is not null and char_length(v_phone) > 40 then raise exception 'invalid_party_phone'; end if;
  if v_email is not null and char_length(v_email) > 160 then raise exception 'invalid_party_email'; end if;

  insert into public.personal_finance_parties(user_id,display_name,party_type,phone,email,notes,status,metadata)
  values(v_user,v_name,v_type,v_phone,v_email,v_notes,'active',coalesce(p_command->'metadata','{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'party_id',v_id,'display_name',v_name,'party_type',v_type,'status','active');
end;
$function$;

revoke all on function public.create_personal_finance_party_v1(jsonb) from public, anon;
grant execute on function public.create_personal_finance_party_v1(jsonb) to authenticated;

create or replace function public.create_business_party_v1(p_command jsonb)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_business uuid;
  v_name text := btrim(coalesce(p_command->>'display_name',''));
  v_normalized text;
  v_phone text := nullif(btrim(coalesce(p_command->>'primary_phone','')),'');
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  begin v_business := nullif(p_command->>'business_id','')::uuid; exception when others then raise exception 'invalid_business_id'; end;
  if v_business is null then raise exception 'business_id_required'; end if;
  if not public.can_access_business_financial_v1(v_business) then raise exception 'business_access_denied'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 160 then raise exception 'invalid_party_name'; end if;
  if v_phone is not null and char_length(v_phone) > 40 then raise exception 'invalid_party_phone'; end if;

  v_normalized := lower(regexp_replace(v_name,'\s+',' ','g'));
  select p.id into v_existing
  from public.business_parties p
  where p.business_id=v_business and p.status='active' and p.normalized_name=v_normalized
  order by p.created_at asc limit 1;

  if v_existing is not null then
    return jsonb_build_object('contract_version',1,'party_id',v_existing,'display_name',v_name,'status','active','already_exists',true);
  end if;

  insert into public.business_parties(business_id,display_name,normalized_name,primary_phone,status,source_mode,metadata)
  values(v_business,v_name,v_normalized,v_phone,'active','manual',coalesce(p_command->'metadata','{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('contract_version',1,'party_id',v_id,'display_name',v_name,'status','active','already_exists',false);
end;
$function$;

revoke all on function public.create_business_party_v1(jsonb) from public, anon;
grant execute on function public.create_business_party_v1(jsonb) to authenticated;

create or replace function public.get_business_commercial_settlement_candidates_v1(p_business_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_invoices jsonb;
  v_payments jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_business_id is null then raise exception 'business_id_required'; end if;
  if not public.can_access_business_financial_v1(p_business_id) then raise exception 'business_access_denied'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'document_type',q.document_type,
    'document_number',q.document_number,
    'document_date',q.document_date,
    'party_id',q.party_id,
    'party_name',q.party_name,
    'currency',q.currency,
    'total_amount',q.total_amount,
    'settled_amount',q.settled_amount,
    'outstanding_amount',q.outstanding_amount,
    'compatible_payment_type',case when q.document_type='sales_invoice' then 'receipt' else 'payment' end
  ) order by q.document_date desc,q.created_at desc),'[]'::jsonb) into v_invoices
  from (
    select d.*,p.display_name as party_name,coalesce(sum(s.amount) filter(where s.status='active'),0) as settled_amount,
           d.total_amount-coalesce(sum(s.amount) filter(where s.status='active'),0) as outstanding_amount
    from public.business_commercial_documents d
    join public.business_parties p on p.id=d.party_id and p.business_id=d.business_id
    left join public.business_commercial_settlements s on s.invoice_document_id=d.id
    where d.business_id=p_business_id and d.status='posted' and d.document_type in ('sales_invoice','purchase_invoice','expense') and d.total_amount>0
    group by d.id,p.display_name
    having d.total_amount-coalesce(sum(s.amount) filter(where s.status='active'),0)>0
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'document_type',q.document_type,
    'document_number',q.document_number,
    'document_date',q.document_date,
    'party_id',q.party_id,
    'party_name',q.party_name,
    'currency',q.currency,
    'total_amount',q.total_amount,
    'used_amount',q.used_amount,
    'available_amount',q.available_amount
  ) order by q.document_date desc,q.created_at desc),'[]'::jsonb) into v_payments
  from (
    select d.*,p.display_name as party_name,coalesce(sum(s.amount) filter(where s.status='active'),0) as used_amount,
           d.total_amount-coalesce(sum(s.amount) filter(where s.status='active'),0) as available_amount
    from public.business_commercial_documents d
    join public.business_parties p on p.id=d.party_id and p.business_id=d.business_id
    left join public.business_commercial_settlements s on s.payment_document_id=d.id
    where d.business_id=p_business_id and d.status='posted' and d.document_type in ('receipt','payment') and d.total_amount>0
    group by d.id,p.display_name
    having d.total_amount-coalesce(sum(s.amount) filter(where s.status='active'),0)>0
  ) q;

  return jsonb_build_object('contract_version',1,'business_id',p_business_id,'invoices',v_invoices,'payments',v_payments);
end;
$function$;

revoke all on function public.get_business_commercial_settlement_candidates_v1(uuid) from public, anon;
grant execute on function public.get_business_commercial_settlement_candidates_v1(uuid) to authenticated;
