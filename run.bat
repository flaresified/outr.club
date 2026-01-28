@echo off
cd /d "%~dp0"

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
    echo.
)

if not exist ".env" (
    if exist ".env.example" (
        echo Copying .env.example to .env...
        copy ".env.example" ".env"
        echo Edit .env to set JWT_SECRET before production.
        echo.
    )
)

echo Freeing port 4000 if in use...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":4000 "') do (
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 1 /nobreak >nul
)

echo Starting outr.club...
call npm start
pause
