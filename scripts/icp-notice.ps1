#Requires -Version 5.1
<#
.SYNOPSIS
    ICP 备案提示的开关 —— 一行命令改掉「转发分享里那句备案说明」

.DESCRIPTION
    小程序里的分享文案、微信转发卡片、分享页底部都会带一句：
      「小鱼来了正在办理 ICP 备案，预计月底前完成」

    这个提示由服务器 .env 里的 ICP_NOTICE 控制：
      没有这一项   -> 显示默认文案
      ICP_NOTICE=  -> 关闭，不再显示
      ICP_NOTICE=xxx -> 改成 xxx

    本脚本做四件事：
      1. 改 .env
      2. 重启服务（让新配置生效）
      3. 清 nginx 分享页缓存（不然要等 10 分钟）
      4. 验证 /api/site 和分享页，把结果打出来

.PARAMETER Off
    关闭提示（备案完成后用这个）

.PARAMETER On
    恢复默认提示文案

.PARAMETER Text
    改成自定义文案，例如 -Text "ICP 备案已通过，备案号 沪ICP备XXXXXXXX号"

.PARAMETER Status
    只看当前状态，不改任何东西

.EXAMPLE
    # 备案通过了，关掉提示
    .\scripts\icp-notice.ps1 -Off

.EXAMPLE
    # 换成备案号
    .\scripts\icp-notice.ps1 -Text "沪ICP备2026XXXXXX号"

.EXAMPLE
    # 看看现在是什么
    .\scripts\icp-notice.ps1 -Status
#>

param(
    [switch]$Off,
    [switch]$On,
    [string]$Text = '',
    [switch]$Status
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Tools   = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\.tools'
$Pscp    = Join-Path $Tools 'pscp.exe'
$Plink   = Join-Path $Tools 'plink.exe'
$HostKey = 'SHA256:3+ADpEr03S1a26kdUYIkKBrxJID6hIQ8F7X9bal00Ks'
$Remote  = 'root@154.221.23.7'
# 密码不再硬编码（仓库公开）：从 .secrets.env 或环境变量读取
. "$PSScriptRoot\_secrets.ps1"
$Pw = $env:XYL_SERVER_PASSWORD
if (-not $Pw) { throw 'Missing XYL_SERVER_PASSWORD - see scripts/SECRETS.md' }
$EnvFile = '/opt/xiaoyu-laile/.env'
$RemoteTmp = '/tmp/xyll-icp-'

function Say($m)  { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [XX] $m" -ForegroundColor Red }

function Invoke-Remote([string]$ScriptFile) {
    & $Plink -ssh -pw $Pw -hostkey $HostKey -batch $Remote "bash $ScriptFile" 2>&1
}

function Push-Script([string]$LocalText, [string]$RemotePath) {
    $tmp = [System.IO.Path]::GetTempFileName()
    # 远程脚本一律 LF，避免 bash 报 \r 错误
    [System.IO.File]::WriteAllText($tmp, ($LocalText -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
    & $Pscp -pw $Pw -hostkey $HostKey -batch $tmp "${Remote}:$RemotePath" 2>&1 | Out-Null
    Remove-Item $tmp -ErrorAction SilentlyContinue
}

if (-not (Test-Path $Plink)) { Fail "找不到 $Plink"; exit 1 }
if (-not (Test-Path $Pscp))  { Fail "找不到 $Pscp"; exit 1 }

Write-Host ""
Write-Host "=================================================="
Write-Host "  ICP 备案提示开关"
Write-Host "=================================================="
Write-Host ""

# ---------- 只看状态 ----------
if ($Status) {
    $s = @'
echo "=== .env 里的 ICP_NOTICE ==="
grep -n "^ICP_NOTICE=" /opt/xiaoyu-laile/.env 2>/dev/null || echo "  (没有这一项，说明用默认文案)"
echo ""
echo "=== 服务实际生效的值（/api/site）==="
curl -s http://127.0.0.1:8787/api/site | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); v=d.get('icpNotice',''); print('  icpNotice =', repr(v) if v else '(空 -> 不显示)')" 2>/dev/null || echo "  (解析失败)"
echo ""
echo "=== 分享页是否带提示 ==="
LID=$(curl -s "http://127.0.0.1:8787/api/listings?limit=1" | python3 -c "import sys,json;d=json.load(sys.stdin);i=d['data'].get('items') or d['data'].get('list') or [];print(i[0]['id'] if i else '')" 2>/dev/null)
if [ -n "$LID" ]; then
  N=$(curl -s "http://127.0.0.1:8787/s/$LID" | grep -c "ICP 备案")
  echo "  /s/$LID 含 ICP 备案提示: $N 处"
fi
'@
    Push-Script $s "${RemoteTmp}status.sh"
    Invoke-Remote "${RemoteTmp}status.sh" | ForEach-Object { Say $_ }
    Write-Host ""
    exit 0
}

# ---------- 算出要写的值 ----------
$value = $null
$label = ''
if ($Off) {
    $value = ''          # 空 = 关闭
    $label = '关闭提示'
} elseif ($Text) {
    $value = $Text
    $label = "改成自定义文案：$Text"
} elseif ($On) {
    $value = '小鱼来了正在办理 ICP 备案，预计月底前完成'
    $label = '恢复默认提示'
} else {
    Warn "请指定操作：-Off 关闭 / -On 恢复 / -Text 自定义 / -Status 查看"
    Write-Host ""
    Say "例子："
    Say "  .\scripts\icp-notice.ps1 -Off"
    Say "  .\scripts\icp-notice.ps1 -Text `"沪ICP备2026XXXXX号`""
    exit 2
}

Say "操作：$label"
Write-Host ""

# ---------- 1) 改 .env（用 base64 传值，避免中文/特殊字符被 shell 吃掉） ----------
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($value))
Say "[1/4] 更新 .env"

$patch = @"
set -e
export ICP_B64='$b64'
python3 - <<'PYEOF'
import base64, os
p = '$EnvFile'
val = base64.b64decode(os.environ['ICP_B64']).decode('utf-8')
lines = []
if os.path.exists(p):
    with open(p, 'r', encoding='utf-8') as f:
        lines = f.read().splitlines()
out, found = [], False
for ln in lines:
    if ln.strip().startswith('ICP_NOTICE='):
        out.append('ICP_NOTICE=' + val)
        found = True
    else:
        out.append(ln)
if not found:
    out.append('')
    out.append('# ICP 备案进度提示（空 = 关闭，不再显示在转发分享里）')
    out.append('ICP_NOTICE=' + val)
with open(p, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(out) + '\n')
print('  .env 已更新: ICP_NOTICE=' + (val if val else '(空，关闭)'))
PYEOF
"@
Push-Script $patch "${RemoteTmp}patch.sh"
Invoke-Remote "${RemoteTmp}patch.sh" | ForEach-Object { Say $_ }
Say ""

# ---------- 2) 重启服务 ----------
Say "[2/4] 重启服务"
$restart = @'
set -e
systemctl restart xiaoyu-laile
for i in $(seq 1 25); do
  sleep 1
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/api/health 2>/dev/null)" = "200" ]; then
    echo "  健康检查通过 (${i}s)"
    exit 0
  fi
done
echo "  !! 健康检查超时"
exit 1
'@
Push-Script $restart "${RemoteTmp}restart.sh"
$out = Invoke-Remote "${RemoteTmp}restart.sh"
$out | ForEach-Object { Say $_ }
if ($LASTEXITCODE -ne 0) { Fail "服务重启失败，请检查 journalctl -u xiaoyu-laile"; exit 3 }
Say ""

# ---------- 3) 清分享页缓存 ----------
Say "[3/4] 清理分享页缓存（nginx proxy_cache）"
$purge = @'
set -e
BEFORE=$(du -sh /var/cache/nginx/xyll_share 2>/dev/null | cut -f1 || echo "0")
rm -rf /var/cache/nginx/xyll_share/* 2>/dev/null || true
systemctl reload nginx
AFTER=$(du -sh /var/cache/nginx/xyll_share 2>/dev/null | cut -f1 || echo "0")
echo "  缓存 $BEFORE -> $AFTER"
'@
Push-Script $purge "${RemoteTmp}purge.sh"
Invoke-Remote "${RemoteTmp}purge.sh" | ForEach-Object { Say $_ }
Say ""

# ---------- 4) 验证 ----------
Say "[4/4] 验证"
$verify = @'
echo "  /api/site.icpNotice:"
curl -s http://127.0.0.1:8787/api/site | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data',{})
v=d.get('icpNotice','')
print('    ' + (repr(v) if v else '(空 -> 不显示)'))
" 2>/dev/null || echo "    (解析失败)"
echo ""
echo "  分享页检查:"
LID=$(curl -s "http://127.0.0.1:8787/api/listings?limit=1" | python3 -c "import sys,json;d=json.load(sys.stdin);i=d['data'].get('items') or d['data'].get('list') or [];print(i[0]['id'] if i else '')" 2>/dev/null)
if [ -n "$LID" ]; then
  N=$(curl -s "http://127.0.0.1:8787/s/$LID" | grep -c "ICP 备案")
  if [ "$N" -gt 0 ]; then echo "    /s/$LID  带提示（$N 处）"; else echo "    /s/$LID  不带提示"; fi
fi
echo ""
echo "  服务状态:"
systemctl is-active xiaoyu-laile | sed 's/^/    /'
'@
Push-Script $verify "${RemoteTmp}verify.sh"
Invoke-Remote "${RemoteTmp}verify.sh" | ForEach-Object { Say $_ }

# ---------- 收尾 ----------
$cleanup = @"
rm -f ${RemoteTmp}*.sh
"@
Push-Script $cleanup "${RemoteTmp}cleanup.sh"
Invoke-Remote "${RemoteTmp}cleanup.sh" | Out-Null

Write-Host ""
if ($Off) {
    Ok "已关闭备案提示 —— 转发分享、微信卡片、分享页底部都不会再出现"
} elseif ($Text) {
    Ok "已更新为：$Text"
} else {
    Ok "已恢复默认备案提示"
}
Write-Host ""
Say "浏览器端：SW 版本没变，前端会从 /api/site 拿到新值，"
Say "          用户下次打开页面即生效（已打开的页面刷新一次）。"
Write-Host ""
