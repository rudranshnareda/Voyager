@echo off
cd /d C:\Users\rudra\Voyager\backend
venv\Scripts\python.exe test_llm_import.py > llm_test_out.txt 2>&1
echo Exit code: %ERRORLEVEL% >> llm_test_out.txt
type llm_test_out.txt
