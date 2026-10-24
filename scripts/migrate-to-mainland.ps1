<#
.SYNOPSIS
    小鱼来了 · 一键迁移到大陆服务器（用于 ICP 备案）

.DESCRIPTION
    把当前平台完整部署到一台新的 Ubuntu 大陆服务器。

    两个阶段：
      -Phase icp    备案期：80 端口只显示「网站备案中」页；
                    主站跑在 127.0.0.1:8787，可用 http://<IP>:8787 验证。
      -Phase live   备案通过后：切换全站 HTTPS，自动申请证书。

    历史数据（/opt/xiaoyu-laile/data，约 379MB）默认不传，
    需要时加 -WithData，会先从香港老服务器下载再上传。

.EXAMPLE
    .\migrate-to-mainland.ps1 -Server 1.2.3.4 -Password 密码 -Phase icp

.EXAMPLE
    .\migrate-to-mainland.ps1 -Server 1.2.3.4 -Password 密码 -Phase live
#>

param(
    [Parameter(Mandatory = $true)][string]$Server,
    [Parameter(Mandatory = $true)][string]$Password,
    [ValidateSet('icp', 'live')][string]$Phase = 'icp',
    [string]$Domain = 'xiaoyulaile.online',
    [string]$RemoteDir = '/opt/xiaoyu-laile',
    [switch]$WithData,
    [string]$User = 'root',
    [int]$Port = 22
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root  = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path (Split-Path -Parent $Root) '.tools'
$Pscp  = Join-Path $Tools 'pscp.exe'
$Plink = Join-Path $Tools 'plink.exe'

$OldServer   = '154.221.23.7'
$OldPassword = 'Weilan0576'
$OldHostKey  = 'SHA256:3+ADpEr03S1a26kdUYIkKBrxJID6hIQ8F7X9bal00Ks'

function Log-Step([string]$m) { Write-Host "`n>> $m" -ForegroundColor Cyan }
function Log-Ok([string]$m)   { Write-Host "   [OK] $m" -ForegroundColor Green }
function Log-Warn([string]$m) { Write-Host "   [!!] $m" -ForegroundColor Yellow }
function Log-Dim([string]$m)  { Write-Host "        $m" -ForegroundColor DarkGray }

if (-not (Test-Path $Pscp))  { throw "找不到 $Pscp" }
if (-not (Test-Path $Plink)) { throw "找不到 $Plink" }

# 用行数组传远程脚本，避开 here-string 与引号问题
function Invoke-Remote([string[]]$Lines) {
    $body = ($Lines -join "`n")
    $tmp = Join-Path $env:TEMP ("xyll-r-" + [guid]::NewGuid().ToString('N') + ".sh")
    [System.IO.File]::WriteAllText($tmp, ($body -replace "`r", ""), (New-Object System.Text.UTF8Encoding($false)))
    try {
        & $Plink -ssh -P $Port -pw $Password -batch "$User@$Server" -m $tmp 2>&1 |
            ForEach-Object { "     $_" }
        if ($LASTEXITCODE -ne 0) { throw "远程命令失败（exit $LASTEXITCODE）" }
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

function Invoke-RemoteOut([string[]]$Lines) {
    $body = ($Lines -join "`n")
    $tmp = Join-Path $env:TEMP ("xyll-r-" + [guid]::NewGuid().ToString('N') + ".sh")
    [System.IO.File]::WriteAllText($tmp, ($body -replace "`r", ""), (New-Object System.Text.UTF8Encoding($false)))
    try {
        $out = & $Plink -ssh -P $Port -pw $Password -batch "$User@$Server" -m $tmp 2>&1
        return ($out -join "`n")
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

function Send-File([string]$Local, [string]$Remote) {
    & $Pscp -P $Port -pw $Password -batch $Local "$User@${Server}:$Remote" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "上传失败：$Local -> $Remote" }
}

function Write-RemoteFile([string[]]$Lines, [string]$RemotePath) {
    $body = ($Lines -join "`n")
    $tmp = Join-Path $env:TEMP ("xyll-f-" + [guid]::NewGuid().ToString('N'))
    [System.IO.File]::WriteAllText($tmp, ($body -replace "`r", ""), (New-Object System.Text.UTF8Encoding($false)))
    try { Send-File $tmp $RemotePath } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

# ==================================================================
Write-Host ""
Write-Host "  +----------------------------------------------------------+" -ForegroundColor White
Write-Host "  |  小鱼来了 · 迁移到大陆服务器                              |" -ForegroundColor White
Write-Host "  +----------------------------------------------------------+" -ForegroundColor White
Log-Dim "目标服务器 : ${User}@${Server}:${Port}"
Log-Dim "域名       : $Domain"
Log-Dim "阶段       : $Phase"
Log-Dim "历史数据   : $(if ($WithData) { '迁移（约 379MB）' } else { '不迁移（空库启动）' })"
Log-Dim "远端目录   : $RemoteDir"

# ==================================================================
Log-Step "1/8 检查服务器连通性与系统信息"
$sysinfo = Invoke-RemoteOut @(
    'echo "hostname: $(hostname)"',
    '. /etc/os-release 2>/dev/null; echo "os      : $PRETTY_NAME"',
    'echo "arch    : $(uname -m)"',
    'echo "mem     : $(free -m | awk ''/Mem:/{print $2}'') MB"',
    'echo "disk    : $(df -h / | awk ''NR==2{print $4}'') 可用"',
    'echo "country : $(curl -s --max-time 8 https://ifconfig.co/country 2>/dev/null || echo UNKNOWN)"'
)
Log-Ok "服务器可达"
$sysinfo -split "`n" | Where-Object { $_.Trim() } | ForEach-Object { Log-Dim ("  " + $_.Trim()) }

# ==================================================================
Log-Step "2/8 检查服务器是否在中国大陆"
$country = ''
if ($sysinfo -match 'country\s*:\s*(\S+)') { $country = $Matches[1] }
if ($country -match 'China|CN') {
    Log-Ok "服务器位于中国大陆（符合 ICP 备案要求）"
} else {
    Log-Warn "服务器地区显示为：$country"
    Log-Warn "ICP 备案要求服务器必须在中国大陆，海外/香港机器会被驳回。"
    $ans = Read-Host "   仍要继续吗？(y/N)"
    if ($ans -ne 'y') { throw "已取消" }
}

# ==================================================================
Log-Step "3/8 本地打包"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pkg = Join-Path $env:TEMP ("xyll-deploy-" + $stamp + ".tar.gz")

Push-Location $Root
try {
    $items = @('server.js', 'package.json', 'src', 'public', 'scripts', '.env.example')
    $existing = $items | Where-Object { Test-Path (Join-Path $Root $_) }
    Log-Dim ("打包: " + ($existing -join ', '))
    $tarArgs = @('-czf', $pkg) + $existing
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
} finally {
    Pop-Location
}
$sizeMB = [math]::Round((Get-Item $pkg).Length / 1MB, 2)
Log-Ok "打包完成: $sizeMB MB"

# ==================================================================
Log-Step "4/8 安装系统依赖（Node 20 / nginx / certbot）"
Invoke-Remote @(
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update -qq',
    'need_node=1',
    'if command -v node >/dev/null 2>&1; then',
    '  v=$(node -v | sed "s/v//" | cut -d. -f1)',
    '  if [ "$v" -ge 18 ]; then need_node=0; fi',
    'fi',
    'if [ "$need_node" = "1" ]; then',
    '  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1',
    '  apt-get install -y nodejs >/dev/null 2>&1',
    'fi',
    'apt-get install -y nginx certbot python3-certbot-nginx curl tar >/dev/null 2>&1 || true',
    'echo "node   : $(node -v)"',
    'echo "nginx  : $(nginx -v 2>&1)"',
    'echo "certbot: $(certbot --version 2>&1)"'
)
Log-Ok "依赖就绪"

# ==================================================================
Log-Step "5/8 上传并解包到 $RemoteDir"
Invoke-Remote @(
    "mkdir -p $RemoteDir",
    "mkdir -p $RemoteDir/data $RemoteDir/logs"
)
Send-File $pkg "/tmp/xyll-deploy.tar.gz"
Invoke-Remote @(
    'set -e',
    "cd $RemoteDir",
    'tar -xzf /tmp/xyll-deploy.tar.gz',
    'rm -f /tmp/xyll-deploy.tar.gz',
    'if [ ! -f .env ]; then',
    '  if [ -f .env.example ]; then cp .env.example .env; else touch .env; fi',
    '  echo "  已生成 .env"',
    'fi',
    'chmod +x scripts/*.sh 2>/dev/null || true',
    'ls -1 . | head -20'
)
Log-Ok "代码已就位"

# ==================================================================
if ($WithData) {
    Log-Step "5b/8 迁移历史数据（从香港老服务器）"
    Log-Dim "老服务器打包 data/ ..."
    & $Plink -ssh -pw $OldPassword -hostkey $OldHostKey -batch "root@$OldServer" "cd /opt/xiaoyu-laile && tar -czf /tmp/xyll-data.tar.gz data 2>/dev/null && echo packed" 2>&1 | ForEach-Object { Log-Dim $_ }

    $dataPkg = Join-Path $env:TEMP ("xyll-data-" + $stamp + ".tar.gz")
    Log-Dim "下载到本地 ..."
    & $Pscp -pw $OldPassword -hostkey $OldHostKey -batch "root@${OldServer}:/tmp/xyll-data.tar.gz" $dataPkg 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "下载数据失败" }
    Log-Ok ("下载完成: " + [math]::Round((Get-Item $dataPkg).Length / 1MB, 1) + " MB")

    Log-Dim "上传到新服务器 ..."
    Send-File $dataPkg "/tmp/xyll-data.tar.gz"
    Invoke-Remote @(
        'set -e',
        "cd $RemoteDir",
        'rm -rf data',
        'tar -xzf /tmp/xyll-data.tar.gz',
        'rm -f /tmp/xyll-data.tar.gz',
        "du -sh $RemoteDir/data"
    )
    Remove-Item $dataPkg -ErrorAction SilentlyContinue
    Log-Ok "历史数据已迁移"
} else {
    Log-Step "5b/8 跳过历史数据（空库启动）"
}

# ==================================================================
Log-Step "6/8 配置 systemd 服务"
$unitLines = @(
    '[Unit]',
    'Description=Xiaoyu Laile Platform',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    'User=root',
    "WorkingDirectory=$RemoteDir",
    'ExecStart=/usr/bin/node server.js --port 8787',
    'Restart=always',
    'RestartSec=5',
    'StandardOutput=append:/var/log/xiaoyu-laile.log',
    'StandardError=append:/var/log/xiaoyu-laile.log',
    '',
    '[Install]',
    'WantedBy=multi-user.target'
)
Write-RemoteFile $unitLines '/etc/systemd/system/xiaoyu-laile.service'

Invoke-Remote @(
    'set -e',
    'systemctl daemon-reload',
    'systemctl enable xiaoyu-laile >/dev/null 2>&1',
    'systemctl restart xiaoyu-laile',
    'sleep 3',
    'systemctl is-active xiaoyu-laile'
)

Start-Sleep -Seconds 2
$health = Invoke-RemoteOut @(
    'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8787/api/health'
)
if ($health -match '200') {
    Log-Ok "服务已启动，健康检查通过"
} else {
    Log-Warn "健康检查未通过，最近日志："
    $log = Invoke-RemoteOut @('tail -30 /var/log/xiaoyu-laile.log')
    $log -split "`n" | ForEach-Object { Log-Dim $_ }
}

# ==================================================================
if ($Phase -eq 'icp') {
    Log-Step "7/8 配置 nginx（备案期：HTTP 80 + 维护页）"
    $confIcp = @(
        'server {',
        '    listen 80;',
        '    listen [::]:80;',
        "    server_name $Domain www.$Domain $Server;",
        '',
        "    root $RemoteDir/public;",
        '    index icp-pending.html;',
        '',
        '    add_header Cache-Control "no-store" always;',
        '    add_header X-Robots-Tag "noindex, nofollow" always;',
        '',
        '    location = /health {',
        '        access_log off;',
        '        return 200 "ok";',
        '        add_header Content-Type text/plain;',
        '    }',
        '',
        '    location / {',
        '        try_files $uri $uri/ /icp-pending.html;',
        '    }',
        '}'
    )
    Write-RemoteFile $confIcp '/etc/nginx/sites-available/xiaoyu-laile'

    Invoke-Remote @(
        'set -e',
        'ln -sf /etc/nginx/sites-available/xiaoyu-laile /etc/nginx/sites-enabled/xiaoyu-laile',
        'rm -f /etc/nginx/sites-enabled/default',
        'nginx -t',
        'systemctl reload nginx',
        'sleep 1',
        'curl -s -o /dev/null -w "  80 -> %{http_code}\n" http://127.0.0.1/health'
    )
    Log-Ok "备案期配置完成"

    Write-Host ""
    Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
    Write-Host "  |  [完成] 备案期部署成功                                    |" -ForegroundColor Green
    Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  这台服务器当前状态：" -ForegroundColor White
    Write-Host "    - 对外 80 端口只显示「网站备案中」页" -ForegroundColor Gray
    Write-Host "    - 主站跑在 127.0.0.1:8787（未对外暴露）" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  备案期间必做：" -ForegroundColor Yellow
    Write-Host "    1. 登录腾讯云 -> 备案 -> 提交企业备案" -ForegroundColor Gray
    Write-Host "       （域名已在腾讯云 DNSPod，无需转移）" -ForegroundColor DarkGray
    Write-Host "    2. 把 $Domain 的 A 记录指向 $Server" -ForegroundColor Gray
    Write-Host "    3. 备案期间不要关闭这台服务器" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  备案通过后执行：" -ForegroundColor White
    Write-Host "    .\scripts\migrate-to-mainland.ps1 -Server $Server -Password *** -Phase live" -ForegroundColor DarkGray
    Write-Host ""

} else {
    Log-Step "7/8 配置 nginx（备案后：全站 HTTPS）"
    $confLive = @(
        'server {',
        '    listen 80;',
        '    listen [::]:80;',
        "    server_name $Domain www.$Domain;",
        '    location /.well-known/acme-challenge/ { root /var/www/html; }',
        '    location / { return 301 https://$host$request_uri; }',
        '}',
        '',
        'server {',
        '    listen 443 ssl http2;',
        '    listen [::]:443 ssl http2;',
        "    server_name $Domain www.$Domain;",
        '',
        '    ssl_protocols TLSv1.2 TLSv1.3;',
        '    ssl_prefer_server_ciphers off;',
        '',
        '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
        '    add_header X-Content-Type-Options "nosniff" always;',
        '    add_header X-Frame-Options "SAMEORIGIN" always;',
        '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
        '',
        '    client_max_body_size 600M;',
        '    proxy_read_timeout 600s;',
        '    proxy_send_timeout 600s;',
        '',
        '    error_page 502 503 504 =503 /maintenance.html;',
        '    location = /maintenance.html {',
        '        internal;',
        "        root $RemoteDir/public;",
        '        add_header Cache-Control "no-store" always;',
        '    }',
        '',
        '    location / {',
        '        proxy_pass http://127.0.0.1:8787;',
        '        proxy_http_version 1.1;',
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '        proxy_set_header X-Forwarded-Proto $scheme;',
        '        proxy_set_header Upgrade $http_upgrade;',
        '        proxy_set_header Connection "upgrade";',
        '        proxy_buffering off;',
        '        proxy_cache off;',
        '    }',
        '}'
    )
    Write-RemoteFile $confLive '/etc/nginx/sites-available/xiaoyu-laile'

    $ans = Read-Host "   $Domain 是否已解析到 $Server ？(y/N)"
    if ($ans -ne 'y') {
        Log-Warn "已跳过证书申请。解析好后重跑 -Phase live 即可。"
    }

    Invoke-Remote @(
        'set -e',
        'ln -sf /etc/nginx/sites-available/xiaoyu-laile /etc/nginx/sites-enabled/xiaoyu-laile',
        'rm -f /etc/nginx/sites-enabled/default',
        'nginx -t',
        'systemctl reload nginx'
    )

    if ($ans -eq 'y') {
        Invoke-Remote @(
            'set -e',
            "certbot --nginx -d $Domain -d www.$Domain --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1 | tail -8",
            'systemctl reload nginx',
            'certbot renew --dry-run 2>&1 | tail -3 || true'
        )
        Log-Ok "HTTPS 已启用"
    }

    Write-Host ""
    Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
    Write-Host "  |  [完成] 全站部署成功                                      |" -ForegroundColor Green
    Write-Host "  +----------------------------------------------------------+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  访问: https://$Domain" -ForegroundColor White
    Write-Host ""
    Write-Host "  上线后必做：" -ForegroundColor Yellow
    Write-Host "    1. 网站底部加 ICP 备案号，链接到 https://beian.miit.gov.cn/" -ForegroundColor Gray
    Write-Host "    2. 30 日内到 https://beian.mps.gov.cn 完成公安联网备案" -ForegroundColor Gray
    Write-Host "    3. 保留老服务器至少 7 天" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  回滚（1 分钟）：把 $Domain 的 A 记录改回 154.221.23.7" -ForegroundColor DarkGray
    Write-Host ""
}

# ==================================================================
Log-Step "8/8 收尾"
Remove-Item $pkg -ErrorAction SilentlyContinue

Invoke-Remote @(
    'echo "  --- 服务 ---"; systemctl is-active xiaoyu-laile',
    'echo "  --- 端口 ---"; ss -tlnp 2>/dev/null | grep -E ":80 |:443 |:8787 " || echo "  (无)"',
    'echo "  --- 磁盘 ---"; df -h / | awk ''NR==2{print "  "$3" / "$2" ("$5")"}'''
)

Write-Host ""
Write-Host "  [完成] 日志: /var/log/xiaoyu-laile.log" -ForegroundColor Green
Write-Host ""
