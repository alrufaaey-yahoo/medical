$ErrorActionPreference = 'Stop'
$BridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $BridgeDir 'cbc-bridge.env'
$TaskName = 'CBC Local Bridge'

if (-not (Test-Path $EnvFile)) {
  @'
CBC_SERVER_URL=https://your-clinic.example
CBC_BRIDGE_TOKEN=PASTE_GENERATED_SECRET_HERE
CBC_SQLITE_PATH=C:\ProgramData\CBCBridge\cbc-bridge.sqlite3
CBC_MAX_MESSAGE_BYTES=1048576
'@ | Set-Content -Path $EnvFile -Encoding ASCII
  Write-Host "Created $EnvFile. Edit it with the generated token and server URL, then run this script again."
  exit 0
}

$Python = (Get-Command py -ErrorAction SilentlyContinue)
if (-not $Python) { throw 'Python launcher (py.exe) is required.' }
$Runner = Join-Path $BridgeDir 'run_bridge.ps1'
if ((Get-Content $EnvFile -Raw) -match 'PASTE_GENERATED_SECRET_HERE|your-clinic\.example') { throw 'Edit cbc-bridge.env and replace placeholders before installing the task.' }
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Installed and started task '$TaskName'. Verify Task Scheduler status and Windows Firewall allowlist."
