-- SANAD React Local-first: server-side uniqueness for promoted local operations.
--
-- The local runtime retries promotion after network/process failures. A durable
-- sync key is therefore part of the canonical cloud contract, not merely
-- client metadata. The partial unique index prevents concurrent/replayed
-- clients from creating more than one cloud operation for the same local
-- operation + original-file hash.

create unique index if not exists operations_local_sync_idempotency_uidx
  on public.operations ((client_upload_metadata ->> 'sync_idempotency_key'))
  where nullif(client_upload_metadata ->> 'sync_idempotency_key', '') is not null;

comment on index public.operations_local_sync_idempotency_uidx is
  'Guarantees exactly one canonical cloud operation per SANAD local-first sync idempotency key.';
