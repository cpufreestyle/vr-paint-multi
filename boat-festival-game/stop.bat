@echo off
:: ========== Anti-Crash Guard Shell ==========
if /i not "%~1"=="--guarded" (
    start "DragonBoat Stop" cmd /k ""%~f0" --guarded"
    exit /b 0
)
:: ========== End Guard ==========

setlocal enabledelayedexpansion
title DragonBoat Festival - Stop

set "PORT=8331"
echo.
echo   Stopping server on port %PORT% ...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo   Killing PID %%a ...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="0" (
    echo   No running server found on port %PORT%.
) else (
    echo   Server stopped.
)
echo.
echo Press any key to close...
pause >nul
endlocal
