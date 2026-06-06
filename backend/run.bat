@echo off
chcp 65001 >nul 2>&1
title 领导力AI工作坊-后端 API

cd /d "%~dp0"

echo ============================================
echo   后端 API 服务启动中...
echo   端口: 8000
echo   文档: http://localhost:8000/docs
echo ============================================
echo.

"%~dp0venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 2>&1

echo.
echo 后端已停止。按任意键关闭...
pause >nul
