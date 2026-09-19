#!/usr/bin/env sh
PYTHONPATH=src uvicorn medflow.api.main:app --reload &
cd dashboard && npm run dev
