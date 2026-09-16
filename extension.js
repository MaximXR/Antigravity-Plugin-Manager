const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { getTranslation, translations } = require('./locales/translations');
const {
  getWebviewScript,
  logDebug,
  getActiveLanguage,
  getActivePluginsPath,
  getActiveSkillsPath,
  getActiveWorkflowsPath,
  getDefaultStoragePath,
  getGlobalStoragePath,
  getStorageSubpath,
  writePluginMetaField,
  safeMoveDir,
  getBuiltinPath,
  getAntigravityConfigPath,
  getGlobalPluginsJsonPath,
  getGlobalSkillsJsonPath,
  getWorkspacePluginConfigPath,
  getWorkspaceSkillConfigPath,
  resolveJsonConfigPath,
  readJsonConfigFile,
  touchAntigravityConfigs,
  ensureDefaultPluginsFolderInGlobalConfig,
  isNameExcludedInJsonConfig,
  isPathInJsonConfigEntries,
  addExcludeToJsonConfig,
  removeExcludeFromJsonConfig,
  setPluginManifestDisabled,
  removeAntigravityPluginFromConfig,
  migrateFromLegacyStorage
} = require('./services/fsUtils');
const {
  scanConflicts,
  scanPlugins,
  scanLocalPlugins,
  scanSkills,
  scanLocalSkills,
  scanBuiltinSkills,
  scanWorkflows,
  scanLocalWorkflows,
  scanBuiltinWorkflows,
  scanAllRules,
  scanAllMcpServers,
  scanAllHooks,
  getContextStats,
  getConnectedFolders,
  scanIdeLiveContext
} = require('./services/scanners');
const {
  toggleItem,
  togglePluginGlobal,
  togglePluginProject,
  toggleSkillGlobal,
  toggleSkillProject,
  connectFolder,
  disconnectFolder,
  toggleHook,
  toggleMcpServer,
  deleteHook,
  deleteMcpServer,
  moveMcpServer,
  moveHook,
  createItem,
  deleteItem,
  resolveConflict,
  migrateStorage
} = require('./services/actions');
const {
  parsePluginRepo,
  checkPluginUpdate,
  checkAllUpdates,
  updatePlugin
} = require('./services/updater');

let activePanel = undefined;
let sidebarProvider = undefined;

// Centralized helper to get current workspace roots
function getWorkspaceRoots() {
  return vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath) 
    : [];
}

// Centralized context data collector
function collectAllData(context) {
  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();

  const workspaceRoots = getWorkspaceRoots();

  const workspaceFolders = vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders.map(folder => ({ name: folder.name, fsPath: folder.uri.fsPath }))
    : [];

  const globalPlugins = scanPlugins(activePluginsPath, workspaceRoots);
  const seenPluginPaths = new Set(globalPlugins.map(p => path.normalize(p.physicalPath).toLowerCase()));
  const localPlugins = scanLocalPlugins(workspaceRoots, seenPluginPaths);
  localPlugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const plugins = [...globalPlugins, ...localPlugins];
  
  const builtinSkills = scanBuiltinSkills();
  const globalSkills = scanSkills(activeSkillsPath, workspaceRoots);
  const seenSkillPaths = new Set([
    ...builtinSkills.map(s => path.normalize(s.physicalPath).toLowerCase()),
    ...globalSkills.map(s => path.normalize(s.physicalPath).toLowerCase())
  ]);
  const localSkills = scanLocalSkills(workspaceRoots, seenSkillPaths);
  localSkills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const pluginSkills = [];
  plugins.forEach(p => {
    if (p.skills && p.skills.length > 0) {
      p.skills.forEach(s => {
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

  const builtinWorkflows = scanBuiltinWorkflows();
  const globalWorkflows = scanWorkflows(activeWorkflowsPath);
  const localWorkflows = scanLocalWorkflows();
  localWorkflows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const pluginWorkflows = [];
  plugins.forEach(p => {
    if (p.workflows && p.workflows.length > 0) {
      p.workflows.forEach(w => {
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

  const rules = scanAllRules(workspaceRoots, plugins);
  const mcpServers = scanAllMcpServers(workspaceRoots, plugins);
  const hooks = scanAllHooks(workspaceRoots, plugins);

  const stats = getContextStats(plugins, skills, workflows, rules, mcpServers, hooks);
  const connectedFolders = getConnectedFolders(workspaceRoots);
  const cachedUpdates = context && context.globalState 
    ? context.globalState.get('antigravity-plugin-manager.updatesState') 
    : null;
  let liveContext = { available: false };
  try {
    liveContext = scanIdeLiveContext();
  } catch (e) {
    logDebug(`scanIdeLiveContext error: ${e.message}`);
  }

  return {
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
    liveContext,
    updatesState: cachedUpdates
  };
}

class PluginManagerViewProvider {
  constructor(context, statusBarItem) {
    this._context = context;
    this._statusBarItem = statusBarItem;
    this._view = undefined;
  }

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;
    sidebarProvider = this;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(this._context.extensionPath)]
    };

    const activeLang = getActiveLanguage();
    webviewView.webview.html = getHtmlContentShared(webviewView.webview, this._context, activeLang);

    setupWebviewMessagingShared(webviewView.webview, this._context, this._statusBarItem, () => {
      const data = collectAllData(this._context);
      this.sendInitialData(data);
      sendPanelData(this._context, data);
      updateStatusBarItem(this._statusBarItem, this._context, data);
    });

    this.sendInitialData();
  }

  sendInitialData(precomputedData = null) {
    if (!this._view) return null;
    const data = precomputedData || collectAllData(this._context);
    this._view.webview.postMessage({
      command: 'init',
      ...data
    });
    return data;
  }
}

function sendPanelData(context, precomputedData = null) {
  if (!activePanel) return null;
  const data = precomputedData || collectAllData(context);
  activePanel.webview.postMessage({
    command: 'init',
    ...data
  });
  return data;
}

function updateStatusBarItem(statusBarItem, context, precomputedData = null) {
  if (!statusBarItem) return;

  const config = vscode.workspace.getConfiguration('antigravity-plugin-manager');
  const showSkills = config.get('statusBar.showSkills', true);
  const showRules = config.get('statusBar.showRules', true);
  const format = config.get('statusBar.format', 'icons');
  const iconSet = config.get('statusBar.iconSet', 'extensions_book');
  const lang = getActiveLanguage();

  let iconPlugin = '$(extensions)';
  let iconSkill = '📖';
  let iconRule = '📜';

  if (iconSet === 'extensions_tabs') {
    iconPlugin = '$(extensions)';
    iconSkill = '📑';
    iconRule = '📜';
  } else if (iconSet === 'extensions_notebook') {
    iconPlugin = '$(extensions)';
    iconSkill = '📓';
    iconRule = '📜';
  } else if (iconSet === 'codicons') {
    iconPlugin = '$(extensions)';
    iconSkill = '$(book)';
    iconRule = '$(law)';
  } else if (iconSet === 'plug_book') {
    iconPlugin = '🔌';
    iconSkill = '📖';
    iconRule = '📜';
  } else if (iconSet === 'puzzle_lightbulb') {
    iconPlugin = '🧩';
    iconSkill = '💡';
    iconRule = '📜';
  } else {
    // 'extensions_book' (default)
    iconPlugin = '$(extensions)';
    iconSkill = '📖';
    iconRule = '📜';
  }

  const data = precomputedData || collectAllData(context);
  const plugins = data.plugins || [];
  const activePlugins = plugins.filter(p => p.isEnabled);
  const activePluginsCount = activePlugins.length;
  const totalPluginsCount = plugins.length;

  // 2. Skills
  let activeSkillsCount = 0;
  let totalSkillsCount = 0;
  let activeSkills = [];
  if (showSkills) {
    const allSkills = data.skills || [];
    activeSkills = allSkills.filter(s => s.isEnabled);
    activeSkillsCount = activeSkills.length;
    totalSkillsCount = allSkills.length;
  }

  // 3. Rules
  let activeRulesCount = 0;
  let totalRulesCount = 0;
  let activeRules = [];
  if (showRules) {
    const allRules = data.rules || [];
    activeRules = allRules.filter(r => r.isEnabled);
    activeRulesCount = activeRules.length;
    totalRulesCount = allRules.length;
  }

  // Format parts (icons only, full words, or compact numbers)
  const parts = [];
  const txtPlugins = lang === 'ru' ? 'Плагины' : 'Plugins';
  const txtSkills = lang === 'ru' ? 'Навыки' : 'Skills';
  const txtRules = lang === 'ru' ? 'Правила' : 'Rules';

  if (format === 'detailed') {
    parts.push(`${txtPlugins}: ${activePluginsCount}/${totalPluginsCount}`);
    if (showSkills) parts.push(`${txtSkills}: ${activeSkillsCount}/${totalSkillsCount}`);
    if (showRules) parts.push(`${txtRules}: ${activeRulesCount}/${totalRulesCount}`);
  } else if (format === 'compact') {
    parts.push(`${activePluginsCount}/${totalPluginsCount}`);
    if (showSkills) parts.push(`${activeSkillsCount}/${totalSkillsCount}`);
    if (showRules) parts.push(`${activeRulesCount}/${totalRulesCount}`);
  } else {
    // 'icons' (default) or legacy 'short'
    parts.push(`${iconPlugin} ${activePluginsCount}/${totalPluginsCount}`);
    if (showSkills) parts.push(`${iconSkill} ${activeSkillsCount}/${totalSkillsCount}`);
    if (showRules) parts.push(`${iconRule} ${activeRulesCount}/${totalRulesCount}`);
  }

  statusBarItem.text = parts.join(' | ');

  // Rich Markdown Tooltip
  const md = new vscode.MarkdownString('', true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  const titleContext = lang === 'ru' ? 'Контекст Antigravity' : 'Antigravity Context';
  md.appendMarkdown(`### ${iconPlugin} ${titleContext}\n\n`);

  const titlePlugins = lang === 'ru' ? 'Плагины' : 'Plugins';
  const noPluginsText = lang === 'ru' ? '*(Нет активных плагинов)*' : '*(No active plugins)*';
  md.appendMarkdown(`**${iconPlugin} ${titlePlugins} (${activePluginsCount}/${totalPluginsCount}):**\n`);
  if (activePlugins.length > 0) {
    for (const p of activePlugins) {
      md.appendMarkdown(`- $(check) **${p.displayName || p.name}** ${p.version ? '`v' + p.version + '`' : ''}\n`);
    }
  } else {
    md.appendMarkdown(`- ${noPluginsText}\n`);
  }

  if (showSkills) {
    const titleSkills = lang === 'ru' ? 'Навыки' : 'Skills';
    const noSkillsText = lang === 'ru' ? '*(Нет активных навыков)*' : '*(No active skills)*';
    md.appendMarkdown(`\n**${iconSkill} ${titleSkills} (${activeSkillsCount}/${totalSkillsCount}):**\n`);
    if (activeSkills.length > 0) {
      const displaySkills = activeSkills.slice(0, 15);
      for (const s of displaySkills) {
        md.appendMarkdown(`- ${iconSkill} \`/${s.name}\`${s.displayName && s.displayName !== s.name ? ' — ' + s.displayName : ''}\n`);
      }
      if (activeSkills.length > 15) {
        const moreText = lang === 'ru' ? `*...и еще ${activeSkills.length - 15}*` : `*...and ${activeSkills.length - 15} more*`;
        md.appendMarkdown(`- ${moreText}\n`);
      }
    } else {
      md.appendMarkdown(`- ${noSkillsText}\n`);
    }
  }

  if (showRules) {
    const titleRules = lang === 'ru' ? 'Правила' : 'Rules';
    const noRulesText = lang === 'ru' ? '*(Нет активных правил)*' : '*(No active rules)*';
    md.appendMarkdown(`\n**${iconRule} ${titleRules} (${activeRulesCount}/${totalRulesCount}):**\n`);
    if (activeRules.length > 0) {
      for (const r of activeRules) {
        md.appendMarkdown(`- ${iconRule} \`@${r.displayName || r.name}\`\n`);
      }
    } else {
      md.appendMarkdown(`- ${noRulesText}\n`);
    }
  }

  const clickHelp = lang === 'ru' ? '*Нажмите, чтобы открыть Antigravity Plugin Manager*' : '*Click to open Antigravity Plugin Manager*';
  md.appendMarkdown(`\n---\n${clickHelp}`);
  statusBarItem.tooltip = md;
}

async function revealOrOpenFolder(folderPath) {
  if (!folderPath) return;
  let target = folderPath;
  try {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (!stat.isDirectory()) {
        target = path.dirname(target);
      }
    }
  } catch (e) {
    // keep target as is
  }

  // 1. Try native vscode.env.openExternal (opens directly INSIDE the directory in OS file manager)
  try {
    const success = await vscode.env.openExternal(vscode.Uri.file(target));
    if (success) return;
  } catch (err) {
    logDebug(`revealOrOpenFolder openExternal failed: ${err.message}`);
  }

  // 2. Direct OS file manager launch (navigates directly into the target directory)
  try {
    const { spawn } = require('child_process');
    if (process.platform === 'win32') {
      const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      return;
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [target], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    } else {
      const child = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
  } catch (err2) {
    logDebug(`revealOrOpenFolder OS spawn failed: ${err2.message}`);
  }

  // 3. Fallback to revealFileInOS if other methods fail
  try {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
  } catch (e) {
    vscode.window.showErrorMessage('Failed to open folder: ' + e.message);
  }
}

async function triggerIdeScannerFlush() {
  try {
    touchAntigravityConfigs();
    await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
  } catch (e) {
    logDebug(`triggerIdeScannerFlush error: ${e.message}`);
  }
}

let ideFlushTimer = null;
let ideFlushSettledTimer = null;

function broadcastSyncStatus(state, etaMs = 0, skillsCount = 0) {
  const msg = {
    command: 'syncStatus',
    state,
    etaMs,
    skillsCount
  };
  if (activePanel) {
    activePanel.webview.postMessage(msg);
  }
  if (sidebarProvider && sidebarProvider._view) {
    sidebarProvider._view.webview.postMessage(msg);
  }
}

function broadcastToAllWebviews(msg) {
  if (activePanel) {
    activePanel.webview.postMessage(msg);
  }
  if (sidebarProvider && sidebarProvider._view) {
    sidebarProvider._view.webview.postMessage(msg);
  }
}

function scheduleIdeScannerFlush(delayMs = 600, customEtaMs = 0, skillsCount = 0) {
  if (ideFlushTimer) {
    clearTimeout(ideFlushTimer);
    ideFlushTimer = null;
  }
  if (ideFlushSettledTimer) {
    clearTimeout(ideFlushSettledTimer);
    ideFlushSettledTimer = null;
  }

  const indexingSettleMs = customEtaMs > 0 ? Math.max(1500, customEtaMs - delayMs) : 1500;
  const totalEtaMs = delayMs + indexingSettleMs;
  broadcastSyncStatus('syncing', totalEtaMs, skillsCount);

  ideFlushTimer = setTimeout(async () => {
    ideFlushTimer = null;
    await triggerIdeScannerFlush();

    ideFlushSettledTimer = setTimeout(() => {
      ideFlushSettledTimer = null;
      broadcastSyncStatus('synced');
    }, indexingSettleMs);
  }, delayMs);
}

async function immediateIdeScannerFlush() {
  if (ideFlushTimer) {
    clearTimeout(ideFlushTimer);
    ideFlushTimer = null;
  }
  if (ideFlushSettledTimer) {
    clearTimeout(ideFlushSettledTimer);
    ideFlushSettledTimer = null;
  }

  const indexingSettleMs = 1500;
  broadcastSyncStatus('syncing', indexingSettleMs);

  await triggerIdeScannerFlush();

  ideFlushSettledTimer = setTimeout(() => {
    ideFlushSettledTimer = null;
    broadcastSyncStatus('synced');
  }, indexingSettleMs);
}

function setupWebviewMessagingShared(webview, context, statusBarItem, onUpdate) {
  const notifyAndUpdate = async (isImmediate = false, etaMs = 0, skillsCount = 0) => {
    onUpdate();
    if (isImmediate) {
      await immediateIdeScannerFlush();
    } else {
      scheduleIdeScannerFlush(600, etaMs, skillsCount);
    }
  };

  webview.onDidReceiveMessage(async (message) => {
    const activePluginsPath = getActivePluginsPath();
    const activeSkillsPath = getActiveSkillsPath();
    const activeWorkflowsPath = getActiveWorkflowsPath();
    
    const storagePath = getGlobalStoragePath(context);
    const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
    const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
    const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

    const lang = getActiveLanguage();
    logDebug(`setupWebviewMessagingShared: Received command '${message.command}'`);

    const checkAndWarnSkillDisableGlobal = async (skillName, physicalPath) => {
      const workspaceRoots = getWorkspaceRoots();
      let connectedWsName = null;
      for (const wsRoot of workspaceRoots) {
        const wsConfig = getWorkspaceSkillConfigPath(wsRoot);
        const wsRootConfig = path.join(wsRoot, 'skills.json');
        if (isPathInJsonConfigEntries(wsConfig, physicalPath, skillName) ||
            isPathInJsonConfigEntries(wsRootConfig, physicalPath, skillName)) {
          connectedWsName = path.basename(wsRoot);
          break;
        }
      }

      if (connectedWsName) {
        const activeSkillsPath = getActiveSkillsPath();
        const isDefaultGlobal = physicalPath && path.normalize(physicalPath).toLowerCase().startsWith(path.normalize(activeSkillsPath).toLowerCase());

        let warnMsg = '';
        if (isDefaultGlobal) {
          warnMsg = getTranslation('warnSkillDisableGlobalWhileInProject', lang)
            .replace('{skill}', skillName)
            .replace('{project}', connectedWsName);
        } else {
          warnMsg = lang === 'ru'
            ? `Навык "${skillName}" подключен к проекту "${connectedWsName}".\n\nПри глобальном отключении он останется активным в проекте "${connectedWsName}", но будет отключен по умолчанию для остальных проектов.\n\nОтключить глобально?`
            : `Skill "${skillName}" is connected to project "${connectedWsName}".\n\nDisabling globally will keep it active in "${connectedWsName}", but disabled by default for other projects.\n\nDisable globally?`;
        }

        const btnDisable = getTranslation('btnDisableGlobally', lang);
        const choice = await vscode.window.showWarningMessage(warnMsg, { modal: true }, btnDisable);
        if (choice !== btnDisable) {
          return false;
        }
      }
      return true;
    };

    const checkAndWarnPluginDisableGlobal = async (pluginName, physicalPath) => {
      const workspaceRoots = getWorkspaceRoots();
      let connectedWsName = null;
      for (const wsRoot of workspaceRoots) {
        const wsConfig = getWorkspacePluginConfigPath(wsRoot);
        const wsRootConfig = path.join(wsRoot, 'plugins.json');
        if (isPathInJsonConfigEntries(wsConfig, physicalPath, pluginName) ||
            isPathInJsonConfigEntries(wsRootConfig, physicalPath, pluginName)) {
          connectedWsName = path.basename(wsRoot);
          break;
        }
      }

      if (connectedWsName) {
        const activePluginsPath = getActivePluginsPath();
        const isDefaultGlobal = physicalPath && path.normalize(physicalPath).toLowerCase().startsWith(path.normalize(activePluginsPath).toLowerCase());

        let warnMsg = '';
        if (isDefaultGlobal) {
          warnMsg = getTranslation('warnPluginDisableGlobalWhileInProject', lang)
            .replace('{plugin}', pluginName)
            .replace('{project}', connectedWsName);
        } else {
          warnMsg = lang === 'ru'
            ? `Плагин "${pluginName}" подключен к проекту "${connectedWsName}".\n\nПри глобальном отключении он останется активным в проекте "${connectedWsName}", но будет отключен по умолчанию для остальных проектов.\n\nОтключить глобально?`
            : `Plugin "${pluginName}" is connected to project "${connectedWsName}".\n\nDisabling globally will keep it active in "${connectedWsName}", but disabled by default for other projects.\n\nDisable globally?`;
        }

        const btnDisable = getTranslation('btnDisablePluginGlobally', lang) || getTranslation('btnDisableGlobally', lang);
        const choice = await vscode.window.showWarningMessage(warnMsg, { modal: true }, btnDisable);
        if (choice !== btnDisable) {
          return false;
        }
      }
      return true;
    };

    const executeRequestMove = async (moveMsg) => {
      try {
        const { itemId, category, sourcePluginId, isEnabled } = moveMsg;
        const bPath = getBuiltinPath().toLowerCase();
        if (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin')) || 
            (moveMsg.physicalPath && moveMsg.physicalPath.toLowerCase().startsWith(bPath))) {
          vscode.window.showWarningMessage(getTranslation('cannotModifyBuiltin', lang));
          return;
        }

        const workspaceRoots = getWorkspaceRoots();
        const globalPlugins = scanPlugins(activePluginsPath, workspaceRoots);
        const localPlugins = scanLocalPlugins(workspaceRoots);
        const allPlugins = [...globalPlugins, ...localPlugins];
        const otherPlugins = allPlugins.filter(p => p.id !== sourcePluginId && p.name !== sourcePluginId);
        const quickPickItems = [];
        
        let currentParentDir = '';
        if (moveMsg.physicalPath) {
          currentParentDir = path.normalize(path.dirname(moveMsg.physicalPath)).toLowerCase();
        } else if (sourcePluginId) {
          const pluginFolder = path.join(activePluginsPath, sourcePluginId);
          currentParentDir = path.normalize(path.join(pluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'))).toLowerCase();
        } else if (moveMsg.isLocal) {
          if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) {
            const ws0 = vscode.workspace.workspaceFolders[0].uri.fsPath;
            currentParentDir = path.normalize(category === 'plugin' 
              ? path.join(ws0, '.agents', 'plugins') 
              : path.join(ws0, '.agents', category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'))
            ).toLowerCase();
          }
        } else {
          if (category === 'plugin') currentParentDir = path.normalize(activePluginsPath).toLowerCase();
          else if (category === 'skill') currentParentDir = path.normalize(activeSkillsPath).toLowerCase();
          else if (category === 'workflow') currentParentDir = path.normalize(activeWorkflowsPath).toLowerCase();
        }

        // 1. Standard Global (~/.gemini/config/...)
        let standardGlobalDir = '';
        if (category === 'plugin') standardGlobalDir = activePluginsPath;
        else if (category === 'skill') standardGlobalDir = activeSkillsPath;
        else if (category === 'workflow') standardGlobalDir = activeWorkflowsPath;

        const standardGlobalNorm = standardGlobalDir ? path.normalize(standardGlobalDir).toLowerCase() : '';
        const isAlreadyInStandardGlobal = standardGlobalNorm && currentParentDir === standardGlobalNorm;

        if (category !== 'rule' && !isAlreadyInStandardGlobal && standardGlobalDir) {
          quickPickItems.push({
            label: lang === 'ru' ? '$(globe) Стандартный глобальный (~/.gemini)' : '$(globe) Standard Global (~/.gemini)',
            description: standardGlobalDir,
            id: 'global',
            type: 'global'
          });
        }

        // 2. Connected custom folders (from plugins.json / skills.json)
        const connectedFolders = getConnectedFolders(workspaceRoots);
        const relevantConnected = connectedFolders.filter(cf => {
          if (category === 'plugin') return cf.type === 'plugin' || cf.category === 'plugins';
          if (category === 'skill') return cf.type === 'skill' || cf.category === 'skills';
          return false;
        });
        relevantConnected.forEach(cf => {
          const cfNorm = path.normalize(cf.path).toLowerCase();
          if (currentParentDir !== cfNorm) {
            const scopeLabel = cf.scope === 'global' ? 'Global' : (cf.workspaceName || 'Workspace');
            quickPickItems.push({
              label: `$(folder-library) ${lang === 'ru' ? 'Подключенная папка' : 'Connected folder'}: ${path.basename(cf.path)}`,
              description: `${cf.scope === 'global' ? '🌐' : '📁'} ${scopeLabel} (${cf.path})`,
              id: cf.path,
              type: 'connected',
              folderPath: cf.path
            });
          }
        });
        
        // 3. Inside plugins (for skills and rules)
        if (category !== 'workflow' && category !== 'plugin') {
          otherPlugins.forEach(p => {
            quickPickItems.push({
              label: `$(extensions) ${lang === 'ru' ? 'В плагин' : 'Into plugin'}: ${p.displayName}`,
              description: `ID: ${p.id}`,
              id: p.id,
              type: 'plugin'
            });
          });
        }

        // 4. Workspace projects
        if (vscode.workspace.workspaceFolders) {
          vscode.workspace.workspaceFolders.forEach(folder => {
            const wsTargetParent = path.normalize(category === 'plugin' 
              ? path.join(folder.uri.fsPath, '.agents', 'plugins') 
              : path.join(folder.uri.fsPath, '.agents', category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'))
            ).toLowerCase();

            if (currentParentDir !== wsTargetParent) {
              quickPickItems.push({
                label: `$(folder) ${lang === 'ru' ? 'Рабочая область' : 'Workspace'}: ${folder.name}`,
                description: wsTargetParent,
                id: folder.uri.fsPath,
                type: 'workspace'
              });
            }
          });
        }
        
        const selected = await vscode.window.showQuickPick(quickPickItems, {
          placeHolder: lang === 'ru' ? `Выберите место назначения для элемента "${itemId}"` : `Select destination for "${itemId}"`
        });
        
        if (selected !== undefined) {
          const targetType = selected.type;
          const targetId = selected.id;
          let sourcePath = '';
          let targetParent = '';
          
          if (moveMsg.physicalPath && fs.existsSync(moveMsg.physicalPath)) {
            sourcePath = moveMsg.physicalPath;
          } else if (sourcePluginId) {
            const pluginFolder = path.join(activePluginsPath, sourcePluginId);
            sourcePath = path.join(pluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'), itemId);
          } else if (moveMsg.isLocal && moveMsg.physicalPath) {
            sourcePath = moveMsg.physicalPath;
          } else {
            if (category === 'skill') sourcePath = path.join(activeSkillsPath, itemId);
            else if (category === 'workflow') sourcePath = path.join(activeWorkflowsPath, itemId);
            else if (category === 'plugin') sourcePath = path.join(activePluginsPath, itemId);
          }
          
          if (targetType === 'plugin') {
            const targetPlugin = allPlugins.find(p => p.id === targetId || p.name === targetId);
            const targetPluginFolder = targetPlugin && targetPlugin.physicalPath 
              ? targetPlugin.physicalPath 
              : path.join(activePluginsPath, targetId);
            targetParent = path.join(targetPluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'));
          } else if (targetType === 'global') {
            if (category === 'skill') targetParent = activeSkillsPath;
            else if (category === 'workflow') targetParent = activeWorkflowsPath;
            else if (category === 'plugin') targetParent = activePluginsPath;
          } else if (targetType === 'connected') {
            targetParent = selected.folderPath;
          } else if (targetType === 'workspace') {
            if (category === 'plugin') targetParent = path.join(targetId, '.agents', 'plugins');
            else targetParent = path.join(targetId, '.agents', category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'));
          }
          
          if (!sourcePath || !targetParent || !fs.existsSync(sourcePath)) {
            throw new Error(getTranslation('invalidPaths', lang));
          }
          
          if (!fs.existsSync(targetParent)) fs.mkdirSync(targetParent, { recursive: true });
          
          const filename = path.basename(sourcePath);
          const targetPath = path.join(targetParent, filename);
          
          if (path.resolve(sourcePath).toLowerCase() === path.resolve(targetPath).toLowerCase()) {
            vscode.window.showInformationMessage(getTranslation('alreadyInFolder', lang).replace('{itemId}', filename));
            return;
          }
          
          if (fs.existsSync(targetPath)) {
            const yes = lang === 'ru' ? 'Да' : 'Yes';
            const no = lang === 'ru' ? 'Нет' : 'No';
            const overwriteChoice = await vscode.window.showWarningMessage(
              getTranslation('overwritePrompt', lang).replace('{itemId}', filename), yes, no
            );
            if (overwriteChoice === yes) {
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
              else fs.unlinkSync(targetPath);
            } else return;
          }
          
          safeMoveDir(sourcePath, targetPath);
          if (category === 'skill') {
            const globalSkillsJson = getGlobalSkillsJsonPath();
            if (targetType === 'connected') {
              const wasExcluded = isNameExcludedInJsonConfig(globalSkillsJson, filename, sourcePath);
              if (wasExcluded) {
                addExcludeToJsonConfig(globalSkillsJson, filename, targetPath);
              } else {
                removeExcludeFromJsonConfig(globalSkillsJson, filename);
              }
            } else if (targetType === 'workspace') {
              removeExcludeFromJsonConfig(globalSkillsJson, filename);
            }
            if (moveMsg.enableInWorkspaceRoot) {
              await toggleSkillProject(moveMsg.enableInWorkspaceRoot, targetPath, filename, 'enable', lang);
            }
          } else if (category === 'plugin') {
            const globalPluginsJson = getGlobalPluginsJsonPath();
            if (targetType === 'connected') {
              setPluginManifestDisabled(targetPath, false);
              removeAntigravityPluginFromConfig(filename);
              const wasExcluded = isNameExcludedInJsonConfig(globalPluginsJson, filename, sourcePath);
              if (wasExcluded) {
                addExcludeToJsonConfig(globalPluginsJson, filename, targetPath);
              } else {
                removeExcludeFromJsonConfig(globalPluginsJson, filename);
              }
            } else if (targetType === 'workspace') {
              setPluginManifestDisabled(targetPath, false);
              removeAntigravityPluginFromConfig(filename);
              removeExcludeFromJsonConfig(globalPluginsJson, filename);
            }
            if (moveMsg.enableInWorkspaceRoot) {
              await togglePluginProject(moveMsg.enableInWorkspaceRoot, targetPath, filename, 'enable', lang);
            }
          }
          await notifyAndUpdate();
          vscode.window.showInformationMessage(getTranslation('moveSuccess', lang).replace('{itemId}', filename));
        }
      } catch (e) {
        vscode.window.showErrorMessage(getTranslation('errorMove', lang).replace('{error}', e.message));
      }
    };

    switch (message.command) {
      case 'clientError':
        logDebug(`[Webview Client Error] ${message.error} at ${message.source || ''}:${message.lineno || ''}`);
        break;

      case 'changeLanguage':
        try {
          await vscode.workspace.getConfiguration('antigravity-plugin-manager').update('language', message.language, vscode.ConfigurationTarget.Global);
        } catch (e) {
          vscode.window.showErrorMessage('Failed to change language: ' + e.message);
        }
        break;

      case 'ready':
        onUpdate();
        break;

      case 'refresh':
        await notifyAndUpdate(true);
        break;

      case 'softApplyIde':
        try {
          if (ideFlushTimer) {
            clearTimeout(ideFlushTimer);
            ideFlushTimer = null;
          }
          if (ideFlushSettledTimer) {
            clearTimeout(ideFlushSettledTimer);
            ideFlushSettledTimer = null;
          }
          ensureDefaultPluginsFolderInGlobalConfig();
          touchAntigravityConfigs();
          try {
            await vscode.commands.executeCommand('antigravity.restartLanguageServer');
            logDebug('softApplyIde: antigravity.restartLanguageServer executed successfully');
          } catch (cmdErr) {
            logDebug(`softApplyIde: command error or unavailable: ${cmdErr.message}`);
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
          }
          broadcastSyncStatus('synced');
          webview.postMessage({ command: 'syncStatus', state: 'synced', etaMs: 0, skillsCount: 0 });
          const successMsg = getTranslation('softApplySuccess', lang);
          vscode.window.setStatusBarMessage(successMsg, 4000);
          onUpdate();
        } catch (err) {
          logDebug(`softApplyIde error: ${err.message}`);
          vscode.window.showErrorMessage('Error during soft apply: ' + err.message);
        }
        break;

      case 'getIdeLiveContext':
        try {
          const liveCtx = scanIdeLiveContext(true);
          webview.postMessage({ command: 'liveContextData', data: liveCtx });
        } catch (err) {
          logDebug(`getIdeLiveContext error: ${err.message}`);
          webview.postMessage({ command: 'liveContextData', data: { available: false, error: err.message } });
        }
        break;

      case 'checkUpdates':
        try {
          const workspaceRoots = getWorkspaceRoots();
          const plugins = scanPlugins(getActivePluginsPath(), workspaceRoots);
          const localPlugins = scanLocalPlugins(workspaceRoots);
          const allPlugins = [...plugins, ...localPlugins];
          const updatesState = await checkAllUpdates(allPlugins, context);
          broadcastToAllWebviews({ command: 'updatesChecked', updatesState });
          if (updatesState.totalAvailableUpdates > 0) {
            const msg = getTranslation('updatesFound', lang).replace('{count}', updatesState.totalAvailableUpdates);
            vscode.window.showInformationMessage(msg);
          } else {
            vscode.window.showInformationMessage(getTranslation('allUpToDate', lang));
          }
        } catch (err) {
          logDebug(`checkUpdates error: ${err.message}`);
          broadcastToAllWebviews({ command: 'updatesChecked', error: err.message });
          vscode.window.showErrorMessage(getTranslation('updateError', lang).replace('{error}', err.message));
        }
        break;

      case 'updatePlugin':
        try {
          const { pluginId, physicalPath } = message;
          const workspaceRoots = getWorkspaceRoots();
          const plugins = scanPlugins(getActivePluginsPath(), workspaceRoots);
          const localPlugins = scanLocalPlugins(workspaceRoots);
          const allPlugins = [...plugins, ...localPlugins];
          const target = allPlugins.find(p => p.id === pluginId || p.name === pluginId || p.physicalPath === physicalPath);
          if (!target) {
            throw new Error(`Plugin not found: ${pluginId}`);
          }
          const targetTitle = target.displayName || target.name;
          vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${getTranslation('updatingPlugin', lang)} (${targetTitle})`,
            cancellable: false
          }, async (progress) => {
            try {
              const res = await updatePlugin(target, (progMsg) => {
                progress.report({ message: progMsg });
                broadcastToAllWebviews({
                  command: 'updateProgress',
                  pluginId: target.id,
                  message: progMsg
                });
              });
              const successMsg = getTranslation('updateSuccess', lang)
                .replace('{name}', targetTitle)
                .replace('{version}', res.newVersion);
              vscode.window.showInformationMessage(successMsg, getTranslation('softApplyBtn', lang)).then(sel => {
                if (sel === getTranslation('softApplyBtn', lang)) {
                  vscode.commands.executeCommand('antigravity-plugin-manager.softApply');
                }
              });
              await notifyAndUpdate(true);
              const updatedPlugins = [...scanPlugins(getActivePluginsPath(), workspaceRoots), ...scanLocalPlugins(workspaceRoots)];
              const newUpdates = await checkAllUpdates(updatedPlugins, context);
              broadcastToAllWebviews({
                command: 'pluginUpdated',
                pluginId: target.id,
                newVersion: res.newVersion,
                updatesState: newUpdates
              });
            } catch (updateErr) {
              logDebug(`updatePlugin error: ${updateErr.message}`);
              const errTxt = getTranslation('updateError', lang).replace('{error}', updateErr.message);
              vscode.window.showErrorMessage(errTxt);
              broadcastToAllWebviews({
                command: 'updateFailed',
                pluginId: target.id,
                error: updateErr.message
              });
            }
          });
        } catch (e) {
          logDebug(`updatePlugin dispatch error: ${e.message}`);
          vscode.window.showErrorMessage(e.message);
        }
        break;

      case 'toggle':
        try {
          if (message.category === 'skill') {
            if (!message.enable) {
              const skillName = message.altName || message.id;
              const shouldProceed = await checkAndWarnSkillDisableGlobal(skillName, message.physicalPath);
              if (!shouldProceed) {
                broadcastSyncStatus('synced');
                onUpdate();
                break;
              }
            }
            await toggleSkillGlobal(message.id, message.enable, lang, message.altName, message.physicalPath);
          } else if (message.category === 'workflow') {
            await toggleItem(activeWorkflowsPath, storageWorkflowsPath, message.id, message.enable, lang, 'workflow');
          } else {
            if (!message.enable) {
              const pluginName = message.id;
              const shouldProceed = await checkAndWarnPluginDisableGlobal(pluginName, message.physicalPath);
              if (!shouldProceed) {
                broadcastSyncStatus('synced');
                onUpdate();
                break;
              }
            }
            await togglePluginGlobal(message.id, message.enable, lang, message.physicalPath);
          }
          await notifyAndUpdate();
        } catch (e) {
          logDebug(`Toggle error: ${e.message}`);
          let errMsg = getTranslation('errorToggle', lang).replace('{error}', e.message);
          vscode.window.showErrorMessage(errMsg);
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'togglePluginGlobal':
        try {
          if (!message.enable) {
            const pluginName = message.id;
            const shouldProceed = await checkAndWarnPluginDisableGlobal(pluginName, message.physicalPath);
            if (!shouldProceed) {
              broadcastSyncStatus('synced');
              onUpdate();
              break;
            }
          }
          await togglePluginGlobal(message.id, message.enable, lang, message.physicalPath);
          await notifyAndUpdate(false, message.etaMs, message.skillsCount);
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorToggle', lang).replace('{error}', e.message));
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'togglePluginProject':
        try {
          const wsRoot = message.workspaceRoot;
          const pluginPhysicalPath = message.pluginPath || message.physicalPath;
          const pluginName = message.id || message.pluginId;
          const action = message.action !== undefined ? message.action : message.enable;

          if (action === 'enable' || action === true) {
            const activePluginsPath = getActivePluginsPath();
            const isDefaultGlobal = pluginPhysicalPath && path.normalize(pluginPhysicalPath).toLowerCase().startsWith(path.normalize(activePluginsPath).toLowerCase());
            let isGloballyDisabled = false;
            if (pluginPhysicalPath && fs.existsSync(pluginPhysicalPath)) {
              try {
                const pj = JSON.parse(fs.readFileSync(path.join(pluginPhysicalPath, 'plugin.json'), 'utf8'));
                if (pj.disabled === true) isGloballyDisabled = true;
              } catch (_) {}
            }
            const globalPluginsJson = getGlobalPluginsJsonPath();
            if (isNameExcludedInJsonConfig(globalPluginsJson, pluginName, pluginPhysicalPath)) {
              isGloballyDisabled = true;
            }

            if (isDefaultGlobal && isGloballyDisabled) {
              const warnMsg = getTranslation('warnPluginEnableInProjectGlobalExcluded', lang)
                .replace('{plugin}', pluginName);
              const btnMove = getTranslation('btnMoveToLibrary', lang);
              const btnAnyway = getTranslation('btnEnableAnyway', lang);

              const choice = await vscode.window.showWarningMessage(warnMsg, { modal: true }, btnMove, btnAnyway);

              if (choice === btnMove) {
                await executeRequestMove({
                  itemId: pluginName,
                  category: 'plugin',
                  sourcePluginId: null,
                  isEnabled: false,
                  isLocal: false,
                  physicalPath: pluginPhysicalPath,
                  enableInWorkspaceRoot: wsRoot
                });
                break;
              } else if (choice !== btnAnyway) {
                broadcastSyncStatus('synced');
                onUpdate();
                break;
              }
            }
          }

          await togglePluginProject(
            message.workspaceRoot,
            message.pluginPath || message.physicalPath,
            message.id || message.pluginId,
            message.action !== undefined ? message.action : message.enable,
            lang
          );
          await notifyAndUpdate(false, message.etaMs, message.skillsCount);
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorToggle', lang).replace('{error}', e.message));
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'toggleSkillGlobal':
        try {
          if (!message.enable) {
            const skillName = message.altName || message.id;
            const shouldProceed = await checkAndWarnSkillDisableGlobal(skillName, message.physicalPath);
            if (!shouldProceed) {
              broadcastSyncStatus('synced');
              onUpdate();
              break;
            }
          }
          await toggleSkillGlobal(message.id, message.enable, lang, message.altName, message.physicalPath);
          await notifyAndUpdate();
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorToggle', lang).replace('{error}', e.message));
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'toggleSkillProject':
        try {
          const wsRoot = message.workspaceRoot;
          const skillPhysicalPath = message.physicalPath || message.skillPath;
          const skillName = message.id || message.skillName;
          const action = message.action !== undefined ? message.action : message.enable;

          if (action === 'enable' || action === true) {
            const activeSkillsPath = getActiveSkillsPath();
            const isDefaultGlobal = skillPhysicalPath && path.normalize(skillPhysicalPath).toLowerCase().startsWith(path.normalize(activeSkillsPath).toLowerCase());
            const globalSkillsJson = getGlobalSkillsJsonPath();
            const isGloballyExcluded = isNameExcludedInJsonConfig(globalSkillsJson, skillName, skillPhysicalPath);

            if (isDefaultGlobal && isGloballyExcluded) {
              const warnMsg = getTranslation('warnSkillEnableInProjectGlobalExcluded', lang)
                .replace('{skill}', skillName);
              const btnMove = getTranslation('btnMoveToLibrary', lang);
              const btnAnyway = getTranslation('btnEnableAnyway', lang);

              const choice = await vscode.window.showWarningMessage(warnMsg, { modal: true }, btnMove, btnAnyway);

              if (choice === btnMove) {
                await executeRequestMove({
                  itemId: skillName,
                  category: 'skill',
                  sourcePluginId: null,
                  isEnabled: false,
                  isLocal: false,
                  physicalPath: skillPhysicalPath,
                  enableInWorkspaceRoot: wsRoot
                });
                break;
              } else if (choice !== btnAnyway) {
                broadcastSyncStatus('synced');
                onUpdate();
                break;
              }
            }
          }

          await toggleSkillProject(
            wsRoot,
            skillPhysicalPath,
            skillName,
            action,
            lang
          );
          await notifyAndUpdate();
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorToggle', lang).replace('{error}', e.message));
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'connectFolder':
        try {
          let folderPath = message.folderPath;
          let configType = message.type;
          let wsRoot = message.workspaceRoot !== undefined ? message.workspaceRoot : (message.scope === 'global' ? null : undefined);

          if (!configType) {
            const typePick = await vscode.window.showQuickPick([
              { label: `$(extensions) ${getTranslation('typePlugins', lang)}`, value: 'plugins' },
              { label: `$(zap) ${getTranslation('typeSkills', lang)}`, value: 'skills' }
            ], { placeHolder: getTranslation('selectConfigType', lang) });
            if (!typePick) break;
            configType = typePick.value;
          }

          if (message.scope === 'workspace' && !wsRoot) {
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
              wsRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
              const scopeItems = vscode.workspace.workspaceFolders.map(f => ({
                label: `$(folder) ${f.name}`,
                root: f.uri.fsPath
              }));
              const scopePick = await vscode.window.showQuickPick(scopeItems, {
                placeHolder: getTranslation('selectConfigScope', lang)
              });
              if (!scopePick) break;
              wsRoot = scopePick.root;
            }
          }

          if (!folderPath) {
            const isWs = !!wsRoot;
            const openTitle = configType === 'plugins'
              ? (lang === 'ru' ? (isWs ? 'Выберите внешнюю папку с плагинами для проекта' : 'Выберите внешнюю папку с плагинами') : 'Select External Plugins Folder')
              : (lang === 'ru' ? (isWs ? 'Выберите внешнюю папку с навыками для проекта' : 'Выберите внешнюю папку с навыками') : 'Select External Skills Folder');
            const openBtnLabel = configType === 'plugins'
              ? getTranslation('btnConnectPluginsFolder', lang)
              : getTranslation('btnConnectSkillsFolder', lang);
            const selected = await vscode.window.showOpenDialog({
              canSelectFolders: true,
              canSelectFiles: false,
              canSelectMany: false,
              title: openTitle,
              openLabel: openBtnLabel
            });
            if (selected && selected[0]) {
              folderPath = selected[0].fsPath;
            } else {
              break;
            }
          }

          if (wsRoot === undefined && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const scopeItems = [
              { label: `$(globe) ${getTranslation('scopeGlobal', lang)}`, root: null }
            ];
            vscode.workspace.workspaceFolders.forEach(f => {
              scopeItems.push({ label: `$(folder) ${f.name}`, root: f.uri.fsPath });
            });
            const scopePick = await vscode.window.showQuickPick(scopeItems, {
              placeHolder: getTranslation('selectConfigScope', lang)
            });
            if (!scopePick) break;
            wsRoot = scopePick.root;
          }

          await connectFolder(configType, folderPath, wsRoot, lang);
          vscode.window.showInformationMessage(
            getTranslation('folderConnectedSuccess', lang)
              .replace('{config}', (wsRoot ? 'Workspace ' : 'Global ') + configType + '.json')
          );
          await notifyAndUpdate();
        } catch (err) {
          vscode.window.showErrorMessage('Failed to connect folder: ' + err.message);
        }
        break;

      case 'disconnectFolder':
        try {
          const configuredPath = message.configuredPath || message.folderPath || message.path || '';
          let sourceFile = message.sourceFile;
          if (!sourceFile) {
            const isPlugins = message.type === 'plugins' || message.type === 'plugin';
            if (message.workspaceRoot) {
              sourceFile = isPlugins ? getWorkspacePluginConfigPath(message.workspaceRoot) : getWorkspaceSkillConfigPath(message.workspaceRoot);
            } else {
              sourceFile = isPlugins ? getGlobalPluginsJsonPath() : getGlobalSkillsJsonPath();
            }
          }
          const folderDisplayName = configuredPath ? (path.basename(configuredPath) || configuredPath) : '';
          const detectedType = message.type || (sourceFile && sourceFile.includes('plugins') ? getTranslation('typePlugins', lang) : getTranslation('typeSkills', lang));
          const confirmMsg = getTranslation('disconnectFolderConfirm', lang)
            .replace('{folder}', folderDisplayName)
            .replace('{type}', detectedType);
          const btnDisconnect = getTranslation('disconnect', lang);
          const choice = await vscode.window.showWarningMessage(confirmMsg, { modal: true }, btnDisconnect);
          if (choice === btnDisconnect) {
            await disconnectFolder(sourceFile, configuredPath, lang);
            vscode.window.showInformationMessage(getTranslation('folderDisconnectedSuccess', lang));
            await notifyAndUpdate();
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to disconnect folder: ' + err.message);
        }
        break;

      case 'openConfigJson':
        try {
          const cfgPath = getAntigravityConfigPath();
          if (fs.existsSync(cfgPath)) {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(cfgPath));
            await vscode.window.showTextDocument(doc);
          } else {
            vscode.window.showWarningMessage('Config file does not exist: ' + cfgPath);
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open config.json: ' + err.message);
        }
        break;

      case 'openPluginsJson':
        try {
          let pJsonPath = message.workspaceRoot 
            ? getWorkspacePluginConfigPath(message.workspaceRoot) 
            : getGlobalPluginsJsonPath();
          if (!fs.existsSync(pJsonPath)) {
            fs.mkdirSync(path.dirname(pJsonPath), { recursive: true });
            fs.writeFileSync(pJsonPath, JSON.stringify({ entries: [] }, null, 2), 'utf8');
          }
          const pDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(pJsonPath));
          await vscode.window.showTextDocument(pDoc);
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open plugins.json: ' + err.message);
        }
        break;

      case 'openSkillsJson':
        try {
          let sJsonPath = message.workspaceRoot 
            ? getWorkspaceSkillConfigPath(message.workspaceRoot) 
            : getGlobalSkillsJsonPath();
          if (!fs.existsSync(sJsonPath)) {
            fs.mkdirSync(path.dirname(sJsonPath), { recursive: true });
            fs.writeFileSync(sJsonPath, JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
          }
          const sDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(sJsonPath));
          await vscode.window.showTextDocument(sDoc);
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open skills.json: ' + err.message);
        }
        break;

      case 'openAgentsFolder':
        try {
          const wsRoot = message.workspaceRoot || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] ? vscode.workspace.workspaceFolders[0].uri.fsPath : null);
          if (wsRoot) {
            const agentsPath = path.join(wsRoot, '.agents');
            if (!fs.existsSync(agentsPath)) {
              fs.mkdirSync(agentsPath, { recursive: true });
            }
            await revealOrOpenFolder(agentsPath);
          } else {
            vscode.window.showWarningMessage('No open workspace found.');
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open .agents folder: ' + err.message);
        }
        break;


      case 'toggleHook':
        try {
          const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
          await toggleHook(message.physicalPath, message.hookName, isEnabled, lang);
          await notifyAndUpdate();
        } catch (err) {
          vscode.window.showErrorMessage(`Hook toggle error: ${err.message}`);
        }
        break;

      case 'toggleMcpServer':
        try {
          const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
          await toggleMcpServer(message.physicalPath, message.serverName, isEnabled, lang);
          await notifyAndUpdate();
        } catch (err) {
          vscode.window.showErrorMessage(`MCP server toggle error: ${err.message}`);
        }
        break;

      case 'deleteHook':
        try {
          const confirmMsg = lang === 'ru' ? `Удалить хук "${message.hookName}"?` : `Delete hook "${message.hookName}"?`;
          const choice = await vscode.window.showWarningMessage(confirmMsg, { modal: true }, lang === 'ru' ? 'Удалить' : 'Delete');
          if (choice === (lang === 'ru' ? 'Удалить' : 'Delete')) {
            await deleteHook(message.physicalPath, message.hookName, lang);
            vscode.window.showInformationMessage(lang === 'ru' ? 'Хук успешно удален.' : 'Hook deleted successfully.');
            await notifyAndUpdate();
          }
        } catch (e) {
          vscode.window.showErrorMessage('Failed to delete hook: ' + e.message);
        }
        break;

      case 'deleteMcpServer':
        try {
          const confirmMsg = lang === 'ru' ? `Удалить MCP сервер "${message.serverName}"?` : `Delete MCP server "${message.serverName}"?`;
          const choice = await vscode.window.showWarningMessage(confirmMsg, { modal: true }, lang === 'ru' ? 'Удалить' : 'Delete');
          if (choice === (lang === 'ru' ? 'Удалить' : 'Delete')) {
            await deleteMcpServer(message.physicalPath, message.serverName, lang);
            vscode.window.showInformationMessage(lang === 'ru' ? 'MCP сервер успешно удален.' : 'MCP server deleted successfully.');
            await notifyAndUpdate();
          }
        } catch (e) {
          vscode.window.showErrorMessage('Failed to delete MCP server: ' + e.message);
        }
        break;

      case 'moveMcp':
        try {
          const { serverName, physicalPath } = message;
          const workspaceRoots = getWorkspaceRoots();
          const allPlugins = scanPlugins(activePluginsPath, workspaceRoots);
          const quickPickItems = [];
          const globalMcpPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');

          if (physicalPath.toLowerCase() !== globalMcpPath.toLowerCase()) {
            quickPickItems.push({ label: '$(globe) Global', description: globalMcpPath, targetPath: globalMcpPath });
          }
          allPlugins.forEach(p => {
            if (p.physicalPath) {
              const targetPath = path.join(p.physicalPath, 'mcp_config.json');
              if (physicalPath.toLowerCase() !== targetPath.toLowerCase()) {
                quickPickItems.push({ label: `$(extensions) ${p.displayName}`, description: targetPath, targetPath });
              }
            }
          });
          if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
              const wsMcpPath = path.join(folder.uri.fsPath, '.agents', 'mcp_config.json');
              if (physicalPath.toLowerCase() !== wsMcpPath.toLowerCase()) {
                quickPickItems.push({ label: `$(folder) Workspace: ${folder.name}`, description: wsMcpPath, targetPath: wsMcpPath });
              }
            });
          }

          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: lang === 'ru' ? `Переместить MCP сервер "${serverName}" в:` : `Move MCP server "${serverName}" to:`
          });

          if (selected && selected.targetPath) {
            await moveMcpServer(serverName, physicalPath, selected.targetPath, lang);
            vscode.window.showInformationMessage(lang === 'ru' ? `Сервер "${serverName}" успешно перемещен.` : `Server "${serverName}" successfully moved.`);
            await notifyAndUpdate();
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Move error: ${err.message}`);
        }
        break;

      case 'moveHook':
        try {
          const { hookName, physicalPath } = message;
          const workspaceRoots = getWorkspaceRoots();
          const allPlugins = scanPlugins(activePluginsPath, workspaceRoots);
          const quickPickItems = [];
          const globalHooksPath = path.join(os.homedir(), '.gemini', 'config', 'hooks.json');

          if (physicalPath.toLowerCase() !== globalHooksPath.toLowerCase()) {
            quickPickItems.push({ label: '$(globe) Global', description: globalHooksPath, targetPath: globalHooksPath });
          }
          allPlugins.forEach(p => {
            if (p.physicalPath) {
              const targetPath = path.join(p.physicalPath, 'hooks.json');
              if (physicalPath.toLowerCase() !== targetPath.toLowerCase()) {
                quickPickItems.push({ label: `$(extensions) ${p.displayName}`, description: targetPath, targetPath });
              }
            }
          });
          if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
              const wsHooksPath = path.join(folder.uri.fsPath, '.agents', 'hooks.json');
              if (physicalPath.toLowerCase() !== wsHooksPath.toLowerCase()) {
                quickPickItems.push({ label: `$(folder) Workspace: ${folder.name}`, description: wsHooksPath, targetPath: wsHooksPath });
              }
            });
          }

          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: lang === 'ru' ? `Переместить хук "${hookName}" в:` : `Move hook "${hookName}" to:`
          });

          if (selected && selected.targetPath) {
            await moveHook(hookName, physicalPath, selected.targetPath, lang);
            vscode.window.showInformationMessage(lang === 'ru' ? `Хук "${hookName}" успешно перемещен.` : `Hook "${hookName}" successfully moved.`);
            await notifyAndUpdate();
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Move error: ${err.message}`);
        }
        break;

      case 'selectStorage':
        const uri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: getTranslation('changeStorage', lang)
        });
        if (uri && uri[0]) {
          const folderPath = uri[0].fsPath;
          const activeDrive = path.parse(activePluginsPath).root.toLowerCase();
          const storageDrive = path.parse(folderPath).root.toLowerCase();
          const yes = lang === 'ru' ? 'Да' : 'Yes';
          const no = lang === 'ru' ? 'Нет' : 'No';

          if (activeDrive && storageDrive && activeDrive !== storageDrive) {
            const warnText = getTranslation('differentDriveWarning', lang)
              .replace('{storageDrive}', storageDrive.toUpperCase())
              .replace('{activeDrive}', activeDrive.toUpperCase());
            const driveChoice = await vscode.window.showWarningMessage(warnText, yes, no);
            if (driveChoice !== yes) break;
          }

          const confirmText = getTranslation('confirmChangeStorage', lang);
          const choice = await vscode.window.showWarningMessage(confirmText, yes, no);
          if (choice === yes) {
            const oldStoragePath = getGlobalStoragePath(context);
            await context.globalState.update('storagePath', folderPath);
            try {
              await vscode.workspace.getConfiguration('antigravity-plugin-manager').update('storagePath', folderPath, vscode.ConfigurationTarget.Global);
            } catch (e) {}

            if (fs.existsSync(oldStoragePath) && oldStoragePath !== folderPath) {
              const migrateChoice = await vscode.window.showInformationMessage(getTranslation('migrateOffer', lang), yes, no);
              if (migrateChoice === yes) {
                await migrateStorage(oldStoragePath, folderPath, lang);
              }
            }
            onUpdate();
          }
        }
        break;

      case 'resolveConflict':
        try {
          await resolveConflict(message, lang);
          await notifyAndUpdate();
        } catch (e) {
          vscode.window.showErrorMessage('Failed to resolve conflict: ' + e.message);
        }
        break;

      case 'createItem':
        try {
          await createItem({
            ...message,
            activePluginsPath,
            activeSkillsPath,
            activeWorkflowsPath
          }, lang);
          await notifyAndUpdate();
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorCreate', lang).replace('{error}', e.message));
        }
        break;

      case 'deleteItem':
        try {
          const deleted = await deleteItem(message.category, message.id, message.displayName, message.physicalPath, lang, activeSkillsPath);
          if (deleted) await notifyAndUpdate();
        } catch (e) {
          vscode.window.showErrorMessage('Failed to delete item: ' + e.message);
        }
        break;

      case 'openStorage':
        if (fs.existsSync(storagePath)) await revealOrOpenFolder(storagePath);
        else vscode.window.showWarningMessage('Storage folder does not exist yet.');
        break;

      case 'openActive':
        if (fs.existsSync(activePluginsPath)) await revealOrOpenFolder(activePluginsPath);
        else vscode.window.showWarningMessage('Active plugins folder does not exist.');
        break;

      case 'openActiveSkills':
        if (fs.existsSync(activeSkillsPath)) await revealOrOpenFolder(activeSkillsPath);
        else vscode.window.showWarningMessage('Active skills folder does not exist: ' + activeSkillsPath);
        break;

      case 'openFolder':
        if (message.path && fs.existsSync(message.path)) {
          await revealOrOpenFolder(message.path);
        } else {
          vscode.window.showWarningMessage('Folder does not exist: ' + (message.path || ''));
        }
        break;

      case 'openItemFolder':
        let itemFolder = '';
        if (message.physicalPath && fs.existsSync(message.physicalPath)) {
          const stat = fs.statSync(message.physicalPath);
          itemFolder = stat.isDirectory() ? message.physicalPath : path.dirname(message.physicalPath);
        } else if (message.isLocal && message.physicalPath) {
          itemFolder = message.physicalPath;
        } else if (message.category === 'skill') {
          itemFolder = message.isEnabled ? path.join(activeSkillsPath, message.id) : path.join(storageSkillsPath, message.id);
        } else if (message.category === 'workflow') {
          itemFolder = message.isEnabled ? activeWorkflowsPath : storageWorkflowsPath;
        } else {
          itemFolder = message.isEnabled ? path.join(activePluginsPath, message.id) : path.join(storagePluginsPath, message.id);
          if (!message.isEnabled && !fs.existsSync(itemFolder)) {
            const rootPath = path.join(storagePath, message.id);
            if (fs.existsSync(rootPath)) itemFolder = rootPath;
          }
        }
        if (fs.existsSync(itemFolder)) {
          await revealOrOpenFolder(itemFolder);
        } else {
          vscode.window.showWarningMessage('Folder does not exist: ' + itemFolder);
        }
        break;

      case 'openFile':
      case 'openFileInEditor':
        try {
          let targetPath = message.physicalPath;
          if (!targetPath && message.id) {
            if (message.category === 'workflow') {
              const activeWf = path.join(activeWorkflowsPath, message.id.endsWith('.md') ? message.id : `${message.id}.md`);
              const storageWf = path.join(storageWorkflowsPath, message.id.endsWith('.md') ? message.id : `${message.id}.md`);
              if (fs.existsSync(activeWf)) targetPath = activeWf;
              else if (fs.existsSync(storageWf)) targetPath = storageWf;
            } else if (message.category === 'skill') {
              const activeSk = path.join(activeSkillsPath, message.id, 'SKILL.md');
              const storageSk = path.join(storageSkillsPath, message.id, 'SKILL.md');
              if (fs.existsSync(activeSk)) targetPath = activeSk;
              else if (fs.existsSync(storageSk)) targetPath = storageSk;
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
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
            const extConfig = vscode.workspace.getConfiguration('antigravity-plugin-manager');
            const openColumnPref = extConfig.get('editorOpenColumn', 'active');
            let targetViewColumn = vscode.ViewColumn.Active;
            if (openColumnPref === 'beside' && activePanel && activePanel.viewColumn) {
              targetViewColumn = vscode.ViewColumn.Beside;
            } else if (activePanel && activePanel.viewColumn) {
              targetViewColumn = activePanel.viewColumn;
            }
            await vscode.window.showTextDocument(doc, { viewColumn: targetViewColumn, preview: false });
          } else {
            vscode.window.showWarningMessage('File does not exist: ' + (targetPath || message.physicalPath || ''));
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open file in editor: ' + err.message);
        }
        break;

      case 'editPluginMetadata':
        try {
          let pluginFolder = message.isEnabled ? path.join(activePluginsPath, message.id) : path.join(storagePluginsPath, message.id);
          if (!message.isEnabled && !fs.existsSync(pluginFolder)) {
            const rootPath = path.join(storagePath, message.id);
            if (fs.existsSync(rootPath)) pluginFolder = rootPath;
          }
          let displayField = message.field;
          if (message.field === 'displayName') displayField = getTranslation('metadataDisplayName', lang);
          else if (message.field === 'name') displayField = getTranslation('metadataName', lang);
          else if (message.field === 'description') displayField = getTranslation('metadataDescription', lang);
          else if (message.field === 'version') displayField = getTranslation('metadataVersion', lang);
          else if (message.field === 'author') displayField = getTranslation('metadataAuthor', lang);

          const promptText = getTranslation('editMetadataPrompt', lang).replace('{field}', displayField);
          const newValue = await vscode.window.showInputBox({ prompt: promptText, value: message.currentValue || '' });
          if (newValue !== undefined) {
            writePluginMetaField(pluginFolder, message.field, newValue);
            await notifyAndUpdate();
          }
        } catch (e) {
          vscode.window.showErrorMessage('Failed to update metadata: ' + e.message);
        }
        break;

      case 'requestMove':
        await executeRequestMove(message);
        break;
    }
  });
}

function openPluginManagerPanel(context, statusBarItem) {
  const lang = getActiveLanguage();
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    sendPanelData(context);
    return;
  }

  activePanel = vscode.window.createWebviewPanel(
    'antigravity-plugin-manager-panel',
    getTranslation('title', lang),
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  activePanel.webview.html = getHtmlContentShared(activePanel.webview, context, lang);

  setupWebviewMessagingShared(activePanel.webview, context, statusBarItem, () => {
    const data = collectAllData(context);
    sendPanelData(context, data);
    if (sidebarProvider) sidebarProvider.sendInitialData(data);
    updateStatusBarItem(statusBarItem, context, data);
  });

  activePanel.onDidDispose(() => {
    activePanel = undefined;
  }, null, context.subscriptions);

  sendPanelData(context);
}

function activate(context) {
  const isAntigravity = vscode.env.appName === 'Antigravity IDE' || (vscode.env.appName && vscode.env.appName.includes('Antigravity'));
  if (!isAntigravity) {
    vscode.window.showErrorMessage('Antigravity Plugin Manager is designed exclusively for Antigravity IDE and is not supported in standard VS Code.');
    return;
  }

  logDebug('Antigravity Plugin Manager activating...');

  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
  const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

  [
    activePluginsPath, activeSkillsPath, activeWorkflowsPath
  ].forEach(p => {
    if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
    }
  });

  // Automatic migration from legacy storage/junctions to native config
  try {
    const migration = migrateFromLegacyStorage(context);
    if (migration && migration.migratedPlugins && migration.migratedPlugins.length > 0) {
      const msg = getActiveLanguage() === 'ru'
        ? `Миграция завершена: ${migration.migratedPlugins.length} плагинов перемещены из storage в ~/.gemini/config/plugins/ и отключены в config.json.`
        : `Migration complete: ${migration.migratedPlugins.length} plugins migrated from storage to ~/.gemini/config/plugins/ and disabled in config.json.`;
      vscode.window.showInformationMessage(msg);
    }
  } catch (migErr) {
    logDebug('Migration error: ' + migErr.message);
  }

  // Ensure default plugins folder is preserved in config if external repos exist
  ensureDefaultPluginsFolderInGlobalConfig();

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  statusBarItem.command = 'antigravity-plugin-manager.open';
  updateStatusBarItem(statusBarItem, context);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const provider = new PluginManagerViewProvider(context, statusBarItem);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('antigravity-plugin-manager.view', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.open', () => {
      openPluginManagerPanel(context, statusBarItem);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.refresh', async () => {
      await immediateIdeScannerFlush();
      const data = collectAllData(context);
      if (provider) provider.sendInitialData(data);
      sendPanelData(context, data);
      updateStatusBarItem(statusBarItem, context, data);
      vscode.window.showInformationMessage(getActiveLanguage() === 'ru' ? 'Список обновлен' : 'List refreshed');
    }),
    vscode.commands.registerCommand('antigravity-plugin-manager.softApply', async () => {
      if (ideFlushTimer) {
        clearTimeout(ideFlushTimer);
        ideFlushTimer = null;
      }
      if (ideFlushSettledTimer) {
        clearTimeout(ideFlushSettledTimer);
        ideFlushSettledTimer = null;
      }
      ensureDefaultPluginsFolderInGlobalConfig();
      touchAntigravityConfigs();
      try {
        await vscode.commands.executeCommand('antigravity.restartLanguageServer');
      } catch (e) {
        await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
      }
      broadcastSyncStatus('synced');
      const lang = getActiveLanguage();
      vscode.window.setStatusBarMessage(getTranslation('softApplySuccess', lang), 4000);
      if (provider) provider.sendInitialData();
      sendPanelData(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.refreshStatusBar', () => {
      updateStatusBarItem(statusBarItem, context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.selectStorage', () => {
      if (activePanel) activePanel.webview.postMessage({ command: 'selectStorage' });
      else if (provider && provider._view) provider._view.webview.postMessage({ command: 'selectStorage' });
    }),
    vscode.commands.registerCommand('antigravity-plugin-manager.openConfigJson', () => {
      const cfgPath = getAntigravityConfigPath();
      if (fs.existsSync(cfgPath)) {
        vscode.workspace.openTextDocument(vscode.Uri.file(cfgPath)).then(doc => vscode.window.showTextDocument(doc));
      } else {
        vscode.window.showWarningMessage('Config file does not exist: ' + cfgPath);
      }
    }),
    vscode.commands.registerCommand('antigravity-plugin-manager.openPluginsJson', () => {
      const pJsonPath = getGlobalPluginsJsonPath();
      if (!fs.existsSync(pJsonPath)) {
        fs.mkdirSync(path.dirname(pJsonPath), { recursive: true });
        fs.writeFileSync(pJsonPath, JSON.stringify({ entries: [] }, null, 2), 'utf8');
      }
      vscode.workspace.openTextDocument(vscode.Uri.file(pJsonPath)).then(doc => vscode.window.showTextDocument(doc));
    }),
    vscode.commands.registerCommand('antigravity-plugin-manager.openSkillsJson', () => {
      const sJsonPath = getGlobalSkillsJsonPath();
      if (!fs.existsSync(sJsonPath)) {
        fs.mkdirSync(path.dirname(sJsonPath), { recursive: true });
        fs.writeFileSync(sJsonPath, JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
      }
      vscode.workspace.openTextDocument(vscode.Uri.file(sJsonPath)).then(doc => vscode.window.showTextDocument(doc));
    }),
    vscode.commands.registerCommand('antigravity-plugin-manager.checkUpdates', async () => {
      const workspaceRoots = getWorkspaceRoots();
      const plugins = scanPlugins(getActivePluginsPath(), workspaceRoots);
      const localPlugins = scanLocalPlugins(workspaceRoots);
      const allPlugins = [...plugins, ...localPlugins];
      try {
        const updatesState = await checkAllUpdates(allPlugins, context);
        broadcastToAllWebviews({ command: 'updatesChecked', updatesState });
        const lang = getActiveLanguage();
        if (updatesState.totalAvailableUpdates > 0) {
          vscode.window.showInformationMessage(
            getTranslation('updatesFound', lang).replace('{count}', updatesState.totalAvailableUpdates)
          );
        } else {
          vscode.window.showInformationMessage(getTranslation('allUpToDate', lang));
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Update check failed: ${err.message}`);
      }
    })
  );

  // Background Auto-check on Startup / Scheduled Interval
  function scheduleBackgroundUpdateCheck() {
    const config = vscode.workspace.getConfiguration('antigravity-plugin-manager');
    const autoCheckMode = config.get('updates.autoCheck', 'daily');
    if (autoCheckMode === 'never') return;

    const cached = context.globalState.get('antigravity-plugin-manager.updatesState');
    const lastCheck = cached && cached.lastCheckedAt ? cached.lastCheckedAt : 0;
    const now = Date.now();

    let intervalMs = 24 * 60 * 60 * 1000; // daily
    if (autoCheckMode === 'hourly') intervalMs = 60 * 60 * 1000;
    else if (autoCheckMode === 'weekly') intervalMs = 7 * 24 * 60 * 60 * 1000;
    else if (autoCheckMode === 'startup') intervalMs = 0; // always on startup

    if (now - lastCheck >= intervalMs) {
      setTimeout(async () => {
        try {
          const workspaceRoots = getWorkspaceRoots();
          const plugins = scanPlugins(getActivePluginsPath(), workspaceRoots);
          const localPlugins = scanLocalPlugins(workspaceRoots);
          const allPlugins = [...plugins, ...localPlugins];
          const updates = await checkAllUpdates(allPlugins, context);
          broadcastToAllWebviews({ command: 'updatesChecked', updatesState: updates });
          if (updates.totalAvailableUpdates > 0) {
            vscode.window.showInformationMessage(
              `Antigravity: ${updates.totalAvailableUpdates} plugin update(s) available!`
            );
          }
        } catch (e) {
          logDebug(`Background update check error: ${e.message}`);
        }
      }, 3500);
    }
  }
  scheduleBackgroundUpdateCheck();

  vscode.workspace.onDidChangeConfiguration(e => {
    const activeLang = getActiveLanguage();
    if (e.affectsConfiguration('antigravity-plugin-manager.storagePath') || 
        e.affectsConfiguration('antigravity-plugin-manager.language') ||
        e.affectsConfiguration('antigravity-plugin-manager.editorOpenColumn')) {
      if (activePanel) {
        activePanel.webview.html = getHtmlContentShared(activePanel.webview, context, activeLang);
        sendPanelData(context);
      }
      if (provider && provider._view) {
        provider._view.webview.html = getHtmlContentShared(provider._view.webview, context, activeLang);
        provider.sendInitialData();
      }
    }
    if (e.affectsConfiguration('antigravity-plugin-manager.statusBar') ||
        e.affectsConfiguration('antigravity-plugin-manager.language')) {
      updateStatusBarItem(statusBarItem, context);
    }
  }, null, context.subscriptions);

  logDebug('Antigravity Plugin Manager activated successfully.');
}

function deactivate() {
  logDebug('Antigravity Plugin Manager deactivated.');
}

function getHtmlContentShared(webview, context, lang) {
  const extPath = context && context.extensionPath ? context.extensionPath : __dirname;
  const htmlPath = path.join(extPath, 'webview', 'index.html');
  const cssPath = path.join(extPath, 'webview', 'style.css');

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = getWebviewScript(path.join(extPath, 'webview'));

  const configLang = vscode.workspace.getConfiguration('antigravity-plugin-manager').get('language', 'auto');
  
  const replacements = {
    lang: lang,
    configLangAuto: configLang === 'auto' ? 'selected' : '',
    configLangEn: configLang === 'en' ? 'selected' : '',
    configLangRu: configLang === 'ru' ? 'selected' : '',
    title: getTranslation('title', lang),
    subtitle: getTranslation('subtitle', lang),
    storagePathLabel: getTranslation('storagePath', lang),
    changeStorageBtn: getTranslation('changeStorage', lang),
    openActiveFolderBtn: lang === 'ru' ? 'Открыть папку Plugins' : 'Open Active Folder',
    openStorageFolderBtn: lang === 'ru' ? 'Открыть Хранилище' : 'Open Storage Folder',
    repositoriesAndConfigs: getTranslation('repositoriesAndConfigs', lang),
    storageScopeGlobal: getTranslation('storageScopeGlobal', lang),
    storageScopeWorkspace: getTranslation('storageScopeWorkspace', lang),
    openAgentsFolderBtn: getTranslation('openAgentsFolderBtn', lang),
    btnConnectPluginsGlobal: getTranslation('btnConnectPluginsGlobal', lang),
    btnConnectSkillsGlobal: getTranslation('btnConnectSkillsGlobal', lang),
    btnConnectPluginsProject: getTranslation('btnConnectPluginsProject', lang),
    btnConnectSkillsProject: getTranslation('btnConnectSkillsProject', lang),
    lblConfigs: getTranslation('lblConfigs', lang),
    lblFolders: getTranslation('lblFolders', lang),
    btnConnectFolder: getTranslation('btnConnectFolder', lang),
    openConfigJson: getTranslation('openConfigJson', lang),
    openPluginsJson: getTranslation('openPluginsJson', lang),
    openSkillsJson: getTranslation('openSkillsJson', lang),
    connectedRepositories: getTranslation('connectedRepositories', lang),
    noConnectedFolders: getTranslation('noConnectedFolders', lang),
    openPluginsFolderBtn: getTranslation('openPluginsFolderBtn', lang),
    openSkillsFolderBtn: getTranslation('openSkillsFolderBtn', lang),
    btnConnectPluginsFolder: getTranslation('btnConnectPluginsFolder', lang),
    btnConnectSkillsFolder: getTranslation('btnConnectSkillsFolder', lang),
    clickToOpenFolder: getTranslation('clickToOpenFolder', lang),
    statPlugins: getTranslation('statPlugins', lang),
    statSkills: getTranslation('statSkills', lang),
    statRules: getTranslation('statRules', lang),
    statWorkflows: getTranslation('statWorkflows', lang),
    statMcp: getTranslation('statMcp', lang) || 'MCP',
    statHooks: getTranslation('statHooks', lang) || (lang === 'ru' ? 'Хуки' : 'Hooks'),
    conflictTitle: getTranslation('conflictTitle', lang),
    tabActive: getTranslation('tabActive', lang) || (lang === 'ru' ? 'Активное' : 'Active'),
    tabRules: getTranslation('tabRules', lang) || (lang === 'ru' ? 'Правила' : 'Rules'),
    tabSkills: getTranslation('tabSkills', lang),
    tabPlugins: getTranslation('tabPlugins', lang),
    tabWorkflows: getTranslation('tabWorkflows', lang),
    tabMcp: getTranslation('tabMcp', lang) || 'MCP',
    tabHooks: getTranslation('tabHooks', lang) || (lang === 'ru' ? 'Хуки' : 'Hooks'),
    captionActiveEsc: (getTranslation('captionActive', lang) || '').replace(/"/g, '&quot;'),
    captionRulesEsc: (getTranslation('captionRules', lang) || '').replace(/"/g, '&quot;'),
    captionSkillsEsc: (getTranslation('captionSkills', lang) || '').replace(/"/g, '&quot;'),
    captionPluginsEsc: (getTranslation('captionPlugins', lang) || '').replace(/"/g, '&quot;'),
    captionWorkflowsEsc: (getTranslation('captionWorkflows', lang) || '').replace(/"/g, '&quot;'),
    captionMcpEsc: (getTranslation('captionMcp', lang) || '').replace(/"/g, '&quot;'),
    captionHooksEsc: (getTranslation('captionHooks', lang) || '').replace(/"/g, '&quot;'),
    layoutModeText: lang === 'ru' ? 'В 1 колонку' : '1 Column',
    viewModeText: lang === 'ru' ? 'Подробно' : 'Detailed',
    groupingModeText: lang === 'ru' ? 'Группировка: Выкл' : 'Grouping: Off',
    refreshBtn: lang === 'ru' ? 'Обновить' : 'Refresh',
    btnCreateNew: getTranslation('btnCreateNew', lang),
    searchPlaceholder: lang === 'ru' ? 'Поиск...' : 'Search...',
    noPlugins: getTranslation('noPlugins', lang),
    back: getTranslation('back', lang),
    pluginDetails: getTranslation('pluginDetails', lang),
    metadataDisplayName: getTranslation('metadataDisplayName', lang),
    metadataName: getTranslation('metadataName', lang),
    metadataDescription: getTranslation('metadataDescription', lang),
    metadataVersion: getTranslation('metadataVersion', lang),
    metadataAuthor: getTranslation('metadataAuthor', lang),
    move: getTranslation('move', lang),
    deleteBtn: lang === 'ru' ? 'Удалить' : 'Delete',
    openFolderBtn: lang === 'ru' ? 'Открыть папку' : 'Open folder',
    openPluginFolderBtn: lang === 'ru' ? 'Открыть папку плагина' : 'Open plugin folder',
    openPluginFolder: getTranslation('openPluginFolder', lang),
    openPluginManifest: getTranslation('openPluginManifest', lang),
    pluginPath: getTranslation('pluginPath', lang),
    copyPath: getTranslation('copyPath', lang),
    copyName: getTranslation('copyName', lang),
    globalToggle: getTranslation('globalToggle', lang),
    workspaceOnly: getTranslation('workspaceOnly', lang),
    selectWorkspace: getTranslation('selectWorkspace', lang),
    noPluginResources: getTranslation('noPluginResources', lang),
    detailLayoutModeText: lang === 'ru' ? 'В 1 колонку' : '1 Column',
    detailViewModeText: lang === 'ru' ? 'Подробно' : 'Detailed',
    createSkillBtn: lang === 'ru' ? 'Создать навык' : 'Create Skill',
    rulesCount: getTranslation('rulesCount', lang),
    hooks: getTranslation('hooks', lang),
    modalCreateTitle: getTranslation('modalCreateTitle', lang),
    labelCategory: getTranslation('labelCategory', lang),
    labelTarget: getTranslation('labelTarget', lang),
    optGlobalOption: getTranslation('optGlobalOption', lang),
    labelFolderName: getTranslation('labelFolderName', lang),
    labelDisplayName: getTranslation('labelDisplayName', lang),
    labelDescription: getTranslation('labelDescription', lang),
    labelVersion: getTranslation('labelVersion', lang),
    labelAuthor: getTranslation('labelAuthor', lang),
    createScriptsLabel: lang === 'ru' ? 'Создать папку scripts (фоновые утилиты)' : 'Create scripts folder (background utilities)',
    createExamplesLabel: lang === 'ru' ? 'Создать папку examples (примеры)' : 'Create examples folder (examples)',
    createDocsLabel: lang === 'ru' ? 'Создать папку docs (документация)' : 'Create docs folder (documentation)',
    createResourcesLabel: lang === 'ru' ? 'Создать папку resources (ресурсы)' : 'Create resources folder (resources)',
    btnCancel: getTranslation('btnCancel', lang),
    btnCreate: getTranslation('btnCreate', lang),
    toggleCategory: getTranslation('toggleCategory', lang),
    syncTooltip: getTranslation('syncTooltip', lang),
    softApplyTitle: getTranslation('softApplyTitle', lang),
    softApplyBtn: getTranslation('softApplyBtn', lang),
    liveContextTitle: getTranslation('liveContextTitle', lang),
    liveContextSubtitle: getTranslation('liveContextSubtitle', lang),
    checkUpdates: getTranslation('checkUpdates', lang),
    updateModalTitle: getTranslation('updateModalTitle', lang),
    updateNow: getTranslation('updateNow', lang),
    btnClose: lang === 'ru' ? 'Закрыть' : 'Close'
  };

  for (const [key, val] of Object.entries(replacements)) {
    html = html.split(`{{${key}}}`).join(val !== undefined ? val : '');
  }

  const activeLangTranslations = translations[lang] || translations['en'] || {};
  const i18nScript = `<script>\nwindow.LANG = ${JSON.stringify(lang)};\nwindow.I18N = ${JSON.stringify(activeLangTranslations)};\n</script>`;

  html = html.replace('<!-- INJECT_STYLE -->', `<style>\n${css}\n</style>`);
  html = html.replace('<!-- INJECT_SCRIPT -->', `${i18nScript}\n<script>\n${js}\n</script>`);

  return html;
}

module.exports = {
  activate,
  deactivate
};
