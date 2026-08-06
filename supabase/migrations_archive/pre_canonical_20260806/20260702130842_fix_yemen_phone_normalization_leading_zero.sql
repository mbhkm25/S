create or replace function public.sanad_normalize_yemen_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_phone is null then
    return null;
  end if;

  v := public.sanad_to_latin_digits(p_phone);
  v := regexp_replace(v, '\D', '', 'g');

  if v = '' then
    return null;
  end if;

  if left(v, 5) = '00967' then
    v := substr(v, 3);
  end if;

  if left(v, 4) = '0967' then
    v := substr(v, 2);
  end if;

  if length(v) = 10 and left(v, 1) = '0' then
    v := substr(v, 2);
  end if;

  if length(v) = 9 then
    v := '967' || v;
  end if;

  return v;
end;
$$;

grant execute on function public.sanad_normalize_yemen_phone(text) to authenticated;

notify pgrst, 'reload schema';;
