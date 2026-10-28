# Deploy helper (Windows / PowerShell)
#
# Usage:
#   .\scripts\deploy.ps1                       # auto: upload changed files, restart only if backend changed
#   .\scripts\deploy.ps1 -Files a.js,b.js      # explicit file list
#   .\scripts\deploy.ps1 -Force                # force restart
#   .\scripts\deploy.ps1 -NoRestart            # force no restart
#
# Rules:
#   - public/* : upload only, NO restart (static files are read from disk)
#   - src/*, server.js : upload + restart, then poll /api/health up to 20s
#   - Restart only happens when backend files changed, so the site stays online
#     for frontend-only changes.

param(
  [string[]]$Files = @(),
  [switch]$Force,
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Tools = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\.tools'
$Pscp = Join-Path $Tools 'pscp.exe'
$Plink = Join-Path $Tools 'plink.exe'
$HostKey = 'SHA256:3+ADpEr03S1a26kdUYIkKBrxJID6hIQ8F7X9bal00Ks'
$Ip = 'root@154.221.23.7'
$Pw = 'Weilan0576'
$RemoteRoot = '/opt/xiaoyu-laile'

function Say($msg) { Write-Host "  $msg" }

# ---------- 1) decide file list ----------
if (-not $Files -or $Files.Count -eq 0) {
  Push-Location $Root
  $changed = & git status --porcelain 2>$null | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -gt 3) { $line.Substring(2).Trim() }
  } | Where-Object { $_ -and (Test-Path (Join-Path $Root ($_ -replace '/', '\'))) }
  Pop-Location
  $Files = @($changed)
}

if (-not $Files -or $Files.Count -eq 0) {
  Say 'Nothing to deploy'
  exit 0
}

Say "Files to deploy: $($Files.Count)"

# ---------- 2) decide restart ----------
$backendChanged = $Files | Where-Object {
  $f = $_.Replace('\', '/')
  $f -like 'src/*' -or $f -eq 'server.js' -or $f -eq 'package.json'
}

$needRestart = $false
if ($Force) { $needRestart = $true }
elseif ($NoRestart) { $needRestart = $false }
elseif ($backendChanged) { $needRestart = $true }

if ($needRestart) {
  Say 'Backend changed -> restart required'
} else {
  Say 'Frontend only -> NO restart (refresh browser to see changes)'
}

# ---------- 3) upload ----------
$ok = 0
$fail = 0
foreach ($rel in $Files) {
  $relNorm = $rel.Replace('\', '/')
  $local = Join-Path $Root ($rel -replace '/', '\')
  $remote = "$RemoteRoot/$relNorm"
  if (-not (Test-Path $local)) { Say "skip (missing locally): $rel"; continue }
  & $Pscp -pw $Pw -hostkey $HostKey -batch $local "${Ip}:$remote" 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ok++
    Say "up: $relNorm"
  } else {
    $fail++
    Say "FAIL: $relNorm"
  }
}

Say "Uploaded ok=$ok fail=$fail"

# ---------- 冒烟测试 ----------
# 必须在重启之后跑：否则测的是正在跑的旧进程，等于没测。
# 2026-10-26 那次把注册页改成引用未定义变量，手机注册坏了整整两天才被发现。
function Invoke-SmokeTest {
  Say ""
  Say "Smoke test: register flow..."
  $NodeExe = "C:\Users\Administrator\nodejs\node.exe"
  $smoke = Join-Path $Root "scripts\smoke-register.mjs"
  if (-not (Test-Path $NodeExe) -or -not (Test-Path $smoke)) {
    Say "  (skipped: node or smoke script missing)"
    return
  }
  & $NodeExe $smoke 2>&1 | ForEach-Object { Say $_ }
  if ($LASTEXITCODE -ne 0) {
    Say ""
    Say "FAILED: register smoke test did not pass"
    exit 1
  }
}

if ($fail -gt 0) { exit 1 }


# ---------- 4) restart if needed ----------
if (-not $needRestart) {
  Invoke-SmokeTest
  Say ''
  Say 'DONE (no restart, zero downtime)'
  exit 0
}

Say ''
Say 'Restarting service...'
$remoteScript = Join-Path $Root 'scripts\remote-restart.sh'
$tmp = Join-Path $env:TEMP 'remote-restart.sh'
# normalize to LF and ASCII-safe copy
$content = [System.IO.File]::ReadAllText($remoteScript) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($tmp, $content, (New-Object System.Text.UTF8Encoding($false)))

& $Plink -pw $Pw -hostkey $HostKey -batch $Ip -m $tmp 2>&1 | ForEach-Object { Say $_ }

if ($LASTEXITCODE -eq 0) {
  Invoke-SmokeTest
  Say ''
  Say 'DONE (restarted, health check passed)'
} else {
  Say ''
  Say 'FAILED: health check did not pass, check journalctl'
  exit 1
}
