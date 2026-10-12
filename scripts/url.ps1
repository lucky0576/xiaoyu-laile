<#
  Print the current public URL and whether it is actually reachable.

  Quick tunnels get recycled by Cloudflare and always get a NEW domain when
  cloudflared restarts, so "what is the URL right now" is a real question.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\url.ps1
    powershell -ExecutionPolicy Bypass -File scripts\url.ps1 -Copy

  NOTE: ASCII-only on purpose (Windows PowerShell 5.1 reads .ps1 as ANSI).
#>
param([switch]$Copy)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env'
$Port = 8787

Write-Host ''
Write-Host 'local      : ' -NoNewline; Write-Host "http://127.0.0.1:$Port" -ForegroundColor Gray
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -like '192.168.*' } |
  ForEach-Object { Write-Host 'lan        : ' -NoNewline; Write-Host "http://$($_.IPAddress):$Port" -ForegroundColor Gray }

$txt = if (Test-Path $EnvFile) { [System.IO.File]::ReadAllText($EnvFile, (New-Object System.Text.UTF8Encoding($false))) } else { '' }
$m = [regex]::Match($txt, '(?m)^[ \t]*PUBLIC_BASE_URL[ \t]*=[ \t]*(\S+)[ \t]*$')
$url = if ($m.Success) { $m.Groups[1].Value } else { '' }

if (-not $url) {
  Write-Host 'public     : ' -NoNewline
  Write-Host 'not configured (PUBLIC_BASE_URL is empty)' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

$ok = $false
try {
  $r = Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 15
  $ok = ($r.StatusCode -eq 200 -and $r.Content -match '"ok"')
} catch { $ok = $false }

Write-Host 'public     : ' -NoNewline
if ($ok) { Write-Host $url -ForegroundColor Green }
else { Write-Host "$url  (NOT REACHABLE)" -ForegroundColor Red }

if ($ok) {
  Write-Host 'status     : ' -NoNewline; Write-Host 'reachable, no interstitial' -ForegroundColor Green
  if ($Copy) {
    try { Set-Clipboard -Value $url; Write-Host 'copied to clipboard' -ForegroundColor Cyan } catch { }
  }
} else {
  Write-Host ''
  Write-Host 'The tunnel is dead or recycled. Rebuild it with:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1'
}

Write-Host ''
if ($ok) { exit 0 } else { exit 1 }
