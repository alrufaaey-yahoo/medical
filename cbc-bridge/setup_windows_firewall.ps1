param(
  [string]$DeviceIp = '192.168.1.100',
  [string]$ComputerIp = '192.168.1.111',
  [int]$Port = 5006
)
$ErrorActionPreference = 'Stop'
$Name = 'CBC Analyzer HL7 from configured device only'
Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $Name -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $ComputerIp -LocalPort $Port -RemoteAddress $DeviceIp -Profile Private | Out-Null
Write-Host "Added a Private-profile rule for TCP $Port from $DeviceIp to $ComputerIp only. Confirm the network is marked Private."
