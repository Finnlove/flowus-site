@echo off
chcp 65001 >nul
echo 正在停止 FlowUs 同步服务...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'sync\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('已停止 PID ' + $_.ProcessId) }"
echo.
echo 完成。按任意键关闭。
pause >nul
