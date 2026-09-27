import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => readFileSync(name, 'utf8');
const runner = load('bridge/windows/run-agent-cycle.ps1');
const install = load('bridge/windows/install-shop-upgrade.ps1');
const manual = load('bridge/windows/request-logical-snapshot-now.ps1');
const hidden = load('bridge/windows/run-agent-cycle-hidden.vbs');
const scheduled = load('bridge/windows/install-scheduled-agent.ps1');
const cycle = load('bridge/windows/Sanad.Bridge/BridgeAgentCycleCommand.cs');

assert.match(runner, /Join-Path \$PSScriptRoot 'app\\Sanad\.Bridge\.exe'/,
  'Scheduled runner must use installed sibling Release output, not old repo Debug.');
assert.doesNotMatch(runner, /SANAD-DEV.*Debug/,
  'Do not silently execute the old debug binary from the stale source checkout.');
assert.match(manual, /SANAD\\Bridge\\runtime\\active\\app\\Sanad\.Bridge\.exe/,
  'Manual refresh must select the same installed build as the scheduled agent.');
assert.match(manual, /SANAD\\Bridge\\runtime\\active\\run-agent-cycle\.ps1/);
assert.match(hidden, /shell\.Run\(command, 0, True\)/);
assert.match(scheduled, /-MultipleInstances IgnoreNew/);
assert.match(cycle, /Global\\SANAD\.Bridge\.AgentCycle\.v1/);

for (const invariant of [
  "ValidatePattern('^[0-9a-f]{40}$')",
  'git -C $Stage rev-parse HEAD',
  'git -C $Stage status --porcelain --untracked-files=no',
  'dotnet build $project --configuration Release --no-restore',
  '.VersionInfo.ProductVersion',
  'Get-FileHash',
  'Export-ScheduledTask',
  "Register-ScheduledTask -TaskName $TaskName -Xml",
  'Disable-ScheduledTask -TaskName $TaskName',
  'Stop-ScheduledTask -TaskName $TaskName',
  'Wait-BridgeStopped',
  "Join-Path $release 'app'",
  "Join-Path $active 'app\\Sanad.Bridge.exe'",
  "private task backup",
  'RunLevel',
]) {
  // The installer invokes the existing signed-in-principal installer with its
  // RunLevel settings, rather than recreating Task Scheduler principal logic.
  if (invariant === 'RunLevel') {
    assert.match(scheduled, /-RunLevel Limited/);
  } else if (invariant === 'private task backup') {
    assert.match(install, /Lock down runtime folder ACL/);
    assert.match(install, /Secure private task backup/);
  } else {
    assert.ok(install.includes(invariant), 'Missing Bridge upgrade guard: ' + invariant);
  }
}

assert.match(install, /-notlike "\*\$installedRunner\*"/);
assert.match(install, /-notlike "\*\$installedLauncher\*"/);
assert.match(install, /Get-ChildItem -LiteralPath \$bin -Recurse -Force -Attributes ReparsePoint/);
assert.match(install, /\$taskSid -ne \$nowUser\.User\.Value/);
assert.match(install, /\$oldTask\.TaskPath -ne '\\'/);
assert.match(install, /\$healthCode -notin @\(0,29\)/);
assert.match(install, /INSTALLED_PENDING_CLOUD_FIELD_SMOKE/);
assert.doesNotMatch(install, /Stop-Process|taskkill|reset --hard|git checkout main|\.\.\\identity\.dat|\.\.\\bridge\.db|--force-logical-snapshot/,
  'Installer must not kill manual cycles, overwrite state, reset the shop repo or force uploads.');
assert.doesNotMatch(install, /Invoke-WebRequest|Invoke-RestMethod|curl\.exe/,
  'Upgrade must not fetch unreviewed binary URLs.');
console.log('SANAD shop Bridge staged upgrade: pinned build, safe scheduler, immutable source, rollback and READ-ONLY safeguards PASS');
