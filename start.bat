@echo off
cd /d "%~dp0"

start "backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"
start "frontend" cmd /k "cd frontend && npm run dev"
