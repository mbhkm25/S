#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const BASELINE_VERSION = '20260806150947';
const BASELINE_NAME = 'canonical_schema_baseline';
const BASELINE_DIR = path.join(ROOT, 'supabase', 'baselines', `${BASELINE_VERSION}_${BASELINE_NAME}`);
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const ARCHIVE_DIR = path.join(ROOT, 'supabase', 'migration_archive', 'pre_canonical_20260806');
const ACTIVE_FILE = path.join(MIGRATIONS_DIR, `${BASELINE_VERSION}_${BASELINE_NAME}.sql`);
const EXPECTED_SHA256 = '8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc';
const EXPECTED_BYTES = 1375100;

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const isSql = (name) => name.endsWith('.sql');

async function assembleBaseline() {
  const parts = (await readdir(BASELINE_DIR))
    .filter((name) => name.endsWith('.sql.part'))
    .sort();
  if (parts.length !== 2) throw new Error(`Expected 2 baseline parts, found ${parts.length}`);

  const buffers = await Promise.all(parts.map((name) => readFile(path.join(BASELINE_DIR, name))));
  const assembled = Buffer.concat(buffers);
  if (assembled.length !== EXPECTED_BYTES) {
    throw new Error(`Baseline byte count mismatch: ${assembled.length} != ${EXPECTED_BYTES}`);
  }
  const digest = sha256(assembled);
  if (digest !== EXPECTED_SHA256) {
    throw new Error(`Baseline SHA-256 mismatch: ${digest} != ${EXPECTED_SHA256}`);
  }
  return { assembled, parts, digest };
}

async function plan() {
  const migrationNames = (await readdir(MIGRATIONS_DIR)).filter(isSql).sort();
  if (migrationNames.length === 0) throw new Error('No historical migrations found');
  if (migrationNames.includes(path.basename(ACTIVE_FILE))) {
    throw new Error('Canonical baseline is already active; refusing to run twice');
  }

  const { assembled, parts, digest } = await assembleBaseline();
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    baseline: {
      version: BASELINE_VERSION,
      name: BASELINE_NAME,
      source_parts: parts,
      sha256: digest,
      bytes: assembled.length,
      active_path: path.relative(ROOT, ACTIVE_FILE),
    },
    archive: {
      path: path.relative(ROOT, ARCHIVE_DIR),
      migration_count: migrationNames.length,
      files: migrationNames,
    },
    production_mutation: false,
  };

  if (!WRITE) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  await mkdir(ARCHIVE_DIR, { recursive: true });
  for (const name of migrationNames) {
    const source = path.join(MIGRATIONS_DIR, name);
    const destination = path.join(ARCHIVE_DIR, name);
    await rename(source, destination);
  }
  await writeFile(ACTIVE_FILE, assembled);
  await writeFile(
    path.join(ARCHIVE_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`Prepared canonical cutover layout with ${migrationNames.length} archived migrations.\n`);
}

plan().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
