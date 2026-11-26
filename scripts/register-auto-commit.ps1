<#
  Register the GitHub auto-backup scheduled task.

  Creates (or replaces) a Windows Scheduled Task that runs
  scripts\auto-commit.ps1 every N minutes, so uncommitted work is pushed to
  GitHub automatically instead of waiting for a manual commit.

  ASCII only -- Windows PowerShell 5.1 reads .ps1 as ANSI unless the file has a
  UTF-8 BOM, which corrupts non-ASCII characters.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1
    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1 -Minutes 5
    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1 -Remove
    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1 -Query
#>
param(
  [int]$Minutes = 10,
  [switch]$Remove,
  [switch]$Query
)

$ErrorActionPreference = 'Stop'

$TaskName = 'XiaoyuLaile-AutoCommit'
$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root 'scripts\auto-commit.ps1'
$LogFile = Join-Path $Root 'data\auto-commit.log'

function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "  ok  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  !   $m" -ForegroundColor Yellow }

# ------------------------------------------------------------------ query
if ($Query) {
  Say 'auto-backup status'
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) {
    Warn 'task is not registered'
  } else {
    $i = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host ("  state        : " + $t.State)
    Write-Host ("  last run     : " + $i.LastRunTime)
    Write-Host ("  last result  : 0x" + ('{0:X}' -f $i.LastTaskResult))
    Write-Host ("  next run     : " + $i.NextRunTime)
    $r = $t.Triggers[0].Repetition
    if ($r) { Write-Host ("  interval     : " + $r.Interval) }
  }
  if (Test-Path $LogFile) {
    Write-Host ''
    Say 'recent auto-commit log'
    Get-Content $LogFile -Tail 8 | ForEach-Object { Write-Host ('  ' + $_) }
  } else {
    Warn 'no log yet'
  }
  exit 0
}

# ------------------------------------------------------------------ remove
if ($Remove) {
  Say "removing task $TaskName"
  $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $t) { Warn 'task was not registered'; exit 0 }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Ok 'removed'
  exit 0
}

# ------------------------------------------------------------------ guards
if (-not (Test-Path $Script)) { throw "auto-commit.ps1 not found at $Script" }
if (-not (Test-Path (Join-Path $Root '.git'))) { throw "not a git repository: $Root" }
if ($Minutes -lt 1 -or $Minutes -gt 1440) { throw 'Minutes must be between 1 and 1440' }

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) { throw 'git is not on PATH' }

# Verify the remote before scheduling a task that will fail forever.
Push-Location $Root
try {
  $remote = (& git remote get-url origin 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'no origin remote configured' }
  Ok ("remote: " + $remote)
} finally {
  Pop-Location
}

Say "registering $TaskName (every $Minutes minute(s))"

$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Script + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $Root

# A single trigger repeated for 10 years. TimeSpan::MaxValue produces an
# invalid XML duration (P99999999DT...) and registration fails.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $Minutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Auto-commit and push xiaoyu-laile to GitHub' -Force | Out-Null

Ok 'registered'

$t = Get-ScheduledTask -TaskName $TaskName
$i = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host ''
Write-Host ("  state      : " + $t.State)
Write-Host ("  interval   : " + $t.Triggers[0].Repetition.Interval)
Write-Host ("  next run   : " + $i.NextRunTime)
Write-Host ("  log        : " + $LogFile)
Write-Host ''
Write-Host '  check anytime :' -ForegroundColor White
Write-Host '    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1 -Query' -ForegroundColor White
Write-Host '  stop / remove :' -ForegroundColor White
Write-Host '    powershell -ExecutionPolicy Bypass -File scripts\register-auto-commit.ps1 -Remove' -ForegroundColor White
