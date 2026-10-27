# 还原 ZCode 原始 app.asar（TPS 补丁回滚）
# 用法: 关闭 ZCode 后运行  powershell -File restore.ps1
param(
  [string]$AsarPath = "C:\Program Files\ZCode\resources\app.asar"
)
$ErrorActionPreference = "Stop"
$backup = "$AsarPath.bak-tps"
if (-not (Test-Path $backup)) { Write-Error "备份不存在: $backup"; exit 1 }

while (Get-Process -Name "ZCode" -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2 }

Move-Item $backup $AsarPath -Force
Write-Output "RESTORED_OK $AsarPath"
