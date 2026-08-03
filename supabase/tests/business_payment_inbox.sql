begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(required_name) into v_missing
  from unnest(array[
    'business_payment_inbox',
    'business_payment_inbox_events'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  if v_missing is not null then
    raise exception 'missing payment inbox tables: %', v_missing;
  end if;

  if not exists (
    select 1 from pg_policy
    where schemaname='public' and tablename='business_payment_inbox'
      and policyname='business_payment_inbox_select_member'
  ) then
    raise exception 'payment inbox select RLS policy missing';
  end if;

  if has_table_privilege('authenticated','public.business_payment_inbox','INSERT')
     or has_table_privilege('authenticated','public.business_payment_inbox','UPDATE')
     or has_table_privilege('authenticated','public.business_payment_inbox','DELETE') then
    raise exception 'authenticated must not write payment inbox directly';
  end if;

  if not has_table_privilege('authenticated','public.business_payment_inbox','SELECT') then
    raise exception 'authenticated requires RLS-governed SELECT for Realtime';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='business_payment_inbox'
  ) then
    raise exception 'payment inbox is not in supabase_realtime publication';
  end if;

  if (select relreplident from pg_class where oid='public.business_payment_inbox'::regclass) <> 'f' then
    raise exception 'payment inbox requires replica identity full';
  end if;
end $$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'get_my_business_payment_inbox_contexts',
    'get_business_payment_inbox',
    'claim_business_payment',
    'heartbeat_business_payment_claim',
    'release_business_payment',
    'complete_business_payment',
    'reject_business_payment',
    'reassign_business_payment'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name
    ) then
      raise exception 'missing public payment inbox function: %', v_name;
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='enqueue_business_payment_inbox'
  ) then
    raise exception 'internal payment inbox enqueue function missing';
  end if;

  if has_function_privilege('authenticated','private.enqueue_business_payment_inbox(uuid,uuid,uuid,uuid,text,smallint,numeric,text,jsonb,boolean)','EXECUTE') then
    raise exception 'authenticated must not execute internal payment enqueue';
  end if;
end $$;

rollback;
