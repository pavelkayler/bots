@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "backend\node_modules" (
  echo Installing backend dependencies...
  pushd backend
  call npm i
  if errorlevel 1 (
    echo Failed to install backend dependencies.
    popd
    exit /b 1
  )
  popd
)

if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  pushd frontend
  call npm i
  if errorlevel 1 (
    echo Failed to install frontend dependencies.
    popd
    exit /b 1
  )
  popd
)

start "backend-dev" cmd /k "cd /d "%ROOT%backend" && npm run dev"
start "frontend-dev" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

endlocal
