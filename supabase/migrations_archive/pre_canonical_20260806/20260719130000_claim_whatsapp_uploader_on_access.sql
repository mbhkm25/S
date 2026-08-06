-- Claim WhatsApp-originated uploads for the authenticated SANAD account whose
-- profile phone matches the original WhatsApp sender phone.
--
-- This keeps viewing and verification semantically separate: the trigger only
-- fills the existing uploader relation and never creates a verifier relation.

create or replace function public.claim_whatsapp_uploader_link_from_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_phone text;
  v_submitted_phone text;
begin
  select
    regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'),
    regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g')
  into v_profile_phone, v_submitted_phone
  from public.profiles p
  join public.operations o on o.id = new.operation_id
  where p.id = new.user_id;

  if coalesce(v_profile_phone, '') = ''
     or coalesce(v_submitted_phone, '') = ''
     or v_profile_phone <> v_submitted_phone then
    return new;
  end if;

  update public.operation_user_links l
  set
    user_id = new.user_id,
    last_seen_at = greatest(
      coalesce(l.last_seen_at, l.created_at, new.last_accessed_at),
      new.last_accessed_at
    )
  where l.operation_id = new.operation_id
    and l.relation_type = 'uploader'
    and l.user_id is null
    and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = v_profile_phone;

  return new;
end;
$$;

revoke all on function public.claim_whatsapp_uploader_link_from_access() from public;

 drop trigger if exists trg_claim_whatsapp_uploader_link_from_access
 on public.operation_access_logs;

create trigger trg_claim_whatsapp_uploader_link_from_access
after insert or update of last_accessed_at on public.operation_access_logs
for each row
execute function public.claim_whatsapp_uploader_link_from_access();

-- Backfill already-accessed WhatsApp uploads where the signed-in profile phone
-- proves ownership of the existing uploader relation.
update public.operation_user_links l
set
  user_id = a.user_id,
  last_seen_at = greatest(
    coalesce(l.last_seen_at, l.created_at, a.last_accessed_at),
    a.last_accessed_at
  )
from public.operation_access_logs a
join public.operations o on o.id = a.operation_id
join public.profiles p on p.id = a.user_id
where l.operation_id = a.operation_id
  and l.relation_type = 'uploader'
  and l.user_id is null
  and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') <> ''
  and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') =
      regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g')
  and regexp_replace(coalesce(o.submitted_by_phone, ''), '[^0-9]', '', 'g') =
      regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g');