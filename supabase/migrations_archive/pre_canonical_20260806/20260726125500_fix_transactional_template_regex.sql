begin;

alter table public.sanad_transactional_message_rules
  drop constraint if exists sanad_transactional_rule_template_check;

alter table public.sanad_transactional_message_rules
  add constraint sanad_transactional_rule_template_check check (
    template_name is null or (
      length(template_name) between 1 and 512
      and template_name ~ '^[a-z0-9_]+$'
    )
  );

create or replace function public.platform_admin_update_transactional_message_rule(
  p_event_type text,
  p_enabled boolean,
  p_template_name text,
  p_template_language text,
  p_parameter_keys jsonb,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_template text := trim(coalesce(p_template_name,''));
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'platform_admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'admin_reason_required'; end if;
  if p_enabled and (length(v_template) not between 1 and 512 or v_template !~ '^[a-z0-9_]+$') then
    raise exception 'approved_template_required';
  end if;
  if jsonb_typeof(coalesce(p_parameter_keys,'[]'::jsonb))<>'array' then raise exception 'invalid_parameter_keys'; end if;
  select to_jsonb(r) into v_before from public.sanad_transactional_message_rules r where event_type=p_event_type for update;
  if not found then raise exception 'rule_not_found'; end if;
  update public.sanad_transactional_message_rules set
    enabled=coalesce(p_enabled,false),
    template_name=nullif(v_template,''),
    template_language=coalesce(nullif(trim(p_template_language),''),'ar'),
    parameter_keys=coalesce(p_parameter_keys,'[]'::jsonb),
    updated_by=auth.uid(),
    updated_at=now()
  where event_type=p_event_type
  returning to_jsonb(sanad_transactional_message_rules) into v_after;
  insert into public.platform_admin_audit_log(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
  values(auth.uid(),'transactional_message_rule_updated','transactional_message_rule',p_event_type,trim(p_reason),v_before,v_after);
end;
$$;

commit;
