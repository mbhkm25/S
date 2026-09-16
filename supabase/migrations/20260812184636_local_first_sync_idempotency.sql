create unique index if not exists operations_local_sync_idempotency_uidx
  on public.operations ((client_upload_metadata ->> 'sync_idempotency_key'))
  where nullif(client_upload_metadata ->> 'sync_idempotency_key', '') is not null;

comment on index public.operations_local_sync_idempotency_uidx is
  'Guarantees exactly one canonical cloud operation per SANAD local-first sync idempotency key.';
