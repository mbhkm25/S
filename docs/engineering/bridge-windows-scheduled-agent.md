# Windows scheduled execution for SANAD Bridge

The Bridge is currently a console application. Production steady-state operation on the shop PC uses Windows Task Scheduler.

Runtime policy:
- run --agent-cycle every minute and once at user logon;
- run as the current interactive Windows account so Edaa Integrated Security matches validated manual execution;
- ignore overlapping launches; Bridge also keeps its own single-instance mutex;
- cap each run at five minutes and request bounded Task Scheduler retries;
- append stdout/stderr to %ProgramData%\\SANAD\\Bridge\\logs\\agent-cycle.log;
- rotate the log at 5 MiB;
- remain read-only against Edaa.

Installation:
cd C:\\SANAD-DEV
git fetch origin
git checkout feat/sanad-bridge-local-agent-v01
git reset --hard origin/feat/sanad-bridge-local-agent-v01
dotnet restore .\\bridge\\windows\\Sanad.Bridge\\Sanad.Bridge.csproj
dotnet build .\\bridge\\windows\\Sanad.Bridge\\Sanad.Bridge.csproj -c Debug --no-restore
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\bridge\\windows\\install-scheduled-agent.ps1

Verification:
Get-ScheduledTask -TaskName "SANAD Bridge Agent" | Get-ScheduledTaskInfo
Get-Content "$env:ProgramData\\SANAD\\Bridge\\logs\\agent-cycle.log" -Tail 80


## No-console task launcher — 2026-09-20

The scheduled task must not launch `powershell.exe` directly under the interactive Windows session because even `-WindowStyle Hidden` can create a very brief console window and steal keyboard focus once per minute.

The installer now schedules:

`wscript.exe //B //NoLogo run-agent-cycle-hidden.vbs run-agent-cycle.ps1`

The VBScript launcher starts Windows PowerShell with window style `0`, waits for completion, and returns the same exit code to Task Scheduler. This keeps the existing interactive-user / Integrated Security behavior required by the legacy Edaa SQL Server connection while preventing console focus theft.

The actual Bridge child process remains `CreateNoWindow=true` inside `run-agent-cycle.ps1`.
