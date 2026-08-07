-- SANAD Supabase migration-ledger reconciliation preflight.
-- READ ONLY: this script must not modify schema, data, or migration metadata.
-- Expected production state is pinned in:
-- docs/operations/supabase-ledger-reconciliation-phase3-manifest.json

begin transaction read only;

with normalized as (
  select
    version,
    coalesce(name, '') as name,
    encode(
      digest(
        convert_to(
          array_to_string(coalesce(statements, array[]::text[]), E'\n'),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as statement_sha256,
    octet_length(
      convert_to(
        array_to_string(coalesce(statements, array[]::text[]), E'\n'),
        'UTF8'
      )
    ) as statement_bytes
  from supabase_migrations.schema_migrations
), ledger as (
  select
    count(*)::integer as migration_count,
    min(version) as first_version,
    max(version) as last_version,
    sum(statement_bytes)::bigint as total_statement_bytes,
    encode(
      digest(
        convert_to(
          string_agg(
            version || '|' || name || '|' || statement_sha256 || '|' || statement_bytes::text,
            E'\n'
            order by version, name, statement_sha256
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    ) as ledger_manifest_sha256
  from normalized
), expected as (
  select
    311::integer as migration_count,
    '20260702130842'::text as first_version,
    '20260806063921'::text as last_version,
    1764166::bigint as total_statement_bytes,
    '60285fa75234648a39cf3de5f139c18e61440d04876048c28f54f0eef30d6903'::text as ledger_manifest_sha256
)
select
  ledger.*,
  ledger.migration_count = expected.migration_count
    and ledger.first_version = expected.first_version
    and ledger.last_version = expected.last_version
    and ledger.total_statement_bytes = expected.total_statement_bytes
    and ledger.ledger_manifest_sha256 = expected.ledger_manifest_sha256
    as matches_approved_manifest
from ledger
cross join expected;

-- The transaction is rolled back deliberately even though it is read-only.
rollback;
