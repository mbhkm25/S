begin;

alter function public.sanad_payment_requests_before_write() set search_path = pg_catalog, public, auth, extensions;
alter function public.sanad_profiles_before_write() set search_path = pg_catalog, public, auth, extensions;
alter function public.sanad_user_financial_accounts_before_write() set search_path = pg_catalog, public, auth, extensions;
alter function public.sanad_to_latin_digits(text) set search_path = pg_catalog, public;
alter function public.sanad_current_access_month(timestamp with time zone) set search_path = pg_catalog, public;
alter function public.sanad_normalize_yemen_phone(text) set search_path = pg_catalog, public;
alter function public.set_updated_at() set search_path = pg_catalog, public;

commit;;
