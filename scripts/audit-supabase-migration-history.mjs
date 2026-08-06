import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SNAPSHOT =
  "docs/operations/supabase-production-migration-history-2026-08-06.json";
const DEFAULT_MIGRATIONS_DIR = "supabase/migrations";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseMigrationFilename(filename) {
  if (!filename.endsWith(".sql")) return null;
  const stem = filename.slice(0, -4);
  const separator = stem.indexOf("_");
  if (separator <= 0 || separator === stem.length - 1) {
    return {
      filename,
      version: null,
      name: null,
      valid_cli_version: false,
      parse_error: "expected_<version>_<name>.sql",
    };
  }

  const version = stem.slice(0, separator);
  const name = stem.slice(separator + 1);
  return {
    filename,
    version,
    name,
    valid_cli_version: /^\d{14}$/.test(version),
    parse_error: null,
  };
}

export async function readLocalMigrations(directory) {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  return await Promise.all(filenames.map(async (filename) => {
    const parsed = parseMigrationFilename(filename);
    const bytes = await readFile(path.join(directory, filename));
    return {
      ...parsed,
      statement_sha256: sha256(bytes),
      statement_bytes: bytes.length,
    };
  }));
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (key == null) continue;
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function duplicates(groups) {
  return [...groups.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key, values]) => ({
      key,
      migrations: values.map(({ version, name, filename }) => ({
        version,
        name,
        ...(filename ? { filename } : {}),
      })),
    }));
}

function identityOf(migration) {
  return `${migration.version}\u0000${migration.name}`;
}

function publicMigration(migration) {
  return {
    version: migration.version,
    name: migration.name,
    ...(migration.filename ? { filename: migration.filename } : {}),
    statement_sha256: migration.statement_sha256,
    statement_bytes: migration.statement_bytes,
  };
}

export function validateSnapshot(snapshot) {
  if (snapshot?.schema_version !== 1) {
    throw new Error("unsupported_snapshot_schema_version");
  }
  if (!Array.isArray(snapshot.migrations) || snapshot.migrations.length === 0) {
    throw new Error("snapshot_has_no_migrations");
  }
  if (snapshot.source?.read_only !== true) {
    throw new Error("snapshot_not_marked_read_only");
  }
  if (snapshot.source?.statement_content_included !== false) {
    throw new Error("snapshot_must_not_embed_sql_statements");
  }

  let previous = "";
  for (const migration of snapshot.migrations) {
    if (!/^\d{14}$/.test(String(migration.version))) {
      throw new Error(`invalid_remote_version:${migration.version}`);
    }
    if (!migration.name || !/^[a-f0-9]{64}$/.test(migration.statement_sha256)) {
      throw new Error(`invalid_remote_entry:${migration.version}`);
    }
    if (String(migration.version) <= previous) {
      throw new Error("remote_versions_not_strictly_ordered");
    }
    previous = String(migration.version);
  }
}

export function buildAudit(snapshot, localMigrations) {
  validateSnapshot(snapshot);
  const remoteMigrations = snapshot.migrations.map((migration) => ({
    ...migration,
    version: String(migration.version),
  }));
  const remoteByIdentity = new Map(
    remoteMigrations.map((migration) => [identityOf(migration), migration]),
  );
  const localByIdentity = new Map(
    localMigrations
      .filter((migration) => migration.version && migration.name)
      .map((migration) => [identityOf(migration), migration]),
  );
  const remoteByName = groupBy(remoteMigrations, (migration) => migration.name);
  const localByName = groupBy(localMigrations, (migration) => migration.name);
  const remoteByHash = groupBy(
    remoteMigrations,
    (migration) => migration.statement_sha256,
  );
  const localByHash = groupBy(
    localMigrations,
    (migration) => migration.statement_sha256,
  );

  const exactIdentity = [];
  const exactContent = [];
  const identityContentMismatch = [];
  for (const local of localMigrations) {
    if (!local.version || !local.name) continue;
    const remote = remoteByIdentity.get(identityOf(local));
    if (!remote) continue;
    exactIdentity.push(publicMigration(local));
    if (remote.statement_sha256 === local.statement_sha256) {
      exactContent.push(publicMigration(local));
    } else {
      identityContentMismatch.push({
        version: local.version,
        name: local.name,
        filename: local.filename,
        local_sha256: local.statement_sha256,
        production_sha256: remote.statement_sha256,
        local_bytes: local.statement_bytes,
        production_bytes: remote.statement_bytes,
      });
    }
  }

  const productionMissingLocalIdentity = remoteMigrations
    .filter((migration) => !localByIdentity.has(identityOf(migration)))
    .map(publicMigration);
  const localMissingProductionIdentity = localMigrations
    .filter((migration) =>
      !migration.version || !migration.name ||
      !remoteByIdentity.has(identityOf(migration))
    )
    .map(publicMigration);
  const sameNameDifferentVersion = localMigrations
    .filter((migration) =>
      migration.name && remoteByName.has(migration.name) &&
      !remoteByIdentity.has(identityOf(migration))
    )
    .map((migration) => ({
      local: publicMigration(migration),
      production: remoteByName.get(migration.name).map(publicMigration),
    }));
  const sameContentDifferentIdentity = localMigrations
    .filter((migration) =>
      remoteByHash.has(migration.statement_sha256) &&
      (!migration.version || !migration.name ||
        !remoteByIdentity.has(identityOf(migration)))
    )
    .map((migration) => ({
      local: publicMigration(migration),
      production: remoteByHash.get(migration.statement_sha256).map(publicMigration),
    }));
  const productionOnlyNames = remoteMigrations
    .filter((migration) => !localByName.has(migration.name))
    .map(publicMigration);
  const localOnlyNames = localMigrations
    .filter((migration) => !migration.name || !remoteByName.has(migration.name))
    .map(publicMigration);
  const invalidLocalFilenames = localMigrations
    .filter((migration) => !migration.valid_cli_version)
    .map((migration) => ({
      filename: migration.filename,
      version: migration.version,
      name: migration.name,
      parse_error: migration.parse_error,
    }));

  const lastRemoteVersion = remoteMigrations.at(-1).version;
  const pendingNewerLocal = localMigrations
    .filter((migration) =>
      migration.valid_cli_version && migration.version > lastRemoteVersion &&
      !remoteByIdentity.has(identityOf(migration)) &&
      !remoteByName.has(migration.name) &&
      !remoteByHash.has(migration.statement_sha256)
    )
    .map(publicMigration);
  const conflictingNewerLocal = localMigrations
    .filter((migration) =>
      migration.valid_cli_version && migration.version > lastRemoteVersion &&
      !remoteByIdentity.has(identityOf(migration)) &&
      (remoteByName.has(migration.name) ||
        remoteByHash.has(migration.statement_sha256))
    )
    .map(publicMigration);
  const conflictingHistoricalLocal = localMigrations
    .filter((migration) =>
      !migration.valid_cli_version || migration.version <= lastRemoteVersion
    )
    .filter((migration) =>
      !migration.version || !migration.name ||
      !remoteByIdentity.has(identityOf(migration))
    )
    .map(publicMigration);

  const duplicateLocalVersions = duplicates(
    groupBy(localMigrations, (migration) => migration.version),
  );
  const duplicateRemoteVersions = duplicates(
    groupBy(remoteMigrations, (migration) => migration.version),
  );
  const duplicateLocalNames = duplicates(localByName);
  const duplicateRemoteNames = duplicates(remoteByName);
  const duplicateLocalHashes = duplicates(localByHash);
  const duplicateRemoteHashes = duplicates(remoteByHash);

  const gateFailures = {
    invalid_local_filenames: invalidLocalFilenames.length,
    production_migrations_missing_exact_local_identity:
      productionMissingLocalIdentity.length,
    exact_identity_content_mismatches: identityContentMismatch.length,
    conflicting_historical_local_migrations: conflictingHistoricalLocal.length,
    conflicting_newer_local_migrations: conflictingNewerLocal.length,
    duplicate_local_versions: duplicateLocalVersions.length,
    duplicate_remote_versions: duplicateRemoteVersions.length,
  };
  const gatePass = Object.values(gateFailures).every((count) => count === 0);

  return {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    source: {
      snapshot_project_ref: snapshot.source.supabase_project_ref,
      snapshot_captured_at: snapshot.source.captured_at,
      snapshot_last_version: lastRemoteVersion,
      local_migrations_directory: DEFAULT_MIGRATIONS_DIR,
    },
    summary: {
      production_migrations: remoteMigrations.length,
      local_migrations: localMigrations.length,
      valid_local_cli_versions:
        localMigrations.length - invalidLocalFilenames.length,
      invalid_local_cli_versions: invalidLocalFilenames.length,
      exact_identity_matches: exactIdentity.length,
      exact_identity_and_content_matches: exactContent.length,
      exact_identity_content_mismatches: identityContentMismatch.length,
      same_name_different_version: sameNameDifferentVersion.length,
      same_content_different_identity: sameContentDifferentIdentity.length,
      production_only_names: productionOnlyNames.length,
      local_only_names: localOnlyNames.length,
      pending_newer_local: pendingNewerLocal.length,
      conflicting_newer_local: conflictingNewerLocal.length,
      conflicting_historical_local: conflictingHistoricalLocal.length,
    },
    deployment_gate: {
      pass: gatePass,
      exit_code: gatePass ? 0 : 2,
      failures: gateFailures,
      policy:
        "Every applied production migration must have one exact local version, name, and SQL hash. Only valid 14-digit local migrations newer than the production high-water mark may remain pending.",
    },
    findings: {
      invalid_local_filenames: invalidLocalFilenames,
      production_missing_local_identity: productionMissingLocalIdentity,
      local_missing_production_identity: localMissingProductionIdentity,
      exact_identity_content_mismatch: identityContentMismatch,
      same_name_different_version: sameNameDifferentVersion,
      same_content_different_identity: sameContentDifferentIdentity,
      production_only_names: productionOnlyNames,
      local_only_names: localOnlyNames,
      pending_newer_local: pendingNewerLocal,
      conflicting_newer_local: conflictingNewerLocal,
      conflicting_historical_local: conflictingHistoricalLocal,
      duplicate_local_versions: duplicateLocalVersions,
      duplicate_remote_versions: duplicateRemoteVersions,
      duplicate_local_names: duplicateLocalNames,
      duplicate_remote_names: duplicateRemoteNames,
      duplicate_local_hashes: duplicateLocalHashes,
      duplicate_remote_hashes: duplicateRemoteHashes,
    },
  };
}

function parseArgs(argv) {
  const args = {
    snapshot: DEFAULT_SNAPSHOT,
    migrationsDir: DEFAULT_MIGRATIONS_DIR,
    mode: "audit",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--snapshot") args.snapshot = argv[++index];
    else if (value === "--migrations-dir") args.migrationsDir = argv[++index];
    else if (value === "--mode") args.mode = argv[++index];
    else if (value === "--help") {
      console.log(
        "Usage: node scripts/audit-supabase-migration-history.mjs " +
          "[--snapshot path] [--migrations-dir path] " +
          "[--mode audit|deploy-gate]",
      );
      return null;
    } else throw new Error(`unknown_argument:${value}`);
  }
  if (!args.snapshot || !args.migrationsDir) throw new Error("missing_path_argument");
  if (!new Set(["audit", "deploy-gate"]).has(args.mode)) {
    throw new Error(`invalid_mode:${args.mode}`);
  }
  return args;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args) return 0;
  const snapshot = JSON.parse(await readFile(args.snapshot, "utf8"));
  const localMigrations = await readLocalMigrations(args.migrationsDir);
  const audit = buildAudit(snapshot, localMigrations);
  audit.source.local_migrations_directory = args.migrationsDir;
  console.log(JSON.stringify(audit, null, 2));
  return args.mode === "deploy-gate" ? audit.deployment_gate.exit_code : 0;
}

const isDirect = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
