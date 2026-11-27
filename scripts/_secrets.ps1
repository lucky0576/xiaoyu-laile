# Load secrets from <project root>\.secrets.env into process env vars.
#
# Why: the repo is PUBLIC. Credentials must never be committed, so scripts
# read them from here (or from real env vars, e.g. in CI).
#
# Usage from another script:
#   . "$PSScriptRoot\_secrets.ps1"
#
# File format (.secrets.env, gitignored):
#   XYL_SERVER_HOST=root@1.2.3.4
#   XYL_SERVER_PASSWORD=...
#   XYL_ADMIN_ACCOUNT=...
#   XYL_ADMIN_PASSWORD=...
#
# ASCII only: Windows PowerShell 5.1 reads .ps1 as ANSI unless it has a BOM.

$__secretsFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.secrets.env'

if (Test-Path $__secretsFile) {
  Get-Content $__secretsFile -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    # real env vars win over the file
    if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) {
      [Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }
}

# Helper: read a required secret or fail loudly instead of using a default.
function Get-RequiredEnv([string]$Name, [string]$Hint) {
  $v = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if (-not $v) {
    throw "Missing $Name. $Hint See scripts\SECRETS.md"
  }
  return $v
}
