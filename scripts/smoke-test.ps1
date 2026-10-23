# 全站冒烟测试
#
# 用法：
#   .\scripts\smoke-test.ps1              # 普通用户视角
#   .\scripts\smoke-test.ps1 -AsAdmin     # 管理员视角
#   .\scripts\smoke-test.ps1 -All         # 两种视角都跑
#
# 除控制台错误外，还会检查页面是否渲染了「出错了」错误页
# —— 只看控制台是查不出这类问题的（错误被 error boundary 吃掉了）。

param(
  [switch]$AsAdmin,
  [switch]$All
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Py = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$Verify = Join-Path $Root 'video\cdp_verify.py'
$Base = 'https://xiaoyulaile.online'

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

$AdminOnly = @('#/admin', '#/admin-invest', '#/admin-ai', '#/wechat-setup')

function Login($account, $password) {
  $body = @{ account = $account; password = $password } | ConvertTo-Json
  $r = Invoke-RestMethod "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 20
  return $r.data.token
}

function Sweep($title, $token, $urls) {
  Write-Host ''
  Write-Host "=== $title ===" -ForegroundColor Cyan
  Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $args = @($Verify, $token) + $urls
  & $Py @args 2>&1 | ForEach-Object { Write-Host "  $_" }
  return $LASTEXITCODE
}

$fail = 0

if ($All -or -not $AsAdmin) {
  $t = Login '13800001234' 'demo123456'
  $fail += Sweep '普通用户视角' $t $Common
}

if ($All -or $AsAdmin) {
  $t = Login '13456693544' 'weilan0576'
  $fail += Sweep '管理员视角' $t ($Common + $AdminOnly)
}

Write-Host ''
if ($fail -eq 0) {
  Write-Host 'SMOKE PASS: all pages healthy' -ForegroundColor Green
  exit 0
} else {
  Write-Host 'SMOKE FAIL: see above' -ForegroundColor Red
  exit 1
}
