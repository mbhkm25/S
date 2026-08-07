import fs from 'node:fs';
import crypto from 'node:crypto';

const sourcePath = 'docs/operations/supabase-production-migration-history-2026-08-06.json';
const canonicalVersion = '20260806150947';
const expected = {
  migrationCount: 311,
  firstVersion: '20260702130842',
  lastVersion: '20260806063921',
  totalStatementBytes: 1764166,
  ledgerManifestSha256: '60285fa75234648a39cf3de5f139c18e61440d04876048c28f54f0eef30d6903',
};

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(parsed.migrations)) fail('migrations array is missing');

const migrations = [...parsed.migrations].sort((a, b) => {
  const version = String(a.version).localeCompare(String(b.version));
  if (version !== 0) return version;
  const name = String(a.name ?? '').localeCompare(String(b.name ?? ''));
  if (name !== 0) return name;
  return String(a.statement_sha256 ?? '').localeCompare(String(b.statement_sha256 ?? ''));
});

if (migrations.length !== expected.migrationCount) {
  fail(`migration count ${migrations.length} != ${expected.migrationCount}`);
}

const versions = migrations.map((row) => String(row.version));
if (versions[0] !== expected.firstVersion) {
  fail(`first version ${versions[0]} != ${expected.firstVersion}`);
}
if (versions.at(-1) !== expected.lastVersion) {
  fail(`last version ${versions.at(-1)} != ${expected.lastVersion}`);
}
if (new Set(versions).size !== versions.length) {
  fail('duplicate migration versions detected');
}
if (versions.includes(canonicalVersion)) {
  fail(`canonical version ${canonicalVersion} must not be part of the legacy before-state`);
}

const totalStatementBytes = migrations.reduce((sum, row) => {
  const value = Number(row.statement_bytes);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`invalid statement_bytes for version ${row.version}`);
  }
  return sum + value;
}, 0);

if (totalStatementBytes !== expected.totalStatementBytes) {
  fail(`statement bytes ${totalStatementBytes} != ${expected.totalStatementBytes}`);
}

for (const row of migrations) {
  if (!/^[0-9]{14}$/.test(String(row.version))) {
    fail(`invalid migration version: ${row.version}`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(row.statement_sha256))) {
    fail(`invalid statement SHA-256 for version ${row.version}`);
  }
}

const ledgerText = migrations
  .map((row) => `${row.version}|${row.name ?? ''}|${row.statement_sha256}|${row.statement_bytes}`)
  .join('\n');
const ledgerManifestSha256 = crypto.createHash('sha256').update(ledgerText, 'utf8').digest('hex');

if (ledgerManifestSha256 !== expected.ledgerManifestSha256) {
  fail(`ledger SHA-256 ${ledgerManifestSha256} != ${expected.ledgerManifestSha256}`);
}

const plan = {
  schema_version: 1,
  status: 'candidate_requires_isolated_simulation_and_review',
  production_execution_authorized: false,
  source: sourcePath,
  verified_before_state: {
    migration_count: migrations.length,
    first_version: versions[0],
    last_version: versions.at(-1),
    total_statement_bytes: totalStatementBytes,
    ledger_manifest_sha256: ledgerManifestSha256,
  },
  target: {
    canonical_version: canonicalVersion,
    expected_remote_versions_after: [canonicalVersion],
  },
  candidate_forward_commands: [
    {
      executable: 'supabase',
      args: ['migration', 'repair', ...versions, '--status', 'reverted', '--linked'],
      purpose: 'Remove the approved 311 legacy versions from remote migration history only.',
    },
    {
      executable: 'supabase',
      args: ['migration', 'repair', canonicalVersion, '--status', 'applied', '--linked'],
      purpose: 'Mark the canonical baseline version applied in remote migration history only.',
    },
  ],
  required_follow_up_commands: [
    { executable: 'supabase', args: ['migration', 'list', '--linked'] },
    { executable: 'supabase', args: ['db', 'push', '--dry-run', '--linked'] },
  ],
  warnings: [
    'Do not execute this candidate against production.',
    'Do not assume multi-version repair is transactionally atomic.',
    'Freeze the Supabase CLI version and prove forward and rollback behavior in an isolated ledger simulation first.',
  ],
};

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
