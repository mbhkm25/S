import assert from "node:assert/strict";
import test from "node:test";
import { buildAudit, parseMigrationFilename } from "./audit-supabase-migration-history.mjs";

function digest(char) {
  return char.repeat(64);
}

function snapshot(migrations) {
  return {
    schema_version: 1,
    source: {
      supabase_project_ref: "test-project",
      captured_at: "2026-08-06T00:00:00.000Z",
      read_only: true,
      statement_content_included: false,
    },
    migrations,
  };
}

function remote(version, name, hash) {
  return {
    version,
    name,
    statement_sha256: hash,
    statement_bytes: 10,
  };
}

function local(version, name, hash) {
  return {
    filename: `${version}_${name}.sql`,
    version,
    name,
    valid_cli_version: /^\d{14}$/.test(version),
    parse_error: null,
    statement_sha256: hash,
    statement_bytes: 10,
  };
}

test("parses names at the first underscore and rejects non-CLI versions", () => {
  assert.deepEqual(
    parseMigrationFilename("20260806063921_harden_contract_v2.sql"),
    {
      filename: "20260806063921_harden_contract_v2.sql",
      version: "20260806063921",
      name: "harden_contract_v2",
      valid_cli_version: true,
      parse_error: null,
    },
  );
  assert.equal(
    parseMigrationFilename("20260719_business_contract.sql").valid_cli_version,
    false,
  );
});

test("deploy gate passes aligned history and permits strictly newer migrations", () => {
  const a = digest("a");
  const b = digest("b");
  const report = buildAudit(
    snapshot([remote("20260806000000", "base", a)]),
    [
      local("20260806000000", "base", a),
      local("20260806010000", "new_feature", b),
    ],
  );
  assert.equal(report.deployment_gate.pass, true);
  assert.equal(report.summary.pending_newer_local, 1);
});

test("deploy gate rejects same identity with different SQL", () => {
  const report = buildAudit(
    snapshot([remote("20260806000000", "base", digest("a"))]),
    [local("20260806000000", "base", digest("b"))],
  );
  assert.equal(report.deployment_gate.pass, false);
  assert.equal(report.summary.exact_identity_content_mismatches, 1);
  assert.equal(report.deployment_gate.exit_code, 2);
});

test("deploy gate rejects renamed historical migrations", () => {
  const hash = digest("c");
  const report = buildAudit(
    snapshot([remote("20260806000000", "base", hash)]),
    [local("20260805000000", "base", hash)],
  );
  assert.equal(report.deployment_gate.pass, false);
  assert.equal(report.summary.same_name_different_version, 1);
  assert.equal(report.summary.same_content_different_identity, 1);
  assert.equal(report.summary.conflicting_historical_local, 1);
});

test("deploy gate rejects a newer timestamp that duplicates a production name", () => {
  const report = buildAudit(
    snapshot([remote("20260806000000", "existing_change", digest("a"))]),
    [local("20260806010000", "existing_change", digest("b"))],
  );
  assert.equal(report.deployment_gate.pass, false);
  assert.equal(report.summary.pending_newer_local, 0);
  assert.equal(report.summary.conflicting_newer_local, 1);
});

test("snapshot cannot contain SQL statement bodies", () => {
  assert.throws(
    () => buildAudit({
      ...snapshot([remote("20260806000000", "base", digest("d"))]),
      source: {
        ...snapshot([]).source,
        statement_content_included: true,
      },
    }, []),
    /snapshot_must_not_embed_sql_statements/,
  );
});
