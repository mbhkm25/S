import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const configPath = path.join(root, 'config', 'android-release.json');

function readConfig() {
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Number.isInteger(value.version_code) || value.version_code < 1) {
    throw new Error('android-release.json: version_code must be a positive integer');
  }
  if (typeof value.version_name !== 'string' || !value.version_name.trim()) {
    throw new Error('android-release.json: version_name is required');
  }
  if (!['recommended', 'required'].includes(value.update_policy)) {
    throw new Error('android-release.json: update_policy must be recommended or required');
  }
  if (!Number.isInteger(value.minimum_supported_version_code) || value.minimum_supported_version_code < 1) {
    throw new Error('android-release.json: minimum_supported_version_code must be a positive integer');
  }
  if (value.minimum_supported_version_code > value.version_code) {
    throw new Error('android-release.json: minimum_supported_version_code cannot exceed version_code');
  }
  if (!Array.isArray(value.release_notes) || value.release_notes.some(note => typeof note !== 'string' || !note.trim())) {
    throw new Error('android-release.json: release_notes must be a non-empty string array');
  }
  return value;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function writeManifest(config, apkPath, outputPath, commit) {
  if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
  const stat = fs.statSync(apkPath);
  const manifest = {
    platform: 'android',
    version: String(config.version_code),
    version_name: config.version_name,
    version_code: config.version_code,
    minimum_supported_version_code: config.minimum_supported_version_code,
    update_policy: config.update_policy,
    release_notes: config.release_notes,
    filename: 'sanad-latest.apk',
    versioned_filename: `sanad-v${config.version_code}.apk`,
    download_url: '/downloads/sanad-latest.apk',
    sha256: sha256File(apkPath),
    size_bytes: stat.size,
    commit: commit || '',
    built_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const [command = 'validate', ...args] = process.argv.slice(2);
const config = readConfig();

if (command === 'validate') {
  process.stdout.write(`Android release ${config.version_name} (${config.version_code}) is valid.\n`);
} else if (command === 'github-output') {
  process.stdout.write(`version_code=${config.version_code}\n`);
  process.stdout.write(`version_name=${config.version_name}\n`);
  process.stdout.write(`minimum_supported_version_code=${config.minimum_supported_version_code}\n`);
  process.stdout.write(`update_policy=${config.update_policy}\n`);
} else if (command === 'manifest') {
  const [apkPath, outputPath, commit = ''] = args;
  if (!apkPath || !outputPath) throw new Error('Usage: android-release-meta.mjs manifest <apk> <output> [commit]');
  const manifest = writeManifest(config, path.resolve(apkPath), path.resolve(outputPath), commit);
  process.stdout.write(`${manifest.sha256}\n`);
} else {
  throw new Error(`Unknown command: ${command}`);
}
