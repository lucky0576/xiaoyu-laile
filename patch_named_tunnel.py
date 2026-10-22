#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 start-all.ps1 增加 Cloudflare Named Tunnel 支持（保留 quick tunnel 回退）"""

import io
import os

D = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(D, "scripts", "start-all.ps1")

s = io.open(F, "r", encoding="utf-8").read()
orig = s
ok = 0
miss = 0


def rep(old, new, label):
    global s, ok, miss
    if old in s:
        s = s.replace(old, new, 1)
        ok += 1
        print("  ok  :", label)
    else:
        miss += 1
        print("  MISS:", label)


# ---------- 1) 通用读取 .env 变量 ----------
rep(
    """function Start-QuickTunnel {""",
    """function Get-EnvVar([string]$Name) {
  $Utf8 = New-Object System.Text.UTF8Encoding($false)
  if (-not (Test-Path $EnvFile)) { return $null }
  $txt = [System.IO.File]::ReadAllText($EnvFile, $Utf8)
  $mm = [regex]::Match($txt, '(?m)^[ \\t]*' + [regex]::Escape($Name) + '[ \\t]*=[ \\t]*(\\S*)[ \\t]*$')
  if ($mm.Success -and $mm.Groups[1].Value) { return $mm.Groups[1].Value }
  return $null
}

# Named tunnel: a stable hostname, no address churn. Enabled when
# CF_TUNNEL_TOKEN is present in .env; otherwise we fall back to a quick tunnel.
function Start-NamedTunnel([string]$Token) {
  if (-not $CfExe) { return $false }
  Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
  Start-Sleep -Seconds 2
  Remove-Item $TunnelLog -Force -ErrorAction SilentlyContinue
  Remove-Item $TunnelOut -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $CfExe `
    -ArgumentList @('tunnel', '--no-autoupdate', 'run', '--token', $Token) `
    -RedirectStandardError $TunnelLog -RedirectStandardOutput $TunnelOut -WindowStyle Hidden
  Write-Log 'started cloudflared NAMED tunnel (token mode)'
  return $true
}

function Start-QuickTunnel {""",
    "插入 Get-EnvVar 与 Start-NamedTunnel",
)

# ---------- 2) 隧道选择逻辑 ----------
rep(
    """$knownUrl = Get-EnvBaseUrl
$cfRunning = @(Get-Process cloudflared -ErrorAction SilentlyContinue)""",
    """$cfToken = Get-EnvVar 'CF_TUNNEL_TOKEN'
$cfHost = Get-EnvVar 'CF_TUNNEL_HOSTNAME'
$namedUrl = if ($cfToken -and $cfHost) { 'https://' + $cfHost } else { $null }

$knownUrl = if ($namedUrl) { $namedUrl } else { Get-EnvBaseUrl }
$cfRunning = @(Get-Process cloudflared -ErrorAction SilentlyContinue)""",
    "读取 Named Tunnel 配置",
)

# ---------- 3) 健康检查分支 ----------
rep(
    """if ($knownUrl -and (Test-TunnelAlive $knownUrl)) {
  Write-Log "tunnel healthy, keeping it: $knownUrl"
} else {""",
    """if ($knownUrl -and (Test-TunnelAlive $knownUrl)) {
  Write-Log "tunnel healthy, keeping it: $knownUrl"
  # A named tunnel process can die while DNS still resolves (edge caches).
  # Make sure a connector is actually running.
  if ($namedUrl -and $cfRunning.Count -eq 0) {
    Write-Log 'named tunnel DNS alive but no connector running, restarting connector'
    Start-NamedTunnel $cfToken | Out-Null
  }
} elseif ($namedUrl) {
  Write-Log "named tunnel not reachable, (re)starting connector for $namedUrl"
  Start-NamedTunnel $cfToken | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    if (Test-PublicUrl $namedUrl) { break }
    Start-Sleep -Seconds 2
  }
} else {""",
    "隧道健康检查分支",
)

# ---------- 4) URL 解析：Named 模式直接用 hostname ----------
rep(
    """# ---------------------------------------------------------------- 3. sync URL
# ($UrlPattern / Get-TunnelUrlFromLog / Test-PublicUrl are defined in step 2.)
$PublicUrl = $null
for ($i = 0; $i -lt 20; $i++) {
  $cand = Get-TunnelUrlFromLog
  if ($cand -and (Test-PublicUrl $cand)) { $PublicUrl = $cand; break }
  Start-Sleep -Seconds 2
}""",
    """# ---------------------------------------------------------------- 3. sync URL
# ($UrlPattern / Get-TunnelUrlFromLog / Test-PublicUrl are defined in step 2.)
# Named tunnel: the hostname never changes, so use it directly. No log scraping.
if ($namedUrl) {
  $PublicUrl = $namedUrl
  for ($i = 0; $i -lt 20; $i++) {
    if (Test-PublicUrl $namedUrl) { break }
    Start-Sleep -Seconds 2
  }
  Write-Log "named tunnel public URL: $PublicUrl"
} else {
  $PublicUrl = $null
  for ($i = 0; $i -lt 20; $i++) {
    $cand = Get-TunnelUrlFromLog
    if ($cand -and (Test-PublicUrl $cand)) { $PublicUrl = $cand; break }
    Start-Sleep -Seconds 2
  }
}""",
    "URL 解析分支",
)

io.open(F, "w", encoding="utf-8").write(s)
print("")
print("patched: %d ok, %d miss, %+d chars" % (ok, miss, len(s) - len(orig)))
