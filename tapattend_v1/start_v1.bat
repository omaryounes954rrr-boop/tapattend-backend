@echo off
cd /d "C:\Users\Ali\Desktop\tapattend_v1"
set PYTHONPATH=%CD%\backend
python -m uvicorn backend.app.main:app --reload --port 8001