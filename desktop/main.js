/**
 * main.js — Electron Main Process (Monorepo Desktop Target)
 * Antigravity Plugin Manager Desktop
 *
 * Architecture:
 * - Application lifecycle & Single Instance Lock
 * - BrowserWindow creation with Glassmorphism styling and secure isolation
 * - HTML hydration & asset inlining (getHtmlContent)
 * - Multi-scope resource aggregator (collectAllData)
 * - IPC message router for all commands from DESKTOP_SPEC.md & extensions
 * - Native Windows Explorer and System File integrations
 * - Headless smoke test engine (--smoke-test)
 * - Projects Scanner & Watcher integration (services/projects.js)
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeTheme } = require('electron');

// Force native dark theme across all Chromium internal popups, menus, and selects
if (nativeTheme) {
  nativeTheme.themeSource = 'dark';
}
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// Monorepo service imports
function resolveService(name) {
  try {
    return require(path.join(__dirname, 'services', name));
  } catch (_) {
    return require(path.join(__dirname, '..', 'services', name));
  }
}

const fsUtils = resolveService('fsUtils');
const scanners = resolveService('scanners');
const actions = resolveService('actions');
const updater = resolveService('updater');
const vscodeShim = resolveService('vscodeShim');
const projectsService = require('./services/projects');

let translationsModule;
try {
  translationsModule = require('../locales/translations');
} catch (_) {
  translationsModule = require('./locales/translations');
}
const { translations, getTranslation } = translationsModule;

// Configuration persistence paths
const CONFIG_FILE = path.join(os.homedir(), '.gemini', 'antigravity_desktop_config.json');
const WORKSPACES_FILE = path.join(os.homedir(), '.gemini', 'antigravity_desktop_workspaces.json');

// Global state
let mainWindow = null;
let tray = null;
let isQuitting = false;
let activeLanguage = loadActiveLanguage();

let appVersion = '1.2.22';
try {
  const pkg = require('./package.json');
  if (pkg && pkg.version) appVersion = pkg.version;
} catch (_) {}
let appUpdateState = null;

let currentProjectId = null;
let workspaceRoots = [];

/**
 * Load persisted workspace folder roots
 */
function loadWorkspaceRoots() {
  try {
    if (fs.existsSync(WORKSPACES_FILE)) {
      const content = fs.readFileSync(WORKSPACES_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((p) => typeof p === 'string' && fs.existsSync(p));
      }
    }
  } catch (e) {
    fsUtils.logDebug(`loadWorkspaceRoots error: ${e.message}`);
  }
  return [];
}

/**
 * Save persisted workspace folder roots
 */
function saveWorkspaceRoots(roots) {
  try {
    const dir = path.dirname(WORKSPACES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(roots, null, 2), 'utf8');
  } catch (e) {
    fsUtils.logDebug(`saveWorkspaceRoots error: ${e.message}`);
  }
}

function loadSavedProjectSelection() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.lastProjectId !== undefined) {
        return parsed.lastProjectId;
      }
    }
  } catch (e) {}
  return undefined;
}

function saveSavedProjectSelection(projectId) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
    }
    existing.lastProjectId = projectId;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {}
}

function initDesktopWorkspace() {
  // 1. Check CLI arguments for an explicit user directory path
  const args = process.argv.slice(1);
  const appRoot = path.resolve(__dirname, '..');
  const desktopRoot = path.resolve(__dirname);

  for (const arg of args) {
    const trimmed = (arg || '').trim();
    if (!trimmed || trimmed.startsWith('-') || trimmed === '.' || trimmed === '..' || trimmed.includes('node_modules') || trimmed.endsWith('.js')) {
      continue;
    }
    const abs = path.resolve(trimmed);
    if (abs === desktopRoot || abs === appRoot) {
      continue;
    }
    if (fs.existsSync(abs)) {
      try {
        if (fs.statSync(abs).isDirectory()) {
          projectsService.addCustomFolder(abs);
          currentProjectId = 'custom:' + abs.toLowerCase();
          workspaceRoots = [abs];
          saveWorkspaceRoots(workspaceRoots);
          saveSavedProjectSelection(currentProjectId);
          return;
        }
      } catch (_) {}
    }
  }

  // 2. Check saved project preference from CONFIG_FILE
  const savedProjId = loadSavedProjectSelection();
  if (savedProjId !== undefined) {
    if (savedProjId === null || savedProjId === '' || savedProjId === '__none__') {
      currentProjectId = null;
      workspaceRoots = [];
      return;
    }
    if (savedProjId.startsWith('custom:')) {
      const targetPath = savedProjId.replace('custom:', '').trim();
      if (targetPath && targetPath !== '.' && targetPath !== '..' && path.isAbsolute(targetPath) && fs.existsSync(targetPath)) {
        const abs = path.resolve(targetPath);
        currentProjectId = 'custom:' + abs.toLowerCase();
        workspaceRoots = [abs];
        return;
      } else {
        // Clear corrupted / dot custom selection
        saveSavedProjectSelection(null);
        currentProjectId = null;
        workspaceRoots = [];
      }
    } else {
      const pData = projectsService.getAntigravityProjects();
      const match = pData.projects.find((p) => p.id === savedProjId);
      if (match && match.folders && match.folders.length > 0) {
        currentProjectId = match.id;
        workspaceRoots = match.folders.map((f) => f.fsPath);
        return;
      }
    }
  }

  // 3. Fallback to active project from app_storage.json if first run
  const pData = projectsService.getAntigravityProjects();
  const activeProj = pData.projects.find((p) => p.isActive);
  if (activeProj && activeProj.folders && activeProj.folders.length > 0) {
    currentProjectId = activeProj.id;
    workspaceRoots = activeProj.folders.map((f) => f.fsPath);
    saveWorkspaceRoots(workspaceRoots);
    saveSavedProjectSelection(currentProjectId);
  }
}

initDesktopWorkspace();

// Helper to resolve webview files (monorepo ../webview first, then ./webview)
function resolveWebviewPath(filename) {
  const parentPath = path.join(__dirname, '..', 'webview', filename);
  if (fs.existsSync(parentPath)) return parentPath;
  return path.join(__dirname, 'webview', filename);
}

// Helper to resolve resource files
function resolveResourcePath(filename) {
  const parentPath = path.join(__dirname, '..', 'resources', filename);
  if (fs.existsSync(parentPath)) return parentPath;
  return path.join(__dirname, 'resources', filename);
}

// Setup background filesystem watcher on Antigravity projects
let projectsWatcher = null;
try {
  projectsWatcher = projectsService.watchAntigravityProjects(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const data = collectAllData(workspaceRoots);
      mainWindow.webContents.send('from-backend', data);
    }
  });
} catch (_) {}

// Intercept before-quit to permit clean application exit
app.on('before-quit', () => {
  isQuitting = true;
  if (projectsWatcher && typeof projectsWatcher.dispose === 'function') {
    projectsWatcher.dispose();
  }
});

// Sync initial state with vscodeShim for services
vscodeShim._setState({
  activeLanguage,
  workspaceFolders: workspaceRoots
});

/**
 * Load persisted language preference
 */
function loadActiveLanguage() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.language) {
        return parsed.language === 'auto' ? 'ru' : parsed.language;
      }
    }
  } catch (e) {}
  return 'ru';
}

/**
 * Save persisted language preference
 */
function saveActiveLanguage(lang) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
    }
    existing.language = lang;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Collect all data across global and workspace scopes
 */
function collectAllData(roots = workspaceRoots) {
  const activePluginsPath = fsUtils.getActivePluginsPath();
  const activeSkillsPath = fsUtils.getActiveSkillsPath();
  const activeWorkflowsPath = fsUtils.getActiveWorkflowsPath();
  const storagePath = fsUtils.getDefaultStoragePath();

  const workspaceFolders = (roots || []).map((r) => {
    let fsPath = typeof r === 'string' ? r : (r.fsPath || (r.uri ? r.uri.fsPath : ''));
    if (fsPath && !path.isAbsolute(fsPath)) {
      fsPath = path.resolve(fsPath);
    }
    const name = typeof r === 'string' ? (path.basename(fsPath) || fsPath) : (r.name || path.basename(fsPath));
    return { name, fsPath };
  }).filter((w) => w.fsPath && w.fsPath !== '.' && w.fsPath !== '..' && fs.existsSync(w.fsPath));

  const validRoots = workspaceFolders.map((w) => w.fsPath).filter(Boolean);

  // 1. Plugins
  const globalPlugins = scanners.scanPlugins(activePluginsPath, validRoots);
  const seenPluginPaths = new Set(globalPlugins.map((p) => path.normalize(p.physicalPath).toLowerCase()));
  const localPlugins = scanners.scanLocalPlugins(validRoots, seenPluginPaths);
  localPlugins.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  const plugins = [...globalPlugins, ...localPlugins];

  // 2. Skills
  const builtinSkills = scanners.scanBuiltinSkills();
  const globalSkills = scanners.scanSkills(activeSkillsPath, validRoots);
  const seenSkillPaths = new Set([
    ...builtinSkills.map((s) => path.normalize(s.physicalPath).toLowerCase()),
    ...globalSkills.map((s) => path.normalize(s.physicalPath).toLowerCase())
  ]);
  const localSkills = scanners.scanLocalSkills(validRoots, seenSkillPaths);
  localSkills.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  const pluginSkills = [];
  plugins.forEach((p) => {
    if (p.skills && p.skills.length > 0) {
      p.skills.forEach((s) => {
        pluginSkills.push({
          ...s,
          id: `plugin-${p.id}-${s.id}`,
          pluginId: p.id,
          pluginName: p.displayName || p.name,
          isPlugin: true,
          isEnabled: p.isEnabled
        });
      });
    }
  });
  const skills = [...globalSkills, ...localSkills, ...builtinSkills, ...pluginSkills];

  // 3. Workflows
  const builtinWorkflows = scanners.scanBuiltinWorkflows();
  const globalWorkflows = scanners.scanWorkflows(activeWorkflowsPath);
  const localWorkflows = scanners.scanLocalWorkflows(validRoots);
  localWorkflows.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
  const pluginWorkflows = [];
  plugins.forEach((p) => {
    if (p.workflows && p.workflows.length > 0) {
      p.workflows.forEach((w) => {
        pluginWorkflows.push({
          ...w,
          id: `plugin-${p.id}-${w.id}`,
          pluginId: p.id,
          pluginName: p.displayName || p.name,
          isPlugin: true,
          isEnabled: p.isEnabled
        });
      });
    }
  });
  const workflows = [...globalWorkflows, ...localWorkflows, ...builtinWorkflows, ...pluginWorkflows];

  // 4. Rules, MCP servers, hooks
  const rules = scanners.scanAllRules(validRoots, plugins);
  const mcpServers = scanners.scanAllMcpServers(validRoots, plugins);
  const hooks = scanners.scanAllHooks(validRoots, plugins);

  // 5. Statistics & connected library folders
  const stats = scanners.getContextStats(plugins, skills, workflows, rules, mcpServers, hooks);
  const connectedFolders = scanners.getConnectedFolders(validRoots);

  const antigravityProjectsData = projectsService.getAntigravityProjects();

  return {
    command: 'init',
    plugins,
    skills,
    workflows,
    rules,
    mcpServers,
    hooks,
    stats,
    connectedFolders,
    conflicts: [],
    workspaceFolders,
    antigravityProjects: antigravityProjectsData.projects,
    customFolders: antigravityProjectsData.customFolders || [],
    activeProjectId: currentProjectId,
    liveContext: { available: false },
    storagePath,
    updatesState: null
  };
}

/**
 * Hydrate webview/index.html with localization dictionary, scripts, and styles
 */
function getHtmlContent(lang = activeLanguage) {
  const htmlPath = resolveWebviewPath('index.html');
  const cssPath = resolveWebviewPath('style.css');

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fsUtils.getWebviewScript(resolveWebviewPath(''));

  // Universal SSOT hydration
  html = fsUtils.hydrateWebviewHtml(html, lang, 'auto');

  const dict = translations[lang] || translations['ru'] || translations['en'] || {};

  // Inject styles and scripts with universal bridge adapter
  const i18nScript = `
<script>
window.LANG = ${JSON.stringify(lang)};
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

  return html;
}

/**
 * Loads hydrated HTML into a BrowserWindow
 */
function loadHydratedHtml(win, lang = activeLanguage) {
  const html = getHtmlContent(lang);
  const tempDir = (app && typeof app.getPath === 'function') ? app.getPath('temp') : os.tmpdir();
  const renderedPath = path.join(tempDir, 'antigravity_desktop_index.render.html');
  fs.writeFileSync(renderedPath, html, 'utf8');
  win.loadFile(renderedPath);
}

/**
 * Open folder or file in Windows Explorer
 */
async function openPathInExplorer(targetPath) {
  if (!targetPath) return;
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        shell.showItemInFolder(targetPath);
      } else {
        await shell.openPath(targetPath);
      }
    } else {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: activeLang === 'ru' ? 'Папка не найдена' : 'Folder Not Found',
          message: activeLang === 'ru'
            ? `Папка не существует на диске:\n${targetPath}`
            : `Folder does not exist on disk:\n${targetPath}`
        });
      }
    }
  } catch (e) {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Error',
        message: e.message
      });
    }
  }
}

/**
 * Open file in default system application
 */
async function openFileInDefaultApp(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      const err = await shell.openPath(filePath);
      if (err) {
        spawn('cmd.exe', ['/c', 'start', '""', filePath], { detached: true, stdio: 'ignore' });
      }
    }
  } catch (e) {
    try {
      spawn('cmd.exe', ['/c', 'start', '""', filePath], { detached: true, stdio: 'ignore' });
    } catch (_) {}
    fsUtils.logDebug(`openFile error: ${e.message}`);
  }
}

/**
 * Create the main Electron application window
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Skill & Plugin Manager Desktop',
    backgroundColor: '#1e1e2e',
    icon: resolveResourcePath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('console-message', (_event, level, msg, line, src) => {
    if (level >= 2 || (typeof msg === 'string' && msg.includes('Error'))) {
      fsUtils.logDebug(`[RENDERER CONSOLE] (${src}:${line}) [lvl:${level}] ${msg}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:') && !url.startsWith('data:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  loadHydratedHtml(mainWindow, activeLanguage);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    const data = collectAllData(workspaceRoots);
    mainWindow.webContents.send('from-backend', data);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Builds the context menu for system tray
 */
function buildTrayMenu() {
  const isRu = activeLanguage === 'ru';
  const menuItems = [];

  if (appUpdateState && appUpdateState.hasUpdate) {
    menuItems.push({
      label: `✨ ${isRu ? 'Доступно обновление' : 'Update available'}: v${appUpdateState.remoteVersion}`,
      click: () => {
        if (appUpdateState.downloadUrl || appUpdateState.releaseUrl) {
          shell.openExternal(appUpdateState.downloadUrl || appUpdateState.releaseUrl);
        }
      }
    });
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({
    label: isRu ? 'Показать окно' : 'Show Window',
    click: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        createMainWindow();
      }
    }
  });

  menuItems.push({
    label: isRu ? 'Обновить данные' : 'Refresh Data',
    click: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const data = collectAllData(workspaceRoots);
        mainWindow.webContents.send('from-backend', data);
      }
    }
  });

  menuItems.push({
    label: isRu ? 'Проверить обновления приложения...' : 'Check for app updates...',
    click: async () => {
      await checkForDesktopAppUpdates(true);
    }
  });

  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: isRu ? 'Выход' : 'Exit',
    click: () => {
      isQuitting = true;
      app.quit();
    }
  });

  return Menu.buildFromTemplate(menuItems);
}

function updateTrayMenu() {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildTrayMenu());
  }
}

/**
 * Checks for a new version of the Desktop app on GitHub.
 * If isManual is true, displays user dialogs.
 */
async function checkForDesktopAppUpdates(isManual = false) {
  try {
    fsUtils.logDebug(`[APP UPDATE] Checking updates (current: v${appVersion}, manual: ${isManual})...`);
    const res = await updater.checkAppUpdate(appVersion);
    if (res && res.hasUpdate) {
      appUpdateState = res;
      updateTrayMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('from-backend', {
          command: 'appUpdateAvailable',
          update: res
        });
      }
      if (isManual && mainWindow && !mainWindow.isDestroyed()) {
        const isRu = activeLanguage === 'ru';
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: isRu ? 'Обновление приложения' : 'Application Update',
          message: isRu
            ? `Доступна новая версия AI Skill & Plugin Manager Desktop v${res.remoteVersion}!\n\nСкачать обновление сейчас?`
            : `A new version of AI Skill & Plugin Manager Desktop v${res.remoteVersion} is available!\n\nDownload update now?`,
          buttons: [isRu ? 'Скачать' : 'Download', isRu ? 'Позже' : 'Later'],
          defaultId: 0
        }).then(({ response }) => {
          if (response === 0) {
            shell.openExternal(res.downloadUrl || res.releaseUrl);
          }
        });
      }
    } else if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      const isRu = activeLanguage === 'ru';
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: isRu ? 'Обновление приложения' : 'Application Update',
        message: isRu
          ? `У вас установлена самая актуальная версия v${appVersion}.`
          : `You are using the latest version v${appVersion}.`,
        buttons: ['OK']
      });
    }
    return res;
  } catch (e) {
    fsUtils.logDebug(`[APP UPDATE] Check error: ${e.message}`);
    if (isManual && mainWindow && !mainWindow.isDestroyed()) {
      const isRu = activeLanguage === 'ru';
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: isRu ? 'Проверка обновлений' : 'Check for Updates',
        message: isRu
          ? `Не удалось проверить обновления: ${e.message}`
          : `Failed to check for updates: ${e.message}`,
        buttons: ['OK']
      });
    }
    return null;
  }
}

/**
 * Initialize system tray icon with context menu
 */
function createTray() {
  const iconPath = resolveResourcePath('icon.png');
  if (!fs.existsSync(iconPath)) return;

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('AI Skill & Plugin Manager Desktop');
    tray.setContextMenu(buildTrayMenu());

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isFocused()) {
            mainWindow.hide();
          } else {
            mainWindow.focus();
          }
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        createMainWindow();
      }
    });
  } catch (e) {
    fsUtils.logDebug(`createTray error: ${e.message}`);
  }
}

/**
 * Headless smoke test harness (--smoke-test)
 */
async function runHeadlessSmokeTest() {
  console.log('[SMOKE TEST] Initializing Headless Test Harness...');
  try {
    const data = collectAllData([]);
    console.log(`[SMOKE TEST] collectAllData: ${data.plugins.length} plugins, ${data.skills.length} skills, ${data.rules.length} rules, ${data.hooks.length} hooks`);
    const html = getHtmlContent('ru');
    if (!html || html.length < 500) {
      throw new Error('Generated HTML content is empty or incomplete');
    }
    console.log('[SMOKE TEST] HTML compilation verified successfully');

    const smokeWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    const rendererErrors = [];
    smokeWin.webContents.on('console-message', (event, level, msg, line, src) => {
      if (level >= 3 || (typeof msg === 'string' && (msg.includes('SyntaxError') || msg.includes('ReferenceError') || msg.includes('TypeError')))) {
        rendererErrors.push(`${msg} (${src}:${line})`);
      }
    });

    const tempDir = app.getPath('temp');
    const smokeFile = path.join(tempDir, 'antigravity_smoke_test.html');
    fs.writeFileSync(smokeFile, html, 'utf8');

    await smokeWin.loadFile(smokeFile);
    smokeWin.webContents.send('from-backend', data);
    await new Promise((r) => setTimeout(r, 600));

    if (rendererErrors.length > 0) {
      throw new Error('Renderer JavaScript errors detected:\n' + rendererErrors.join('\n'));
    }

    console.log('[SMOKE TEST] Headless BrowserWindow, webview assets and renderer IPC executed without errors');
    smokeWin.destroy();
    console.log('[SMOKE TEST PASSED]');
    app.exit(0);
  } catch (err) {
    console.error(`[SMOKE TEST FAILED]: ${err.message}`);
    app.exit(1);
  }
}

const isSmokeTest = process.argv.includes('--smoke-test');

if (isSmokeTest) {
  const tempDir = path.join(os.tmpdir(), 'antigravity-smoke-userdata-' + Date.now());
  try { fs.mkdirSync(tempDir, { recursive: true }); } catch (_) {}
  app.setPath('userData', tempDir);

  app.whenReady().then(async () => {
    await runHeadlessSmokeTest();
  });
} else {
  // Single instance lock
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    app.whenReady().then(async () => {
      createMainWindow();
      createTray();

      setTimeout(async () => {
        await checkForDesktopAppUpdates(false);
      }, 3500);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        }
      });
    });
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

/**
 * IPC Message Router (Listening on 'to-backend', responding on 'from-backend')
 */
ipcMain.on('to-backend', async (event, message) => {
  if (!message || typeof message !== 'object') return;
  const cmd = message.command;

  try {
    switch (cmd) {
      case 'clientError': {
        fsUtils.logDebug(`[CLIENT ERROR] ${message.error || ''} at ${message.source || ''}:${message.lineno || ''}`);
        break;
      }

      case 'init':
      case 'ready':
      case 'refresh': {
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'refreshAntigravityProjects': {
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'changeLanguage': {
        if (message.language) {
          activeLanguage = message.language === 'auto' ? 'ru' : message.language;
          saveActiveLanguage(activeLanguage);
          vscodeShim._setState({ activeLanguage });
          if (mainWindow && !mainWindow.isDestroyed()) {
            loadHydratedHtml(mainWindow, activeLanguage);
          }
        }
        break;
      }

      case 'switchAntigravityProject': {
        const pId = message.projectId;
        if (!pId || pId === '__none__' || pId === '') {
          // Deselect project: return to clean global context
          currentProjectId = null;
          workspaceRoots = [];
          saveWorkspaceRoots([]);
          saveSavedProjectSelection(null);
          vscodeShim._setState({ workspaceFolders: [] });
        } else if (pId.startsWith('custom:')) {
          // Custom user folder
          const targetPath = pId.replace('custom:', '').trim();
          if (targetPath && targetPath !== '.' && targetPath !== '..' && path.isAbsolute(targetPath) && fs.existsSync(targetPath)) {
            const abs = path.resolve(targetPath);
            currentProjectId = 'custom:' + abs.toLowerCase();
            workspaceRoots = [abs];
            saveWorkspaceRoots(workspaceRoots);
            saveSavedProjectSelection(currentProjectId);
            vscodeShim._setState({ workspaceFolders: workspaceRoots });
          } else {
            // Stale or invalid custom folder: purge and reset to global
            projectsService.removeCustomFolder(targetPath);
            currentProjectId = null;
            workspaceRoots = [];
            saveWorkspaceRoots([]);
            saveSavedProjectSelection(null);
            vscodeShim._setState({ workspaceFolders: [] });
          }
        } else {
          // Standard Antigravity project
          currentProjectId = pId;
          projectsService.setAntigravityActiveProject(currentProjectId);
          const pData = projectsService.getAntigravityProjects();
          const targetProj = pData.projects.find((p) => p.id === currentProjectId);
          if (targetProj && targetProj.folders && targetProj.folders.length > 0) {
            workspaceRoots = targetProj.folders.map((f) => f.fsPath);
          } else {
            workspaceRoots = [];
          }
          saveWorkspaceRoots(workspaceRoots);
          saveSavedProjectSelection(currentProjectId);
          vscodeShim._setState({ workspaceFolders: workspaceRoots });
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'chooseCustomWorkspaceFolder': {
        if (mainWindow) {
          const res = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: activeLanguage === 'ru' ? 'Выберите пользовательскую рабочую папку' : 'Select Custom Workspace Folder'
          });
          if (!res.canceled && res.filePaths && res.filePaths[0]) {
            const selectedFolder = res.filePaths[0];
            projectsService.addCustomFolder(selectedFolder);
            currentProjectId = 'custom:' + path.normalize(selectedFolder).toLowerCase();
            workspaceRoots = [selectedFolder];
            saveWorkspaceRoots(workspaceRoots);
            saveSavedProjectSelection(currentProjectId);
            vscodeShim._setState({ workspaceFolders: workspaceRoots });
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'removeCustomWorkspaceFolder': {
        if (message.folderPath) {
          projectsService.removeCustomFolder(message.folderPath);
          const targetId = 'custom:' + path.normalize(message.folderPath).toLowerCase();
          if (currentProjectId === targetId) {
            currentProjectId = null;
            workspaceRoots = [];
            saveWorkspaceRoots([]);
            saveSavedProjectSelection(null);
            vscodeShim._setState({ workspaceFolders: [] });
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'togglePluginGlobal': {
        await actions.toggleItem(
          null,
          null,
          message.id,
          message.enable,
          activeLanguage,
          'plugin',
          message.physicalPath
        );
        event.sender.send('from-backend', {
          command: 'syncStatus',
          state: 'synced',
          etaMs: 0,
          skillsCount: 0
        });
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'togglePluginProject': {
        let targetRoots = [];
        if (message.targetMode === 'all') {
          targetRoots = workspaceRoots;
        } else if (message.targetMode === 'specific' && message.workspaceRoot) {
          targetRoots = [message.workspaceRoot];
        } else {
          // primary by default
          targetRoots = message.workspaceRoot ? [message.workspaceRoot] : (workspaceRoots.length > 0 ? [workspaceRoots[0]] : []);
        }

        if (targetRoots.length > 0) {
          await actions.togglePluginProject(
            targetRoots,
            message.pluginPath || message.physicalPath,
            message.id || message.pluginId,
            message.action !== undefined ? message.action : message.enable,
            activeLanguage
          );
          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'toggleSkillGlobal': {
        await actions.toggleSkillGlobal(
          message.id,
          message.enable,
          activeLanguage,
          message.altName,
          message.physicalPath
        );
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'toggleSkillProject': {
        let targetRoots = [];
        if (message.targetMode === 'all') {
          targetRoots = workspaceRoots;
        } else if (message.targetMode === 'specific' && message.workspaceRoot) {
          targetRoots = [message.workspaceRoot];
        } else {
          targetRoots = message.workspaceRoot ? [message.workspaceRoot] : (workspaceRoots.length > 0 ? [workspaceRoots[0]] : []);
        }

        if (targetRoots.length > 0) {
          await actions.toggleSkillProject(
            targetRoots,
            message.physicalPath || message.skillPath,
            message.id || message.skillName,
            message.action !== undefined ? message.action : message.enable,
            activeLanguage
          );
          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'toggle': {
        if (message.category === 'skill') {
          await actions.toggleSkillGlobal(
            message.id,
            message.enable,
            activeLanguage,
            message.altName,
            message.physicalPath
          );
        } else if (message.category === 'workflow') {
          await actions.toggleItem(
            fsUtils.getActiveWorkflowsPath(),
            path.join(fsUtils.getDefaultStoragePath(), 'workflows'),
            message.id,
            message.enable,
            activeLanguage,
            'workflow'
          );
        } else {
          await actions.toggleItem(
            null,
            null,
            message.id,
            message.enable,
            activeLanguage,
            'plugin',
            message.physicalPath
          );
        }
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'toggleMcpServer': {
        const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
        await actions.toggleMcpServer(message.physicalPath, message.serverName, isEnabled, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'deleteMcpServer': {
        await actions.deleteMcpServer(message.physicalPath, message.serverName, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'moveMcp':
      case 'moveMcpServer': {
        await actions.moveMcpServer(message.serverName, message.physicalPath, message.targetPath, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'toggleHook': {
        const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
        await actions.toggleHook(message.physicalPath, message.hookName, isEnabled, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'deleteHook': {
        await actions.deleteHook(message.physicalPath, message.hookName, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'moveHook': {
        await actions.moveHook(message.hookName, message.physicalPath, message.targetPath, activeLanguage);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'connectFolder':
      case 'addCustomFolder': {
        let folderPath = message.folderPath;
        const configType = message.type || 'plugins';
        const isWorkspace = message.scope === 'workspace' || !!message.workspaceRoot;

        if (!folderPath && mainWindow) {
          const res = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: configType === 'plugins' ? 'Connect Plugins Folder' : 'Connect Skills Folder'
          });
          if (!res.canceled && res.filePaths && res.filePaths[0]) {
            folderPath = res.filePaths[0];
          }
        }

        if (folderPath && fs.existsSync(folderPath)) {
          let targetRoots = [];
          if (isWorkspace) {
            if (message.targetMode === 'all') {
              targetRoots = workspaceRoots;
            } else if (message.workspaceRoot) {
              targetRoots = [message.workspaceRoot];
            } else {
              targetRoots = workspaceRoots.length > 0 ? [workspaceRoots[0]] : [];
            }
            for (const root of targetRoots) {
              const targetConfig = configType === 'skills'
                ? fsUtils.getWorkspaceSkillConfigPath(root)
                : fsUtils.getWorkspacePluginConfigPath(root);
              fsUtils.addEntryToJsonConfig(targetConfig, folderPath);
            }
          } else {
            const targetConfig = configType === 'skills'
              ? fsUtils.getGlobalSkillsJsonPath()
              : fsUtils.getGlobalPluginsJsonPath();
            fsUtils.addEntryToJsonConfig(targetConfig, folderPath);
          }
          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'disconnectFolder': {
        const configuredPath = message.configuredPath || message.folderPath || message.path || '';
        let sourceFile = message.sourceFile;
        if (!sourceFile) {
          const isPlugins = message.type === 'plugins' || message.type === 'plugin';
          if (message.workspaceRoot) {
            sourceFile = isPlugins
              ? fsUtils.getWorkspacePluginConfigPath(message.workspaceRoot)
              : fsUtils.getWorkspaceSkillConfigPath(message.workspaceRoot);
          } else {
            sourceFile = isPlugins
              ? fsUtils.getGlobalPluginsJsonPath()
              : fsUtils.getGlobalSkillsJsonPath();
          }
        }
        if (sourceFile && configuredPath) {
          fsUtils.removeEntryFromJsonConfig(sourceFile, configuredPath);
          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'removeCustomWorkspaceFolder':
      case 'removeCustomFolder': {
        const folderToRemove = message.folderPath || message.path || (message.projectId && message.projectId.startsWith('custom:') ? message.projectId.replace('custom:', '') : '');
        if (folderToRemove) {
          projectsService.removeCustomFolder(folderToRemove);
          const normToRemove = path.resolve(folderToRemove).toLowerCase();
          const currentNorm = currentProjectId && currentProjectId.startsWith('custom:')
            ? path.resolve(currentProjectId.replace('custom:', '')).toLowerCase()
            : null;
          if (currentNorm === normToRemove) {
            currentProjectId = null;
            workspaceRoots = [];
            saveWorkspaceRoots([]);
            saveSavedProjectSelection(null);
            vscodeShim._setState({ workspaceFolders: [] });
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'replaceConnectedFolder': {
        const { sourceFile, oldPath, workspaceRoot } = message;
        if (sourceFile && oldPath && mainWindow) {
          const res = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: activeLang === 'ru' ? 'Выберите новую папку для замены' : 'Select replacement folder'
          });
          if (!res.canceled && res.filePaths && res.filePaths[0]) {
            const newFolder = res.filePaths[0];
            fsUtils.replaceEntryInJsonConfig(sourceFile, oldPath, newFolder, workspaceRoot);
            await fsUtils.triggerIdeScannerFlush(workspaceRoots);
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'selectWorkspace': {
        if (mainWindow) {
          const res = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Project Workspace Folder'
          });
          if (!res.canceled && res.filePaths && res.filePaths[0]) {
            const selectedPath = res.filePaths[0];
            if (!workspaceRoots.includes(selectedPath)) {
              workspaceRoots.push(selectedPath);
              saveWorkspaceRoots(workspaceRoots);
              vscodeShim._setState({ workspaceFolders: workspaceRoots });
            }
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'createItem': {
        await actions.createItem({
          ...message,
          activePluginsPath: fsUtils.getActivePluginsPath(),
          activeSkillsPath: fsUtils.getActiveSkillsPath(),
          activeWorkflowsPath: fsUtils.getActiveWorkflowsPath()
        }, activeLanguage);
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'deleteItem': {
        await actions.deleteItem(
          message.category,
          message.id,
          message.displayName || message.id,
          message.physicalPath,
          activeLanguage,
          fsUtils.getActiveSkillsPath()
        );
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'requestMove':
      case 'requestMoveTargets': {
        fsUtils.logDebug(`[MOVE] requestMove: ${message.itemId || ''} (${message.category || ''}) path=${message.physicalPath || ''}`);
        if (message.targetDir && message.physicalPath) {
          // Direct execution if targetDir is already specified
          const moveRes = await actions.moveItem(message.physicalPath, message.targetDir, {
            lang: activeLanguage,
            overwrite: !!message.overwrite,
            category: message.category,
            itemId: message.itemId,
            enableInWorkspaceRoot: message.enableInWorkspaceRoot
          });
          if (!moveRes.success) {
            if (moveRes.conflict) {
              event.sender.send('from-backend', {
                command: 'moveConflict',
                conflict: true,
                message: moveRes.message,
                filename: moveRes.filename,
                targetPath: moveRes.targetPath
              });
              return;
            }
            event.sender.send('from-backend', {
              command: 'error',
              message: moveRes.message || 'Protected resource cannot be moved'
            });
          } else {
            await fsUtils.triggerIdeScannerFlush(workspaceRoots);
            event.sender.send('from-backend', {
              command: 'moveComplete',
              filename: moveRes.filename
            });
          }
          const data = collectAllData(workspaceRoots);
          event.sender.send('from-backend', data);
        } else {
          // Calculate destinations and open universal move modal
          const targetRes = fsUtils.getMoveDestinations(message, workspaceRoots, activeLanguage);
          fsUtils.logDebug(`[MOVE] getMoveDestinations: ${targetRes.destinations.length} destinations found`);
          if (!targetRes.success && targetRes.isProtected) {
            event.sender.send('from-backend', {
              command: 'error',
              message: targetRes.message
            });
            return;
          }
          event.sender.send('from-backend', {
            command: 'moveTargetsResponse',
            data: targetRes
          });
        }
        break;
      }

      case 'chooseCustomMoveFolder': {
        try {
          const result = await dialog.showOpenDialog(mainWindow, {
            title: activeLanguage === 'ru' ? 'Выберите папку назначения' : 'Select Destination Folder',
            properties: ['openDirectory', 'createDirectory']
          });
          if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
            event.sender.send('from-backend', {
              command: 'customMoveFolderChosen',
              folderPath: result.filePaths[0]
            });
          }
        } catch (e) {
          fsUtils.logDebug(`Error opening move folder dialog: ${e.message}`);
        }
        break;
      }

      case 'executeMove':
      case 'moveItem': {
        fsUtils.logDebug(`[MOVE] executeMove: ${message.physicalPath} -> ${message.targetDir} (overwrite=${!!message.overwrite})`);
        if (message.targetDir && message.physicalPath) {
          const moveRes = await actions.moveItem(message.physicalPath, message.targetDir, {
            lang: activeLanguage,
            overwrite: !!message.overwrite,
            category: message.category,
            itemId: message.itemId,
            enableInWorkspaceRoot: message.enableInWorkspaceRoot
          });
          if (!moveRes.success) {
            if (moveRes.conflict) {
              event.sender.send('from-backend', {
                command: 'moveConflict',
                conflict: true,
                message: moveRes.message,
                filename: moveRes.filename,
                targetPath: moveRes.targetPath
              });
              return;
            }
            event.sender.send('from-backend', {
              command: 'error',
              message: moveRes.message || 'Failed to move resource'
            });
          } else {
            await fsUtils.triggerIdeScannerFlush(workspaceRoots);
            event.sender.send('from-backend', {
              command: 'moveComplete',
              filename: moveRes.filename
            });
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'savePluginMetadata': {
        const pluginDir = message.physicalPath || (message.id ? path.join(fsUtils.getActivePluginsPath(), message.id) : '');
        if (pluginDir) {
          await actions.savePluginMetadata(pluginDir, message.metadata || {}, activeLanguage);
          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'editPluginMetadata': {
        const val = message.value !== undefined ? message.value : message.currentValue;
        fsUtils.writePluginMetaField(message.physicalPath || message.id, message.field, val);
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'resolveConflict': {
        await actions.resolveConflict(message, activeLanguage);
        await fsUtils.triggerIdeScannerFlush(workspaceRoots);
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'softApplyIde': {
        fsUtils.ensureDefaultPluginsFolderInGlobalConfig();
        fsUtils.touchAntigravityConfigs(workspaceRoots);
        event.sender.send('from-backend', { command: 'syncStatus', state: 'synced', etaMs: 0, skillsCount: 0 });
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'getIdeLiveContext': {
        event.sender.send('from-backend', { command: 'liveContextData', data: { available: false } });
        break;
      }

      case 'checkUpdates': {
        const data = collectAllData(workspaceRoots);
        try {
          // Check plugin updates and desktop app updates concurrently
          const [updates] = await Promise.all([
            updater.checkAllUpdates(data.plugins, activeLanguage),
            checkForDesktopAppUpdates(false)
          ]);
          event.sender.send('from-backend', {
            command: 'updatesChecked',
            results: updates,
            hasUpdates: updates.filter((u) => u.hasUpdate).length > 0
          });
        } catch (e) {
          event.sender.send('from-backend', {
            command: 'updateStatus',
            message: `Update check failed: ${e.message}`,
            level: 'error'
          });
        }
        break;
      }

      case 'checkAppUpdate': {
        const appUp = await checkForDesktopAppUpdates(true);
        if (appUp && appUp.hasUpdate) {
          event.sender.send('from-backend', {
            command: 'appUpdateAvailable',
            update: appUp
          });
        }
        break;
      }

      case 'openExternalUrl': {
        if (message.url) {
          shell.openExternal(message.url);
        }
        break;
      }

      case 'updatePlugin': {
        try {
          event.sender.send('from-backend', {
            command: 'updateProgress',
            pluginId: message.pluginId,
            stage: 'start',
            status: 'running',
            detail: 'Starting update...'
          });

          const result = await updater.updatePlugin(message.pluginId, message.physicalPath, (progress) => {
            event.sender.send('from-backend', {
              command: 'updateProgress',
              pluginId: message.pluginId,
              ...progress
            });
          });

          event.sender.send('from-backend', {
            command: 'updateProgress',
            pluginId: message.pluginId,
            stage: 'complete',
            status: result.success ? 'success' : 'error',
            detail: result.message
          });

          await fsUtils.triggerIdeScannerFlush(workspaceRoots);
          const data = collectAllData(workspaceRoots);
          event.sender.send('from-backend', data);
        } catch (e) {
          event.sender.send('from-backend', {
            command: 'updateProgress',
            pluginId: message.pluginId,
            stage: 'error',
            status: 'error',
            detail: e.message
          });
        }
        break;
      }

      case 'openItemFolder': {
        let p = message.physicalPath;
        if (!p && message.id && message.type === 'plugin') {
          p = path.join(fsUtils.getActivePluginsPath(), message.id);
        }
        if (p) await openPathInExplorer(p);
        break;
      }

      case 'openFolder': {
        const folder = message.folderPath || message.path;
        if (folder) await openPathInExplorer(folder);
        break;
      }

      case 'openFile':
      case 'openFileInEditor': {
        let targetPath = message.physicalPath || message.filePath || message.file;
        if (!targetPath && message.id) {
          if (message.category === 'workflow') {
            const activeWf = path.join(fsUtils.getActiveWorkflowsPath(), message.id.endsWith('.md') ? message.id : `${message.id}.md`);
            if (fs.existsSync(activeWf)) targetPath = activeWf;
          } else if (message.category === 'skill') {
            const activeSk = path.join(fsUtils.getActiveSkillsPath(), message.id, 'SKILL.md');
            if (fs.existsSync(activeSk)) targetPath = activeSk;
          }
        }

        if (targetPath && fs.existsSync(targetPath)) {
          if (fs.statSync(targetPath).isDirectory()) {
            const skillMd = path.join(targetPath, 'SKILL.md');
            const pluginJson = path.join(targetPath, 'plugin.json');
            if (fs.existsSync(skillMd)) {
              targetPath = skillMd;
            } else if (fs.existsSync(pluginJson)) {
              targetPath = pluginJson;
            }
          }
          await openFileInDefaultApp(targetPath);
        } else if (targetPath) {
          await openFileInDefaultApp(targetPath);
        }
        break;
      }

      case 'openActive':
      case 'openActiveFolder':
      case 'openActivePluginsFolder': {
        const p = fsUtils.getActivePluginsPath();
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        await openPathInExplorer(p);
        break;
      }

      case 'openActiveSkills':
      case 'openActiveSkillsFolder': {
        const p = fsUtils.getActiveSkillsPath();
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        await openPathInExplorer(p);
        break;
      }

      case 'openStorage': {
        const p = fsUtils.getDefaultStoragePath();
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        await openPathInExplorer(p);
        break;
      }

      case 'openConfigJson':
      case 'openConfigFile': {
        await openFileInDefaultApp(fsUtils.getAntigravityConfigPath());
        break;
      }

      case 'openPluginsJson':
      case 'openPluginsConfigFile': {
        const root = message.workspaceRoot;
        if (root) {
          await openFileInDefaultApp(fsUtils.getWorkspacePluginConfigPath(root));
        } else {
          await openFileInDefaultApp(fsUtils.getGlobalPluginsJsonPath());
        }
        break;
      }

      case 'openSkillsJson':
      case 'openSkillsConfigFile': {
        const root = message.workspaceRoot;
        if (root) {
          await openFileInDefaultApp(fsUtils.getWorkspaceSkillConfigPath(root));
        } else {
          await openFileInDefaultApp(fsUtils.getGlobalSkillsJsonPath());
        }
        break;
      }

      case 'openProjectConfigFile': {
        const root = message.workspaceRoot || workspaceRoots[0];
        if (root) {
          const cfg = message.type === 'skills'
            ? fsUtils.getWorkspaceSkillConfigPath(root)
            : fsUtils.getWorkspacePluginConfigPath(root);
          await openFileInDefaultApp(cfg);
        }
        break;
      }

      case 'openAgentsFolder':
      case 'openProjectAgentsFolder': {
        const root = message.workspaceRoot || (workspaceRoots.length > 0 ? workspaceRoots[0] : null);
        if (root) {
          const p = path.join(root, '.agents');
          if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
          await openPathInExplorer(p);
        }
        break;
      }

      case 'openExternalUrl': {
        if (message.url) {
          shell.openExternal(message.url);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    fsUtils.logDebug(`IPC Handler error [${cmd}]: ${err.message}`);
    event.sender.send('from-backend', {
      command: 'error',
      message: err.message
    });
  }
});

module.exports = {
  collectAllData,
  getHtmlContent,
  loadWorkspaceRoots,
  saveWorkspaceRoots
};
