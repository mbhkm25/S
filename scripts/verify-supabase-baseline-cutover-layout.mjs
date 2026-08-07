#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VERSION = '20260806150947';
const NAME = 'canonical_schema_baseline';
const EXPECTED_PAYLOAD_SHA256 = '8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc';
const EXPECTED_PAYLOAD_BYTES = 1375100;
const EXPECTED_BLOBS = [
  'f686e627eea987ee7ac6dd5aca2459852d7e0ef6',
  '375f4d82f8828ed1943d30a1d8702adeb8ad643c',
];
const ACTIVE_NAME = `${VERSION}_${NAME}.sql`;
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const ARCHIVE_DIR = path.join(ROOT, 'supabase', 'migrations_archive', 'pre_canonical_20260806');

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Canonical bootstrap missing ${label}`);
  }
}

async function main() {
  const migrationFiles = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
  if (migrationFiles.length !== 1 || migrationFiles[0] !== ACTIVE_NAME) {
    throw new Error(`Expected only ${ACTIVE_NAME} in active migrations, found ${migrationFiles.join(', ')}`);
  }

  const active = await readFile(path.join(MIGRATIONS_DIR, ACTIVE_NAME), 'utf8');
  requireText(active, `v_bytes <> ${EXPECTED_PAYLOAD_BYTES}`, 'payload byte guard');
  requireText(active, EXPECTED_PAYLOAD_SHA256, 'payload SHA-256 guard');
  for (const blob of EXPECTED_BLOBS) {
    requireText(active, `/git/blobs/${blob}`, `immutable blob ${blob}`);
  }
  requireText(active, 'SANAD canonical bootstrap requires a fresh database', 'fresh-database guard');
  requireText(active, 'execute v_sql;', 'atomic canonical payload execution');
  requireText(active, 'drop extension if exists http;', 'temporary HTTP extension cleanup');

  const archiveFiles = (await readdir(ARCHIVE_DIR)).filter((name) => name.endsWith('.sql'));
  if (archiveFiles.length < 200) {
    throw new Error(`Historical archive unexpectedly small: ${archiveFiles.length}`);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    active_migrations: migrationFiles.length,
    archived_migrations: archiveFiles.length,
    canonical_payload_bytes: EXPECTED_PAYLOAD_BYTES,
    canonical_payload_sha256: EXPECTED_PAYLOAD_SHA256,
    immutable_blobs: EXPECTED_BLOBS,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
