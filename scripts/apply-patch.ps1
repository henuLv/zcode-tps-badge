# 将补丁后的 app.asar 换入 ZCode 安装目录
# 用法: powershell -File apply-patch.ps1 -PatchedPath <补丁asar路径> [-TimeoutSec 0] [-NoWait]
# 行为: 默认等待 ZCode 进程退出(运行中无法替换被占用的 asar) -> 首次备份 -> 原子换入
param(
  [string]$AsarPath = "C:\Program Files\ZCode\resources\app.asar",
  [Parameter(Mandatory = $true)][string]$PatchedPath,
  [int]$TimeoutSec = 0,
  [switch]$NoWait
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $PatchedPath)) { Write-Error "补丁文件不存在: $PatchedPath"; exit 1 }

function Test-ZCodeRunning { return [bool](Get-Process -Name "ZCode" -ErrorAction SilentlyContinue) }

if (-not $NoWait) {
  $deadline = if ($TimeoutSec -gt 0) { (Get-Date).AddSeconds($TimeoutSec) } else { $null }
  while (Test-ZCodeRunning) {
    if ($deadline -and (Get-Date) -ge $deadline) {
      Write-Output "WAIT_TIMEOUT"
      exit 3
    }
    Start-Sleep -Seconds 2
  }
}

if (Test-ZCodeRunning) { Write-Output "ZCODE_RUNNING"; exit 3 }

# 首次换入前备份原文件（永久保留，供 restore.ps1 还原）
$backup = "$AsarPath.bak-tps"
if (-not (Test-Path $backup)) {
  Copy-Item $AsarPath $backup
  Write-Output "BACKUP_CREATED $backup"
}

# 同卷临时名 + Move-Item 保证原子性；换入窗口内若 ZCode 重新启动则重试
$tmp = "$AsarPath.tmp-tps"
for ($i = 1; $i -le 3; $i++) {
  try {
    Copy-Item $PatchedPath $tmp -Force
    Move-Item $tmp $AsarPath -Force
    Write-Output "PATCHED_OK"
    exit 0
  } catch {
    Write-Output "RETRY_$i $($_.Exception.Message)"
    Start-Sleep -Seconds 3
  }
}
Write-Output "PATCHED_FAILED"
exit 1
