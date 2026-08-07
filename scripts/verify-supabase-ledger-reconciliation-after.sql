-- SANAD Supabase migration-ledger reconciliation post-check.
-- READ ONLY: validates the structural expected-after history state only.
-- It does not validate schema/data fingerprints; those are separate required gates.

begin transaction read only;

with ledger as (
  select
    count(*)::integer as migration_count,
    min(version) as first_version,
    max(version) as last_version,
    array_agg(version order by version) as versions
  from supabase_migrations.schema_migrations
), expected as (
  select
    1::integer as migration_count,
    '20260806150947'::text as canonical_version,
    array['20260806150947']::text[] as versions
)
select
  ledger.*,
  ledger.migration_count = expected.migration_count
    and ledger.first_version = expected.canonical_version
    and ledger.last_version = expected.canonical_version
    and ledger.versions = expected.versions
    as matches_expected_after
from ledger
cross join expected;

rollback;
