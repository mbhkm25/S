import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (path) => readFileSync(path, 'utf8');
const runner = load('bridge/windows/run-agent-cycle.ps1');
const request = load('bridge/windows/request-logical-snapshot-now.ps1');
const scheduler = load('bridge/windows/install-scheduled-agent.ps1');
const cycle = load('bridge/windows/Sanad.Bridge/BridgeAgentCycleCommand.cs');
const snapshot = load('bridge/windows/Sanad.Bridge/EdaaLogicalSnapshotCommand.cs');

assert.match(runner, /\[switch\]\$ForceLogicalSnapshot/);
assert.match(runner, /--agent-cycle --force-logical-snapshot/);
assert.match(runner, /\$ForceLogicalSnapshot\) \{ "--agent-cycle --force-logical-snapshot" \} else \{ "--agent-cycle" \}/,
  'Scheduled runner must keep its ordinary periodic due-check when no manual flag supplied.');
assert.match(request, /& \$RunnerPath -BridgeExe \$BridgeExe -ForceLogicalSnapshot/);
assert.match(request, /\$exitCode -eq 28/, 'Busy mutex must not start an overlapping run.');
assert.match(request, /\$exitCode -eq 24/, 'No-new-sales code can coexist with successful full snapshot.');
assert.match(request, /Get-ScheduledTask/, 'Manual operation must report periodic task health without modifying it.');
assert.doesNotMatch(request, /(Register|Set|Disable|Unregister)-ScheduledTask/,
  'Manual refresh must not change periodic schedule.');
assert.match(scheduler, /-Minutes 1/, 'Scheduled minute-level Bridge agent must remain in place.');
assert.match(scheduler, /-MultipleInstances IgnoreNew/);
assert.match(cycle, /Global\\SANAD\.Bridge\.AgentCycle\.v1/,
  'Periodic and manual paths must share the existing global mutex.');
assert.match(cycle, /EdaaLogicalSnapshotCommand\.RunAsync\((args|snapshotArgs)\)/,
  'Agent cycle must pass scheduled or explicitly forced arguments to the canonical snapshot command.');
assert.match(snapshot, /HasArg\(args, "--force-logical-snapshot"\)/);
assert.match(snapshot, /DefaultIntervalMinutes = 360/);
assert.match(snapshot, /MinimumIntervalMinutes = 60/);
assert.match(snapshot, /GetLatestLogicalSnapshot/, 'Retain existing durable-snapshot resume logic.');
assert.match(snapshot, /No writes were performed against Edaa/);
console.log('Bridge on-demand + scheduled safe coexistence contract passed.');
