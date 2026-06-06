@echo off
cd /d "%~dp0"

echo ============================================
echo   Backend API - Leadership AI Workshop
echo   Port: 8000
echo   Docs: http://localhost:8000/docs
echo ============================================
echo.
"%~dp0venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000
echo.
echo Backend stopped. Press any key...
pause >nul
