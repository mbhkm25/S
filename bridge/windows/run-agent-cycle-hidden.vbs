Option Explicit

Dim shell, runnerPath, powershellPath, command, exitCode

If WScript.Arguments.Count < 1 Then
  WScript.Quit 90
End If

runnerPath = WScript.Arguments(0)

Set shell = CreateObject("WScript.Shell")
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")

command = Chr(34) & powershellPath & Chr(34) & _
  " -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " & _
  Chr(34) & runnerPath & Chr(34)

' WindowStyle=0 keeps the child process fully hidden.
' WaitOnReturn=True preserves the Bridge cycle exit code for Task Scheduler.
exitCode = shell.Run(command, 0, True)

WScript.Quit exitCode
