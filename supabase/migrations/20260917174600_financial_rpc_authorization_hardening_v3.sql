create or replace function public.is_business_owner_v1(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(exists (
    select 1
    from public.business_profiles b
    where b.id = p_business_id
      and b.owner_user_id = auth.uid()
  ), false);
$function$;

revoke all on function public.is_business_owner_v1(uuid) from public;
grant execute on function public.is_business_owner_v1(uuid) to authenticated;

create or replace function public.can_access_business_financial_v1(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    exists (
      select 1
      from public.business_profiles b
      where b.id = p_business_id
        and b.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.business_team_members m
      where m.business_id = p_business_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    ),
    false
  );
$function$;

revoke all on function public.can_access_business_financial_v1(uuid) from public;
grant execute on function public.can_access_business_financial_v1(uuid) to authenticated;

-- Keep the authenticated RPC surface independent from schema private.
-- This avoids granting broad USAGE on private just to execute these contracts.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.create_business_commercial_draft_v1(jsonb)'::regprocedure)
    into v_definition;
  if position('private.user_is_business_owner(v_business,v_user)' in v_definition) = 0 then
    raise exception 'create_business_commercial_draft_v1 authorization expression not found';
  end if;
  v_definition := replace(
    v_definition,
    'private.user_is_business_owner(v_business,v_user)',
    'public.is_business_owner_v1(v_business)'
  );
  execute v_definition;

  select pg_get_functiondef('public.post_business_commercial_document_v1(uuid)'::regprocedure)
    into v_definition;
  if position('private.user_is_business_owner(v_doc.business_id,v_user)' in v_definition) = 0 then
    raise exception 'post_business_commercial_document_v1 authorization expression not found';
  end if;
  v_definition := replace(
    v_definition,
    'private.user_is_business_owner(v_doc.business_id,v_user)',
    'public.is_business_owner_v1(v_doc.business_id)'
  );
  execute v_definition;

  select pg_get_functiondef('public.get_ai_financial_context_v1(text,uuid,date,date,integer)'::regprocedure)
    into v_definition;
  if position('private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)',
      'public.can_access_business_financial_v1(p_business_id)'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.get_ai_financial_context_v2(text,uuid,date,date,integer,text)'::regprocedure)
    into v_definition;
  if position('private.user_is_business_owner(p_business_id,v_user)' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'private.user_is_business_owner(p_business_id,v_user)\n    or private.user_is_active_business_member(p_business_id,v_user)',
      'public.can_access_business_financial_v1(p_business_id)'
    );
    execute v_definition;
  end if;
end;
$migration$;

-- Restore the intended callable surface after CREATE OR REPLACE.
revoke all on function public.create_business_commercial_draft_v1(jsonb) from public;
grant execute on function public.create_business_commercial_draft_v1(jsonb) to authenticated;
revoke all on function public.post_business_commercial_document_v1(uuid) from public;
grant execute on function public.post_business_commercial_document_v1(uuid) to authenticated;
revoke all on function public.get_ai_financial_context_v1(text,uuid,date,date,integer) from public;
revoke all on function public.get_ai_financial_context_v1(text,uuid,date,date,integer) from authenticated;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from public;
revoke all on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) from anon;
grant execute on function public.get_ai_financial_context_v2(text,uuid,date,date,integer,text) to authenticated;