const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { getTranslation, translations } = require('./locales/translations');
const {
  logDebug,
  getActiveLanguage,
  getActivePluginsPath,
  getActiveSkillsPath,
  getActiveWorkflowsPath,
  getDefaultStoragePath,
  getGlobalStoragePath,
  getStorageSubpath,
  writePluginMetaField,
  safeMoveDir
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
  getContextStats
} = require('./services/scanners');
const {
  toggleItem,
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

let activePanel = undefined;
let sidebarProvider = undefined;

// Centralized context data collector
function collectAllData(context) {
  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();
  
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
  const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

  const workspaceRoots = vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath) 
    : [];

  const workspaceFolders = vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders.map(folder => ({ name: folder.name, fsPath: folder.uri.fsPath }))
    : [];

  const globalPlugins = scanPlugins(activePluginsPath, storagePluginsPath);
  const localPlugins = scanLocalPlugins();
  localPlugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const plugins = [...globalPlugins, ...localPlugins];
  
  const builtinSkills = scanBuiltinSkills();
  const globalSkills = scanSkills(activeSkillsPath, storageSkillsPath);
  const localSkills = scanLocalSkills();
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
  const globalWorkflows = scanWorkflows(activeWorkflowsPath, storageWorkflowsPath);
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

  const pluginConflicts = scanConflicts(activePluginsPath, storagePluginsPath, 'plugin');
  const skillConflicts = scanConflicts(activeSkillsPath, storageSkillsPath, 'skill');
  const workflowConflicts = scanConflicts(activeWorkflowsPath, storageWorkflowsPath, 'workflow');
  const conflicts = [...pluginConflicts, ...skillConflicts, ...workflowConflicts];

  return {
    plugins,
    skills,
    workflows,
    rules,
    mcpServers,
    hooks,
    stats,
    storagePath,
    conflicts,
    workspaceFolders
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
      this.sendInitialData();
      sendPanelData(this._context);
      updateStatusBarItem(this._statusBarItem, this._context);
    });

    this.sendInitialData();
  }

  sendInitialData() {
    if (!this._view) return;
    const data = collectAllData(this._context);
    this._view.webview.postMessage({
      command: 'init',
      ...data
    });
  }
}

function sendPanelData(context) {
  if (!activePanel) return;
  const data = collectAllData(context);
  activePanel.webview.postMessage({
    command: 'init',
    ...data
  });
}

function updateStatusBarItem(statusBarItem, context) {
  const activePath = getActivePluginsPath();
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const lang = getActiveLanguage();

  const globalPlugins = scanPlugins(activePath, storagePluginsPath);
  const localPlugins = scanLocalPlugins();
  const plugins = [...globalPlugins, ...localPlugins];
  const activeCount = plugins.filter(p => p.isEnabled).length;
  const totalCount = plugins.length;

  let statusText = getTranslation('statusBarText', lang)
    .replace('{active}', activeCount)
    .replace('{total}', totalCount);
  
  statusBarItem.text = `$(extensions) ${statusText}`;

  const activeList = plugins
    .filter(p => p.isEnabled)
    .map(p => `• ${p.displayName} (v${p.version})`)
    .join('\n') || (lang === 'ru' ? '• Нет активных плагинов' : '• No active plugins');

  const disabledList = plugins
    .filter(p => !p.isEnabled)
    .map(p => `• ${p.displayName} (v${p.version})`)
    .join('\n') || (lang === 'ru' ? '• Нет выключенных плагинов' : '• No disabled plugins');

  statusBarItem.tooltip = getTranslation('statusBarTooltip', lang)
    .replace('{activeList}', activeList)
    .replace('{disabledList}', disabledList);
}

function setupWebviewMessagingShared(webview, context, statusBarItem, onUpdate) {
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

    switch (message.command) {
      case 'changeLanguage':
        try {
          await vscode.workspace.getConfiguration('antigravity-plugin-manager').update('language', message.language, vscode.ConfigurationTarget.Global);
        } catch (e) {
          vscode.window.showErrorMessage('Failed to change language: ' + e.message);
        }
        break;

      case 'ready':
      case 'refresh':
        onUpdate();
        break;

      case 'toggle':
        try {
          if (message.category === 'skill') {
            await toggleItem(activeSkillsPath, storageSkillsPath, message.id, message.enable, lang, 'skill');
          } else if (message.category === 'workflow') {
            await toggleItem(activeWorkflowsPath, storageWorkflowsPath, message.id, message.enable, lang, 'workflow');
          } else {
            await toggleItem(activePluginsPath, storagePluginsPath, message.id, message.enable, lang, 'plugin');
          }
          onUpdate();
        } catch (e) {
          logDebug(`Toggle error: ${e.message}`);
          let errMsg = (e.code === 'EPERM' || e.code === 'EACCES')
            ? (lang === 'ru' ? `Доступ запрещен или папка заблокирована: "${message.id}"` : `Access denied or directory locked: "${message.id}"`)
            : (getTranslation('errorToggle', lang).replace('{error}', e.message));
          vscode.window.showErrorMessage(errMsg);
          webview.postMessage({ command: 'error' });
          onUpdate();
        }
        break;

      case 'toggleHook':
        try {
          const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
          await toggleHook(message.physicalPath, message.hookName, isEnabled, lang);
          onUpdate();
          updateStatusBarItem(statusBarItem, context);
        } catch (err) {
          vscode.window.showErrorMessage(`Hook toggle error: ${err.message}`);
        }
        break;

      case 'toggleMcpServer':
        try {
          const isEnabled = message.enable !== undefined ? message.enable : message.enabled;
          await toggleMcpServer(message.physicalPath, message.serverName, isEnabled, lang);
          onUpdate();
          updateStatusBarItem(statusBarItem, context);
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
            onUpdate();
            updateStatusBarItem(statusBarItem, context);
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
            onUpdate();
            updateStatusBarItem(statusBarItem, context);
          }
        } catch (e) {
          vscode.window.showErrorMessage('Failed to delete MCP server: ' + e.message);
        }
        break;

      case 'moveMcp':
        try {
          const { serverName, physicalPath } = message;
          const allPlugins = scanPlugins(activePluginsPath, storagePluginsPath);
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
            onUpdate();
            updateStatusBarItem(statusBarItem, context);
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Move error: ${err.message}`);
        }
        break;

      case 'moveHook':
        try {
          const { hookName, physicalPath } = message;
          const allPlugins = scanPlugins(activePluginsPath, storagePluginsPath);
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
            onUpdate();
            updateStatusBarItem(statusBarItem, context);
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
          onUpdate();
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
          onUpdate();
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorCreate', lang).replace('{error}', e.message));
        }
        break;

      case 'deleteItem':
        try {
          const deleted = await deleteItem(message.category, message.id, message.displayName, message.physicalPath, lang, activeSkillsPath);
          if (deleted) onUpdate();
        } catch (e) {
          vscode.window.showErrorMessage('Failed to delete item: ' + e.message);
        }
        break;

      case 'openStorage':
        if (fs.existsSync(storagePath)) vscode.env.openExternal(vscode.Uri.file(storagePath));
        else vscode.window.showWarningMessage('Storage folder does not exist yet.');
        break;

      case 'openActive':
        if (fs.existsSync(activePluginsPath)) vscode.env.openExternal(vscode.Uri.file(activePluginsPath));
        else vscode.window.showWarningMessage('Active plugins folder does not exist.');
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
        if (fs.existsSync(itemFolder)) vscode.env.openExternal(vscode.Uri.file(itemFolder));
        else vscode.window.showWarningMessage('Folder does not exist: ' + itemFolder);
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
            await vscode.window.showTextDocument(doc);
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
            onUpdate();
          }
        } catch (e) {
          vscode.window.showErrorMessage('Failed to update metadata: ' + e.message);
        }
        break;

      case 'requestMove':
        try {
          const { itemId, category, sourcePluginId, isEnabled } = message;
          const bPath = getBuiltinPath().toLowerCase();
          if (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin')) || 
              (message.physicalPath && message.physicalPath.toLowerCase().startsWith(bPath))) {
            vscode.window.showWarningMessage(getTranslation('cannotModifyBuiltin', lang));
            break;
          }

          const globalPlugins = scanPlugins(activePluginsPath, storagePluginsPath);
          const localPlugins = scanLocalPlugins();
          const allPlugins = [...globalPlugins, ...localPlugins];
          const otherPlugins = allPlugins.filter(p => p.id !== sourcePluginId && p.name !== sourcePluginId);
          const quickPickItems = [];
          
          const isAlreadyGlobal = category !== 'plugin' ? (!sourcePluginId && !message.isLocal) : !message.isLocal;
          if (category !== 'rule' && !isAlreadyGlobal) {
            quickPickItems.push({
              label: lang === 'ru' ? '$(globe) Глобальный' : '$(globe) Global',
              description: lang === 'ru' ? 'Переместить в общие папки' : 'Move to global folders',
              id: 'global',
              type: 'global'
            });
          }
          
          if (category !== 'workflow' && category !== 'plugin') {
            otherPlugins.forEach(p => {
              quickPickItems.push({
                label: `$(extensions) ${p.displayName}`,
                description: `ID: ${p.id}`,
                id: p.id,
                type: 'plugin'
              });
            });
          }

          if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
              let isCurrentWorkspace = false;
              if (message.isLocal && message.physicalPath) {
                const relative = path.relative(folder.uri.fsPath, message.physicalPath);
                isCurrentWorkspace = !relative.startsWith('..') && !path.isAbsolute(relative);
              }
              if (!isCurrentWorkspace) {
                quickPickItems.push({
                  label: `$(folder) ${lang === 'ru' ? 'Рабочая область' : 'Workspace'}: ${folder.name}`,
                  description: folder.uri.fsPath,
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
            
            if (message.physicalPath && fs.existsSync(message.physicalPath)) {
              sourcePath = message.physicalPath;
            } else if (sourcePluginId) {
              const pluginFolder = isEnabled ? path.join(activePluginsPath, sourcePluginId) : path.join(storagePluginsPath, sourcePluginId);
              sourcePath = path.join(pluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'), itemId);
            } else if (message.isLocal && message.physicalPath) {
              sourcePath = message.physicalPath;
            } else {
              if (category === 'skill') sourcePath = isEnabled ? path.join(activeSkillsPath, itemId) : path.join(storageSkillsPath, itemId);
              else if (category === 'workflow') sourcePath = isEnabled ? path.join(activeWorkflowsPath, itemId) : path.join(storageWorkflowsPath, itemId);
              else if (category === 'plugin') sourcePath = isEnabled ? path.join(activePluginsPath, itemId) : path.join(storagePluginsPath, itemId);
            }
            
            if (targetType === 'plugin') {
              const targetPlugin = allPlugins.find(p => p.id === targetId || p.name === targetId);
              const targetPluginFolder = targetPlugin && targetPlugin.physicalPath 
                ? targetPlugin.physicalPath 
                : (targetPlugin && targetPlugin.isEnabled ? path.join(activePluginsPath, targetId) : path.join(storagePluginsPath, targetId));
              targetParent = path.join(targetPluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'));
            } else if (targetType === 'global') {
              if (category === 'skill') targetParent = isEnabled ? activeSkillsPath : storageSkillsPath;
              else if (category === 'workflow') targetParent = isEnabled ? activeWorkflowsPath : storageWorkflowsPath;
              else if (category === 'plugin') targetParent = isEnabled ? activePluginsPath : storagePluginsPath;
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
            onUpdate();
            vscode.window.showInformationMessage(getTranslation('moveSuccess', lang).replace('{itemId}', filename));
          }
        } catch (e) {
          vscode.window.showErrorMessage(getTranslation('errorMove', lang).replace('{error}', e.message));
        }
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
    sendPanelData(context);
    if (sidebarProvider) sidebarProvider.sendInitialData();
    updateStatusBarItem(statusBarItem, context);
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
    activePluginsPath, activeSkillsPath, activeWorkflowsPath,
    storagePath, storagePluginsPath, storageSkillsPath, storageWorkflowsPath
  ].forEach(p => {
    if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
    }
  });

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
    vscode.commands.registerCommand('antigravity-plugin-manager.refresh', () => {
      if (provider) provider.sendInitialData();
      sendPanelData(context);
      updateStatusBarItem(statusBarItem, context);
      vscode.window.showInformationMessage(getActiveLanguage() === 'ru' ? 'Список обновлен' : 'List refreshed');
    })
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
    })
  );

  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('antigravity-plugin-manager.storagePath') || e.affectsConfiguration('antigravity-plugin-manager.language')) {
      const activeLang = getActiveLanguage();
      if (activePanel) {
        activePanel.webview.html = getHtmlContentShared(activePanel.webview, context, activeLang);
        sendPanelData(context);
      }
      if (provider && provider._view) {
        provider._view.webview.html = getHtmlContentShared(provider._view.webview, context, activeLang);
        provider.sendInitialData();
      }
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
  const jsPath = path.join(extPath, 'webview', 'main.js');

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

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
    btnCreate: getTranslation('btnCreate', lang)
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
