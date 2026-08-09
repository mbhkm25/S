-- Native Android push support alongside existing Web Push subscriptions.
-- Keeps one delivery/outbox model while allowing FCM-backed Android targets.

alter table public.push_subscriptions
  add column if not exists provider text not null default 'web_push',
  add column if not exists provider_token text,
  add column if not exists app_version text;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform = any (array['web'::text,'pwa'::text,'android'::text]));

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_provider_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_provider_check
  check (provider = any (array['web_push'::text,'fcm'::text]));

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_provider_contract_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_provider_contract_check
  check (
    (provider='web_push' and platform in ('web','pwa') and provider_token is null)
    or
    (provider='fcm' and platform='android' and provider_token is not null and length(provider_token) between 20 and 4096)
  );

create unique index if not exists push_subscriptions_fcm_token_uidx
on public.push_subscriptions(provider, provider_token)
where provider='fcm' and provider_token is not null;

create or replace function public.upsert_my_native_push_device(
  p_token text,
  p_device_label text default null,
  p_app_version text default null,
  p_permission_state text default 'granted'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_token,''));
  v_permission text := lower(btrim(coalesce(p_permission_state,'granted')));
  v_endpoint text;
  v_row public.push_subscriptions%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if length(v_token) < 20 or length(v_token) > 4096 then raise exception 'invalid_fcm_token'; end if;
  if v_permission not in ('granted','denied','default') then raise exception 'invalid_push_permission_state'; end if;
  if p_device_label is not null and length(btrim(p_device_label)) > 160 then raise exception 'invalid_push_device_label'; end if;
  if p_app_version is not null and length(btrim(p_app_version)) > 80 then raise exception 'invalid_push_app_version'; end if;

  v_endpoint := 'https://fcm.sanadflow.invalid/subscription/' ||
    encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex');

  insert into public.push_subscriptions as s(
    user_id,endpoint,p256dh,auth_secret,content_encoding,platform,provider,provider_token,
    user_agent,device_label,app_version,permission_state,is_active,last_seen_at,
    failure_count,last_failure_at,last_error_code,updated_at
  ) values (
    v_user_id,v_endpoint,'native-fcm-placeholder-key','native-fcm-auth','aes128gcm','android','fcm',v_token,
    'SANAD Android',nullif(btrim(coalesce(p_device_label,'')),''),nullif(btrim(coalesce(p_app_version,'')),''),
    v_permission,v_permission='granted',now(),0,null,null,now()
  )
  on conflict(endpoint) do update set
    user_id=excluded.user_id,
    platform='android',provider='fcm',provider_token=excluded.provider_token,
    user_agent=excluded.user_agent,device_label=excluded.device_label,app_version=excluded.app_version,
    permission_state=excluded.permission_state,is_active=excluded.is_active,last_seen_at=now(),
    failure_count=0,last_failure_at=null,last_error_code=null,updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'subscription_id',v_row.id,'platform',v_row.platform,'provider',v_row.provider,
    'permission_state',v_row.permission_state,'is_active',v_row.is_active,'updated_at',v_row.updated_at
  );
end;
$function$;

create or replace function public.deactivate_my_native_push_device(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  update public.push_subscriptions
  set is_active=false,permission_state='default',updated_at=now()
  where user_id=v_user_id and provider='fcm' and provider_token=btrim(coalesce(p_token,'')) and is_active=true;
  get diagnostics v_count=row_count;
  return jsonb_build_object('ok',true,'affected_count',v_count);
end;
$function$;

-- Keep the established worker RPC shape intact. For FCM targets the internal
-- endpoint identifies the provider and p256dh carries the token to the provider-aware sender.
drop function if exists public.get_push_delivery_targets(uuid,text);
create function public.get_push_delivery_targets(p_outbox_id uuid,p_worker_id text)
returns table(
  subscription_id uuid,endpoint text,p256dh text,auth_secret text,content_encoding text,
  platform text,failure_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_recipient_user_id uuid;
begin
  p_worker_id:=btrim(coalesce(p_worker_id,''));
  if p_outbox_id is null or length(p_worker_id)<1 or length(p_worker_id)>200 then raise exception 'invalid_worker_request'; end if;

  select o.recipient_user_id into v_recipient_user_id
  from public.push_outbox o
  where o.id=p_outbox_id and o.status='processing' and o.locked_by=p_worker_id and o.locked_at is not null;
  if v_recipient_user_id is null then raise exception 'push_outbox_lock_not_owned'; end if;

  return query
  select
    s.id,
    s.endpoint,
    case when s.provider='fcm' then s.provider_token else s.p256dh end,
    s.auth_secret,
    s.content_encoding,
    case when s.provider='fcm' then 'pwa'::text else s.platform end,
    s.failure_count
  from public.push_subscriptions s
  where s.user_id=v_recipient_user_id and s.is_active=true and s.permission_state='granted'
    and not exists(
      select 1 from public.push_delivery_attempts a
      join public.push_outbox o2 on o2.id=a.outbox_id
      where a.subscription_id=s.id and a.status='sent' and o2.id=p_outbox_id and a.notification_id=o2.notification_id
    )
  order by s.updated_at desc,s.id;
end;
$function$;

revoke all on function public.upsert_my_native_push_device(text,text,text,text) from public,anon;
grant execute on function public.upsert_my_native_push_device(text,text,text,text) to authenticated;
revoke all on function public.deactivate_my_native_push_device(text) from public,anon;
grant execute on function public.deactivate_my_native_push_device(text) to authenticated;
revoke all on function public.get_push_delivery_targets(uuid,text) from public,anon,authenticated;
grant execute on function public.get_push_delivery_targets(uuid,text) to service_role;
