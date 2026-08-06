begin;

create or replace function public.sync_operation_temporal_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
  v_date_text text;
  v_time_present boolean := false;
  v_date_source text;
  v_local_timestamp timestamp;
begin
  v_raw := coalesce(
    nullif(new.structured_data ->> 'transaction_datetime', ''),
    nullif(new.raw_ai_json #>> '{normalized,transaction_datetime}', ''),
    nullif(new.raw_ai_json #>> '{extracted,transaction_datetime}', '')
  );

  begin
    v_time_present := coalesce(
      (new.structured_data ->> 'transaction_time_present')::boolean,
      (new.raw_ai_json #>> '{normalized,transaction_time_present}')::boolean,
      (new.raw_ai_json #>> '{extracted,transaction_time_present}')::boolean,
      false
    );
  exception when others then
    v_time_present := false;
  end;

  v_date_source := coalesce(
    nullif(new.structured_data ->> 'transaction_date_source', ''),
    nullif(new.raw_ai_json #>> '{normalized,transaction_date_source}', ''),
    nullif(new.raw_ai_json #>> '{extracted,transaction_date_source}', ''),
    case when new.transaction_datetime is not null then 'legacy_datetime' else null end
  );

  if v_raw ~ '^\d{4}-\d{2}-\d{2}' then
    v_date_text := substring(v_raw from 1 for 10);
    new.transaction_date := v_date_text::date;
  elsif new.transaction_date is null and new.transaction_datetime is not null then
    new.transaction_date := (new.transaction_datetime at time zone 'Asia/Aden')::date;
  end if;

  if v_time_present and v_raw ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?' then
    if v_raw ~ '([+-]\d{2}:?\d{2}|Z)$' then
      new.transaction_datetime := v_raw::timestamptz;
      v_local_timestamp := new.transaction_datetime at time zone 'Asia/Aden';
    else
      v_local_timestamp := replace(v_raw, 'T', ' ')::timestamp;
      new.transaction_datetime := v_local_timestamp at time zone 'Asia/Aden';
    end if;

    new.transaction_date := v_local_timestamp::date;
    new.transaction_time := v_local_timestamp::time;
    new.transaction_time_present := true;
    new.transaction_timezone := 'Asia/Aden';
    new.transaction_date_source := coalesce(v_date_source, 'explicit_datetime');
  else
    -- Date-only source: preserve the date while explicitly refusing to invent time.
    new.transaction_time := null;
    new.transaction_time_present := false;
    new.transaction_timezone := null;
    new.transaction_date_source := v_date_source;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_operation_temporal_fields() from public, anon, authenticated;
grant execute on function public.sync_operation_temporal_fields() to postgres, service_role;

drop trigger if exists trg_sync_operation_temporal_fields on public.operations;
create trigger trg_sync_operation_temporal_fields
before insert or update of structured_data, raw_ai_json, transaction_datetime
on public.operations
for each row
execute function public.sync_operation_temporal_fields();

-- Re-run synchronization for existing rows after installing the canonical trigger.
update public.operations
set structured_data = structured_data
where transaction_datetime is not null
   or structured_data ? 'transaction_datetime'
   or raw_ai_json #> '{normalized,transaction_datetime}' is not null
   or raw_ai_json #> '{extracted,transaction_datetime}' is not null;

commit;
