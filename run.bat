@echo off
setlocal enabledelayedexpansion
title PulseGrid - Clinical Operations and Intelligence Simulator
color 0B

echo ============================================================
echo   PulseGrid - Clinical Operations and Intelligence Simulator
echo   Launching backend API + React dashboard
echo ============================================================
echo.

cd /d "%~dp0"

REM --- Python backend checks -----------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found on PATH. Install Python 3.11+ and re-run.
    pause
    exit /b 1
)

if not exist "venv\" (
    echo [SETUP] Creating virtual environment ...
    python -m venv venv
)
call venv\Scripts\activate.bat
set PYTHONPATH=src

if exist "requirements.txt" (
    echo [SETUP] Installing backend dependencies ...
    python -m pip install --upgrade pip >nul
    pip install -r requirements.txt
)

if not exist "logs\reports\" mkdir logs\reports

echo [CHECK] Running backend test suite ...
python -m pytest tests -q
if errorlevel 1 echo [WARN] Some tests failed. Continuing anyway.

REM --- Node/React frontend checks --------------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found on PATH. Install Node 18+ LTS and re-run.
    pause
    exit /b 1
)

if not exist "dashboard\node_modules\" (
    echo [SETUP] Installing dashboard dependencies via npm install ...
    pushd dashboard
    call npm install
    popd
)

REM --- Launch backend ---------------------------------------------
echo [RUN] Starting backend API on http://127.0.0.1:8000 ...
start "PulseGrid API" cmd /k "call venv\Scripts\activate.bat && set PYTHONPATH=src && python -m uvicorn medflow.api.main:app --app-dir src --host 0.0.0.0 --port 8000 --reload"

timeout /t 4 /nobreak >nul

REM --- Launch frontend ----------------------------------------------
echo [RUN] Starting dashboard on http://localhost:5173 ...
start "PulseGrid Dashboard" cmd /k "cd dashboard && npm run dev"

echo.
echo ============================================================
echo   PulseGrid is starting up in two new windows:
echo     - API        : http://127.0.0.1:8000/docs
echo     - Dashboard  : http://localhost:5173
echo   Close those windows (or Ctrl+C inside them) to stop PulseGrid.
echo ============================================================
echo.
pause
endlocal
