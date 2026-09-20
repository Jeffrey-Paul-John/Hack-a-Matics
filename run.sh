#!/usr/bin/env sh
PYTHONPATH=src uvicorn medflow.api.main:app --host 0.0.0.0 --port 8000 --reload &
cd dashboard && npm run dev
