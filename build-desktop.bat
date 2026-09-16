@echo off
call "%~dp0build.bat" desktop %*
exit /b %errorlevel%
