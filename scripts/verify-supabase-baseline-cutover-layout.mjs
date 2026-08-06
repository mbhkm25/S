#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VERSION = '20260806150947';
const NAME = 'canonical_schema_baseline';
const EXPECTED_SHA256 = '8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc';
const EXPECTED_BYTES = 1375100;
const ACTIVE_NAME = `${VERSION}_${NAME}.sql`;
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const ARCHIVE_DIR = path.join(ROOT, 'supabase', 'migration_archive', 'pre_canonical_20260806');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function main() {
  const migrationFiles = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  if (migrationFiles.length !== 1 || migrationFiles[0] !== ACTIVE_NAME) {
    throw new Error(`Expected only ${ACTIVE_NAME} in active migrations, found ${migrationFiles.join(', ')}`);
  }

  const active = await readFile(path.join(MIGRATIONS_DIR, ACTIVE_NAME));
  if (active.length !== EXPECTED_BYTES) throw new Error(`Active baseline bytes mismatch: ${active.length}`);
  if (sha256(active) !== EXPECTED_SHA256) throw new Error('Active baseline SHA-256 mismatch');

  const archiveFiles = (await readdir(ARCHIVE_DIR)).filter((name) => name.endsWith('.sql'));
  if (archiveFiles.length < 200) {
    throw new Error(`Historical archive unexpectedly small: ${archiveFiles.length}`);
  }

  const manifest = JSON.parse(await readFile(path.join(ARCHIVE_DIR, 'manifest.json'), 'utf8'));
  if (manifest.production_mutation !== false) throw new Error('Manifest must state production_mutation=false');
  if (manifest.baseline.sha256 !== EXPECTED_SHA256) throw new Error('Manifest baseline hash mismatch');
  if (manifest.archive.migration_count !== archiveFiles.length) throw new Error('Archive count mismatch');

  process.stdout.write(JSON.stringify({
    ok: true,
    active_migrations: migrationFiles.length,
    archived_migrations: archiveFiles.length,
    baseline_sha256: EXPECTED_SHA256,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
