# 批量重新生成照片封面（把旧的「小鱼」占位换成新 logo）
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$base = 'https://xiaoyulaile.online'
$log = "$env:TEMP\cover-batch.log"
$json = "$env:TEMP\cover-cands.json"

function Log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
}

Remove-Item $log -Force -ErrorAction SilentlyContinue
Log '=== 开始批量生成封面 ==='

# 登录拿 token
$body = @{ account = '13456693544'; password = 'weilan0576' } | ConvertTo-Json
$login = Invoke-RestMethod "$base/api/auth/login" -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 30
$token = $login.data.token
$hdr = @{ Authorization = "Bearer $token" }

$items = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json
Log "目标数量: $($items.Count)"

$ok = 0; $fail = 0; $n = 0
foreach ($it in $items) {
  $n++
  $payload = @{ listingId = $it.id; force = $true } | ConvertTo-Json
  try {
    $r = Invoke-RestMethod "$base/api/admin/covers/photo" -Method POST `
      -ContentType 'application/json; charset=utf-8' -Headers $hdr `
      -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 120
    if ($r.data.coverUrl) { $ok++ } else { $fail++; Log "  [$n/$($items.Count)] 无封面返回: $($it.id)" }
  } catch {
    $fail++
    Log "  [$n/$($items.Count)] 失败: $($it.id) - $($_.Exception.Message.Substring(0, [Math]::Min(60, $_.Exception.Message.Length)))"
  }
  if ($n % 10 -eq 0) { Log "  进度 $n/$($items.Count)  成功 $ok  失败 $fail" }
}

Log "=== 完成：成功 $ok / 失败 $fail / 共 $n ==="
Write-Output "DONE ok=$ok fail=$fail total=$n"
