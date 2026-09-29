-- SANAD ChatGPT production pilot: additive, default-deny per-owner/business/client grants.
-- Never seed real access here. Revocation is immediate via enabled=false.
create table if not exists private.sanad_chatgpt_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  oauth_client_id text not null check (length(oauth_client_id) between 16 and 160),
  permission text not null check (permission in ('businesses:read','sync:read','customers:read','statements:read')),
  enabled boolean not null default false,
  expires_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_user_id,business_id,oauth_client_id,permission),
  check (not enabled or approved_at is not null)
);
revoke all on private.sanad_chatgpt_access_grants from public,anon,authenticated;
alter table private.sanad_chatgpt_access_grants enable row level security;
-- No self-service INSERT/UPDATE/DELETE policies. Grant provisioning is owner-reviewed admin workflow only.

create or replace function public.sanad_chatgpt_is_allowed_v1(
  p_business_id uuid,
  p_oauth_client_id text,
  p_permission text
) returns boolean language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and p_permission in ('businesses:read','sync:read','customers:read','statements:read')
    and exists (
      select 1
      from private.sanad_chatgpt_access_grants g
      join public.business_profiles b
        on b.id = g.business_id and b.owner_user_id = g.owner_user_id
      where g.owner_user_id = auth.uid()
        and g.business_id = p_business_id
        and g.oauth_client_id = p_oauth_client_id
        and g.permission = p_permission
        and g.enabled = true
        and g.approved_at is not null
        and g.expires_at > now()
    ), false
  );
$$;
revoke all on function public.sanad_chatgpt_is_allowed_v1(uuid,text,text) from public,anon;
grant execute on function public.sanad_chatgpt_is_allowed_v1(uuid,text,text) to authenticated;

create or replace function public.sanad_chatgpt_list_permitted_businesses_v1(
  p_oauth_client_id text
) returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('business_id', b.id, 'name', b.name)
    order by b.name
  ),'[]'::jsonb)
  from (
    select distinct b.id,b.name
    from private.sanad_chatgpt_access_grants g
    join public.business_profiles b on b.id=g.business_id and b.owner_user_id=g.owner_user_id
    where auth.uid() is not null
      and g.owner_user_id=auth.uid()
      and g.oauth_client_id=p_oauth_client_id
      and g.permission='businesses:read'
      and g.enabled=true
      and g.approved_at is not null
      and g.expires_at > now()
    order by b.name
    limit 10
  ) b;
$$;
revoke all on function public.sanad_chatgpt_list_permitted_businesses_v1(text) from public,anon;
grant execute on function public.sanad_chatgpt_list_permitted_businesses_v1(text) to authenticated;

comment on table private.sanad_chatgpt_access_grants is
  'Default-deny owner-per-business-per-client-permission ChatGPT pilot grants; no self-service mutation.';
