#Requires -Version 5.1
<#
.SYNOPSIS
    把服务器备份拉到本机 —— 避免"服务器挂了备份也一起没"

.DESCRIPTION
    服务器上的备份是纯本地保存的：
        /opt/xiaoyu-laile/backups/daily/   每天 03:00，保留 14 天，约 19MB/份
        /opt/xiaoyu-laile/backups/full/    每周日 03:30，保留 3 份，约 1.2GB/份

    如果服务器磁盘坏了 / 被删 / 到期不续费，这些备份会一起消失。
    本脚本把服务器上的备份**下载到本机**，做第二份冷备。

    默认行为：
      · 只拉 daily（体积小，最重要）
      · 本地保留 8 份（约 150MB）
      · 已存在的跳过，不重复下载

.PARAMETER What
    daily（默认）| full | both

.PARAMETER KeepDaily
    本地保留 daily 份数，默认 8

.PARAMETER KeepFull
    本地保留 full 份数，默认 1（full 很大，1.2GB/份）

.PARAMETER Dest
    本机保存目录，默认 <工作区>\server-backups

.PARAMETER InstallTask
    注册 Windows 计划任务（每周一 09:00 自动拉一次），需要当前用户有权限

.EXAMPLE
    # 立刻拉一次 daily
    powershell -ExecutionPolicy Bypass -File pull-backup.ps1

.EXAMPLE
    # 拉 daily + full
    powershell -ExecutionPolicy Bypass -File pull-backup.ps1 -What both

.EXAMPLE
    # 注册每周一 09:00 自动拉取
    powershell -ExecutionPolicy Bypass -File pull-backup.ps1 -InstallTask
#>

param(
    [ValidateSet('daily', 'full', 'both')][string]$What = 'daily',
    [int]$KeepDaily = 8,
    [int]$KeepFull = 1,
    [string]$Dest = '',
    [switch]$InstallTask
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Tools  = 'C:\Users\Administrator\Documents\deepseek-harness\default-workspace\.tools'
$Pscp   = Join-Path $Tools 'pscp.exe'
$Plink  = Join-Path $Tools 'plink.exe'
$HostKey = 'SHA256:3+ADpEr03S1a26kdUYIkKBrxJID6hIQ8F7X9bal00Ks'
$Remote  = 'root@154.221.23.7'
# 密码不再硬编码（仓库公开）：从 .secrets.env 或环境变量读取
. "$PSScriptRoot\_secrets.ps1"
$Pw = $env:XYL_SERVER_PASSWORD
if (-not $Pw) { throw 'Missing XYL_SERVER_PASSWORD - see scripts/SECRETS.md' }
$RemoteRoot = '/opt/xiaoyu-laile/backups'

if (-not $Dest) {
    $Dest = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'server-backups'
}

function Say($m)  { Write-Host "  $m" }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [XX] $m" -ForegroundColor Red }

if (-not (Test-Path $Pscp))  { Fail "找不到 $Pscp"; exit 1 }
if (-not (Test-Path $Plink)) { Fail "找不到 $Plink"; exit 1 }

# ---------- 注册计划任务 ----------
if ($InstallTask) {
    $self = $MyInvocation.MyCommand.Path
    $taskName = 'XYLL-PullBackup'
    Say "注册计划任务 $taskName（每周一 09:00，仅拉 daily）"
    try {
        $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$self`" -What daily"
        $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
        $trg = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'
        $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
        Register-ScheduledTask -TaskName $taskName -Action $act -Trigger $trg -Settings $set `
            -Description '小鱼来了：每周把服务器 daily 备份拉到本机' -Force | Out-Null
        Ok "计划任务已注册"
        Say "  查看：schtasks /Query /TN $taskName /V /FO LIST"
        Say "  删除：schtasks /Delete /TN $taskName /F"
    } catch {
        Fail "注册失败：$($_.Exception.Message)"
        Say "  （自建任务通常不需要管理员；若报拒绝访问，请用管理员 PowerShell 重跑）"
    }
    Write-Host ""
    # 注册后继续跑一次，方便立刻验证
}

# ---------- 准备目录 ----------
$destDaily = Join-Path $Dest 'daily'
$destFull  = Join-Path $Dest 'full'
New-Item -ItemType Directory -Path $destDaily, $destFull -Force | Out-Null

Write-Host ""
Write-Host "=================================================="
Write-Host "  拉取服务器备份到本机"
Write-Host "=================================================="
Say "服务器 : $Remote"
Say "远端   : $RemoteRoot"
Say "本地   : $Dest"
Say "范围   : $What"
Write-Host ""

function Get-RemoteList([string]$Sub, [string]$Pattern) {
    $out = & $Plink -ssh -pw $Pw -hostkey $HostKey -batch $Remote "ls -1 $RemoteRoot/$Sub 2>/dev/null | grep -E '$Pattern' | sort" 2>&1
    return @($out | Where-Object { $_ -and $_.Trim() -and $_ -notmatch '^(Warning|FATAL|Access)' })
}

function Pull-One([string]$Sub, [string]$Name, [string]$LocalDir) {
    $local = Join-Path $LocalDir $Name
    if (Test-Path $local) {
        # 已有且大小一致就跳过
        $remoteSize = (& $Plink -ssh -pw $Pw -hostkey $HostKey -batch $Remote "stat -c %s $RemoteRoot/$Sub/$Name" 2>&1) | Select-Object -First 1
        $localSize = (Get-Item $local).Length
        if ($remoteSize -and [int64]$remoteSize -eq $localSize) {
            Say "  跳过（已存在）$Name"
            return $false
        }
    }
    Say "  下载 $Sub/$Name ..."
    & $Pscp -pw $Pw -hostkey $HostKey -batch "${Remote}:$RemoteRoot/$Sub/$Name" $local 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $local)) {
        Warn "  下载失败：$Name"
        return $false
    }
    $mb = [math]::Round((Get-Item $local).Length / 1MB, 1)
    Ok "  $Name ($mb MB)"
    return $true
}

function Prune-Local([string]$Dir, [string]$Pattern, [int]$Keep) {
    $files = Get-ChildItem $Dir -Filter $Pattern -File -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending
    if ($files.Count -le $Keep) { return 0 }
    $drop = $files | Select-Object -Skip $Keep
    foreach ($f in $drop) {
        Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue
        Say "  清理旧备份 $($f.Name)"
    }
    return $drop.Count
}

$newCount = 0

# ---------- daily ----------
if ($What -eq 'daily' -or $What -eq 'both') {
    Write-Host "[daily]"
    $list = Get-RemoteList 'daily' '^xyll-db-.*\.tar\.gz$'
    Say "远端共 $($list.Count) 份"
    foreach ($n in $list) {
        if (Pull-One 'daily' $n $destDaily) { $newCount++ }
    }
    $null = Prune-Local $destDaily 'xyll-db-*.tar.gz' $KeepDaily
    Write-Host ""
}

# ---------- full ----------
if ($What -eq 'full' -or $What -eq 'both') {
    Write-Host "[full]"
    $list = Get-RemoteList 'full' '^xyll-full-.*\.tar\.gz$'
    Say "远端共 $($list.Count) 份"
    # full 很大，只拉最新的 KeepFull 份
    $take = $list | Select-Object -Last ([Math]::Max(1, $KeepFull))
    foreach ($n in $take) {
        if (Pull-One 'full' $n $destFull) { $newCount++ }
    }
    $null = Prune-Local $destFull 'xyll-full-*.tar.gz' $KeepFull
    Write-Host ""
}

# ---------- 汇总 ----------
Write-Host "=================================================="
if ($newCount -gt 0) {
    Ok "本次下载 $newCount 份新备份"
} else {
    Ok "没有新备份（本地已是最新）"
}

$d = Get-ChildItem $destDaily -File -ErrorAction SilentlyContinue
$f = Get-ChildItem $destFull -File -ErrorAction SilentlyContinue
$dSize = if ($d) { [math]::Round(($d | Measure-Object Length -Sum).Sum / 1MB, 1) } else { 0 }
$fSize = if ($f) { [math]::Round(($f | Measure-Object Length -Sum).Sum / 1MB, 1) } else { 0 }

Write-Host ""
Say "本地 daily : $($d.Count) 份  共 $dSize MB"
if ($d.Count -gt 0) { Say ("              最新 " + ($d | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name) }
Say "本地 full  : $($f.Count) 份  共 $fSize MB"
if ($f.Count -gt 0) { Say ("              最新 " + ($f | Sort-Object LastWriteTime -Descending | Select-Object -First 1).Name) }

Write-Host ""
Say "还原方法（在服务器上）："
Say "  cd /opt/xiaoyu-laile"
Say "  systemctl stop xiaoyu-laile"
Say "  tar -xzf xyll-db-XXXX.tar.gz"
Say "  systemctl start xiaoyu-laile"
Write-Host ""
