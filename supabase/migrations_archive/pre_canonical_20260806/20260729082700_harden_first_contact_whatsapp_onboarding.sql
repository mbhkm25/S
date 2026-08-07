-- First-contact WhatsApp onboarding reliability
-- Applied to production on 2026-07-29.

create table if not exists private.sanad_worker_tokens (
  worker_name text primary key,
  token_value text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.sanad_worker_tokens(worker_name,token_value,is_active)
values('whatsapp_onboarding',encode(gen_random_bytes(32),'hex'),true)
on conflict(worker_name) do update set is_active=true,updated_at=now();

create or replace function public.get_whatsapp_onboarding_worker_token()
returns text language plpgsql security definer set search_path=''
as $$
declare v text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select token_value into v from private.sanad_worker_tokens where worker_name='whatsapp_onboarding' and is_active;
  return v;
end;$$;

-- The production definition of register_whatsapp_inbound now queues onboarding
-- on the first unique inbound event for an unregistered WhatsApp-only contact,
-- and returns should_send_welcome=true. See production migration history for
-- the complete function body.

create or replace function private.dispatch_whatsapp_onboarding()
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_token text; v_request bigint;
begin
 select token_value into v_token from private.sanad_worker_tokens where worker_name='whatsapp_onboarding' and is_active;
 if v_token is null then return null; end if;
 select net.http_post(
   url := 'https://hudbzlgclghlhazlduas.supabase.co/functions/v1/sanad-v3-whatsapp-onboarding',
   headers := jsonb_build_object('content-type','application/json','x-sanad-worker-token',v_token),
   body := jsonb_build_object('limit',10,'source','database_dispatch')
 ) into v_request;
 return v_request;
end;$$;

create or replace function private.trigger_whatsapp_onboarding_dispatch()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.onboarding_status='queued' and (tg_op='INSERT' or old.onboarding_status is distinct from new.onboarding_status) then
   perform private.dispatch_whatsapp_onboarding();
 end if;
 return new;
end;$$;

drop trigger if exists trg_whatsapp_contact_dispatch_onboarding on public.sanad_whatsapp_contacts;
create trigger trg_whatsapp_contact_dispatch_onboarding
after insert or update of onboarding_status on public.sanad_whatsapp_contacts
for each row execute function private.trigger_whatsapp_onboarding_dispatch();

select cron.unschedule(jobid) from cron.job where command='select private.dispatch_whatsapp_onboarding();';
select cron.schedule('sanad-whatsapp-onboarding-dispatch','* * * * *','select private.dispatch_whatsapp_onboarding();');

-- mark_whatsapp_welcome_result and release_stale_whatsapp_welcome_claims
-- were also hardened in production to track attempts and retry temporary
-- failures with bounded exponential backoff (maximum five attempts).