@echo off
cd /d "%~dp0"

echo ============================================
echo   Frontend UI - Leadership AI Workshop
echo   Port: 5173
echo   URL:  http://localhost:5173
echo ============================================
echo.
npx vite --host 0.0.0.0 --port 5173
echo.
echo Frontend stopped. Press any key...
pause >nul
