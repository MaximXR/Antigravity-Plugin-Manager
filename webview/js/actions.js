// Card and resource mutation actions
function togglePluginGlobal(pluginId, enable, physicalPath = null) {
  const plugin = pluginsData.find(p => p.id === pluginId || p.name === pluginId || (p.physicalPath && physicalPath && p.physicalPath === physicalPath));
  const count = (plugin && plugin.skillsCount) ? plugin.skillsCount : ((plugin && plugin.skills) ? plugin.skills.length : 1);
  const etaMs = calculatePluginSyncEta(pluginId, enable);
  setSyncingState(etaMs, enable ? count : 0);

  // Non-blocking: only show loader for this specific plugin, never lock other items
  trackItemLoading(pluginId);
  if (plugin && plugin.id && plugin.id !== pluginId) {
    trackItemLoading(plugin.id);
  }

  if (activePluginId && (activePluginId === pluginId || (plugin && activePluginId === plugin.id))) {
    const dSwitch = document.getElementById('detail-switch-container');
    const dLoader = document.getElementById('detail-loader');
    if (dSwitch && dLoader) {
      dSwitch.style.display = 'none';
      dLoader.style.display = 'block';
    }
  }
  vscode.postMessage({ command: 'togglePluginGlobal', id: pluginId, enable: enable, physicalPath: physicalPath, etaMs: etaMs, skillsCount: count });
}
window.togglePluginGlobal = togglePluginGlobal;

function togglePluginProject(workspaceRoot, pluginPath, pluginId, action) {
  const isEnabling = (action === 'enable' || action === true);
  const plugin = pluginsData.find(p => p.id === pluginId || p.name === pluginId);
  const count = (plugin && plugin.skillsCount) ? plugin.skillsCount : ((plugin && plugin.skills) ? plugin.skills.length : 1);
  const etaMs = calculatePluginSyncEta(pluginId, isEnabling);
  setSyncingState(etaMs, isEnabling ? count : 0);

  let effectiveWsRoot = workspaceRoot;
  let targetMode = multiRootTargetMode || 'primary';
  if (workspaceFoldersList && workspaceFoldersList.length > 1) {
    if (targetMode === 'specific' && multiRootSpecificFolder) {
      effectiveWsRoot = multiRootSpecificFolder;
    }
  }

  vscode.postMessage({
    command: 'togglePluginProject',
    workspaceRoot: effectiveWsRoot,
    targetMode: (workspaceFoldersList && workspaceFoldersList.length > 1) ? targetMode : undefined,
    pluginPath: pluginPath,
    id: pluginId,
    action: action,
    etaMs: etaMs,
    skillsCount: count
  });
}
window.togglePluginProject = togglePluginProject;

function toggleSkillGlobal(skillId, enable, altName = null, physicalPath = null) {
  setSyncingState(2100);
  // Non-blocking: only show loader for this specific skill, never lock other items
  trackItemLoading(skillId);
  vscode.postMessage({ command: 'toggleSkillGlobal', id: skillId, enable: enable, altName: altName || null, physicalPath: physicalPath || null });
}
window.toggleSkillGlobal = toggleSkillGlobal;

function toggleSkillProject(workspaceRoot, skillPath, skillId, action) {
  setSyncingState(2100);

  let effectiveWsRoot = workspaceRoot;
  let targetMode = multiRootTargetMode || 'primary';
  if (workspaceFoldersList && workspaceFoldersList.length > 1) {
    if (targetMode === 'specific' && multiRootSpecificFolder) {
      effectiveWsRoot = multiRootSpecificFolder;
    }
  }

  vscode.postMessage({
    command: 'toggleSkillProject',
    workspaceRoot: effectiveWsRoot,
    targetMode: (workspaceFoldersList && workspaceFoldersList.length > 1) ? targetMode : undefined,
    physicalPath: skillPath,
    id: skillId,
    action: action
  });
}
window.toggleSkillProject = toggleSkillProject;

function disconnectFolder(sourceFile, configuredPath) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'disconnectFolder',
    sourceFile: sourceFile,
    configuredPath: configuredPath
  });
}
window.disconnectFolder = disconnectFolder;

function toggleItem(category, itemId, enable, physicalPath = null) {
  setSyncingState(2100);
  if (category === 'plugin') {
    togglePluginGlobal(itemId, enable, physicalPath);
  } else if (category === 'skill') {
    toggleSkillGlobal(itemId, enable, null, physicalPath);
  } else {
    // Non-blocking: only show loader for this specific item, never lock other items
    trackItemLoading(itemId);
    vscode.postMessage({ command: 'toggle', category: category, id: itemId, enable: enable });
  }
}
window.toggleItem = toggleItem;

function openItemFolder(category, itemId, isEnabled, isLocal, physicalPath) {
  vscode.postMessage({
    command: 'openItemFolder',
    category: category,
    id: itemId,
    isEnabled: isEnabled,
    isLocal: !!isLocal,
    physicalPath: physicalPath || ''
  });
}
window.openItemFolder = openItemFolder;

function openFileInEditor(category, physicalPath, itemId) {
  vscode.postMessage({
    command: 'openFileInEditor',
    category: category,
    physicalPath: physicalPath,
    id: itemId
  });
}
window.openFileInEditor = openFileInEditor;

function toggleMcpServer(physicalPath, serverName, enable) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'toggleMcpServer',
    physicalPath: physicalPath,
    serverName: serverName,
    enable: enable
  });
}
window.toggleMcpServer = toggleMcpServer;

function moveItem(itemId, category, sourcePluginId, isEnabled, isLocal, physicalPath) {
  vscode.postMessage({
    command: 'requestMove',
    itemId: itemId,
    category: category,
    sourcePluginId: sourcePluginId,
    isEnabled: isEnabled,
    isLocal: !!isLocal,
    physicalPath: physicalPath || ''
  });
}
window.moveItem = moveItem;

function deleteItem(category, itemId, displayName, physicalPath) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'deleteItem',
    category: category,
    itemId: itemId,
    displayName: displayName || itemId,
    physicalPath: physicalPath || ''
  });
}
window.deleteItem = deleteItem;

function toggleHook(physicalPath, hookName, enable) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'toggleHook',
    physicalPath: physicalPath,
    hookName: hookName,
    enable: enable
  });
}
window.toggleHook = toggleHook;

function deleteHook(hookName, physicalPath) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'deleteHook',
    hookName: hookName,
    physicalPath: physicalPath
  });
}
window.deleteHook = deleteHook;

function deleteMcpServer(serverName, physicalPath) {
  setSyncingState(2100);
  vscode.postMessage({
    command: 'deleteMcpServer',
    serverName: serverName,
    physicalPath: physicalPath
  });
}
window.deleteMcpServer = deleteMcpServer;

function moveMcpServer(serverName, physicalPath) {
  moveItem(serverName, 'mcp', null, false, false, physicalPath);
}
window.moveMcpServer = moveMcpServer;

function moveHook(hookName, physicalPath) {
  moveItem(hookName, 'hook', null, false, false, physicalPath);
}
window.moveHook = moveHook;

function editMetadata(field) {
  if (!activePluginId) return;
  const plugin = pluginsData.find(p => p.id === activePluginId);
  if (!plugin) return;
  
  let currentValue = '';
  if (field === 'displayName') currentValue = plugin.displayName;
  else if (field === 'name') currentValue = plugin.name;
  else if (field === 'description') currentValue = plugin.description;
  else if (field === 'version') currentValue = plugin.version;
  else if (field === 'author') currentValue = plugin.author;

  vscode.postMessage({
    command: 'editPluginMetadata',
    id: activePluginId,
    isEnabled: plugin.isEnabled,
    field: field,
    value: currentValue
  });
}
window.editMetadata = editMetadata;
