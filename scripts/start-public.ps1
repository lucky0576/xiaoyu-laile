<#
  Xiaoyu Laile - start the site plus a public tunnel.

  Four modes:

  1) serveo  (free, fixed subdomain once your SSH key is registered)
     First run prints a console.serveo.net link; log in with Google/GitHub to
     register the local SSH key. After that the address is stable:
       https://<Subdomain>.serveousercontent.com
     Caveat: the free tier shows a browser warning page on first visit.

  2) ngrok   (free, fixed domain, needs a real authtoken)
     Register at https://dashboard.ngrok.com, claim your free static domain
     (xxx.ngrok-free.dev) and put the real authtoken in
     %LOCALAPPDATA%\ngrok\ngrok.yml. Caveat: free tier shows an interstitial.

  3) cloudflare (recommended for production: fixed, no interstitial, no
     bandwidth cap, automatic HTTPS). Requires your own domain on Cloudflare:
       cloudflared tunnel login
       cloudflared tunnel create xiaoyu
       cloudflared tunnel route dns xiaoyu xiaoyu.your-domain.com

  4) cloudflare-quick  (temporary; the hostname changes on every restart)

  Usage:
    .\scripts\start-public.ps1 -Mode ngrok -Domain xxxx.ngrok-free.dev
    .\scripts\start-public.ps1 -Mode serveo -Subdomain xiaoyu-lailai
    .\scripts\start-public.ps1 -Mode cloudflare -Tunnel xiaoyu -Domain xiaoyu.example.com
    .\scripts\start-public.ps1 -Mode cloudflare-quick

  NOTE: ASCII-only on purpose. Windows PowerShell 5.1 reads .ps1 as ANSI unless
  the file has a UTF-8 BOM, which corrupts non-ASCII characters and can break
  parsing. Keep this file ASCII.
#>
param(
  [ValidateSet('serveo', 'ngrok', 'cloudflare', 'cloudflare-quick')]
  [string]$Mode = 'ngrok',
  [string]$Subdomain = 'xiaoyu-lailai',
  [string]$Domain = '',
  [string]$Tunnel = 'xiaoyu',
  [int]$Port = 8787,
  [switch]$NoApp,
  [switch]$SetBaseUrl
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }

function Resolve-Exe([string]$name, [string[]]$candidates) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

# ---------------------------------------------------------------- web app
$appUp = $false
try {
  $appUp = (Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200
} catch { $appUp = $false }

if (-not $NoApp) {
  if ($appUp) {
    Step "web app already running on port $Port"
  } else {
    $node = Resolve-Exe 'node' @("$env:USERPROFILE\nodejs\node.exe", "$env:ProgramFiles\nodejs\node.exe")
    if (-not $node) { throw 'node executable not found' }
    Step "starting web app on port $Port"
    Start-Process -FilePath $node -ArgumentList @('server.js', '--port', "$Port") `
      -WorkingDirectory $Root -WindowStyle Hidden
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 700
      try {
        if ((Invoke-WebRequest "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $appUp = $true; break }
      } catch { }
    }
    if ($appUp) { Write-Host "    web app is ready" -ForegroundColor Green }
    else { Write-Host "    WARNING: web app not ready, run 'node server.js' to see errors" -ForegroundColor Yellow }
  }
}

# ---------------------------------------------------------------- public url
$publicUrl = ''

switch ($Mode) {
  'serveo' {
    Step "starting serveo tunnel (requesting fixed subdomain: $Subdomain)"
    $publicUrl = "https://$Subdomain.serveousercontent.com"
    ssh -i "$env:USERPROFILE\.ssh\id_ed25519" `
      -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL `
      -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
      -R "${Subdomain}:80:localhost:$Port" serveo.net
  }

  'ngrok' {
    if (-not $Domain) { throw 'ngrok mode requires -Domain, e.g. -Domain xxxx.ngrok-free.dev' }
    $ng = Resolve-Exe 'ngrok' @("$env:LOCALAPPDATA\Microsoft\WindowsApps\ngrok.exe")
    if (-not $ng) { throw 'ngrok executable not found' }
    Step "starting ngrok tunnel on $Domain"
    $publicUrl = "https://$Domain"
    & $ng http "$Port" --url "https://$Domain" --log=stdout
  }

  'cloudflare' {
    if (-not $Domain) { throw 'cloudflare mode requires -Domain, e.g. -Domain xiaoyu.example.com' }
    $cf = Resolve-Exe 'cloudflared' @((Join-Path $Root '..\.tools\cloudflared.exe'))
    if (-not $cf) { throw 'cloudflared not found' }
    Step "starting named Cloudflare tunnel ($Tunnel)"
    $publicUrl = "https://$Domain"
    & $cf tunnel run --url "http://127.0.0.1:$Port" $Tunnel
  }

  'cloudflare-quick' {
    $cf = Resolve-Exe 'cloudflared' @((Join-Path $Root '..\.tools\cloudflared.exe'))
    if (-not $cf) { throw 'cloudflared not found' }
    Step 'starting temporary Cloudflare tunnel (hostname changes every restart)'
    & $cf tunnel --url "http://127.0.0.1:$Port" --no-autoupdate
  }
}

# reached after the tunnel stops (Ctrl+C)
if ($SetBaseUrl -and $publicUrl) {
  Step "writing PUBLIC_BASE_URL into .env"
  $envFile = Join-Path $Root '.env'
  $lines = @()
  if (Test-Path $envFile) { $lines = Get-Content $envFile }
  $done = $false
  $lines = $lines | ForEach-Object {
    if ($_ -match '^\s*PUBLIC_BASE_URL\s*=') { $done = $true; "PUBLIC_BASE_URL=$publicUrl" } else { $_ }
  }
  if (-not $done) { $lines += "PUBLIC_BASE_URL=$publicUrl" }
  Set-Content -Path $envFile -Value $lines -Encoding UTF8
  Write-Host "    wrote PUBLIC_BASE_URL=$publicUrl (restart the app to apply)" -ForegroundColor Green
}
