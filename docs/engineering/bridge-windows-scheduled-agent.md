# Windows scheduled execution for SANAD Bridge

The Bridge is currently a console application. Production steady-state operation on the shop PC uses Windows Task Scheduler.

Runtime policy:
- run --agent-cycle every minute and once at user logon;
- run as the current interactive Windows account so Edaa Integrated Security matches validated manual execution;
- ignore overlapping launches; Bridge also keeps its own single-instance mutex;
- cap each run at 45 minutes (logical cloud snapshot delivery has a 30-minute timeout; one-minute triggers continue to ignore overlaps) and request bounded Task Scheduler retries;
- append stdout/stderr to %ProgramData%\\SANAD\\Bridge\\logs\\agent-cycle.log;
- rotate the log at 5 MiB;
- remain read-only against Edaa.

Installation / existing shop-PC upgrades:

**Do not use the original feature-branch `git reset --hard` recipe:** it was written for the initial bootstrap and can overwrite shop-local changes without updating the running task's actual Debug EXE. For the existing authorized shop workstation, use the pinned, staged, rollback-safe installer and manual remote-refresh verification in:

`docs/engineering/SANAD_BRIDGE_SHOP_UPGRADE_RECONCILIATION_2026-09-27.md`

The upgraded scheduled task points to a verified complete NET48 Release copy at `%ProgramData%\\SANAD\\Bridge\\runtime\\active`, not the repository Debug `bin` directory. The one-time manual refresh uses that same active runtime and the existing mutex. Existing Bridge device identity, SQLite state/outbox and logs under the ProgramData Bridge root stay in place. A scheduler LastResult of `267009 (0x41301)` denotes **still running**, not a confirmed Bridge error; check its actual task action and logs before diagnosing.

Initial task creation from scratch remains possible through `install-scheduled-agent.ps1`, but it is NOT an in-place upgrade: review the real task principal and live deployment path first. The upgrade script preserves the existing principal, safely waits for quiescence and saves recoverable task XML.


## No-console task launcher — 2026-09-20

The scheduled task must not launch `powershell.exe` directly under the interactive Windows session because even `-WindowStyle Hidden` can create a very brief console window and steal keyboard focus once per minute.

The installer now schedules:

`wscript.exe //B //NoLogo run-agent-cycle-hidden.vbs run-agent-cycle.ps1`

The VBScript launcher starts Windows PowerShell with window style `0`, waits for completion, and returns the same exit code to Task Scheduler. This keeps the existing interactive-user / Integrated Security behavior required by the legacy Edaa SQL Server connection while preventing console focus theft.

The actual Bridge child process remains `CreateNoWindow=true` inside `run-agent-cycle.ps1`.
