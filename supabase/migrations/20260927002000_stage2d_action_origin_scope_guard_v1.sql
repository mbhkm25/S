-- Stage 2D.0 — immutable, canonical action provenance guard.
-- This is additive and intentionally leaves the existing action create/approve
-- RPC signatures and deterministic execution handlers unchanged.
-- Before allowing a new persisted draft, require a server-classified source
-- project that matches the action type, actor, and business exactly.
-- Do not use the browser's selected project as authorization.

create or replace function private.sanad_agent_action_origin_guard_v1()
returns trigger
language plpgsql security definer set search_path=''
as $guard$
declare
  v_thread public.sanad_agent_threads%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.user_id,new.thread_id,new.business_id,new.action_type)
       is distinct from
       (old.user_id,old.thread_id,old.business_id,old.action_type) then
      raise exception 'agent_action_origin_immutable' using errcode='42501';
    end if;
    return new;
  end if;

  select * into v_thread
  from public.sanad_agent_threads
  where id=new.thread_id and user_id=new.user_id and status='active';

  if not found then
    raise exception 'agent_action_thread_invalid' using errcode='42501';
  end if;

  if new.action_type='personal_transaction' then
    if v_thread.project_kind<>'personal' or
       v_thread.business_id is not null or
       new.business_id is not null then
      raise exception 'agent_action_personal_project_required' using errcode='42501';
    end if;
  elsif new.action_type='commercial_document_draft' then
    if v_thread.project_kind<>'business' or
       v_thread.business_id is null or
       new.business_id is distinct from v_thread.business_id then
      raise exception 'agent_action_business_project_mismatch' using errcode='42501';
    end if;
  else
    raise exception 'agent_action_type_not_allowed' using errcode='22023';
  end if;
  return new;
end;
$guard$;

revoke all on function private.sanad_agent_action_origin_guard_v1()
  from public,anon,authenticated;

-- Fail closed instead of silently rewriting legacy draft origins. Historical
-- actions remain immutable and require separate explicitly reviewed repair if
-- any mismatch appears during deployment.
do $preflight$
begin
  if exists(
    select 1 from public.sanad_agent_actions a
    left join public.sanad_agent_threads t
      on t.id=a.thread_id and t.user_id=a.user_id
    where t.id is null
      or (a.action_type='personal_transaction' and (
        t.project_kind is distinct from 'personal'
        or t.business_id is not null or a.business_id is not null))
      or (a.action_type='commercial_document_draft' and (
        t.project_kind is distinct from 'business'
        or t.business_id is null
        or a.business_id is distinct from t.business_id))
  ) then
    raise exception 'existing_agent_action_origin_requires_review'
      using errcode='42501';
  end if;
end;
$preflight$;

drop trigger if exists sanad_agent_action_origin_guard_v1 on public.sanad_agent_actions;
create trigger sanad_agent_action_origin_guard_v1
  before insert or update on public.sanad_agent_actions
  for each row execute function private.sanad_agent_action_origin_guard_v1();

comment on function private.sanad_agent_action_origin_guard_v1() is
  'Stage 2D.0: enforce canonical persisted action project/biz/actor binding and immutable origin independently of conversation/form/model entry paths.';
