: << 'BATCH_SCRIPT'
@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
set "HOOK_NAME=%~1"
if "%HOOK_NAME%"=="" (
    echo {"error": "No hook name provided"} 1>&2
    exit /b 1
)
set "BASH_PATH="
where git >nul 2>&1 && (
    for /f "delims=" %%i in ('where git') do (
        set "GIT_PATH=%%~dpi"
        if exist "!GIT_PATH!..\bin\bash.exe" set "BASH_PATH=!GIT_PATH!..\bin\bash.exe"
        if exist "!GIT_PATH!..\usr\bin\bash.exe" set "BASH_PATH=!GIT_PATH!..\usr\bin\bash.exe"
    )
)
if "!BASH_PATH!"=="" where bash >nul 2>&1 && set "BASH_PATH=bash"
if "!BASH_PATH!"=="" (
    where node >nul 2>&1 && (
        node "%SCRIPT_DIR%run-hook.js" %HOOK_NAME% 2>nul
        exit /b !ERRORLEVEL!
    )
    echo {}
    exit /b 0
)
"!BASH_PATH!" "%SCRIPT_DIR%%HOOK_NAME%" 2>/dev/null
exit /b %ERRORLEVEL%
BATCH_SCRIPT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_NAME="${1:-}"
if [ -z "$HOOK_NAME" ]; then
    echo '{"error": "No hook name provided"}' >&2
    exit 1
fi
HOOK_SCRIPT="$SCRIPT_DIR/$HOOK_NAME"
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo '{}'
    exit 0
fi
exec bash "$HOOK_SCRIPT"
