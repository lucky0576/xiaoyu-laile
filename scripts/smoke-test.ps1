# 全站冒烟测试 (smoke test)
#
# 用法:
#   .\scripts\smoke-test.ps1              # normal user view
#   .\scripts\smoke-test.ps1 -AsAdmin     # admin view
#   .\scripts\smoke-test.ps1 -All         # both
#
# Checks console errors AND whether the page rendered the framework
# error boundary ("出错了" / "... is not defined"). Console-only checks
# miss these because the error boundary swallows them.

param(
  [switch]$AsAdmin,
  [switch]$All
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Py = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$Verify = Join-Path $Root 'video\cdp_verify.py'
$Base = 'https://xiaoyulaile.online'
$env:PYTHONIOENCODING = 'utf-8'

$Common = @(
  '#/home',
  '#/list/project',
  '#/list/trade',
  '#/list/event',
  '#/forums',
  '#/cases',
  '#/account',
  '#/invest',
  '#/verify',
  '#/qualification',
  '#/publish?category=project'
)

$AdminExtra = @('#/admin', '#/admin-invest', '#/admin-ai', '#/wechat-setup')

function Login($account, $password) {
  $body = @{ account = $account; password = $password } | ConvertTo-Json
  $r = Invoke-RestMethod "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 20
  return $r.data.token
}

function Sweep($label, $token, $pages) {
  Write-Host ''
  Write-Host "=== $label ===" -ForegroundColor Cyan
  Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  $pyArgs = @($Verify, $token) + $pages
  & $Py @pyArgs 2>&1 | ForEach-Object { Write-Host "  $_" }
  return $LASTEXITCODE
}

$fail = 0

if ($All -or -not $AsAdmin) {
  $t = Login '13800001234' 'demo123456'
  $fail += Sweep 'NORMAL USER' $t $Common
}

if ($All -or $AsAdmin) {
  $t = Login '13456693544' 'weilan0576'
  $fail += Sweep 'ADMIN' $t ($Common + $AdminExtra)
}

Write-Host ''
if ($fail -eq 0) {
  Write-Host 'SMOKE PASS: all pages healthy' -ForegroundColor Green
  exit 0
} else {
  Write-Host 'SMOKE FAIL: see above' -ForegroundColor Red
  exit 1
}
