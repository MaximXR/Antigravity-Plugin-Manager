@echo off
title Antigravity Plugin Manager Desktop
cd /d "%~dp0"
echo Starting Antigravity Plugin Manager Desktop...

if not exist node_modules (
    echo [INFO] Installing desktop dependencies...
    call npm install
)

call npm start
