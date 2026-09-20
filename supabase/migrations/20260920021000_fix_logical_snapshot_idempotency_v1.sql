-- Scope ERP raw-event idempotency correctly for logical snapshots.
-- Non-snapshot events keep the original source/revision uniqueness.
-- Logical snapshot chunks include baseline_public_id so unchanged chunks may
-- legitimately recur in later snapshots without colliding with prior runs.

drop index if exists public.business_erp_raw_events_source_instance_id_entity_type_sour_key;

create unique index if not exists business_erp_raw_events_non_snapshot_idempotency_key
on public.business_erp_raw_events (
  source_instance_id,
  entity_type,
  source_record_id,
  revision
)
where entity_type <> 'erp_logical_snapshot_chunk';

create unique index if not exists business_erp_raw_events_logical_snapshot_idempotency_key
on public.business_erp_raw_events (
  source_instance_id,
  entity_type,
  (coalesce(integrity->>'baseline_public_id','')),
  source_record_id,
  revision
)
where entity_type = 'erp_logical_snapshot_chunk';
