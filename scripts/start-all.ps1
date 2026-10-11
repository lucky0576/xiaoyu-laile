<#
  Xiaoyu Laile - keep the site and its public tunnel alive.

  Does three things:
    1. If nothing answers on port 8787, start `node server.js`
    2. If cloudflared is not running, start a quick tunnel
       (no browser interstitial, unlike ngrok's free plan)
    3. Sync the tunnel URL into .env PUBLIC_BASE_URL and restart the app
       when it changed (quick tunnels get a NEW domain on every restart,
       and share links / QR codes are built from PUBLIC_BASE_URL)

  Registered as scheduled tasks:
    XiaoyuLaile           - at logon
    XiaoyuLaile-Watchdog  - every 5 minutes

  Manual run:
    powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1

  NOTE: ASCII-only on purpose. Windows PowerShell 5.1 reads .ps1 as ANSI
  unless the file has a UTF-8 BOM, which corrupts non-ASCII characters and
  can break parsing. Keep this file ASCII.
#>
$ErrorActionPreference = 'SilentlyContinue'
$Root   = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root 'data'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
$Log       = Join-Path $LogDir 'autostart.log'
$TunnelLog = Join-Path $LogDir 'public-tunnel.log'
$TunnelOut = Join-Path $LogDir 'public-tunnel.out.log'
$EnvFile   = Join-Path $Root '.env'

function Write-Log($msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Add-Content -Path $Log -Encoding UTF8
}

function Resolve-Exe([string]$name, [string[]]$candidates) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

Set-Location $Root
Write-Log '---- start-all triggered ----'

$Port = 8787

$NodeExe = Resolve-Exe 'node' @(
  "$env:USERPROFILE\nodejs\node.exe",
  "$env:ProgramFiles\nodejs\node.exe",
  "${env:ProgramFiles(x86)}\nodejs\node.exe"
)
$CfExe = Resolve-Exe 'cloudflared' @(
  (Join-Path (Split-Path -Parent $PSScriptRoot) '..\.tools\cloudflared.exe'),
  (Join-Path $Root '..\.tools\cloudflared.exe'),
  "$env:LOCALAPPDATA\cloudflared\cloudflared.exe",
  "$env:ProgramFiles\cloudflared\cloudflared.exe"
)

function Test-AppUp {
  try {
    return (Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200
  } catch { return $false }
}

function Start-App {
  if (-not $NodeExe) { Write-Log 'node executable not found, cannot start web app'; return $false }
  Start-Process -FilePath $NodeExe -ArgumentList @('server.js', '--port', "$Port") `
    -WorkingDirectory $Root -WindowStyle Hidden
  Write-Log "started web app: $NodeExe server.js --port $Port"
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    if (Test-AppUp) { return $true }
  }
  return $false
}

# ---------------------------------------------------------------- 1. web app
if (Test-AppUp) {
  Write-Log "web app already up on port $Port, skipping"
} else {
  [void](Start-App)
}

# ---------------------------------------------------------------- 2. tunnel
$cfRunning = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
if ($cfRunning.Count -gt 0) {
  Write-Log "cloudflared already running (PID $($cfRunning[0].Id)), skipping"
} elseif ($CfExe) {
  Remove-Item $TunnelLog -Force
  Remove-Item $TunnelOut -Force
  Start-Process -FilePath $CfExe `
    -ArgumentList @('tunnel', '--url', "http://localhost:$Port", '--no-autoupdate') `
    -RedirectStandardError $TunnelLog -RedirectStandardOutput $TunnelOut -WindowStyle Hidden
  Write-Log "started cloudflared quick tunnel -> http://localhost:$Port"
} else {
  Write-Log 'cloudflared not found, skipping tunnel'
}

# ---------------------------------------------------------------- 3. sync URL
# IMPORTANT: match the tunnel domain but NOT the Cloudflare API host.
# A naive 'https://[a-z0-9-]+\.trycloudflare\.com' also matches
# https://api.trycloudflare.com, which appears in the log on API failures,
# and would get written into .env as if it were the public site.
$UrlPattern = 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com'

function Get-TunnelUrlFromLog {
  if (-not (Test-Path $TunnelLog)) { return $null }
  $m = Select-String -Path $TunnelLog -Pattern $UrlPattern -AllMatches
  if (-not $m) { return $null }
  return ($m.Matches | Select-Object -Last 1).Value
}

# Only accept a URL that actually serves our app. A domain can appear in the
# log while the tunnel is still broken (or already recycled by Cloudflare).
function Test-PublicUrl([string]$u) {
  if (-not $u) { return $false }
  try {
    $r = Invoke-WebRequest "$u/api/health" -UseBasicParsing -TimeoutSec 15
    return ($r.StatusCode -eq 200 -and $r.Content -match '"ok"')
  } catch { return $false }
}

$PublicUrl = $null
for ($i = 0; $i -lt 20; $i++) {
  $cand = Get-TunnelUrlFromLog
  if ($cand -and (Test-PublicUrl $cand)) { $PublicUrl = $cand; break }
  Start-Sleep -Seconds 2
}

if (-not $PublicUrl) {
  Write-Log 'public tunnel URL not available/healthy; leaving .env unchanged'
} else {
  # Read/write as explicit UTF-8. Get-Content -Raw would use the ANSI codepage
  # on Windows PowerShell 5.1 and turn the Chinese comments into mojibake.
  $Utf8 = New-Object System.Text.UTF8Encoding($false)
  $envText = if (Test-Path $EnvFile) { [System.IO.File]::ReadAllText($EnvFile, $Utf8) } else { '' }
  $mm = [regex]::Match($envText, '(?m)^[ \t]*PUBLIC_BASE_URL[ \t]*=[ \t]*(\S*)[ \t]*$')
  $current = if ($mm.Success) { $mm.Groups[1].Value } else { $null }

  if ($current -eq $PublicUrl) {
    Write-Log "PUBLIC_BASE_URL already in sync: $PublicUrl"
  } else {
    Write-Log "PUBLIC_BASE_URL changed from '$current' to '$PublicUrl'"
    if ($mm.Success) {
      $envText = [regex]::Replace($envText, '(?m)^[ \t]*PUBLIC_BASE_URL[ \t]*=[ \t]*\S*[ \t]*$', "PUBLIC_BASE_URL=$PublicUrl")
    } else {
      $envText = $envText.TrimEnd() + "`nPUBLIC_BASE_URL=$PublicUrl`n"
    }
    [System.IO.File]::WriteAllText($EnvFile, $envText, $Utf8)

    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force }
    }
    Start-Sleep -Seconds 2
    [void](Start-App)
    Write-Log "restarted web app on new public URL: $PublicUrl"
  }
}

Write-Log '---- start-all done ----'
