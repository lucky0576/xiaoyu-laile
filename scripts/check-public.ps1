<#
  Xiaoyu Laile - public access doctor.

  Why this exists:
    Earlier verification used the ngrok-skip-browser-warning header. That
    header suppresses exactly the page a real user sees, so the site looked
    healthy while every visitor got ERR_NGROK_6024. This script ALWAYS tests
    the way a visitor does: no bypass headers, browser-like UA, and a WeChat
    in-app user agent.

  Checks:
    1. local app on 8787
    2. cloudflared / ngrok process state
    3. public URL from .env
    4. homepage as a browser would fetch it
    5. API as XHR would fetch it (must be application/json)
    6. WeChat in-app browser
    7. interstitial / tunnel-block detection
    8. share link and QR code point at the public URL

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\check-public.ps1
    powershell -ExecutionPolicy Bypass -File scripts\check-public.ps1 -Url https://x.trycloudflare.com

  NOTE: ASCII-only on purpose (Windows PowerShell 5.1 reads .ps1 as ANSI).
#>
param([string]$Url = '')

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 8787
$Local = "http://127.0.0.1:$Port"

$BrowserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
$WeChatUA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2f) NetType/WIFI Language/zh_CN'

$script:Fail = 0
$script:Warn = 0
function Ok($m)   { Write-Host ("  [OK]   " + $m) -ForegroundColor Green }
function Bad($m)  { $script:Fail++; Write-Host ("  [FAIL] " + $m) -ForegroundColor Red }
function Warn($m) { $script:Warn++; Write-Host ("  [WARN] " + $m) -ForegroundColor Yellow }
function Info($m) { Write-Host ("         " + $m) -ForegroundColor DarkGray }

function Get-EnvValue([string]$key) {
  $f = Join-Path $Root '.env'
  if (-not (Test-Path $f)) { return $null }
  # Read as explicit UTF-8. On Windows PowerShell 5.1, Get-Content -Raw uses
  # the ANSI codepage, so the UTF-8 Chinese comments in .env turn into
  # mojibake whose trailing bytes eat the line break, and the regex below
  # then fails to match at all (false "PUBLIC_BASE_URL missing").
  # NOTE: keep this file ASCII-only. A non-ASCII comment here would be
  # decoded as ANSI and corrupt the surrounding code.
  $text = [System.IO.File]::ReadAllText($f, (New-Object System.Text.UTF8Encoding($false)))
  $m = [regex]::Match($text, "(?m)^[ \t]*$key[ \t]*=[ \t]*(\S*)[ \t]*$")
  if ($m.Success -and $m.Groups[1].Value) { return $m.Groups[1].Value }
  return $null
}

function Test-Interstitial([string]$body, [string]$ct) {
  if ($body -match 'ERR_NGROK') { return 'ngrok interstitial/block (ERR_NGROK)' }
  if ($body -match 'about to visit' -and $body -match 'ngrok') { return 'ngrok browser warning page' }
  if ($body -match 'You are about to visit') { return 'tunnel browser warning page' }
  if ($ct -notmatch 'text/html' -and $ct -notmatch 'application/json') { return "unexpected content-type: $ct" }
  return $null
}

Write-Host ''
Write-Host '=============== Xiaoyu Laile public access doctor ===============' -ForegroundColor Cyan

# ---------------------------------------------------------------- 1
Write-Host ''
Write-Host '1) local app on port 8787' -ForegroundColor White
try {
  $h = (Invoke-WebRequest "$Local/api/health" -UseBasicParsing -TimeoutSec 8).Content | ConvertFrom-Json
  Ok "local API responding (uptime $($h.data.uptimeSec)s, node $($h.data.node))"
  Info "PUBLIC_BASE_URL seen by app: $($h.data.baseUrl)"
} catch {
  Bad "local API not reachable: $($_.Exception.Message)"
  Write-Host ''
  Write-Host 'Local app is down. Start it with: powershell -File scripts\start-all.ps1' -ForegroundColor Yellow
  exit 1
}

# ---------------------------------------------------------------- 2
Write-Host ''
Write-Host '2) tunnel process' -ForegroundColor White
$cf = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
$ng = @(Get-Process ngrok -ErrorAction SilentlyContinue)
if ($cf.Count -gt 0) {
  Ok "cloudflared running (PID $($cf[0].Id)) - no browser interstitial"
} else {
  Warn 'cloudflared is NOT running'
}
if ($ng.Count -gt 0) {
  Warn "ngrok is running (PID $($ng[0].Id)) - free plan shows a warning page and blocks XHR"
}

# ---------------------------------------------------------------- 3
Write-Host ''
Write-Host '3) public URL' -ForegroundColor White
if (-not $Url) { $Url = Get-EnvValue 'PUBLIC_BASE_URL' }
if (-not $Url) {
  Bad 'no public URL given and PUBLIC_BASE_URL missing from .env'
  exit 1
}
$Url = $Url.TrimEnd('/')
Ok "testing $Url"

# ---------------------------------------------------------------- 4
Write-Host ''
Write-Host '4) homepage as a browser fetches it (NO bypass headers)' -ForegroundColor White
try {
  $r = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 30 -UserAgent $BrowserUA `
        -Headers @{ 'Accept' = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  $ct = [string]$r.Headers['Content-Type']
  $bad = Test-Interstitial $r.Content $ct
  if ($bad) { Bad "browser got an interstitial/block: $bad" }
  elseif ($r.Content -match 'id="app"') { Ok "served the app shell (HTTP $($r.StatusCode), $($r.RawContentLength) bytes)" }
  else { Warn "HTTP $($r.StatusCode) but the body does not look like the app shell" }
} catch {
  Bad "request failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------- 5
Write-Host ''
Write-Host '5) API as XHR fetches it (this is what breaks silently)' -ForegroundColor White
try {
  $a = Invoke-WebRequest "$Url/api/site" -UseBasicParsing -TimeoutSec 25 -UserAgent $BrowserUA
  $act = [string]$a.Headers['Content-Type']
  if ($act -match 'application/json') {
    $j = $a.Content | ConvertFrom-Json
    Ok "returned JSON (name='$($j.data.name)', baseUrl='$($j.data.baseUrl)')"
    if ($j.data.baseUrl -and $j.data.baseUrl -ne $Url) {
      Warn "app baseUrl ($($j.data.baseUrl)) differs from the tunnel URL ($Url) - share links will be wrong"
    }
  } else {
    $bad = Test-Interstitial $a.Content $act
    Bad "API did not return JSON: $act $(if ($bad) { "- $bad" })"
  }
} catch {
  Bad "API request failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------- 6
Write-Host ''
Write-Host '6) WeChat in-app browser (where shared links open)' -ForegroundColor White
try {
  $w = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 30 -UserAgent $WeChatUA -Headers @{ 'Accept' = 'text/html' }
  $bad = Test-Interstitial $w.Content ([string]$w.Headers['Content-Type'])
  if ($bad) { Bad "WeChat browser would hit: $bad" }
  elseif ($w.Content -match 'id="app"') { Ok 'WeChat browser gets the real page' }
  else { Warn 'unexpected body in WeChat browser' }
} catch {
  Bad "WeChat-style request failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------- 7
Write-Host ''
Write-Host '7) static assets' -ForegroundColor White
foreach ($p in @('/static/app.js', '/static/styles.css', '/static/home.css', '/static/live.css', '/static/meeting.css')) {
  try {
    $s = Invoke-WebRequest "$Url$p" -UseBasicParsing -TimeoutSec 20 -UserAgent $BrowserUA
    $sct = [string]$s.Headers['Content-Type']
    if ($sct -match 'json|text/plain') { Bad "$p returned $sct (blocked?)" }
    else { Ok "$p  $($s.StatusCode)  $($s.RawContentLength) bytes  $sct" }
  } catch { Bad "$p failed: $($_.Exception.Message)" }
}

# ---------------------------------------------------------------- 8
Write-Host ''
Write-Host '8) share link + QR code use the public URL' -ForegroundColor White
try {
  $feeds = (Invoke-WebRequest "$Url/api/feeds?featured=1" -UseBasicParsing -TimeoutSec 25).Content | ConvertFrom-Json
  if ($feeds.data.items.Count -gt 0) {
    $fid = $feeds.data.items[0].id
    $sh = (Invoke-WebRequest "$Url/api/feeds/$fid/share" -UseBasicParsing -TimeoutSec 25).Content | ConvertFrom-Json
    if ($sh.data.url -like "$Url*") { Ok "share link points at the public URL" }
    else { Bad "share link points elsewhere: $($sh.data.url)" }
    Info "share link: $($sh.data.url)"
    $qr = Invoke-WebRequest "$Url/api/share/qrcode?text=$([uri]::EscapeDataString($sh.data.url))&size=360" -UseBasicParsing -TimeoutSec 25
    if ($qr.RawContentLength -gt 200 -and [string]$qr.Headers['Content-Type'] -match 'image') {
      Ok "QR code renders ($($qr.RawContentLength) bytes)"
    } else { Bad "QR code looks wrong ($($qr.RawContentLength) bytes)" }
  } else {
    Warn 'no featured feeds yet, skipped share check'
  }
} catch { Bad "share check failed: $($_.Exception.Message)" }

# ---------------------------------------------------------------- summary
Write-Host ''
Write-Host '============================= summary =============================' -ForegroundColor Cyan
if ($script:Fail -eq 0 -and $script:Warn -eq 0) {
  Write-Host '  ALL GOOD - visitors get the real site with no interstitial.' -ForegroundColor Green
} elseif ($script:Fail -eq 0) {
  Write-Host "  PASSED with $($script:Warn) warning(s) - look at the WARN lines above." -ForegroundColor Yellow
} else {
  Write-Host "  $($script:Fail) FAILURE(s), $($script:Warn) warning(s)." -ForegroundColor Red
  Write-Host ''
  Write-Host '  If the homepage works but the API returns text/plain, the tunnel is'
  Write-Host '  injecting an interstitial. ngrok free does this. Switch to cloudflared:'
  Write-Host '    powershell -File scripts\start-public.ps1 -Mode cloudflare-quick -SetBaseUrl'
}
Write-Host ''
exit $(if ($script:Fail -gt 0) { 1 } else { 0 })
