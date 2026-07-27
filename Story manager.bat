@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found on PATH.
  echo Install Python 3 and try again.
  pause
  exit /b 1
)

python -c "import markdown" >nul 2>&1
if errorlevel 1 (
  echo Installing Story Manager dependencies...
  python -m pip install -r "tools\story_manager\requirements.txt"
  if errorlevel 1 (
    echo Failed to install requirements.
    pause
    exit /b 1
  )
)

python "tools\story_manager\app.py"
if errorlevel 1 (
  echo.
  echo Story Manager exited with an error.
  pause
  exit /b 1
)
