import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const manifestPath =
  "docs/operations/supabase-canonical-baseline-validation-2026-08-06.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const generatorPath = manifest.artifact.generator_path;
const [baselineParts, generator, activeMigrationNames] = await Promise.all([
  Promise.all(manifest.artifact.parts.map((part) => readFile(part))),
  readFile(generatorPath),
  readdir("supabase/migrations"),
]);
const baseline = Buffer.concat(baselineParts);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sql = baseline.toString("utf8");

assert.equal(manifest.source.read_only_extraction, true);
assert.equal(manifest.source.table_rows_included, false);
assert.equal(manifest.artifact.activation_state, "staged_not_active");
assert.equal(manifest.artifact.assembly, "byte-concatenation in listed order");
assert.equal(manifest.artifact.parts.length, 2);
for (const [index, part] of manifest.artifact.parts.entries()) {
  assert.match(part, /^supabase\/baselines\/\d{14}_[a-z0-9_]+\/part-\d{4}\.sql\.part$/);
  assert.equal(sha256(baselineParts[index]), manifest.artifact.part_sha256[index]);
}
assert.equal(sha256(baseline), manifest.artifact.sha256);
assert.equal(baseline.length, manifest.artifact.bytes);
assert.equal(sql.split("\n").length, manifest.artifact.lines);
assert.equal(sha256(generator), manifest.artifact.generator_sha256);
assert.equal(
  activeMigrationNames.some((name) => manifest.artifact.parts.some((part) => part.endsWith(name))),
  false,
  "the baseline must not become an active migration before ledger reconciliation",
);

for (const required of [
  "-- Generated from PostgreSQL catalogs; contains no table rows.",
  "create table public.operations",
  "alter table public.operations enable row level security;",
  "create policy",
  "revoke all on function",
  "reset check_function_bodies;",
]) {
  assert.ok(sql.includes(required), `missing baseline contract: ${required}`);
}

const forbiddenPatterns = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /postgres(?:ql)?:\/\//i,
  /vault\.decrypted_secrets/i,
  /\bwhsec_[A-Za-z0-9_-]+/,
  /\bsk_(?:live|test)_[A-Za-z0-9_-]+/,
];
for (const pattern of forbiddenPatterns) {
  assert.doesNotMatch(sql, pattern);
}

console.log(JSON.stringify({
  baseline_parts: manifest.artifact.parts,
  sha256: manifest.artifact.sha256,
  bytes: baseline.length,
  activation_state: manifest.artifact.activation_state,
  verified: true,
}, null, 2));
