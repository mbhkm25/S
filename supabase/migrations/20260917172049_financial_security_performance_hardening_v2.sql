create index if not exists idx_business_commercial_settlements_party_fk
  on public.business_commercial_settlements(party_id);

-- The AI context reader does not need elevated table privileges. Keep it SECURITY INVOKER
-- and allow users to append only audit rows that are scoped to their own auth.uid().
drop policy if exists ai_financial_context_access_log_insert_own on public.ai_financial_context_access_log;
create policy ai_financial_context_access_log_insert_own on public.ai_financial_context_access_log
  for insert with check ((select auth.uid()) = user_id);

grant insert on public.ai_financial_context_access_log to authenticated;

create or replace function public.get_ai_financial_context_v2(
  p_scope_kind text default 'personal',
  p_business_id uuid default null,
  p_from date default (current_date-30),
  p_to date default current_date,
  p_limit integer default 50,
  p_purpose text default 'assistant_query'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_context jsonb;
  v_log_id uuid;
  v_scope text := lower(btrim(coalesce(p_scope_kind,'personal')));
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if v_scope not in ('personal','business') then raise exception 'invalid_scope_kind'; end if;
  if p_to < p_from then raise exception 'invalid_date_range'; end if;
  if v_scope='personal' then p_business_id := null; end if;
  if v_scope='business' and p_business_id is null then raise exception 'business_id_required'; end if;
  if v_scope='business' and not (
    private.user_is_business_owner(p_business_id,v_user)
    or private.user_is_active_business_member(p_business_id,v_user)
  ) then raise exception 'business_access_denied'; end if;

  v_context := public.get_ai_financial_context_v1(v_scope,p_business_id,p_from,p_to,p_limit);

  insert into public.ai_financial_context_access_log(
    user_id,scope_kind,business_id,period_from,period_to,result_contract_version,purpose,metadata
  ) values (
    v_user,v_scope,p_business_id,p_from,p_to,2,left(nullif(btrim(coalesce(p_purpose,'')),''),120),
    jsonb_build_object('limit',greatest(1,least(coalesce(p_limit,50),200)),'source','get_ai_financial_context_v2')
  ) returning id into v_log_id;

  return jsonb_build_object(
    'contract_version',2,
    'access_log_id',v_log_id,
    'context',v_context
  );
end;
$function$;

revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from public;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from anon;
grant execute on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) to authenticated;
