@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo Antigravity Plugin Manager Multi-Target Build
echo ==================================================

set TARGET=%1
if "%TARGET%"=="" set TARGET=vsix

if not exist dist mkdir dist

if "%TARGET%"=="all" goto BUILD_EXT
if "%TARGET%"=="vsix" goto BUILD_EXT
if "%TARGET%"=="ide" goto BUILD_EXT
if "%TARGET%"=="ext" goto BUILD_EXT
if "%TARGET%"=="desktop" goto BUILD_DESKTOP
if "%TARGET%"=="electron" goto BUILD_DESKTOP

echo [ERROR] Unknown build target: %TARGET%
echo Usage:
echo   build.bat           - Build IDE extension (.vsix)
echo   build.bat ide       - Build IDE extension (.vsix) [or run build-ide.bat]
echo   build.bat desktop   - Build Electron Desktop (.exe / portable) [or run build-desktop.bat]
echo   build.bat vsix      - Build IDE extension (vsix alias)
echo   build.bat all       - Build both Extension and Desktop
echo.
echo Shortcuts:
echo   build-ide.bat       - Direct shortcut for IDE extension build (.vsix)
echo   build-desktop.bat   - Direct shortcut for Desktop build (.exe)
exit /b 1

:BUILD_EXT
echo.
echo [1/2] Packaging extension via vsce...
if exist *.vsix del /q /f *.vsix
call npx @vscode/vsce package --allow-star-activation --allow-missing-repository --skip-license

if not exist dist mkdir dist
move /y *.vsix dist\

if %errorlevel% neq 0 (
    echo [ERROR] Extension build failed!
    exit /b 1
)

if "%TARGET%"=="ext" goto BUILD_FINISH
if "%TARGET%"=="vsix" goto BUILD_FINISH
if "%TARGET%"=="ide" goto BUILD_FINISH

:BUILD_DESKTOP
echo.
echo [2/2] Building Electron Desktop Application...
cd /d "%~dp0desktop"

:: Synchronize version from root package.json to desktop/package.json
node -e "const fs = require('fs'); const rootPkg = JSON.parse(fs.readFileSync('../package.json')); const deskPkg = JSON.parse(fs.readFileSync('package.json')); deskPkg.version = rootPkg.version; fs.writeFileSync('package.json', JSON.stringify(deskPkg, null, 2) + '\n'); console.log('Synchronized Desktop version to v' + deskPkg.version);"

if not exist node_modules (
    echo Installing Desktop dependencies...
    call npm install
)

:: Close running desktop instance to release file locks
taskkill /f /im "AI Skill & Plugin Manager Desktop.exe" >nul 2>&1

call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Desktop build failed!
    cd /d "%~dp0"
    exit /b 1
)
cd /d "%~dp0"

:BUILD_FINISH
echo.
echo ==================================================
echo Build completed successfully!
echo Artifacts ready in dist/:
dir /b /o-d dist\*.vsix dist\*.exe dist\*.zip 2>nul
echo.
echo Local unpacked executable ready in: dist\win-unpacked\
echo ==================================================
