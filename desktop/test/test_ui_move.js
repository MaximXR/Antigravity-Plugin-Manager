/**
 * Test clicking move button and verifying #move-modal opens in Electron
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point to desktop/main functions
const fsUtils = require('../../services/fsUtils');
const scanners = require('../../services/scanners');
const translations = require('../../locales/translations');

async function testUiMove() {
  console.log('[TEST-UI-MOVE] Starting...');
  const mainModulePath = path.join(__dirname, '..', 'main.js');
  
  // We can spin up an actual test window
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.webContents.on('console-message', (event) => {
    console.log('[RENDERER CONSOLE]', event.message);
  });

  // Setup IPC handler as in main.js
  ipcMain.on('to-backend', async (event, message) => {
    console.log('[IPC to-backend RECEIVED]', JSON.stringify(message));
    if (message.command === 'requestMove' || message.command === 'requestMoveTargets') {
      const targetRes = fsUtils.getMoveDestinations(message, [], 'ru');
      console.log('[IPC getMoveDestinations RESULT]', JSON.stringify(targetRes));
      event.sender.send('from-backend', {
        command: 'moveTargetsResponse',
        data: targetRes
      });
    }
  });

  // Read html
  const htmlPath = path.join(__dirname, '..', '..', 'webview', 'index.html');
  const cssPath = path.join(__dirname, '..', '..', 'webview', 'style.css');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fsUtils.getWebviewScript(path.join(__dirname, '..', '..', 'webview'));

  const dict = translations['ru'] || {};
  html = html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => dict[key] || match);
  const i18nScript = `
<script>
window.LANG = "ru";
window.I18N = ${JSON.stringify(dict)};
if (typeof acquireVsCodeApi === 'undefined') {
  window.acquireVsCodeApi = function() {
    return window.desktopApi || {
      postMessage: function(msg) {
        if (window.desktopApi && window.desktopApi.postMessage) {
          window.desktopApi.postMessage(msg);
        }
      }
    };
  };
}
</script>
`;
  html = html.replace('<!-- INJECT_STYLE -->', `<style>\n${css}\n</style>`);
  html = html.replace('<!-- INJECT_SCRIPT -->', `${i18nScript}\n<script>\n${js}\n</script>`);

  const tempHtml = path.join(os.tmpdir(), 'test_ui_move.html');
  fs.writeFileSync(tempHtml, html, 'utf8');

  await win.loadFile(tempHtml);

  // Send initial data
  const plugins = scanners.scanPlugins(fsUtils.getActivePluginsPath(), []);
  win.webContents.send('from-backend', {
    command: 'init',
    plugins: plugins,
    skills: [],
    rules: [],
    workflows: [],
    mcpServers: [],
    hooks: [],
    stats: { totalPlugins: plugins.length, activePlugins: plugins.length, skills: 0, rules: 0, workflows: 0, mcp: 0, hooks: 0 },
    connectedFolders: [],
    conflicts: [],
    workspaceFolders: []
  });

  await new Promise(r => setTimeout(r, 600));

  // Now inspect the DOM and click the move button
  const result = await win.webContents.executeJavaScript(`
    (function() {
      try {
        console.log('Testing in renderer context...');
        // Find move button
        const moveBtn = document.querySelector('.plugin-move-btn') || document.querySelector('button[title="Переместить"]');
        console.log('Move button found:', !!moveBtn);
        if (moveBtn) {
          console.log('Clicking move button...');
          moveBtn.click();
          return { clicked: true };
        } else {
          return { clicked: false, error: 'No move button found' };
        }
      } catch (e) {
        return { clicked: false, error: e.stack || e.message };
      }
    })()
  `);

  console.log('[EVAL RESULT 1]', result);

  // Wait 1000ms for IPC and modal
  await new Promise(r => setTimeout(r, 1000));

  const modalState = await win.webContents.executeJavaScript(`
    (function() {
      const modal = document.getElementById('move-modal');
      const liveModal = document.getElementById('live-context-modal');
      return {
        modalFound: !!modal,
        display: modal ? modal.style.display : null,
        computedDisplay: modal ? window.getComputedStyle(modal).display : null,
        isInsideLiveModal: modal && liveModal ? liveModal.contains(modal) : false,
        parentTag: modal && modal.parentElement ? modal.parentElement.tagName : null,
        parentClass: modal && modal.parentElement ? modal.parentElement.className : null,
        isTrulyVisible: modal ? (modal.offsetWidth > 0 && modal.offsetHeight > 0) : false,
        destinationsCount: document.querySelectorAll('#move-destinations-list label').length,
        destHtml: document.getElementById('move-destinations-list') ? document.getElementById('move-destinations-list').innerHTML : null
      };
    })()
  `);

  console.log('[MODAL STATE]', modalState);

  // Assert modal is NOT trapped inside live-context-modal and is genuinely visible on screen
  if (modalState.isInsideLiveModal) {
    throw new Error('FAIL: #move-modal is trapped inside #live-context-modal!');
  }
  if (!modalState.isTrulyVisible) {
    throw new Error('FAIL: #move-modal is not truly visible on screen (offsetWidth/Height <= 0)!');
  }

  win.destroy();
  console.log('[TEST-UI-MOVE] PASSED SUCCESSFULLY!');
  app.exit(0);
}

const tempDir = path.join(os.tmpdir(), 'antigravity-test-userdata-' + Date.now());
fs.mkdirSync(tempDir, { recursive: true });
app.setPath('userData', tempDir);
app.whenReady().then(testUiMove);
