-- Prevent authenticated clients from changing profile authority fields directly.
-- `global_role` and `status` are authorization inputs used by platform-admin and
-- business access checks, so they must only be changed by privileged server flows.

create or replace function private.protect_profile_authority_fields()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user in ('anon','authenticated') then
    if tg_op = 'INSERT' then
      if coalesce(new.global_role,'user') <> 'user'
         or coalesce(new.status,'active') <> 'active' then
        raise exception 'profile_authority_fields_managed_by_privileged_flow' using errcode='42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.global_role is distinct from old.global_role
         or new.status is distinct from old.status then
        raise exception 'profile_authority_fields_managed_by_privileged_flow' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_profile_authority_fields on public.profiles;
create trigger protect_profile_authority_fields
before insert or update on public.profiles
for each row execute function private.protect_profile_authority_fields();

revoke all on function private.protect_profile_authority_fields() from public, anon, authenticated;
