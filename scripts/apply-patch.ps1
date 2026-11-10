# Swap the patched app.asar into the ZCode install directory.
# Usage: powershell -File apply-patch.ps1 -PatchedPath <patched-asar> [-TimeoutSec 0] [-NoWait]
# Behavior: wait for ZCode to exit (locked asar cannot be replaced) -> backup once -> atomic swap.
# NOTE: keep comments ASCII-only. PS5.1 reads BOM-less .ps1 as ANSI/GBK; UTF-8 Chinese
# comments can swallow newlines and silently comment out the next line (hit on 3.18.0.10300).
param(
  [string]$AsarPath = "C:\Program Files\ZCode\resources\app.asar",
  [Parameter(Mandatory = $true)][string]$PatchedPath,
  [int]$TimeoutSec = 0,
  [switch]$NoWait
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $PatchedPath)) { Write-Error "Patched file not found: $PatchedPath"; exit 1 }

function Test-ZCodeRunning { return [bool](Get-Process -Name "ZCode" -ErrorAction SilentlyContinue) }

if (-not $NoWait) {
  $deadline = if ($TimeoutSec -gt 0) { (Get-Date).AddSeconds($TimeoutSec) } else { $null }
  while (Test-ZCodeRunning) {
    if ($deadline -and (Get-Date) -ge $deadline) {
      Write-Output "WAIT_TIMEOUT"
      exit 3
    }
    # poll 0.8s: catch the exit window even if the user restarts within 1-2s
    Start-Sleep -Milliseconds 800
  }
}

if (Test-ZCodeRunning) { Write-Output "ZCODE_RUNNING"; exit 3 }

# Backup the original once before the first swap (kept permanently for restore.ps1).
# Use string concat: "$AsarPath.bak-tps" would try property access .bak -> empty string.
$backup = $AsarPath + ".bak-tps"
if (-not (Test-Path $backup)) {
  Copy-Item $AsarPath $backup
  Write-Output "BACKUP_CREATED $backup"
}

# Same-volume tmp name + Move-Item for atomicity; retry if ZCode restarts mid-swap.
$tmp = $AsarPath + ".tmp-tps"
for ($i = 1; $i -le 10; $i++) {
  try {
    Copy-Item $PatchedPath $tmp -Force
    Move-Item $tmp $AsarPath -Force
    Write-Output "PATCHED_OK"
    exit 0
  } catch {
    Write-Output "RETRY_$i $($_.Exception.Message)"
    Start-Sleep -Seconds 2
  }
}
Write-Output "PATCHED_FAILED"
exit 1
