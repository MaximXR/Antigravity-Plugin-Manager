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
  // 1. Check CLI arguments for a directory path
  const args = process.argv.slice(1);
  for (const arg of args) {
    if (arg && !arg.startsWith('-') && !arg.includes('node_modules') && !arg.endsWith('.js') && fs.existsSync(arg)) {
      try {
        if (fs.statSync(arg).isDirectory()) {
          const norm = path.normalize(arg);
          projectsService.addCustomFolder(norm);
          currentProjectId = 'custom:' + norm.toLowerCase();
          workspaceRoots = [norm];
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
      const targetPath = savedProjId.replace('custom:', '');
      if (fs.existsSync(targetPath)) {
        currentProjectId = savedProjId;
        workspaceRoots = [targetPath];
        return;
      }
    }
    const pData = projectsService.getAntigravityProjects();
    const match = pData.projects.find((p) => p.id === savedProjId);
    if (match && match.folders && match.folders.length > 0) {
      currentProjectId = match.id;
      workspaceRoots = match.folders.map((f) => f.fsPath);
      return;
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
    const fsPath = typeof r === 'string' ? r : (r.fsPath || (r.uri ? r.uri.fsPath : ''));
    const name = typeof r === 'string' ? path.basename(r) : (r.name || path.basename(fsPath));
    return { name, fsPath };
  });

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

  const dict = translations[lang] || translations['ru'] || translations['en'] || {};
  const enDict = translations['en'] || {};

  // 1. Language selector options
  html = html.replace(/\{\{lang\}\}/g, lang);
  html = html.replace(/\{\{configLangAuto\}\}/g, lang === 'auto' ? 'selected' : '');
  html = html.replace(/\{\{configLangEn\}\}/g, lang === 'en' ? 'selected' : '');
  html = html.replace(/\{\{configLangRu\}\}/g, lang === 'ru' ? 'selected' : '');

  // 2. Dictionary token replacements
  html = html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    if (dict[key] !== undefined) {
      return dict[key];
    }
    if (key.endsWith('Esc')) {
      const baseKey = key.slice(0, -3);
      if (dict[baseKey] !== undefined) {
        return String(dict[baseKey]).replace(/"/g, '&quot;');
      }
    }
    if (enDict[key] !== undefined) {
      return enDict[key];
    }
    if (key.endsWith('Esc')) {
      const baseKey = key.slice(0, -3);
      if (enDict[baseKey] !== undefined) {
        return String(enDict[baseKey]).replace(/"/g, '&quot;');
      }
    }
    return match;
  });

  // 3. Fallback explicit labels
  const manualReplacements = {
    openActiveFolderBtn: lang === 'ru' ? 'Открыть папку Plugins' : 'Open Active Folder',
    openStorageFolderBtn: lang === 'ru' ? 'Открыть Хранилище' : 'Open Storage Folder',
    openFolderBtn: lang === 'ru' ? 'Открыть папку' : 'Open folder',
    openPluginFolderBtn: lang === 'ru' ? 'Открыть папку плагина' : 'Open plugin folder',
    createSkillBtn: lang === 'ru' ? 'Создать навык' : 'Create Skill',
    createScriptsLabel: lang === 'ru' ? 'Создать папку scripts (фоновые утилиты)' : 'Create scripts folder (background utilities)',
    createExamplesLabel: lang === 'ru' ? 'Создать папку examples (примеры)' : 'Create examples folder (examples)',
    createDocsLabel: lang === 'ru' ? 'Создать папку docs (документация)' : 'Create docs folder (documentation)',
    createResourcesLabel: lang === 'ru' ? 'Создать папку resources (ресурсы)' : 'Create resources folder (resources)',
    deleteBtn: lang === 'ru' ? 'Удалить' : 'Delete',
    refreshBtn: lang === 'ru' ? 'Обновить' : 'Refresh',
    searchPlaceholder: lang === 'ru' ? 'Поиск...' : 'Search...',
    layoutModeText: lang === 'ru' ? 'В 1 колонку' : '1 Column',
    viewModeText: lang === 'ru' ? 'Подробно' : 'Detailed',
    groupingModeText: lang === 'ru' ? 'Группировка: Выкл' : 'Grouping: Off',
    detailLayoutModeText: lang === 'ru' ? 'В 1 колонку' : '1 Column',
    detailViewModeText: lang === 'ru' ? 'Подробно' : 'Detailed',
    btnClose: lang === 'ru' ? 'Закрыть' : 'Close'
  };

  for (const [k, v] of Object.entries(manualReplacements)) {
    html = html.split(`{{${k}}}`).join(v);
  }

  // 4. Inject styles and scripts with universal bridge adapter
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
      spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
    }
  } catch (e) {
    try {
      spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
    } catch (_) {}
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
 * Initialize system tray icon with context menu
 */
function createTray() {
  const iconPath = resolveResourcePath('icon.png');
  if (!fs.existsSync(iconPath)) return;

  try {
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Показать окно',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Обновить данные',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const data = collectAllData(workspaceRoots);
            mainWindow.webContents.send('from-backend', data);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('AI Skill & Plugin Manager Desktop');
    tray.setContextMenu(contextMenu);

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
          currentProjectId = pId;
          const targetPath = pId.replace('custom:', '');
          if (fs.existsSync(targetPath)) {
            workspaceRoots = [targetPath];
            saveWorkspaceRoots(workspaceRoots);
            saveSavedProjectSelection(currentProjectId);
            vscodeShim._setState({ workspaceFolders: workspaceRoots });
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

      case 'disconnectFolder':
      case 'removeCustomFolder': {
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
      case 'moveItem': {
        if (message.targetDir && message.physicalPath) {
          const moveRes = await actions.moveItem(message.physicalPath, message.targetDir, activeLanguage);
          if (!moveRes || !moveRes.success) {
            event.sender.send('from-backend', {
              command: 'error',
              message: (moveRes && moveRes.message) || 'Protected resource cannot be moved'
            });
          } else {
            await fsUtils.triggerIdeScannerFlush(workspaceRoots);
          }
        }
        const data = collectAllData(workspaceRoots);
        event.sender.send('from-backend', data);
        break;
      }

      case 'editPluginMetadata': {
        fsUtils.writePluginMetaField(message.physicalPath || message.id, message.field, message.currentValue);
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
          const updates = await updater.checkAllUpdates(data.plugins, activeLanguage);
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

      case 'openActiveFolder': {
        const p = message.type === 'skills' ? fsUtils.getActiveSkillsPath() : fsUtils.getActivePluginsPath();
        await openPathInExplorer(p);
        break;
      }

      case 'openActivePluginsFolder': {
        await openPathInExplorer(fsUtils.getActivePluginsPath());
        break;
      }

      case 'openActiveSkillsFolder': {
        await openPathInExplorer(fsUtils.getActiveSkillsPath());
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
          await openPathInExplorer(path.join(root, '.agents'));
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
