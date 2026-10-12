<#
  Push xiaoyu-laile to GitHub with retries.

  GitHub over SSH from this network resets roughly one connection in six,
  so a single `git push` sometimes fails for no real reason. This retries.

  Usage:
    powershell -ExecutionPolicy Bypass -File push-github.ps1
    powershell -ExecutionPolicy Bypass -File push-github.ps1 -Remote other
#>
param(
  [string]$Remote = 'origin',
  [int]$Tries = 8
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$url = (& git remote get-url $Remote 2>&1)
if ($LASTEXITCODE -ne 0) { Write-Host "remote '$Remote' not found" -ForegroundColor Red; exit 1 }
Write-Host "remote: $Remote -> $url" -ForegroundColor Cyan
Write-Host "branch: $((& git branch --show-current))" -ForegroundColor Cyan
Write-Host ''

for ($i = 1; $i -le $Tries; $i++) {
  Write-Host "[$i/$Tries] pushing..." -ForegroundColor Yellow
  $out = & git push -u $Remote HEAD 2>&1
  $txt = ($out | Out-String)
  if ($LASTEXITCODE -eq 0) {
    Write-Host $txt
    Write-Host 'push OK' -ForegroundColor Green
    exit 0
  }
  if ($txt -match 'Permission denied \(publickey\)') {
    Write-Host 'SSH key is not registered on GitHub.' -ForegroundColor Red
    Write-Host 'Add this public key at https://github.com/settings/keys :' -ForegroundColor Red
    [System.IO.File]::ReadAllLines("$env:USERPROFILE\.ssh\id_ed25519.pub") | ForEach-Object { Write-Host "  $_" }
    exit 2
  }
  if ($txt -match 'Repository not found|does not exist') {
    Write-Host 'Repository not found. Create it first: https://github.com/new' -ForegroundColor Red
    exit 3
  }
  Write-Host ($txt.Trim() -split "`n" | Select-Object -Last 2 | Out-String).Trim() -ForegroundColor DarkGray
  Start-Sleep -Seconds (2 * $i)
}

Write-Host "push failed after $Tries tries" -ForegroundColor Red
exit 1