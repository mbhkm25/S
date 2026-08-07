drop function if exists public.create_report_request(text,timestamptz,timestamptz,jsonb,text);
drop function if exists public.create_business_report_request(uuid,timestamptz,timestamptz,jsonb,text);

create function public.create_report_request(
  p_report_scope text default 'all',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_filters jsonb default '{}'::jsonb,
  p_destination_phone text default null,
  p_delivery_format text default 'interactive'
)
returns table(report_request_id uuid,status text,message text)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_destination text;
  v_format text := lower(coalesce(nullif(btrim(p_delivery_format),''),'interactive'));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_report_scope not in ('all','sent','verified') then raise exception 'invalid_report_scope'; end if;
  if v_format not in ('interactive','pdf','both') then raise exception 'invalid_delivery_format'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from >= p_date_to then raise exception 'invalid_date_range'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_to-p_date_from > interval '366 days' then raise exception 'date_range_too_large'; end if;
  if octet_length(coalesce(p_filters,'{}'::jsonb)::text)>8192 then raise exception 'filters_too_large'; end if;
  select p.phone into v_phone from public.profiles p where p.id=v_uid;
  v_destination:=nullif(regexp_replace(coalesce(p_destination_phone,v_phone,''),'[^0-9]','','g'),'');
  if v_destination is null then raise exception 'missing_destination_phone'; end if;
  if length(v_destination)=9 then v_destination:='967'||v_destination;
  elsif left(v_destination,5)='00967' then v_destination:=substring(v_destination from 3);
  elsif left(v_destination,4)='0967' then v_destination:=substring(v_destination from 2); end if;
  if v_destination !~ '^967[0-9]{9}$' then raise exception 'invalid_destination_phone'; end if;
  if exists(select 1 from public.report_requests rr where rr.requested_by_user_id=v_uid and rr.report_context='personal' and rr.status in ('queued','processing') and rr.requested_at>now()-interval '90 seconds' and rr.report_scope=p_report_scope and rr.date_from is not distinct from p_date_from and rr.date_to is not distinct from p_date_to and rr.filters=coalesce(p_filters,'{}'::jsonb) and rr.delivery_format=v_format) then raise exception 'duplicate_report_request'; end if;
  insert into public.report_requests(requested_by_user_id,requested_by_phone,report_context,report_title,report_scope,date_from,date_to,filters,delivery_channel,delivery_format,destination_phone,status,processing_stage)
  values(v_uid,v_phone,'personal','تقرير عمليات سند',p_report_scope,p_date_from,p_date_to,coalesce(p_filters,'{}'::jsonb),'whatsapp',v_format,v_destination,'queued','queued')
  returning id,report_requests.status into report_request_id,status;
  message:=case v_format when 'interactive' then 'تم استلام الطلب. سيصلك رابط التقرير التفاعلي عبر واتساب.' when 'pdf' then 'تم استلام الطلب. سيصلك ملف PDF عبر واتساب.' else 'تم استلام الطلب. سيصلك رابط التقرير وملف PDF عبر واتساب.' end;
  return next;
end$$;

create function public.create_business_report_request(
  p_business_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_filters jsonb default '{}'::jsonb,
  p_destination_phone text default null,
  p_delivery_format text default 'interactive'
)
returns table(report_request_id uuid,status text,message text)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_owner_phone text; v_business_phone text; v_destination text;
  v_filters jsonb:=coalesce(p_filters,'{}'::jsonb); v_currency text; v_operation_status text;
  v_team_member_text text; v_team_member uuid; v_financial_entity text; v_title text;
  v_format text:=lower(coalesce(nullif(btrim(p_delivery_format),''),'interactive'));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_business_id is null then raise exception 'business_id_required'; end if;
  if v_format not in ('interactive','pdf','both') then raise exception 'invalid_delivery_format'; end if;
  select p.phone,bp.whatsapp,bp.name into v_owner_phone,v_business_phone,v_title from public.business_profiles bp left join public.profiles p on p.id=bp.owner_user_id where bp.id=p_business_id and (bp.owner_user_id=v_uid or public.is_platform_admin(v_uid));
  if not found then raise exception 'business_owner_required'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from>=p_date_to then raise exception 'invalid_date_range'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_to-p_date_from>interval '366 days' then raise exception 'date_range_too_large'; end if;
  if octet_length(v_filters::text)>8192 then raise exception 'filters_too_large'; end if;
  if exists(select 1 from jsonb_object_keys(v_filters) k where k not in ('currency','status','team_member_user_id','financial_entity','include_details','include_team_performance','include_status_distribution','include_currency_distribution','include_entity_distribution')) then raise exception 'unsupported_report_filter'; end if;
  v_currency:=upper(nullif(btrim(v_filters->>'currency'),''));
  if v_currency is not null and v_currency not in ('ALL','YER','SAR','AED','USD') then raise exception 'invalid_currency_filter'; end if;
  v_operation_status:=lower(nullif(btrim(v_filters->>'status'),''));
  if v_operation_status is not null and v_operation_status not in ('all','verified','ready','stored','received','matched','failed') then raise exception 'invalid_status_filter'; end if;
  v_financial_entity:=nullif(btrim(v_filters->>'financial_entity'),'');
  if v_financial_entity is not null and length(v_financial_entity)>120 then raise exception 'invalid_financial_entity_filter'; end if;
  v_team_member_text:=nullif(btrim(v_filters->>'team_member_user_id'),'');
  if v_team_member_text is not null then
    begin v_team_member:=v_team_member_text::uuid; exception when invalid_text_representation then raise exception 'invalid_team_member_filter'; end;
    if not exists(select 1 from public.business_team_members tm where tm.business_id=p_business_id and tm.user_id=v_team_member and tm.status='active') then raise exception 'team_member_not_in_business'; end if;
  end if;
  v_destination:=nullif(regexp_replace(coalesce(p_destination_phone,v_owner_phone,v_business_phone,''),'[^0-9]','','g'),'');
  if v_destination is null then raise exception 'missing_destination_phone'; end if;
  if length(v_destination)=9 then v_destination:='967'||v_destination;
  elsif left(v_destination,5)='00967' then v_destination:=substring(v_destination from 3);
  elsif left(v_destination,4)='0967' then v_destination:=substring(v_destination from 2); end if;
  if v_destination !~ '^967[0-9]{9}$' then raise exception 'invalid_destination_phone'; end if;
  if exists(select 1 from public.report_requests rr where rr.requested_by_user_id=v_uid and rr.report_context='business' and rr.business_id=p_business_id and rr.status in ('queued','processing') and rr.requested_at>now()-interval '90 seconds' and rr.date_from is not distinct from p_date_from and rr.date_to is not distinct from p_date_to and rr.filters=v_filters and rr.delivery_format=v_format) then raise exception 'duplicate_report_request'; end if;
  insert into public.report_requests(requested_by_user_id,requested_by_phone,report_context,business_id,report_title,report_scope,date_from,date_to,filters,delivery_channel,delivery_format,destination_phone,status,processing_stage)
  values(v_uid,v_owner_phone,'business',p_business_id,'تقرير عمليات '||v_title,'all',p_date_from,p_date_to,v_filters,'whatsapp',v_format,v_destination,'queued','queued')
  returning id,report_requests.status into report_request_id,status;
  message:=case v_format when 'interactive' then 'تم استلام الطلب. سيصلك رابط التقرير التفاعلي عبر واتساب.' when 'pdf' then 'تم استلام الطلب. سيصلك ملف PDF عبر واتساب.' else 'تم استلام الطلب. سيصلك رابط التقرير وملف PDF عبر واتساب.' end;
  return next;
end$$;

revoke all on function public.create_report_request(text,timestamptz,timestamptz,jsonb,text,text) from public,anon;
grant execute on function public.create_report_request(text,timestamptz,timestamptz,jsonb,text,text) to authenticated,service_role;
revoke all on function public.create_business_report_request(uuid,timestamptz,timestamptz,jsonb,text,text) from public,anon;
grant execute on function public.create_business_report_request(uuid,timestamptz,timestamptz,jsonb,text,text) to authenticated,service_role;