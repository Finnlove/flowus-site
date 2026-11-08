@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   FlowUs 到 GitHub 同步服务
echo   控制面板: http://127.0.0.1:7357/
echo ============================================
echo.
node sync.js --serve
echo.
echo 服务已停止。按任意键关闭窗口。
pause >nul
