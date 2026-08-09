import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'android-release-meta.mjs');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'android-release.json'), 'utf8'));

test('android release config validates', () => {
  const output = execFileSync(process.execPath, [script, 'validate'], { cwd: root, encoding: 'utf8' });
  assert.match(output, new RegExp(`\\(${config.version_code}\\)`));
});

test('android release manifest binds APK bytes to release metadata', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sanad-android-release-'));
  try {
    const apkPath = path.join(temp, 'sanad-latest.apk');
    const manifestPath = path.join(temp, 'sanad-latest.json');
    const bytes = Buffer.from('SANAD deterministic updater fixture');
    fs.writeFileSync(apkPath, bytes);

    const shaOutput = execFileSync(
      process.execPath,
      [script, 'manifest', apkPath, manifestPath, 'test-commit'],
      { cwd: root, encoding: 'utf8' }
    ).trim();

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');

    assert.equal(shaOutput, expectedSha);
    assert.equal(manifest.sha256, expectedSha);
    assert.equal(manifest.version_code, config.version_code);
    assert.equal(manifest.version_name, config.version_name);
    assert.equal(manifest.minimum_supported_version_code, config.minimum_supported_version_code);
    assert.equal(manifest.update_policy, config.update_policy);
    assert.deepEqual(manifest.release_notes, config.release_notes);
    assert.equal(manifest.size_bytes, bytes.length);
    assert.equal(manifest.download_url, '/downloads/sanad-latest.apk');
    assert.equal(manifest.commit, 'test-commit');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
