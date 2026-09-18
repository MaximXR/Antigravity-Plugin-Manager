let vscode;
try {
  vscode = require('vscode');
} catch (e) {
  vscode = require('./vscodeShim');
}
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getTranslation } = require('../locales/translations');
const {
  logDebug,
  safeMoveDir,
  createLink,
  syncBackDir,
  twoWayMergeDirs,
  escapeJsString,
  getAntigravityConfig,
  saveAntigravityConfig,
  setAntigravityPluginEnabled,
  removeAntigravityPluginFromConfig,
  setPluginManifestDisabled,
  getActivePluginsPath,
  getGlobalPluginsJsonPath,
  getGlobalSkillsJsonPath,
  getWorkspacePluginConfigPath,
  getWorkspaceSkillConfigPath,
  readJsonConfigFile,
  resolveJsonConfigPath,
  addEntryToJsonConfig,
  removeEntryFromJsonConfig,
  addExcludeToJsonConfig,
  removeExcludeFromJsonConfig,
  ensureDefaultPluginsFolderInGlobalConfig,
  cleanupDefaultPluginsFolderInGlobalConfig,
  getBuiltinPath
} = require('./fsUtils');

// Native toggle global plugin:
// For Default Global plugins (~/.gemini/config/plugins): Default Discovery ignores entry.exclude,
// so writes disabled to plugin.json (IDE), config.json (Desktop), and root exclude in plugins.json.
// For Connected Library plugins (E:\AI\plugins or any entries): MUST NOT set disabled in plugin.json
// or enabled: false in config.json (which act as universal machine-wide blacklists).
// Instead, toggles strictly via entry.exclude in plugins.json, allowing per-project overrides (Case C4)!
async function togglePluginGlobal(pluginId, enable, lang, physicalPath = null) {
  if (pluginId && (pluginId.startsWith('builtin-') || pluginId.includes('builtin'))) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }

  // 1. Resolve physical path of plugin directory
  let targetDir = physicalPath;
  const activePluginsPath = getActivePluginsPath();
  if (!targetDir || !fs.existsSync(targetDir)) {
    const defaultPath = path.join(activePluginsPath, pluginId);
    if (fs.existsSync(defaultPath)) {
      targetDir = defaultPath;
    }
  }

  if (!targetDir || !fs.existsSync(targetDir)) {
    const globalPluginsJson = getGlobalPluginsJsonPath();
    const cfg = readJsonConfigFile(globalPluginsJson);
    if (cfg && cfg.entries) {
      for (const ent of cfg.entries) {
        if (ent.path) {
          const resolved = resolveJsonConfigPath(ent.path);
          const candidate = path.join(resolved, pluginId);
          if (fs.existsSync(candidate)) {
            targetDir = candidate;
            break;
          }
        }
      }
    }
  }

  const isDefaultGlobal = targetDir && path.normalize(targetDir).toLowerCase().startsWith(path.normalize(activePluginsPath).toLowerCase());
  const dirName = targetDir ? path.basename(targetDir) : pluginId;
  let manifestName = null;
  if (targetDir && fs.existsSync(targetDir)) {
    try {
      const pJson = JSON.parse(fs.readFileSync(path.join(targetDir, 'plugin.json'), 'utf8'));
      if (pJson.name) manifestName = pJson.name;
    } catch (_) {}
  }

  const globalPluginsJson = getGlobalPluginsJsonPath();
  const namesToSync = [...new Set([dirName, manifestName, pluginId].filter(Boolean))];

  if (isDefaultGlobal) {
    // 2. Standard Global: Write to plugin.json (Antigravity IDE source of truth)
    if (targetDir && fs.existsSync(targetDir)) {
      setPluginManifestDisabled(targetDir, !enable);
    }

    // 3. Write to config.json (Antigravity Desktop 2.0 / CLI)
    setAntigravityPluginEnabled(dirName, enable);
    if (manifestName && manifestName !== dirName) {
      setAntigravityPluginEnabled(manifestName, enable);
    }
    if (pluginId && pluginId !== dirName && pluginId !== manifestName) {
      setAntigravityPluginEnabled(pluginId, enable);
    }

    // 4. Sync with global plugins.json exclude list (root exclude)
    for (const n of namesToSync) {
      if (enable) {
        removeExcludeFromJsonConfig(globalPluginsJson, n, targetDir);
      } else {
        addExcludeToJsonConfig(globalPluginsJson, n, targetDir);
      }
    }
  } else {
    // Connected Library Plugin:
    // Keep plugin.json manifest clean (disabled: false) so projects can load it
    if (targetDir && fs.existsSync(targetDir)) {
      setPluginManifestDisabled(targetDir, false);
    }

    // Clean any machine-wide killswitch from config.json
    removeAntigravityPluginFromConfig(dirName);
    if (manifestName) removeAntigravityPluginFromConfig(manifestName);
    if (pluginId) removeAntigravityPluginFromConfig(pluginId);

    // Sync strictly via entry.exclude in plugins.json
    for (const n of namesToSync) {
      if (enable) {
        removeExcludeFromJsonConfig(globalPluginsJson, n);
      } else {
        addExcludeToJsonConfig(globalPluginsJson, n, targetDir);
      }
    }
  }
}

// Toggle plugin for a specific project (or multiple project folders) via .agents/plugins.json
async function togglePluginProject(wsRootOrRoots, pluginPhysicalPath, pluginId, action, lang) {
  if (!wsRootOrRoots || (Array.isArray(wsRootOrRoots) && wsRootOrRoots.length === 0)) {
    throw new Error(lang === 'ru' ? 'Нет открытой рабочей области.' : 'No open workspace folder.');
  }
  const roots = Array.isArray(wsRootOrRoots) ? wsRootOrRoots : [wsRootOrRoots];
  for (const wsRoot of roots) {
    if (!wsRoot) continue;
    const configPath = getWorkspacePluginConfigPath(wsRoot);
    const dirName = pluginPhysicalPath ? path.basename(pluginPhysicalPath) : pluginId;
    const idToUse = pluginId || dirName;

    if (action === 'enable' || action === true) {
      addEntryToJsonConfig(configPath, pluginPhysicalPath, {}, wsRoot);
      removeExcludeFromJsonConfig(configPath, idToUse);
      removeExcludeFromJsonConfig(configPath, dirName);
    } else if (action === 'disable' || action === false) {
      removeEntryFromJsonConfig(configPath, pluginPhysicalPath);
      addExcludeToJsonConfig(configPath, idToUse);
    } else if (action === 'reset' || action === 'default') {
      removeEntryFromJsonConfig(configPath, pluginPhysicalPath);
      removeExcludeFromJsonConfig(configPath, idToUse);
      removeExcludeFromJsonConfig(configPath, dirName);
    }
  }
}

// Helper to check if a path or resource is protected (case-insensitive for Windows)
function isProtectedResource(physicalPath) {
  if (!physicalPath) return false;
  const lowerPath = path.normalize(physicalPath).toLowerCase();
  const baseName = path.basename(lowerPath);
  if (
    baseName === 'gemini.md' ||
    baseName === 'agents.md' ||
    lowerPath.endsWith('gemini.md') ||
    lowerPath.endsWith('agents.md')
  ) {
    return true;
  }
  let builtinSkillsPath = '';
  try {
    builtinSkillsPath = path.join(getBuiltinPath(), 'skills').toLowerCase();
  } catch (_) {}
  if (lowerPath.includes('builtin') || (builtinSkillsPath && lowerPath.startsWith(builtinSkillsPath))) {
    return true;
  }
  return false;
}

// Toggle skill globally via ~/.gemini/config/skills.json exclude list
async function toggleSkillGlobal(skillName, enable, lang, altName = null, physicalPath = null) {
  const lowerName = (skillName || '').toLowerCase();
  const lowerPath = (physicalPath || '').toLowerCase();
  let builtinSkillsPath = '';
  try {
    builtinSkillsPath = path.join(getBuiltinPath(), 'skills').toLowerCase();
  } catch (_) {}

  if (
    lowerName.startsWith('builtin-') ||
    lowerName.includes('builtin') ||
    lowerPath.includes('builtin') ||
    (builtinSkillsPath && lowerPath.startsWith(builtinSkillsPath)) ||
    isProtectedResource(physicalPath)
  ) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  const globalSkillsJson = getGlobalSkillsJsonPath();
  if (enable) {
    removeExcludeFromJsonConfig(globalSkillsJson, skillName, physicalPath);
    if (altName) removeExcludeFromJsonConfig(globalSkillsJson, altName, physicalPath);
  } else {
    addExcludeToJsonConfig(globalSkillsJson, skillName, physicalPath);
  }
}

// Toggle skill for a project (or multiple project folders): 'enable' (add to entries), 'disable' (add to exclude), 'reset' (clear override)
async function toggleSkillProject(wsRootOrRoots, skillPhysicalPath, skillName, action, lang) {
  if (!wsRootOrRoots || (Array.isArray(wsRootOrRoots) && wsRootOrRoots.length === 0)) {
    throw new Error(lang === 'ru' ? 'Нет открытой рабочей области.' : 'No open workspace folder.');
  }
  const roots = Array.isArray(wsRootOrRoots) ? wsRootOrRoots : [wsRootOrRoots];
  for (const wsRoot of roots) {
    if (!wsRoot) continue;
    const configPath = getWorkspaceSkillConfigPath(wsRoot);
    const dirName = skillPhysicalPath ? path.basename(skillPhysicalPath) : skillName;
    const nameToUse = skillName || dirName;

    if (action === 'enable' || action === 'include' || action === true) {
      addEntryToJsonConfig(configPath, skillPhysicalPath, {}, wsRoot);
      removeExcludeFromJsonConfig(configPath, nameToUse);
      removeExcludeFromJsonConfig(configPath, dirName);
    } else if (action === 'disable' || action === 'exclude' || action === false) {
      removeEntryFromJsonConfig(configPath, skillPhysicalPath);
      addExcludeToJsonConfig(configPath, nameToUse);
    } else if (action === 'reset' || action === 'default') {
      removeEntryFromJsonConfig(configPath, skillPhysicalPath);
      removeExcludeFromJsonConfig(configPath, nameToUse);
      removeExcludeFromJsonConfig(configPath, dirName);
    }
  }
}

// Connect an external folder to plugins.json or skills.json
async function connectFolder(arg1, arg2, arg3, arg4, arg5) {
  let category, folderPath, wsRoot, lang;
  if (arg1 === 'workspace' || arg1 === 'global') {
    // 5-arg signature: (targetType, category, folderPath, wsRoot, lang)
    category = arg2;
    folderPath = arg3;
    wsRoot = arg1 === 'workspace' ? arg4 : null;
    lang = arg5 || 'en';
  } else {
    // 4-arg signature: (category, folderPath, wsRoot, lang)
    category = arg1;
    folderPath = arg2;
    wsRoot = arg3 || null;
    lang = arg4 || 'en';
  }

  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error(lang === 'ru' ? 'Указанная папка не существует.' : 'Selected folder does not exist.');
  }

  const isPlugin = category === 'plugin' || category === 'plugins';
  let configPath = '';
  if (wsRoot) {
    configPath = isPlugin ? getWorkspacePluginConfigPath(wsRoot) : getWorkspaceSkillConfigPath(wsRoot);
    addEntryToJsonConfig(configPath, folderPath, {}, wsRoot);
  } else {
    configPath = isPlugin ? getGlobalPluginsJsonPath() : getGlobalSkillsJsonPath();
    addEntryToJsonConfig(configPath, folderPath);
    if (isPlugin) {
      ensureDefaultPluginsFolderInGlobalConfig();
    }
  }
}

// Disconnect/remove an external folder from plugins.json or skills.json
async function disconnectFolder(sourceFile, configuredPath, lang) {
  if (!sourceFile || !fs.existsSync(sourceFile)) {
    throw new Error(lang === 'ru' ? 'Конфигурационный файл не найден.' : 'Config file not found.');
  }
  removeEntryFromJsonConfig(sourceFile, configuredPath);
  if (sourceFile === getGlobalPluginsJsonPath()) {
    cleanupDefaultPluginsFolderInGlobalConfig();
  }
}

// Backward-compatible generic toggle action (invokes native methods without file moving)
async function toggleItem(activePath, storagePath, itemId, enable, lang, category, physicalPath = null) {
  if (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin'))) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (category === 'plugin') {
    await togglePluginGlobal(itemId, enable, lang, physicalPath);
  } else if (category === 'skill') {
    await toggleSkillGlobal(itemId, enable, lang, null, physicalPath);
  }
}

// Toggle hook enabled flag directly in hooks.json
async function toggleHook(physicalPath, hookName, enabled, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content[hookName]) {
    content[hookName].enabled = enabled;
  } else if (content && content.hooks && Array.isArray(content.hooks)) {
    const item = content.hooks.find(h => (h.name === hookName || h.id === hookName));
    if (item) item.enabled = enabled;
  }
  fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
}

// Delete hook from hooks.json
async function deleteHook(physicalPath, hookName, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content[hookName]) {
    delete content[hookName];
  } else if (content && content.hooks && Array.isArray(content.hooks)) {
    content.hooks = content.hooks.filter(h => !(h.name === hookName || h.id === hookName));
  }
  fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
}

// Toggle MCP server enabled/disabled
async function toggleMcpServer(physicalPath, serverName, enabled, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content.mcpServers && content.mcpServers[serverName]) {
    if (enabled) {
      delete content.mcpServers[serverName].disabled;
    } else {
      content.mcpServers[serverName].disabled = true;
    }
    fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
  }
}

// Delete MCP server from mcp_config.json
async function deleteMcpServer(physicalPath, serverName, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content.mcpServers && content.mcpServers[serverName]) {
    delete content.mcpServers[serverName];
    fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
  }
}

// Move MCP server between mcp_config.json files
async function moveMcpServer(serverName, sourcePath, targetPath, lang) {
  if (sourcePath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const srcContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!srcContent.mcpServers || !srcContent.mcpServers[serverName]) {
    throw new Error(`MCP server "${serverName}" not found in source.`);
  }
  const serverConfig = srcContent.mcpServers[serverName];

  // Target file
  let tgtContent = { mcpServers: {} };
  if (fs.existsSync(targetPath)) {
    try {
      tgtContent = JSON.parse(fs.readFileSync(targetPath, 'utf8')) || { mcpServers: {} };
      if (!tgtContent.mcpServers) tgtContent.mcpServers = {};
    } catch (e) {
      tgtContent = { mcpServers: {} };
    }
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  tgtContent.mcpServers[serverName] = serverConfig;
  delete srcContent.mcpServers[serverName];

  fs.writeFileSync(targetPath, JSON.stringify(tgtContent, null, 2), 'utf8');
  fs.writeFileSync(sourcePath, JSON.stringify(srcContent, null, 2), 'utf8');
}

// Move hook between hooks.json files
async function moveHook(hookName, sourcePath, targetPath, lang) {
  if (sourcePath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const srcContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!srcContent[hookName]) {
    throw new Error(`Hook "${hookName}" not found in source.`);
  }
  const hookConfig = srcContent[hookName];

  // Target file
  let tgtContent = {};
  if (fs.existsSync(targetPath)) {
    try {
      tgtContent = JSON.parse(fs.readFileSync(targetPath, 'utf8')) || {};
    } catch (e) {
      tgtContent = {};
    }
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  tgtContent[hookName] = hookConfig;
  delete srcContent[hookName];

  fs.writeFileSync(targetPath, JSON.stringify(tgtContent, null, 2), 'utf8');
  fs.writeFileSync(sourcePath, JSON.stringify(srcContent, null, 2), 'utf8');
}

// Create new resource (plugin, skill, workflow, rule)
async function createItem(data, lang) {
  const {
    category,
    targetType,
    targetId,
    name,
    displayName,
    description,
    version,
    author,
    createScripts,
    createExamples,
    createDocs,
    createResources,
    activePluginsPath,
    activeSkillsPath,
    activeWorkflowsPath
  } = data;

  let targetDir = '';
  if (targetType === 'global') {
    if (category === 'skill') targetDir = path.join(activeSkillsPath, name);
    else if (category === 'workflow') targetDir = activeWorkflowsPath;
    else if (category === 'plugin') targetDir = path.join(activePluginsPath, name);
    else if (category === 'rule') {
      throw new Error(lang === 'ru' 
        ? 'Создание глобальных правил заблокировано: система поддерживает только 2 глобальных системных файла правил (GEMINI.md и AGENTS.md).' 
        : 'Global rule creation is locked: only 2 system global rule files are supported (GEMINI.md and AGENTS.md).');
    }
  } else if (targetType === 'workspace') {
    const wsRoot = targetId;
    if (category === 'plugin') targetDir = path.join(wsRoot, '.agents', 'plugins', name);
    else if (category === 'skill') targetDir = path.join(wsRoot, '.agents', 'skills', name);
    else if (category === 'workflow') targetDir = path.join(wsRoot, '.agents', 'workflows');
    else if (category === 'rule') targetDir = path.join(wsRoot, '.agents', 'rules');
  } else if (targetType === 'plugin') {
    if (category === 'skill') targetDir = path.join(targetId, 'skills', name);
    else if (category === 'rule') targetDir = path.join(targetId, 'rules');
  }

  if (!targetDir) {
    throw new Error(getTranslation('invalidPaths', lang));
  }

  if (category === 'workflow') {
    const workflowFile = path.join(targetDir, `${name}.md`);
    if (fs.existsSync(workflowFile)) {
      throw new Error(`File ${name}.md already exists in destination.`);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const cleanTitle = displayName || name;
    const nameField = displayName ? `name: "${displayName}"\n` : '';
    const content = `---
${nameField}description: "${escapeJsString(description || '')}"
---

#### ${cleanTitle}

## Шаги / Steps
1. Шаг первый...
`;
    fs.writeFileSync(workflowFile, content, 'utf8');
    vscode.window.showInformationMessage(`Workflow "${name}" created successfully.`);
  } else if (category === 'rule') {
    const ruleFile = path.join(targetDir, `${name}.md`);
    if (fs.existsSync(ruleFile)) {
      throw new Error(`File ${name}.md already exists in destination.`);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const cleanTitle = displayName || name;
    const content = `---
trigger: always_on
description: "${escapeJsString(description || cleanTitle)}"
---

# ${cleanTitle}

## Правила / Rules
- Описание правила...
`;
    fs.writeFileSync(ruleFile, content, 'utf8');
    vscode.window.showInformationMessage(`Rule "${name}" created successfully.`);
  } else {
    if (fs.existsSync(targetDir)) {
      throw new Error(`Folder "${name}" already exists in destination.`);
    }
    fs.mkdirSync(targetDir, { recursive: true });
    if (category === 'plugin') {
      fs.mkdirSync(path.join(targetDir, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(targetDir, 'rules'), { recursive: true });
      const manifest = {
        name: name,
        displayName: displayName || name,
        description: description || '',
        version: version || '1.0.0',
        author: author || ''
      };
      fs.writeFileSync(path.join(targetDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Plugin "${name}" created successfully.`);
    } else if (category === 'skill') {
      if (createScripts) fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
      if (createExamples) fs.mkdirSync(path.join(targetDir, 'examples'), { recursive: true });
      if (createDocs) fs.mkdirSync(path.join(targetDir, 'docs'), { recursive: true });
      if (createResources) fs.mkdirSync(path.join(targetDir, 'resources'), { recursive: true });

      const cleanTitle = displayName || name;
      const nameField = displayName ? `name: "${displayName}"\n` : '';
      const content = `---
${nameField}description: "${escapeJsString(description || '')}"
---

#### ${cleanTitle}

## Когда использовать (When to use)
- Используй этот навык при...

## Как использовать (How to use)
1. Шаги...
`;
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf8');
      vscode.window.showInformationMessage(`Skill "${name}" created successfully.`);
    }
  }
}

// Delete item (with protection for built-in and global protected items)
async function deleteItem(category, itemId, displayName, physicalPath, lang, activeSkillsPath) {
  // Builtin and protected checks
  const lowerId = (itemId || '').toLowerCase();
  if (
    (lowerId && (lowerId.startsWith('builtin-') || lowerId.includes('builtin'))) ||
    isProtectedResource(physicalPath)
  ) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }

  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File or folder not found: ${physicalPath}`);
  }

  if (category === 'plugin') {
    const optDeleteAll = lang === 'ru' ? 'Удалить всё' : 'Delete all';
    const optMoveSkills = lang === 'ru' ? 'Переместить вложенные навыки' : 'Move nested skills';
    
    const skillsDir = path.join(physicalPath, 'skills');
    const hasSkills = fs.existsSync(skillsDir) && fs.readdirSync(skillsDir).filter(f => {
      const p = path.join(skillsDir, f);
      return fs.statSync(p).isDirectory();
    }).length > 0;

    let choice;
    if (hasSkills) {
      choice = await vscode.window.showWarningMessage(
        lang === 'ru' 
          ? `Удалить плагин "${displayName || itemId}"? Внутри него есть вложенные навыки. Вы можете переместить их перед удалением.`
          : `Delete plugin "${displayName || itemId}"? It contains nested skills. You can move them before deleting.`,
        { modal: true },
        optDeleteAll,
        optMoveSkills
      );
    } else {
      choice = await vscode.window.showWarningMessage(
        lang === 'ru' 
          ? `Вы уверены, что хотите удалить плагин "${displayName || itemId}"?`
          : `Are you sure you want to delete plugin "${displayName || itemId}"?`,
        { modal: true },
        lang === 'ru' ? 'Да' : 'Yes'
      );
      if (choice === (lang === 'ru' ? 'Да' : 'Yes')) {
        choice = optDeleteAll;
      }
    }

    if (!choice) return false;

    if (choice === optMoveSkills) {
      const optGlobal = lang === 'ru' ? 'Глобальные навыки' : 'Global Skills';
      const optWorkspace = lang === 'ru' ? 'Навыки текущей рабочей области' : 'Workspace Skills';
      
      const destChoice = await vscode.window.showQuickPick(
        [
          { label: optGlobal, id: 'global' },
          { label: optWorkspace, id: 'workspace' }
        ],
        { placeHolder: lang === 'ru' ? 'Выберите назначение для вложенных навыков' : 'Select destination for nested skills' }
      );
      
      if (!destChoice) return false;

      let targetSkillsDir = '';
      if (destChoice.id === 'global') {
        targetSkillsDir = activeSkillsPath;
      } else {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
          throw new Error(lang === 'ru' ? 'Нет открытой рабочей области.' : 'No open workspace folder.');
        }
        targetSkillsDir = path.join(wsFolder.uri.fsPath, '.agents', 'skills');
      }

      if (!fs.existsSync(targetSkillsDir)) {
        fs.mkdirSync(targetSkillsDir, { recursive: true });
      }

      const files = fs.readdirSync(skillsDir);
      for (const f of files) {
        const srcPath = path.join(skillsDir, f);
        if (fs.statSync(srcPath).isDirectory()) {
          let destPath = path.join(targetSkillsDir, f);
          let counter = 1;
          while (fs.existsSync(destPath)) {
            destPath = path.join(targetSkillsDir, `${f}-${counter}`);
            counter++;
          }
          fs.renameSync(srcPath, destPath);
        }
      }
      
      vscode.window.showInformationMessage(
        lang === 'ru' ? 'Вложенные навыки успешно перемещены.' : 'Nested skills moved successfully.'
      );
    }

    if (choice === optDeleteAll || choice === optMoveSkills) {
      fs.rmSync(physicalPath, { recursive: true, force: true });
      vscode.window.showInformationMessage(
        lang === 'ru' ? `Плагин "${displayName || itemId}" успешно удален.` : `Plugin "${displayName || itemId}" deleted successfully.`
      );
      return true;
    }
    return false;
  } else {
    const confirmMsg = lang === 'ru'
      ? `Вы уверены, что хотите удалить ${category === 'skill' ? 'навык' : category === 'workflow' ? 'воркфлоу' : category === 'rule' ? 'правило' : 'хук'} "${displayName || itemId}"?`
      : `Are you sure you want to delete ${category === 'skill' ? 'skill' : category === 'workflow' ? 'workflow' : category === 'rule' ? 'rule' : 'hook'} "${displayName || itemId}"?`;
    
    const choice = await vscode.window.showWarningMessage(
      confirmMsg,
      { modal: true },
      lang === 'ru' ? 'Да' : 'Yes'
    );

    if (choice === (lang === 'ru' ? 'Да' : 'Yes')) {
      if (fs.statSync(physicalPath).isDirectory()) {
        fs.rmSync(physicalPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(physicalPath);
      }
      vscode.window.showInformationMessage(
        lang === 'ru' ? 'Ресурс успешно удален.' : 'Resource deleted successfully.'
      );
      return true;
    }
    return false;
  }
}

// Move item with protection checks for built-in skills and protected files
async function moveItem(physicalPath, targetDir, options = {}) {
  const lang = typeof options === 'string' ? options : (options && options.lang ? options.lang : 'en');
  const overwrite = typeof options === 'object' && options ? !!options.overwrite : false;
  const enableInWorkspaceRoot = typeof options === 'object' && options ? options.enableInWorkspaceRoot : null;
  const category = typeof options === 'object' && options ? options.category : null;

  if (!physicalPath || !targetDir) {
    return { success: false, message: 'Invalid paths' };
  }
  if (isProtectedResource(physicalPath)) {
    return { success: false, message: getTranslation('cannotModifyBuiltin', lang) };
  }
  if (!fs.existsSync(physicalPath)) {
    return { success: false, message: `Source file does not exist: ${physicalPath}` };
  }

  if (category === 'mcp') {
    const serverName = (options && options.itemId) || path.basename(physicalPath);
    const targetFile = targetDir.endsWith('.json') ? targetDir : path.join(targetDir, 'mcp_config.json');
    try {
      await moveMcpServer(serverName, physicalPath, targetFile, lang);
      return { success: true, targetPath: targetFile, filename: serverName };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  if (category === 'hook') {
    const hookName = (options && options.itemId) || path.basename(physicalPath);
    const targetFile = targetDir.endsWith('.json') ? targetDir : path.join(targetDir, 'hooks.json');
    try {
      await moveHook(hookName, physicalPath, targetFile, lang);
      return { success: true, targetPath: targetFile, filename: hookName };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  const filename = path.basename(physicalPath);
  const targetFile = path.join(targetDir, filename);

  if (path.resolve(physicalPath).toLowerCase() === path.resolve(targetFile).toLowerCase()) {
    return {
      success: false,
      alreadyInFolder: true,
      message: getTranslation('alreadyInFolder', lang).replace('{itemId}', filename)
    };
  }

  if (fs.existsSync(targetFile)) {
    if (!overwrite) {
      return {
        success: false,
        conflict: true,
        filename: filename,
        targetPath: targetFile,
        message: getTranslation('overwritePrompt', lang).replace('{itemId}', filename)
      };
    }
    // Overwrite confirmed: remove target first
    try {
      const stat = fs.statSync(targetFile);
      if (stat.isDirectory()) {
        fs.rmSync(targetFile, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetFile);
      }
    } catch (err) {
      return { success: false, message: `Failed to remove existing file: ${err.message}` };
    }
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  safeMoveDir(physicalPath, targetFile);

  // Synchronize configuration manifests
  try {
    const isSkill = category === 'skill' || (physicalPath.endsWith('.md') && physicalPath.toLowerCase().includes('skills'));
    const isPlugin = category === 'plugin' || fs.existsSync(path.join(targetFile, 'plugin.json'));

    if (isSkill) {
      const globalSkillsJson = getGlobalSkillsJsonPath();
      removeExcludeFromJsonConfig(globalSkillsJson, filename);
      if (enableInWorkspaceRoot) {
        await toggleSkillProject(enableInWorkspaceRoot, targetFile, filename, 'enable', lang);
      }
    } else if (isPlugin) {
      const globalPluginsJson = getGlobalPluginsJsonPath();
      setPluginManifestDisabled(targetFile, false);
      removeAntigravityPluginFromConfig(filename);
      removeExcludeFromJsonConfig(globalPluginsJson, filename);
    }
  } catch (syncErr) {
    logDebug(`Error syncing configs after move: ${syncErr.message}`);
  }

  return { success: true, targetPath: targetFile, filename: filename };
}

// Migrate storage folders to new structure on storage path change
async function migrateStorage(oldPath, newPath, lang) {
  if (!fs.existsSync(oldPath)) return;
  const entries = fs.readdirSync(oldPath, { withFileTypes: true });
  if (entries.length === 0) return;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: getTranslation('migratingTitle', lang),
    cancellable: false
  }, async () => {
    let count = 0;
    const categories = ['plugins', 'skills', 'workflows'];
    
    // Ensure destination folders exist
    categories.forEach(cat => {
      const destCatPath = path.join(newPath, cat);
      if (!fs.existsSync(destCatPath)) {
        fs.mkdirSync(destCatPath, { recursive: true });
      }
    });

    for (const entry of entries) {
      const src = path.join(oldPath, entry.name);
      
      if (categories.includes(entry.name)) {
        if (entry.isDirectory()) {
          try {
            const subEntries = fs.readdirSync(src);
            for (const subName of subEntries) {
              const subSrc = path.join(src, subName);
              const subDest = path.join(newPath, entry.name, subName);
              if (fs.existsSync(subDest)) {
                fs.renameSync(subDest, subDest + '_bak_' + Date.now());
              }
              safeMoveDir(subSrc, subDest);
              count++;
            }
            fs.rmdirSync(src);
          } catch (e) {
            logDebug(`Error migrating subcategory ${entry.name}: ${e.message}`);
          }
        }
      } else {
        // Legacy root plugin folder, migrate to newPath/plugins/
        const dest = path.join(newPath, 'plugins', entry.name);
        try {
          if (fs.existsSync(dest)) {
            fs.renameSync(dest, dest + '_bak_' + Date.now());
          }
          safeMoveDir(src, dest);
          count++;
        } catch (e) {
          logDebug(`Error migrating legacy item ${entry.name}: ${e.message}`);
        }
      }
    }

    const msg = getTranslation('migrationFinished', lang).replace('{count}', count);
    vscode.window.showInformationMessage(msg);
  });
}

// Resolve conflict between active and storage versions
async function resolveConflict(data, lang) {
  const { id, category, resolution, activePath, storagePath, isDir } = data;
  logDebug(`resolveConflict id=${id}, resolution=${resolution}, category=${category}`);
  
  if (resolution === 'merge') {
    if (isDir) {
      twoWayMergeDirs(activePath, storagePath);
      if (fs.existsSync(activePath)) {
        fs.rmSync(activePath, { recursive: true, force: true });
      }
      createLink(storagePath, activePath, true, category);
    } else {
      const parsed = path.parse(storagePath);
      const backupName = `${parsed.name}_backup_${Date.now()}${parsed.ext}`;
      const backupPath = path.join(parsed.dir, backupName);
      fs.copyFileSync(storagePath, backupPath);
      if (fs.existsSync(activePath)) {
        fs.unlinkSync(activePath);
      }
      createLink(storagePath, activePath, false, category);
    }
    vscode.window.showInformationMessage(getTranslation('mergeSuccess', lang));
  } else if (resolution === 'active') {
    if (fs.existsSync(storagePath)) {
      fs.rmSync(storagePath, { recursive: true, force: true });
    }
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  } else if (resolution === 'storage') {
    if (fs.existsSync(activePath)) {
      fs.rmSync(activePath, { recursive: true, force: true });
    }
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  } else if (resolution === 'keepBoth') {
    const parsed = path.parse(storagePath);
    const backupName = `${parsed.name}_backup_${Date.now()}${parsed.ext}`;
    const backupPath = path.join(parsed.dir, backupName);
    fs.renameSync(storagePath, backupPath);
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  }
}

module.exports = {
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
  moveItem,
  isProtectedResource,
  resolveConflict,
  migrateStorage
};


