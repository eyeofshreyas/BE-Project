@echo off
cd /d "%~dp0"

start "backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"
start "frontend" cmd /k "cd frontend && npm run dev"

if "%1"=="--ngrok" (
    where ngrok >nul 2>nul
    if %errorlevel%==0 (
        start "ngrok" cmd /k "ngrok http 8000"
    ) else (
        echo ngrok not found -- install it first ^(see SETUP.md^), skipping tunnel
    )
)
