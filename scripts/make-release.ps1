<#
  Xiaoyu Laile - build a release tarball

  Produces xiaoyu-laile-release-<timestamp>.tar.gz ready to upload to a server.
  Excludes local data, tests, secrets, logs and helper images.

  IMPORTANT - keep this file ASCII-only.
  Windows PowerShell 5.1 decodes .ps1 as ANSI/GBK unless the file carries a
  UTF-8 BOM. Non-ASCII characters get corrupted, which silently breaks string
  and regex literals (this exact bug shipped a .env and stray PNGs inside the
  release package once). Do not add Chinese text here.

  Usage:
    .\scripts\make-release.ps1
    .\scripts\make-release.ps1 -OutDir D:\releases
#>
param(
  # Empty means "parent directory of the project" (computed in the body,
  # because $PSScriptRoot is not available in a param default).
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Split-Path -Parent $Root }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$Name  = 'xiaoyu-laile'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$Stage = Join-Path $env:TEMP "xyl-release-$Stamp"
$Dest  = Join-Path $Stage $Name

# --- top level of the project -------------------------------------------
# Directories skipped only at the project root.
# NOTE: "data" must never become a recursive name filter, otherwise src\data
# (the industry dictionary) would be dropped and the package would not boot.
# Test scratch dirs are all named data / data-*, so match by pattern to stay
# safe when new test suites add their own.
$SkipRootFixed = @('node_modules', '.git', '.tools', 'tests')
function Test-SkipRootDir([string]$name) {
  if ($name -eq 'data') { return $true }
  if ($name -like 'data-*') { return $true }
  return $SkipRootFixed -contains $name
}

$SkipRootFiles = @('.env')   # machine-specific, must never ship
$SkipRootNames = @('qr-smoke.png', 'package-lock.json')
$SkipRootExt   = @('.png')   # stray helper images (e.g. QR screenshots)

# --- nested anywhere ----------------------------------------------------
# Only names that can never be real source inside this project.
$SkipAnyDirs  = @('node_modules', '.git', '.tools', '_boot', 'data-test', 'data-debug')
$SkipAnyFiles = @('.env')
$SkipAnyExt   = @('.log')

function Copy-Dir {
  param([string]$SrcDir, [string]$DstDir)

  if (-not (Test-Path $DstDir)) { New-Item -ItemType Directory -Force -Path $DstDir | Out-Null }

  foreach ($entry in (Get-ChildItem -Path $SrcDir -Force)) {
    if ($entry.PSIsContainer) {
      if ($SkipAnyDirs -contains $entry.Name) { continue }
      Copy-Dir -SrcDir $entry.FullName -DstDir (Join-Path $DstDir $entry.Name)
    } else {
      if ($SkipAnyFiles -contains $entry.Name) { continue }
      if ($SkipAnyExt -contains $entry.Extension) { continue }
      Copy-Item $entry.FullName (Join-Path $DstDir $entry.Name) -Force
    }
  }
}

Write-Host "==> Staging: $Dest" -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "==> Copying (skipping root data dirs and dev-only folders)" -ForegroundColor Cyan
foreach ($item in (Get-ChildItem -Path $Root -Force)) {
  if ($item.PSIsContainer) {
    if (Test-SkipRootDir $item.Name) { continue }
    Copy-Dir -SrcDir $item.FullName -DstDir (Join-Path $Dest $item.Name)
  } else {
    if ($SkipRootFiles -contains $item.Name) { continue }
    if ($SkipRootNames -contains $item.Name) { continue }
    if ($SkipRootExt -contains $item.Extension) { continue }
    Copy-Item $item.FullName (Join-Path $Dest $item.Name) -Force
  }
}

# deploy/data is a runtime mount point created by docker-compose; never ship it
Remove-Item -Recurse -Force (Join-Path $Dest 'deploy\data') -ErrorAction SilentlyContinue

# empty data dir: docker-compose mounts a volume over it, native deploy writes into it
New-Item -ItemType Directory -Force -Path (Join-Path $Dest 'data') | Out-Null

# --- sanity checks: the package must be able to boot --------------------
$Required = @(
  'server.js', 'package.json',
  'src\data\taxonomy.js', 'src\lib\qrcode.js', 'src\lib\png.js', 'src\lib\zip.js', 'src\lib\extract.js',
  'src\services\ai.js', 'src\services\listings.js', 'src\services\chat.js', 'src\http\app.js',
  'public\index.html', 'public\static\app.js', 'public\static\styles.css',
  'scripts\seed.js', 'deploy\deploy.sh', 'deploy\Dockerfile'
)
$missing = @()
foreach ($rel in $Required) {
  if (-not (Test-Path (Join-Path $Dest $rel))) { $missing += $rel }
}
if ($missing.Count -gt 0) {
  Write-Host "ERROR: release is incomplete, missing:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
  throw 'release package is missing required files'
}
Write-Host "==> Sanity check passed ($($Required.Count) required files present)" -ForegroundColor Green

# --- pack ---------------------------------------------------------------
$target = Join-Path $OutDir "$Name-release-$Stamp.tar.gz"
Write-Host "==> Packing -> $target" -ForegroundColor Cyan
tar -czf $target -C $Stage $Name
if ($LASTEXITCODE -ne 0) { throw 'tar failed' }

# --- verify the archive contents ---------------------------------------
$listed = @(tar -tzf $target)
$bad = @()
foreach ($entry in $listed) {
  if ($entry -match '/\.env$') { $bad += "$entry (machine-specific .env)" }
  if ($entry -match 'qr-smoke\.png$') { $bad += "$entry (helper image)" }
  if ($entry -match '\.png$' -and $entry -notmatch '/public/') { $bad += "$entry (stray image)" }
  if ($entry -match '/collections/') { $bad += "$entry (live data)" }
}
if ($bad.Count -gt 0) {
  Write-Host "ERROR: archive contains files it should not:" -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
  throw 'archive content verification failed'
}
Write-Host "==> Archive verified: $($listed.Count) entries, no secrets or live data" -ForegroundColor Green

$sizeKb = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host ""
Write-Host "Done: $target ($sizeKb KB)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps on the server:" -ForegroundColor Yellow
Write-Host "  scp `"$target`" root@SERVER_IP:/root/"
Write-Host "  ssh root@SERVER_IP"
Write-Host "  cd /root && tar -xzf $(Split-Path -Leaf $target)"
Write-Host "  cd $Name && sudo bash deploy/deploy.sh"
Write-Host ""
Write-Host "Full guide: deploy/README.md" -ForegroundColor Yellow

Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
