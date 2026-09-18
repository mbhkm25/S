-- Replace private-schema authorization dependencies in the new financial/commercial surface.
-- Do not grant authenticated broad USAGE on schema private.

drop policy if exists business_commercial_documents_select_member on public.business_commercial_documents;
create policy business_commercial_documents_select_member on public.business_commercial_documents
  for select using (public.can_access_business_financial_v1(business_id));
drop policy if exists business_commercial_documents_owner_insert on public.business_commercial_documents;
create policy business_commercial_documents_owner_insert on public.business_commercial_documents
  for insert with check (public.is_business_owner_v1(business_id));
drop policy if exists business_commercial_documents_owner_update on public.business_commercial_documents;
create policy business_commercial_documents_owner_update on public.business_commercial_documents
  for update using (public.is_business_owner_v1(business_id))
  with check (public.is_business_owner_v1(business_id));
drop policy if exists business_commercial_documents_owner_delete on public.business_commercial_documents;
create policy business_commercial_documents_owner_delete on public.business_commercial_documents
  for delete using (public.is_business_owner_v1(business_id));

drop policy if exists business_commercial_document_lines_select_member on public.business_commercial_document_lines;
create policy business_commercial_document_lines_select_member on public.business_commercial_document_lines
  for select using (public.can_access_business_financial_v1(business_id));
drop policy if exists business_commercial_document_lines_owner_insert on public.business_commercial_document_lines;
create policy business_commercial_document_lines_owner_insert on public.business_commercial_document_lines
  for insert with check (public.is_business_owner_v1(business_id));
drop policy if exists business_commercial_document_lines_owner_update on public.business_commercial_document_lines;
create policy business_commercial_document_lines_owner_update on public.business_commercial_document_lines
  for update using (public.is_business_owner_v1(business_id))
  with check (public.is_business_owner_v1(business_id));
drop policy if exists business_commercial_document_lines_owner_delete on public.business_commercial_document_lines;
create policy business_commercial_document_lines_owner_delete on public.business_commercial_document_lines
  for delete using (public.is_business_owner_v1(business_id));

drop policy if exists business_party_ledger_entries_select_member on public.business_party_ledger_entries;
create policy business_party_ledger_entries_select_member on public.business_party_ledger_entries
  for select using (public.can_access_business_financial_v1(business_id));
drop policy if exists business_party_ledger_entries_owner_insert on public.business_party_ledger_entries;
create policy business_party_ledger_entries_owner_insert on public.business_party_ledger_entries
  for insert with check (public.is_business_owner_v1(business_id));
drop policy if exists business_party_ledger_entries_owner_update on public.business_party_ledger_entries;
create policy business_party_ledger_entries_owner_update on public.business_party_ledger_entries
  for update using (public.is_business_owner_v1(business_id))
  with check (public.is_business_owner_v1(business_id));
drop policy if exists business_party_ledger_entries_owner_delete on public.business_party_ledger_entries;
create policy business_party_ledger_entries_owner_delete on public.business_party_ledger_entries
  for delete using (public.is_business_owner_v1(business_id));

drop policy if exists business_commercial_settlements_select_member on public.business_commercial_settlements;
create policy business_commercial_settlements_select_member on public.business_commercial_settlements
  for select using (public.can_access_business_financial_v1(business_id));
drop policy if exists business_commercial_settlements_owner_insert on public.business_commercial_settlements;
create policy business_commercial_settlements_owner_insert on public.business_commercial_settlements
  for insert with check (public.is_business_owner_v1(business_id));
drop policy if exists business_commercial_settlements_owner_update on public.business_commercial_settlements;
create policy business_commercial_settlements_owner_update on public.business_commercial_settlements
  for update using (public.is_business_owner_v1(business_id))
  with check (public.is_business_owner_v1(business_id));

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.settle_business_commercial_document_v1(uuid,uuid,numeric)'::regprocedure) into v_definition;
  if position('private.user_is_business_owner(v_invoice.business_id,v_user)' in v_definition) > 0 then
    v_definition := replace(v_definition,'private.user_is_business_owner(v_invoice.business_id,v_user)','public.is_business_owner_v1(v_invoice.business_id)');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.get_business_commercial_dashboard_v1(uuid,date,date)'::regprocedure) into v_definition;
  if position('private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)' in v_definition) > 0 then
    v_definition := replace(v_definition,'private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)','public.can_access_business_financial_v1(p_business_id)');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.get_business_party_statement_v1(uuid,uuid,text,integer)'::regprocedure) into v_definition;
  if position('private.user_is_business_owner(p_business_id,auth.uid()) or private.user_is_active_business_member(p_business_id,auth.uid())' in v_definition) > 0 then
    v_definition := replace(v_definition,'private.user_is_business_owner(p_business_id,auth.uid()) or private.user_is_active_business_member(p_business_id,auth.uid())','public.can_access_business_financial_v1(p_business_id)');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.get_ai_financial_context_v2(text,uuid,date,date,integer,text)'::regprocedure) into v_definition;
  if position('private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)' in v_definition) > 0 then
    v_definition := replace(v_definition,'private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)','public.can_access_business_financial_v1(p_business_id)');
    execute v_definition;
  end if;
end;
$migration$;

revoke all on function public.settle_business_commercial_document_v1(uuid,uuid,numeric) from public;
grant execute on function public.settle_business_commercial_document_v1(uuid,uuid,numeric) to authenticated;
revoke all on function public.get_business_commercial_dashboard_v1(uuid,date,date) from public;
grant execute on function public.get_business_commercial_dashboard_v1(uuid,date,date) to authenticated;
revoke all on function public.get_business_party_statement_v1(uuid,uuid,text,integer) from public;
grant execute on function public.get_business_party_statement_v1(uuid,uuid,text,integer) to authenticated;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from public;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from anon;
grant execute on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) to authenticated;