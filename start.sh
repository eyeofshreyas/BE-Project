#!/usr/bin/env bash
cd "$(dirname "$0")"
mkdir -p logs

(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000) > logs/backend.log 2>&1 &
echo "backend  pid=$! log=logs/backend.log"

(cd frontend && npm run dev) > logs/frontend.log 2>&1 &
echo "frontend pid=$! log=logs/frontend.log"

echo "tail -f logs/backend.log logs/frontend.log   # to watch"
wait
