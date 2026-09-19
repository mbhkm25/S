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
