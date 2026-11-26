<#
  Auto-commit and push to GitHub -- "real time" backup of the working tree.

  Why: the working tree carries work that is not committed yet. If the machine
  dies, nothing recovers it. This script snapshots whatever changed and pushes
  it, so the remote always has the latest state.

  Run by a Windows Scheduled Task (see register-auto-commit.ps1), typically
  every 10 minutes. Safe to run manually too.

  Rules:
    - never commits data/ or .env  (they are gitignored, and .gitignore is
      the single source of truth here -- do not duplicate those rules)
    - does nothing when the tree is clean (no empty commits)
    - retries the push: GitHub over SSH resets about one connection in six
      on this network
    - a lock file prevents two runs from overlapping
    - ASCII only. Windows PowerShell 5.1 reads .ps1 as ANSI unless the file
      has a UTF-8 BOM, which corrupts non-ASCII characters.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\auto-commit.ps1
    powershell -ExecutionPolicy Bypass -File scripts\auto-commit.ps1 -DryRun
#>
param(
  [switch]$DryRun,
  [string]$Remote = 'origin',
  [int]$Tries = 6
)

$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$LogFile = Join-Path $Root 'data\auto-commit.log'
$LockFile = Join-Path $Root 'data\.auto-commit.lock'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Log([string]$msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
  Write-Host $line
  try {
    $dir = Split-Path -Parent $LogFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::AppendAllText($LogFile, $line + "`r`n", $Utf8)
  } catch {
    # logging must never break the backup
  }
}

# ---------------------------------------------------------------- guards
if (-not (Test-Path (Join-Path $Root '.git'))) {
  Log 'skip: not a git repository'
  exit 0
}

# lock: a stale lock older than 30 minutes is ignored
if (Test-Path $LockFile) {
  $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  if ($age.TotalMinutes -lt 30) {
    Log 'skip: another auto-commit is running'
    exit 0
  }
  Log 'stale lock removed'
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
try {
  [System.IO.File]::WriteAllText($LockFile, (Get-Date -Format 'o'), $Utf8)
} catch {
  Log 'skip: cannot create lock'
  exit 0
}

try {
  # ------------------------------------------------------------ changes?
  $status = & git status --porcelain 2>&1
  if ($LASTEXITCODE -ne 0) {
    Log 'skip: git status failed'
    exit 1
  }
  $lines = @($status | Where-Object { $_ -and $_.Trim() })
  if ($lines.Count -eq 0) {
    # nothing to commit, but still push if the local branch is ahead
    $ahead = & git rev-list --count '@{u}..HEAD' 2>&1
    if ($LASTEXITCODE -eq 0 -and "$ahead".Trim() -match '^\d+$' -and [int]"$ahead".Trim() -gt 0) {
      Log ("clean tree but $($ahead.Trim()) commit(s) ahead, pushing")
    } else {
      exit 0
    }
  } else {
    Log ("detected $($lines.Count) changed path(s)")
    & git add -A 2>&1 | Out-Null

    $staged = & git diff --cached --name-only 2>&1
    $stagedList = @($staged | Where-Object { $_ -and $_.Trim() })
    if ($stagedList.Count -eq 0) {
      Log 'nothing staged after add, skip'
      exit 0
    }

    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $msg = "auto: backup $stamp ($($stagedList.Count) files)`n`n" +
           (($stagedList | Select-Object -First 40) -join "`n")
    if ($stagedList.Count -gt 40) {
      $msg += "`n... and " + ($stagedList.Count - 40) + " more files"
    }

    $tmp = Join-Path $env:TEMP ('autocommit-' + [guid]::NewGuid().ToString('n') + '.txt')
    [System.IO.File]::WriteAllText($tmp, $msg, $Utf8)

    if ($DryRun) {
      Log ("dry run: would commit " + $stagedList.Count + " file(s)")
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
      exit 0
    }

    & git commit -q -F $tmp 2>&1 | Out-Null
    $commitCode = $LASTEXITCODE
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($commitCode -ne 0) {
      Log 'commit failed, leaving changes in the tree'
      exit 1
    }
    Log ("committed: " + (& git log --oneline -1 2>&1))
  }

  # ------------------------------------------------------------ push
  if ($DryRun) { Log 'dry run: would push'; exit 0 }

  $branch = (& git branch --show-current 2>&1).Trim()
  if (-not $branch) { Log 'skip push: detached HEAD'; exit 0 }

  for ($i = 1; $i -le $Tries; $i++) {
    $out = & git push $Remote $branch 2>&1
    if ($LASTEXITCODE -eq 0) {
      Log "push OK ($Remote/$branch)"
      exit 0
    }
    $txt = ($out | Out-String)
    if ($txt -match 'Permission denied \(publickey\)') {
      Log 'push failed: SSH key not authorised on GitHub'
      exit 2
    }
    if ($txt -match 'Repository not found') {
      Log 'push failed: remote repository not found'
      exit 3
    }
    if ($txt -match 'non-fast-forward|rejected|fetch first') {
      Log 'push rejected: remote moved ahead, needs a manual merge'
      exit 4
    }
    Log ("push attempt $i/$Tries failed, retrying")
    Start-Sleep -Seconds (2 * $i)
  }

  Log "push failed after $Tries attempts"
  exit 1
} finally {
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
