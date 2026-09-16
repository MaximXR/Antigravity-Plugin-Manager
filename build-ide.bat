@echo off
call "%~dp0build.bat" ide %*
exit /b %errorlevel%
