@echo off
setlocal
title ClipForge Bridge
color 0A
cls

echo ==============================================================
echo   ClipForge Bridge - starting
echo ==============================================================
echo.

REM --- find python ---
set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY ( where py >nul 2>&1 && set "PY=py" )
if not defined PY (
    color 0C
    echo [ERROR] Python was not found on this PC.
    echo.
    echo   Install it from https://www.python.org/downloads/
    echo   IMPORTANT: tick "Add python.exe to PATH" in the installer.
    echo.
    pause
    exit /b 1
)

REM --- make sure yt-dlp is available ---
where yt-dlp >nul 2>&1
if errorlevel 1 (
    %PY% -m yt_dlp --version >nul 2>&1
    if errorlevel 1 (
        echo [SETUP] yt-dlp not found - installing it now...
        %PY% -m pip install -U yt-dlp
        echo.
    )
)

echo [OK] Starting bridge on http://127.0.0.1:8765
echo      Leave this window OPEN while you use ClipForge Pro.
echo.
%PY% "%~dp0clipforge_bridge.py" --port 8765 --out "%~dp0..\ClipForge_Output"

echo.
echo Bridge stopped.
pause
