#!/usr/bin/env bash
cd "$(dirname "$0")"
mkdir -p logs

(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000) > logs/backend.log 2>&1 &
echo "backend  pid=$! log=logs/backend.log"

(cd frontend && npm run dev) > logs/frontend.log 2>&1 &
echo "frontend pid=$! log=logs/frontend.log"

if [ "$1" = "--ngrok" ]; then
  if command -v ngrok >/dev/null 2>&1; then
    (ngrok http 8000) > logs/ngrok.log 2>&1 &
    echo "ngrok    pid=$! log=logs/ngrok.log   # forwarding URL: http://127.0.0.1:4040 -- see SETUP.md for webhook setup"
  else
    echo "ngrok not found -- install it first (see SETUP.md), skipping tunnel"
  fi
fi

echo "tail -f logs/backend.log logs/frontend.log   # to watch"
wait
