@echo off
rem Starts Receipt Tracker on http://localhost:8770/ and opens it in your browser.
rem Needs Python 3 (https://www.python.org/downloads/ - tick "Add python.exe to PATH").
cd /d "%~dp0"
set PORT=8770
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo Python 3 was not found. Install it from https://www.python.org/downloads/
  pause
  exit /b 1
)
start "" "http://localhost:%PORT%/"
echo Receipt Tracker is running at http://localhost:%PORT%/
echo Keep this window open while you use the app. Close it to stop.
%PY% -m http.server %PORT% --bind 127.0.0.1
