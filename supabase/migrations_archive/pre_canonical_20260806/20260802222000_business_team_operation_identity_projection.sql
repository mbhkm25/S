begin;

alter function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer)
  rename to get_business_team_member_operations_v2_core;

create function public.get_business_team_member_operations_v2(
  p_business_id uuid,
  p_member_user_id uuid,
  p_activity_type text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
  v_business_name text;
begin
  v_payload:=public.get_business_team_member_operations_v2_core(
    p_business_id,p_member_user_id,p_activity_type,p_limit,p_offset
  );

  select name into v_business_name
  from public.business_profiles
  where id=p_business_id;

  select coalesce(jsonb_agg(
    jsonb_set(
      item,
      '{operation}',
      coalesce(item->'operation','{}'::jsonb)
      || jsonb_build_object(
        'raw_receiver_name',operation.receiver_name,
        'resolved_business_name',v_business_name,
        'identity_source',case
          when exists(
            select 1 from public.business_operation_links link
            where link.business_id=p_business_id
              and link.operation_id=operation.id
              and link.status='linked'
          ) then 'linked_business'
          when exists(
            select 1 from public.business_payment_inbox inbox
            where inbox.business_id=p_business_id
              and inbox.operation_id=operation.id
          ) then 'business_inbox_context'
          else 'team_activity_context'
        end,
        'display_title',case
          when exists(
            select 1 from public.business_operation_links link
            where link.business_id=p_business_id
              and link.operation_id=operation.id
              and link.status='linked'
          ) then 'عملية لدى '||v_business_name
          else 'عملية ضمن نشاط '||v_business_name
        end,
        'has_name_conflict',case
          when nullif(trim(coalesce(operation.receiver_name,'')),'') is null then false
          else public.normalize_financial_name(operation.receiver_name)
            is distinct from public.normalize_financial_name(v_business_name)
        end
      ),
      true
    ) order by (item->>'latest_member_activity_at')::timestamptz desc
  ),'[]'::jsonb)
  into v_items
  from jsonb_array_elements(coalesce(v_payload->'items','[]'::jsonb)) item
  join public.operations operation on operation.id=(item->>'operation_id')::uuid;

  return jsonb_set(v_payload,'{items}',v_items,true);
end;
$function$;

revoke all on function public.get_business_team_member_operations_v2_core(uuid,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) to authenticated;

comment on function public.get_business_team_member_operations_v2(uuid,uuid,text,integer,integer) is
'Team operation history enriched with business-context identity while preserving raw extracted receiver names.';

commit;
