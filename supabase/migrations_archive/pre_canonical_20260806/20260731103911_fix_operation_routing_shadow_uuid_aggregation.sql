do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.evaluate_operation_financial_routing_shadow(uuid)'::regprocedure)
  into v_definition;

  v_definition := replace(
    v_definition,
    'max(account_id) filter (where rank_no = 1),
      max(business_id) filter (where rank_no = 1),
      max(strategy) filter (where rank_no = 1)',
    '(array_agg(account_id order by rank_no) filter (where rank_no = 1))[1],
      (array_agg(business_id order by rank_no) filter (where rank_no = 1))[1],
      (array_agg(strategy order by rank_no) filter (where rank_no = 1))[1]'
  );

  execute v_definition;
end $$;

revoke all on function public.evaluate_operation_financial_routing_shadow(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_operation_financial_routing_shadow(uuid) to service_role;

do $$
declare
  v_row record;
begin
  for v_row in
    select id from public.operations
    where ai_status = 'completed' and routing_shadow_status = 'error'
  loop
    begin
      perform public.evaluate_operation_financial_routing_shadow(v_row.id);
    exception when others then
      update public.operations
      set routing_shadow_status = 'error',
          routing_shadow_evaluated_at = now(),
          updated_at = now()
      where id = v_row.id;
    end;
  end loop;
end $$;
