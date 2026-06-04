@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Leadership AI Workshop - Launcher

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "PY=%BACKEND_DIR%\venv\Scripts\python.exe"
set "NPM_CMD=npm"
set "NPX_CMD=npx"
set "CURL=%SystemRoot%\System32\curl.exe"
set "BACKEND_URL=http://localhost:8000/api/health"
set "FRONTEND_URL=http://localhost:5173"

if /i "%~1"=="--check" (
    call :validate
    if errorlevel 1 exit /b 1
    echo Startup script check passed.
    exit /b 0
)

echo.
echo ============================================
echo   Leadership AI Workshop
echo ============================================
echo.

call :validate
if errorlevel 1 (
    echo.
    echo Startup aborted. Fix the item above and run start.bat again.
    pause
    exit /b 1
)

echo [1/2] Starting backend API...
start "Backend API" /D "%BACKEND_DIR%" cmd /k ""%PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo   Waiting for backend...
call :wait_for_url "%BACKEND_URL%" 30
if errorlevel 1 (
    echo.
    echo   [Warning] Backend did not become ready within 30 seconds.
    echo   Check the "Backend API" window for details.
) else (
    echo   Backend ready.
)

echo.
echo [2/2] Starting frontend UI...
start "Frontend UI" /D "%FRONTEND_DIR%" cmd /k "%NPX_CMD% vite --host 0.0.0.0 --port 5173"

echo   Waiting for frontend...
call :wait_for_url "%FRONTEND_URL%" 30
if errorlevel 1 (
    echo.
    echo   [Warning] Frontend did not become ready within 30 seconds.
    echo   Check the "Frontend UI" window for details.
) else (
    echo   Frontend ready.
)

echo.
echo ============================================
echo   Startup complete
echo.
echo   Frontend: %FRONTEND_URL%
echo   API docs: http://localhost:8000/docs
echo ============================================
echo.
start "" "%FRONTEND_URL%"
pause
exit /b 0

:validate
if not exist "%BACKEND_DIR%\" (
    echo [Error] Backend directory not found: %BACKEND_DIR%
    exit /b 1
)

if not exist "%FRONTEND_DIR%\" (
    echo [Error] Frontend directory not found: %FRONTEND_DIR%
    exit /b 1
)

if not exist "%PY%" (
    echo [Error] Python virtual environment not found: %PY%
    echo         Create it under backend\venv and install backend\requirements.txt.
    exit /b 1
)

where "%NPX_CMD%" >nul 2>&1
if errorlevel 1 (
    echo [Error] npx was not found. Install Node.js or add it to PATH.
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo [Error] Frontend package.json not found: %FRONTEND_DIR%\package.json
    exit /b 1
)

if not exist "%CURL%" (
    echo [Error] curl.exe was not found: %CURL%
    exit /b 1
)

exit /b 0

:wait_for_url
set "URL=%~1"
set "SECONDS=%~2"

for /l %%i in (1,1,%SECONDS%) do (
    "%CURL%" -fsS -o nul "%URL%" >nul 2>&1
    if !ERRORLEVEL! EQU 0 exit /b 0
    <nul set /p =.
    timeout /t 1 /nobreak >nul
)

exit /b 1
