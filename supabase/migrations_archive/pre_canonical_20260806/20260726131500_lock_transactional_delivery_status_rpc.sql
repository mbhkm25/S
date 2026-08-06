begin;

revoke all on function public.apply_transactional_whatsapp_delivery_status(text,text,timestamptz,text)
from public, anon, authenticated;

grant execute on function public.apply_transactional_whatsapp_delivery_status(text,text,timestamptz,text)
to service_role;

commit;
