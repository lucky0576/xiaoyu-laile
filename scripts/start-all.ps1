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

# Tunnel liveness ONLY -- deliberately independent of the local app.
#
# BUG THIS FIXES: the watchdog used Test-PublicUrl (tunnel + app end to end) to
# decide whether the tunnel was dead. So every time the web app restarted, the
# probe failed, the script concluded "tunnel DEAD", killed cloudflared and made a
# brand new tunnel -- which means a new public URL. Restarting the app was
# silently destroying the tunnel and invalidating every shared link.
#
# A tunnel is alive if cloudflared is running AND its hostname still resolves.
# Whether the app behind it is up is a separate question (Test-AppUp).
function Test-TunnelAlive([string]$u) {
  if (-not $u) { return $false }
  $cf = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
  if ($cf.Count -eq 0) { return $false }
  try {
    $h = ([uri]$u).Host
    $a = @(Resolve-DnsName $h -Type A -ErrorAction Stop | Where-Object { $_.IPAddress })
    return ($a.Count -gt 0)
  } catch {
    # No Resolve-DnsName (old host) -> fall back to an HTTP probe.
    try {
      $null = Invoke-WebRequest "$u/api/health" -UseBasicParsing -TimeoutSec 10
      return $true
    } catch {
      # An HTTP-level error still proves the tunnel edge is reachable.
      return [bool]$_.Exception.Response
    }
  }
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
# ---------------------------------------------------------------- 2. tunnel
# A cloudflared process can be alive while its tunnel is already dead:
# Cloudflare recycles quick tunnels ("Unauthorized: Tunnel not found") and
# the agent just retries forever. So "process exists" is NOT a health check.
# We test the URL from .env and, when it is dead, replace the tunnel.

$UrlPattern = 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com'

function Get-TunnelUrlFromLog {
  if (-not (Test-Path $TunnelLog)) { return $null }
  $m = Select-String -Path $TunnelLog -Pattern $UrlPattern -AllMatches
  if (-not $m) { return $null }
  return ($m.Matches | Select-Object -Last 1).Value
}

# Only accept a URL that actually serves our app.
function Test-PublicUrl([string]$u) {
  if (-not $u) { return $false }
  try {
    $r = Invoke-WebRequest "$u/api/health" -UseBasicParsing -TimeoutSec 15
    return ($r.StatusCode -eq 200 -and $r.Content -match '"ok"')
  } catch { return $false }
}

function Get-EnvBaseUrl {
  if (-not (Test-Path $EnvFile)) { return $null }
  $txt = [System.IO.File]::ReadAllText($EnvFile, (New-Object System.Text.UTF8Encoding($false)))
  $mm = [regex]::Match($txt, '(?m)^[ \t]*PUBLIC_BASE_URL[ \t]*=[ \t]*(\S*)[ \t]*$')
  if ($mm.Success -and $mm.Groups[1].Value) { return $mm.Groups[1].Value }
  return $null
}

function Start-QuickTunnel {
  if (-not $CfExe) { return $false }
  Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
  Start-Sleep -Seconds 2
  Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue
  Remove-Item $TunnelOut -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $CfExe `
    -ArgumentList @('tunnel', '--url', "http://localhost:$Port", '--no-autoupdate') `
    -RedirectStandardError $TunnelLog -RedirectStandardOutput $TunnelOut -WindowStyle Hidden
  Write-Log "started cloudflared quick tunnel -> http://localhost:$Port"
  return $true
}

$knownUrl = Get-EnvBaseUrl
$cfRunning = @(Get-Process cloudflared -ErrorAction SilentlyContinue)

# Keep the existing tunnel unless it is genuinely gone.
# Do NOT use Test-PublicUrl here -- that also tests the local app, so an app
# restart would look like a dead tunnel and needlessly mint a new URL.
if ($knownUrl -and (Test-TunnelAlive $knownUrl)) {
  Write-Log "tunnel healthy, keeping it: $knownUrl"
} else {
  if ($knownUrl) { Write-Log "tunnel at $knownUrl is DEAD, replacing it" }
  elseif ($cfRunning.Count -gt 0) { Write-Log 'cloudflared running but no URL recorded, restarting' }
  else { Write-Log 'no tunnel running, starting one' }

  if (Start-QuickTunnel) {
    # wait for a URL that actually answers
    for ($i = 0; $i -lt 30; $i++) {
      $cand = Get-TunnelUrlFromLog
      if ($cand -and (Test-PublicUrl $cand)) { break }
      Start-Sleep -Seconds 2
    }
  } else {
    Write-Log 'cloudflared not found, skipping tunnel'
  }
}

# ---------------------------------------------------------------- 3. sync URL
# ($UrlPattern / Get-TunnelUrlFromLog / Test-PublicUrl are defined in step 2.)
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

# ---------------------------------------------------------------- 4. launcher
# Keep a desktop shortcut pointing at the CURRENT tunnel URL.
#
# A quick tunnel's hostname dies with the tunnel, so old links start returning
# Cloudflare Error 1016 ("Origin DNS error"). Rather than chase the user with a
# new URL every time, we rewrite a clickable shortcut on the Desktop and inside
# the project folder so there is one stable thing to click.
#
# NOTE: filename must stay ASCII -- this script must remain pure ASCII because a
# non-ASCII .ps1 gets corrupted by the ANSI codepage on Windows PowerShell 5.1.
function Write-Launcher([string]$url) {
  if (-not $url) { return }
  $body = "[InternetShortcut]`r`nURL=$url`r`nIconIndex=0`r`n"
  $targets = @(
    (Join-Path $Root 'xiaoyu-laile.url'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'xiaoyu-laile.url')
  )
  foreach ($path in $targets) {
    try {
      $dir = Split-Path $path -Parent
      if (-not (Test-Path $dir)) { continue }
      $old = if (Test-Path $path) { [System.IO.File]::ReadAllText($path, (New-Object System.Text.UTF8Encoding($false))) } else { '' }
      if ($old -ne $body) {
        [System.IO.File]::WriteAllText($path, $body, (New-Object System.Text.UTF8Encoding($false)))
        Write-Log "launcher updated: $path"
      }
    } catch {
      Write-Log "launcher write failed: $path"
    }
  }
}

# Prefer the value we just synced; fall back to whatever .env already holds.
$finalUrl = $PublicUrl
if (-not $finalUrl) { $finalUrl = Get-EnvBaseUrl }
if ($finalUrl) { Write-Launcher $finalUrl }

Write-Log '---- start-all done ----'
