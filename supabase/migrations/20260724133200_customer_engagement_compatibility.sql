create or replace function public.get_business_customers(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if not public.can_access_business_customers(p_business_id, 'customers.view') then
    raise exception 'business_customer_view_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bc.id,
    'business_id', bc.business_id,
    'user_id', bc.user_id,
    'status', bc.status,
    'source', bc.source,
    'created_at', bc.created_at,
    'updated_at', bc.updated_at,
    'ended_at', bc.ended_at,
    'full_name', p.full_name,
    'phone', p.phone,
    'marketing_opt_in', bc.marketing_opt_in,
    'in_app_notifications_enabled', bc.in_app_notifications_enabled,
    'whatsapp_service_enabled', bc.whatsapp_service_enabled,
    'whatsapp_marketing_enabled', bc.whatsapp_marketing_enabled,
    'tags', bc.tags,
    'last_contacted_at', bc.last_contacted_at,
    'contact_count', bc.contact_count,
    'engagement_state', case
      when bc.created_at >= now() - interval '30 days' then 'new'
      when coalesce(bc.last_contacted_at, bc.created_at) < now() - interval '90 days' then 'inactive'
      else 'active'
    end
  ) order by
      case when bc.status = 'active' then 0 else 1 end,
      coalesce(bc.last_contacted_at, bc.created_at) desc), '[]'::jsonb)
  into v_items
  from public.business_customers bc
  join public.profiles p on p.id = bc.user_id
  where bc.business_id = p_business_id;

  return jsonb_build_object('items', v_items);
end;
$$;
