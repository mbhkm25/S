alter table public.sanad_whatsapp_contacts
  add constraint sanad_whatsapp_contacts_linked_user_id_fkey
  foreign key (linked_user_id) references public.profiles(id) on delete set null;

create or replace function public.claim_whatsapp_contact_for_profile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g');
begin
  if v_phone ~ '^967[0-9]{9}$' then
    update public.sanad_whatsapp_contacts
    set linked_user_id = new.id,
        registration_status = case
          when new.full_name is not null and length(trim(new.full_name)) > 0
            and new.governorate is not null and length(trim(new.governorate)) > 0
          then 'profile_completed'
          else 'registered'
        end,
        onboarding_status = 'registered',
        updated_at = now()
    where phone_normalized = v_phone
      and (linked_user_id is null or linked_user_id = new.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.claim_whatsapp_contact_for_profile() from public, anon, authenticated;

drop trigger if exists claim_whatsapp_contact_after_profile_change on public.profiles;
create trigger claim_whatsapp_contact_after_profile_change
after insert or update of phone, full_name, governorate on public.profiles
for each row execute function public.claim_whatsapp_contact_for_profile();

update public.sanad_whatsapp_contacts c
set linked_user_id = p.id,
    registration_status = case
      when p.full_name is not null and length(trim(p.full_name)) > 0
        and p.governorate is not null and length(trim(p.governorate)) > 0
      then 'profile_completed'
      else 'registered'
    end,
    onboarding_status = 'registered',
    updated_at = now()
from public.profiles p
where c.phone_normalized = regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
  and c.linked_user_id is null;
