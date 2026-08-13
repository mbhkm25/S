-- Prevent a second auth identity from being created for a phone number that is
-- already owned by, or pending verification for, another SANAD profile.
--
-- The advisory transaction lock serializes concurrent signups for the same
-- normalized phone so two requests cannot both pass the pre-insert check.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text;
begin
  begin
    v_phone := private.normalize_sanad_phone(coalesce(new.phone, new.raw_user_meta_data->>'phone'));
  exception when others then
    v_phone := null;
  end;

  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_phone, 0));

    if exists (
      select 1
      from public.profiles p
      where p.id <> new.id
        and (p.phone = v_phone or p.pending_phone = v_phone)
    ) then
      raise exception 'phone_identity_already_in_use' using errcode = '23505';
    end if;
  end if;

  insert into public.profiles (
    id, full_name, phone, pending_phone, phone_verification_status,
    governorate, status, phone_verification_updated_at
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    null,
    v_phone,
    case when v_phone is null then 'unverified' else 'pending' end,
    nullif(trim(new.raw_user_meta_data->>'governorate'), ''),
    'active',
    now()
  )
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      governorate = coalesce(public.profiles.governorate, excluded.governorate),
      pending_phone = case
        when public.profiles.phone is null then coalesce(public.profiles.pending_phone, excluded.pending_phone)
        else public.profiles.pending_phone
      end,
      phone_verification_status = case
        when public.profiles.phone is not null then 'verified'
        else excluded.phone_verification_status
      end,
      updated_at = now();

  if v_phone is not null and not exists (
    select 1
    from public.verified_phone_identities
    where user_id = new.id
      and phone_normalized = v_phone
  ) then
    perform private.queue_phone_verification_claim(new.id, v_phone, 'auth_signup');
  end if;

  return new;
end;
$function$;
