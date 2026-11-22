$ErrorActionPreference = 'Stop'
$BridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $BridgeDir 'cbc-bridge.env'
if (-not (Test-Path $EnvFile)) { throw 'cbc-bridge.env is missing; run install_windows_task.ps1 first.' }
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#\s][^=]+)=(.*)$') { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
}
Set-Location $BridgeDir
py .\bridge.py
