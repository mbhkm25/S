begin;

create or replace function public.sync_operation_received_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_meta_timestamp_text text;
  v_meta_timestamp numeric;
begin
  if new.source = 'whatsapp' or new.upload_origin = 'whatsapp' then
    v_meta_timestamp_text := coalesce(
      nullif(new.raw_webhook_json #>> '{entry,0,changes,0,value,messages,0,timestamp}', ''),
      nullif(new.storage_metadata ->> 'whatsapp_timestamp', ''),
      nullif(new.client_upload_metadata ->> 'whatsapp_timestamp', '')
    );

    begin
      v_meta_timestamp := v_meta_timestamp_text::numeric;
    exception when others then
      v_meta_timestamp := null;
    end;

    if v_meta_timestamp is not null and v_meta_timestamp > 0 then
      new.received_at := to_timestamp(v_meta_timestamp);
    else
      new.received_at := coalesce(new.received_at, new.created_at, now());
    end if;
  else
    new.received_at := coalesce(new.received_at, new.created_at, now());
  end if;

  new.received_timezone := 'Asia/Aden';
  return new;
end;
$$;

revoke all on function public.sync_operation_received_at() from public, anon, authenticated;
grant execute on function public.sync_operation_received_at() to postgres, service_role;

drop trigger if exists trg_sync_operation_received_at on public.operations;
create trigger trg_sync_operation_received_at
before insert or update of raw_webhook_json, storage_metadata, client_upload_metadata, source, upload_origin
on public.operations
for each row
execute function public.sync_operation_received_at();

update public.operations
set raw_webhook_json = raw_webhook_json
where source = 'whatsapp' or upload_origin = 'whatsapp';

commit;
