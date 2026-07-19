-- Document and enforce the intended RPC-only access contract for sensitive tables.

revoke all on table public.app_public_information from anon, authenticated;
revoke all on table public.business_customer_communications from anon, authenticated;
revoke all on table public.business_customer_notes from anon, authenticated;

comment on table public.app_public_information is
  'Backend-managed singleton. Direct Data API access is intentionally denied; public reads go through get_app_public_information().';

comment on table public.business_customer_communications is
  'RPC-only customer communication history. Direct anon/authenticated table access is intentionally denied.';

comment on table public.business_customer_notes is
  'RPC-only private business customer notes. Direct anon/authenticated table access is intentionally denied.';

comment on function public.get_app_public_information() is
  'Intentionally public read-only SECURITY DEFINER RPC returning only the approved app information projection.';

comment on function public.get_public_business_profile(text) is
  'Intentionally public read-only SECURITY DEFINER RPC restricted to published business profiles.';

comment on function public.get_public_businesses(text, uuid, text, text, integer, integer) is
  'Intentionally public read-only SECURITY DEFINER discovery RPC restricted to published businesses.';

comment on function public.get_sanad_pro_payment_options() is
  'Authenticated read-only SECURITY DEFINER RPC returning active SANAD Pro plan and payment options.';

-- Fail the migration if a future schema state violates the reviewed contract.
do $guardrails$
declare
  v_table text;
  v_function regprocedure;
begin
  foreach v_table in array array[
    'public.app_public_information',
    'public.business_customer_communications',
    'public.business_customer_notes'
  ]
  loop
    if has_table_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'anon_direct_table_privilege_detected:%', v_table;
    end if;
    if has_table_privilege('authenticated', v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'authenticated_direct_table_privilege_detected:%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.platform_admin_review_business(uuid,text,text)'::regprocedure,
    'public.update_business_profile(uuid,text,text,text,text,text,uuid,text,text,text,text,numeric,numeric,text,text,jsonb,jsonb,jsonb,jsonb,text,boolean)'::regprocedure,
    'public.update_business_team_member_status(uuid,uuid,text,text)'::regprocedure,
    'public.add_business_customer_note(uuid,uuid,text)'::regprocedure,
    'public.record_business_customer_communication(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure,
    'public.get_business_customers(uuid)'::regprocedure,
    'public.get_business_customer_detail(uuid,uuid)'::regprocedure,
    'public.link_operation_to_business(uuid,uuid)'::regprocedure,
    'public.verify_operation(uuid,text)'::regprocedure,
    'public.open_operation_access(uuid,text)'::regprocedure
  ]
  loop
    if has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'anon_execute_detected:%', v_function::text;
    end if;
    if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'authenticated_execute_missing:%', v_function::text;
    end if;
  end loop;
end
$guardrails$;
