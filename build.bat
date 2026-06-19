@echo off
echo ==================================================
echo Antigravity Plugin Manager Build Automation
echo ==================================================

echo [1/3] Cleaning up old build files...
if exist *.vsix del /q /f *.vsix

echo [2/3] Packaging extension via vsce...
call npx @vscode/vsce package --allow-star-activation --allow-missing-repository --skip-license


echo [3/3] Moving and renaming the packaged VSIX to dist/...
node -e "const fs = require('fs'); const path = require('path'); const pkg = JSON.parse(fs.readFileSync('package.json')); const tgt = path.join('dist', 'Antigravity-plugin-manager-' + pkg.version + '.vsix'); if (!fs.existsSync('dist')) { fs.mkdirSync('dist'); } if (fs.existsSync(tgt)) { fs.unlinkSync(tgt); } const files = fs.readdirSync('.').filter(f => f.endsWith('.vsix') && f.includes('plugin-manager')); if (files.length > 0) { fs.renameSync(files[0], tgt); console.log('Successfully moved and renamed ' + files[0] + ' to ' + tgt); } else { console.error('Error: Packaged VSIX file was not found!'); process.exit(1); }"

if %errorlevel% neq 0 (
    echo [ERROR] Move/Rename failed!
    exit /b 1
)

echo ==================================================
echo Build finished successfully!
echo Output VSIX is ready at: dist/
echo ==================================================
