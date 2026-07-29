-- Basic profile completion means required signup data is present.
-- Phone ownership verification remains a separate security state.

create or replace function public.sanad_profiles_before_write()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public', 'auth', 'extensions'
as $$
declare
  v_effective_phone text;
begin
  new.full_name := nullif(trim(coalesce(new.full_name, '')), '');
  new.governorate := nullif(trim(coalesce(new.governorate, '')), '');
  new.phone := public.sanad_normalize_yemen_phone(new.phone);
  new.pending_phone := case
    when nullif(trim(coalesce(new.pending_phone, '')), '') is null then null
    else regexp_replace(new.pending_phone, '[^0-9]', '', 'g')
  end;

  v_effective_phone := coalesce(new.phone, new.pending_phone);

  if new.full_name is not null
     and v_effective_phone ~ '^967[0-9]{9}$'
     and new.governorate is not null then
    new.profile_completed_at := coalesce(new.profile_completed_at, now());
  else
    new.profile_completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sanad_user_has_basic_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.status = 'active'
      and nullif(trim(p.full_name), '') is not null
      and coalesce(p.phone, p.pending_phone) ~ '^967[0-9]{9}$'
      and nullif(trim(p.governorate), '') is not null
  );
$$;

create or replace function public.get_my_profile_completion()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_profile record;
  v_accounts_count integer;
  v_basic_complete boolean;
  v_effective_phone text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select id, full_name, phone, pending_phone, governorate, profile_completed_at,
         phone_verification_status, phone_verified_at
  into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  select count(*) into v_accounts_count
  from public.user_financial_accounts
  where user_id = auth.uid() and status = 'active';

  v_effective_phone := coalesce(v_profile.phone, v_profile.pending_phone);
  v_basic_complete := v_profile.id is not null
    and nullif(trim(v_profile.full_name), '') is not null
    and v_effective_phone ~ '^967[0-9]{9}$'
    and nullif(trim(v_profile.governorate), '') is not null;

  return jsonb_build_object(
    'basic_profile_complete', coalesce(v_basic_complete, false),
    'phone_ownership_verified', v_profile.phone_verification_status = 'verified' and v_profile.phone is not null,
    'financial_accounts_count', coalesce(v_accounts_count, 0),
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'phone', v_effective_phone,
      'verified_phone', v_profile.phone,
      'pending_phone', v_profile.pending_phone,
      'governorate', v_profile.governorate,
      'profile_completed_at', v_profile.profile_completed_at,
      'phone_verification_status', v_profile.phone_verification_status,
      'phone_verified_at', v_profile.phone_verified_at
    )
  );
end;
$$;

update public.profiles
set profile_completed_at = coalesce(profile_completed_at, created_at, now()),
    updated_at = now()
where nullif(trim(full_name), '') is not null
  and coalesce(phone, pending_phone) ~ '^967[0-9]{9}$'
  and nullif(trim(governorate), '') is not null
  and profile_completed_at is null;

update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('profile_completed', true),
    updated_at = now()
from public.profiles p
where p.id = u.id
  and public.sanad_user_has_basic_profile(p.id)
  and coalesce((u.raw_user_meta_data->>'profile_completed')::boolean, false) = false;
