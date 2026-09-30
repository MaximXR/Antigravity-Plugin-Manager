@echo off
call "%~dp0build.bat" all %*
exit /b %errorlevel%
