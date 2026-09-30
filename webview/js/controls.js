// Project selectors, workspace scopes, connected folders, and tab switching
let isConfigReposCollapsed = window.isConfigReposCollapsed || false;
function toggleConfigReposSection() {
  isConfigReposCollapsed = !isConfigReposCollapsed;
  window.isConfigReposCollapsed = isConfigReposCollapsed;
  const body = document.getElementById('config-repos-body');
  const chevron = document.getElementById('config-repos-chevron');
  if (body) body.classList.toggle('collapsed', isConfigReposCollapsed);
  if (chevron) chevron.classList.toggle('collapsed', isConfigReposCollapsed);
}
window.toggleConfigReposSection = toggleConfigReposSection;

function renderAntigravityProjectsSelector() {
  const container = document.getElementById('project-selector-container');
  const select = document.getElementById('antigravity-project-select');
  if (!container || !select) return;

  const hasNative = antigravityProjectsList && antigravityProjectsList.length > 0;
  const hasCustom = customFoldersList && customFoldersList.length > 0;

  if (!hasNative && !hasCustom) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  let html = '';
  // 1. Option for "No project (Global context only)"
  const isNoneSel = !activeProjectId ? 'selected' : '';
  html += `<option value="" ${isNoneSel} style="background-color: #181825; color: #94a3b8;">${escapeHtml(t('noProjectGlobalOnly', '🌐 Без проекта (только глобальный контекст)'))}</option>`;

  // 2. Native Antigravity Projects group
  if (hasNative) {
    html += `<optgroup label="${escapeHtml(t('antigravityProjectsGroup', 'Проекты Antigravity'))}">`;
    antigravityProjectsList.forEach(p => {
      const isSel = p.id === activeProjectId ? 'selected' : '';
      const folderCount = p.folders ? p.folders.length : 1;
      const countTag = folderCount > 1 ? ` (${folderCount})` : '';
      html += `<option value="${escapeQuotes(p.id)}" ${isSel} style="background-color: #181825; color: #f8fafc;">${escapeHtml(p.name)}${countTag}</option>`;
    });
    html += `</optgroup>`;
  }

  // 3. Custom Folders group
  if (hasCustom) {
    html += `<optgroup label="${escapeHtml(t('customFoldersGroup', 'Пользовательские папки'))}">`;
    customFoldersList.forEach(c => {
      const isSel = c.id === activeProjectId ? 'selected' : '';
      const displayPath = c.primaryPath || (c.folders && c.folders[0] ? c.folders[0].fsPath : '');
      const pathHint = displayPath ? ` (${displayPath})` : '';
      html += `<option value="${escapeQuotes(c.id)}" ${isSel} title="${escapeQuotes(displayPath)}" style="background-color: #181825; color: #a5b4fc;">📁 ${escapeHtml(c.name)}${escapeHtml(pathHint)} [${t('badgeCustomFolder', 'Пользовательская')}]</option>`;
    });
    html += `</optgroup>`;
  }

  // 4. Action: Choose custom folder
  html += `<option value="__browse_folder__" style="background-color: #1e1e2e; color: #38bdf8; font-weight: 600;">${escapeHtml(t('optChooseCustomFolder', '📂 + Выбрать другую папку...'))}</option>`;

  // 5. Action: Remove active custom folder if custom is currently active
  if (activeProjectId && activeProjectId.startsWith('custom:')) {
    html += `<option value="__remove_current_custom__" style="background-color: #1e1e2e; color: #f87171; font-weight: 500;">${escapeHtml(t('optRemoveCustomFolder', '✕ Убрать текущую папку из списка...'))}</option>`;
  }

  select.innerHTML = html;

  // Set tooltip on select element showing full path of active project
  let currentActivePath = '';
  if (activeProjectId) {
    if (activeProjectId.startsWith('custom:')) {
      const c = (customFoldersList || []).find(item => item.id === activeProjectId);
      if (c) currentActivePath = c.primaryPath || (c.folders && c.folders[0] ? c.folders[0].fsPath : '');
    } else {
      const p = (antigravityProjectsList || []).find(item => item.id === activeProjectId);
      if (p) currentActivePath = p.primaryPath || (p.folders && p.folders[0] ? p.folders[0].fsPath : '');
    }
  }
  select.title = currentActivePath || (activeProjectId || '');
}
window.renderAntigravityProjectsSelector = renderAntigravityProjectsSelector;

function switchAntigravityProject(projectId) {
  if (projectId === '__browse_folder__') {
    renderAntigravityProjectsSelector();
    vscode.postMessage({
      command: 'chooseCustomWorkspaceFolder'
    });
    return;
  }
  if (projectId === '__remove_current_custom__') {
    renderAntigravityProjectsSelector();
    removeCurrentCustomFolder();
    return;
  }

  activeProjectId = projectId || null;
  document.body.classList.add('loading');
  vscode.postMessage({
    command: 'switchAntigravityProject',
    projectId: activeProjectId
  });
}
window.switchAntigravityProject = switchAntigravityProject;

function refreshAntigravityProjects(btnEl) {
  if (btnEl) {
    const icon = btnEl.querySelector('.refresh-spin-icon');
    if (icon) icon.classList.add('rotating');
  }
  vscode.postMessage({
    command: 'refreshAntigravityProjects'
  });
}
window.refreshAntigravityProjects = refreshAntigravityProjects;

function changeMultiRootTargetMode(mode) {
  multiRootTargetMode = mode;
  const specificSelect = document.getElementById('multi-root-specific-folder-select');
  if (specificSelect) {
    specificSelect.style.display = mode === 'specific' ? 'inline-block' : 'none';
  }
}
window.changeMultiRootTargetMode = changeMultiRootTargetMode;

function changeMultiRootSpecificFolder(folderPath) {
  multiRootSpecificFolder = folderPath;
}
window.changeMultiRootSpecificFolder = changeMultiRootSpecificFolder;

function renderMultiRootTargetControls() {
  const row = document.getElementById('multi-root-target-row');
  const modeSelect = document.getElementById('multi-root-target-mode');
  const specSelect = document.getElementById('multi-root-specific-folder-select');
  if (!row) return;

  if (!workspaceFoldersList || workspaceFoldersList.length <= 1) {
    row.style.display = 'none';
    return;
  }

  row.style.display = 'flex';
  if (modeSelect) modeSelect.value = multiRootTargetMode;

  if (specSelect) {
    specSelect.style.display = multiRootTargetMode === 'specific' ? 'inline-block' : 'none';
    specSelect.innerHTML = workspaceFoldersList.map((w, idx) => {
      const isSel = (multiRootSpecificFolder ? w.fsPath === multiRootSpecificFolder : idx === 0) ? 'selected' : '';
      return `<option value="${escapeQuotes(w.fsPath)}" ${isSel} style="background-color: #181825; color: #f8fafc;">${escapeHtml(w.name)}</option>`;
    }).join('');
    if (!multiRootSpecificFolder && workspaceFoldersList.length > 0) {
      multiRootSpecificFolder = workspaceFoldersList[0].fsPath;
    }
  }
}
window.renderMultiRootTargetControls = renderMultiRootTargetControls;

function renderWorkspaceSelector() {
  const blockEl = document.getElementById('workspace-scope-block');
  const titleLabelEl = document.getElementById('workspace-scope-title-label');
  const pathEl = document.getElementById('workspace-scope-path');
  const selectEl = document.getElementById('workspace-selector-select');
  const helpEl = document.getElementById('workspace-scope-help');
  const hintEl = document.getElementById('workspace-multi-hint');
  const removeCustomBtn = document.getElementById('btn-remove-custom-workspace');
  if (!blockEl) return;

  if (!workspaceFoldersList || workspaceFoldersList.length === 0) {
    blockEl.style.display = 'none';
    selectedWorkspaceRoot = null;
    if (pathEl) pathEl.style.display = 'none';
    if (removeCustomBtn) removeCustomBtn.style.display = 'none';
    renderMultiRootTargetControls();
    return;
  }

  blockEl.style.display = 'flex';
  const currentRoot = getActiveWorkspaceRoot();

  // Check if current workspace is a custom user folder
  const isCustomWorkspace = !!(activeProjectId && activeProjectId.startsWith('custom:')) ||
    (customFoldersList || []).some(c => c.id === activeProjectId || (currentRoot && normalizePathStr(c.primaryPath) === normalizePathStr(currentRoot)));

  if (removeCustomBtn) {
    removeCustomBtn.style.display = isCustomWorkspace ? 'inline-flex' : 'none';
  }

  if (workspaceFoldersList.length === 1) {
    const singleWs = workspaceFoldersList[0];
    selectedWorkspaceRoot = singleWs.fsPath;
    if (titleLabelEl) {
      titleLabelEl.textContent = `${t('storageScopeWorkspace', 'Рабочая область')}: ${singleWs.name}`;
    }
    if (pathEl) {
      pathEl.style.display = 'inline-block';
      pathEl.textContent = singleWs.fsPath;
      pathEl.title = `${t('clickToOpenFolder', 'Нажмите, чтобы открыть папку в проводнике')}: ${singleWs.fsPath}`;
    }
    if (selectEl) selectEl.style.display = 'none';
    if (helpEl) helpEl.style.display = 'none';
    if (hintEl) hintEl.style.display = 'none';
    renderMultiRootTargetControls();
    return;
  }

  // Multi-root workspace
  if (titleLabelEl) {
    titleLabelEl.textContent = `${t('storageScopeWorkspace', 'Рабочая область')}:`;
  }
  if (pathEl) {
    if (selectedWorkspaceRoot) {
      pathEl.style.display = 'inline-block';
      pathEl.textContent = selectedWorkspaceRoot;
      pathEl.title = `${t('clickToOpenFolder', 'Нажмите, чтобы открыть папку в проводнике')}: ${selectedWorkspaceRoot}`;
    } else {
      pathEl.style.display = 'none';
    }
  }
  if (helpEl) {
    helpEl.style.display = 'inline-block';
    helpEl.title = t('workspaceMultiRootTooltip', 'В мульти-проектах Antigravity IDE по умолчанию считывает контекст из первой (верхней) основной папки.');
  }
  if (hintEl) {
    hintEl.style.display = 'block';
    hintEl.textContent = `💡 ${t('workspaceSelectorHint', 'Antigravity IDE по умолчанию использует первую (верхнюю) папку как основную. Настройки будут применены к выбранному проекту.')}`;
  }

  if (selectEl) {
    selectEl.style.display = 'inline-block';
    selectEl.innerHTML = workspaceFoldersList.map((w, idx) => {
      const isSelected = w.fsPath === selectedWorkspaceRoot ? 'selected' : '';
      const isPrimary = idx === 0;
      const primaryTag = isPrimary ? ` [${t('workspacePrimaryTag', 'Основной')}]` : '';
      return `<option value="${escapeQuotes(w.fsPath)}" ${isSelected} style="background-color: #181825; color: #f8fafc;">${escapeHtml(w.name)}${primaryTag}</option>`;
    }).join('');

    selectEl.onchange = (e) => {
      selectedWorkspaceRoot = e.target.value;
      if (pathEl) {
        pathEl.textContent = selectedWorkspaceRoot;
        pathEl.title = `${t('clickToOpenFolder', 'Нажмите, чтобы открыть папку в проводнике')}: ${selectedWorkspaceRoot}`;
      }
      renderConnectedFolders();
      renderCurrentTab();
    };
  }

  renderMultiRootTargetControls();
}
window.renderWorkspaceSelector = renderWorkspaceSelector;

function openProjectRootFolder() {
  const wsRoot = getActiveWorkspaceRoot();
  if (wsRoot) {
    vscode.postMessage({
      command: 'openFolder',
      path: wsRoot,
      folderPath: wsRoot
    });
  }
}
window.openProjectRootFolder = openProjectRootFolder;

function removeCurrentCustomFolder() {
  const currentWs = getActiveWorkspaceRoot();
  const customItem = (customFoldersList || []).find(c => c.id === activeProjectId || (currentWs && normalizePathStr(c.primaryPath) === normalizePathStr(currentWs)));
  const folderPath = customItem ? customItem.primaryPath : currentWs;
  if (!folderPath) return;

  const folderName = customItem ? customItem.name : folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'folder';
  const confirmMsg = (t('removeCustomFolderConfirm', 'Убрать пользовательскую папку «{name}» из списка проектов?')).replace('{name}', folderName);

  if (confirm(confirmMsg)) {
    document.body.classList.add('loading');
    vscode.postMessage({
      command: 'removeCustomWorkspaceFolder',
      folderPath: folderPath
    });
  }
}
window.removeCurrentCustomFolder = removeCurrentCustomFolder;

function renderConnectedFolders() {
  const globalContainer = document.getElementById('connected-repos-global-container');
  const globalChipsEl = document.getElementById('connected-repos-global-chips');
  const wsContainer = document.getElementById('connected-repos-workspace-container');
  const wsChipsEl = document.getElementById('connected-repos-workspace-chips');

  const globalList = (connectedFoldersList || []).filter(cf => cf.scope === 'global');
  const wsRoot = getActiveWorkspaceRoot();
  const wsList = (connectedFoldersList || []).filter(cf => {
    if (cf.scope !== 'workspace') return false;
    if (!wsRoot) return true;
    return !cf.workspaceRoot || normalizePathStr(cf.workspaceRoot) === normalizePathStr(wsRoot);
  });

  const renderChipsHtml = (list) => {
    return list.map(cf => {
      const isPlugin = cf.type === 'plugin' || cf.type === 'plugins';
      const isMissing = cf.exists === false;
      const typeIcon = isPlugin ? '🔌' : '⚡';
      const typeLabel = isPlugin ? t('tabPlugins', 'Plugins') : t('tabSkills', 'Skills');
      const folderPath = cf.path || cf.physicalPath || cf.configuredPath || '';
      const folderName = cf.folderName || cf.label || (folderPath ? folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() : '');

      if (isMissing) {
        const tooltip = `${t('folderNotFound', 'Папка не найдена')}: ${folderPath}`;
        return `
          <div class="repo-chip repo-chip-missing" title="${escapeHtml(tooltip)}">
            <span class="repo-chip-badge badge-missing">⚠️ ${t('folderNotFound', 'Не найдена')}</span>
            <span class="repo-chip-icon">${typeIcon}</span>
            <span class="repo-chip-name">${escapeHtml(folderName)}</span>
            <span class="repo-chip-path">${escapeHtml(folderPath)}</span>
            <button class="repo-chip-replace-btn" title="${t('replaceFolderTitle', 'Выбрать новую папку для замены')}" onclick="event.stopPropagation(); replaceConnectedFolder('${escapeQuotes(cf.sourceFile || '')}', '${escapeQuotes(cf.configuredPath || folderPath)}', '${escapeQuotes(cf.workspaceRoot || '')}')">
              <span>↺ ${t('replaceFolder', 'Заменить')}</span>
            </button>
            <button class="repo-chip-disconnect" title="${t('disconnect', 'Disconnect')}" onclick="event.stopPropagation(); disconnectFolder('${escapeQuotes(cf.sourceFile || '')}', '${escapeQuotes(cf.configuredPath || folderPath)}')">×</button>
          </div>
        `;
      }

      const badgeClass = isPlugin ? 'badge-global' : 'badge-workspace';
      const chipTooltip = `${t('clickToOpenFolder', 'Click to open folder in File Explorer')}: ${folderPath} (${typeLabel})`;

      return `
        <div class="repo-chip" title="${escapeHtml(chipTooltip)}" onclick="openConnectedFolder('${escapeQuotes(folderPath)}')">
          <span class="repo-chip-badge ${badgeClass}">${typeLabel}</span>
          <span class="repo-chip-icon">${typeIcon}</span>
          <span class="repo-chip-name">${escapeHtml(folderName)}</span>
          <span class="repo-chip-path">${escapeHtml(folderPath)}</span>
          <button class="repo-chip-disconnect" title="${t('disconnect', 'Disconnect')}" onclick="event.stopPropagation(); disconnectFolder('${escapeQuotes(cf.sourceFile || '')}', '${escapeQuotes(cf.configuredPath || folderPath)}')">×</button>
        </div>
      `;
    }).join('');
  };

  if (globalContainer && globalChipsEl) {
    if (globalList.length === 0) {
      globalContainer.style.display = 'none';
      globalChipsEl.innerHTML = '';
    } else {
      globalContainer.style.display = 'flex';
      globalChipsEl.innerHTML = renderChipsHtml(globalList);
    }
  }

  if (wsContainer && wsChipsEl) {
    if (wsList.length === 0) {
      wsContainer.style.display = 'none';
      wsChipsEl.innerHTML = '';
    } else {
      wsContainer.style.display = 'flex';
      wsChipsEl.innerHTML = renderChipsHtml(wsList);
    }
  }
}
window.renderConnectedFolders = renderConnectedFolders;

function openConnectedFolder(folderPath) {
  if (folderPath) {
    vscode.postMessage({ command: 'openFolder', path: folderPath });
  }
}
window.openConnectedFolder = openConnectedFolder;

function toggleConnectMenu(scope, event) {
  if (event) event.stopPropagation();
  const globalMenu = document.getElementById('connect-menu-global');
  const projectMenu = document.getElementById('connect-menu-project');

  if (scope === 'global') {
    if (projectMenu) projectMenu.style.display = 'none';
    if (globalMenu) {
      globalMenu.style.display = globalMenu.style.display === 'block' ? 'none' : 'block';
    }
  } else {
    if (globalMenu) globalMenu.style.display = 'none';
    if (projectMenu) {
      projectMenu.style.display = projectMenu.style.display === 'block' ? 'none' : 'block';
    }
  }
}
window.toggleConnectMenu = toggleConnectMenu;

function triggerConnectFolder(type, scope) {
  const globalMenu = document.getElementById('connect-menu-global');
  const projectMenu = document.getElementById('connect-menu-project');
  if (globalMenu) globalMenu.style.display = 'none';
  if (projectMenu) projectMenu.style.display = 'none';

  if (scope === 'workspace') {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'connectFolder', type, scope: 'workspace', workspaceRoot: wsRoot });
  } else {
    vscode.postMessage({ command: 'connectFolder', type, scope: 'global' });
  }
}
window.triggerConnectFolder = triggerConnectFolder;

function replaceConnectedFolder(sourceFile, oldPath, wsRoot) {
  vscode.postMessage({
    command: 'replaceConnectedFolder',
    sourceFile,
    oldPath,
    workspaceRoot: wsRoot || getActiveWorkspaceRoot()
  });
}
window.replaceConnectedFolder = replaceConnectedFolder;

// Close connect menus on click outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.connect-dropdown-wrapper')) {
    const gm = document.getElementById('connect-menu-global');
    const pm = document.getElementById('connect-menu-project');
    if (gm) gm.style.display = 'none';
    if (pm) pm.style.display = 'none';
  }
});

function triggerRefresh(btn) {
  document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.add('rotating'));
  document.body.classList.add('loading');
  setSyncingState(1500);
  vscode.postMessage({ command: 'refresh' });
  setTimeout(() => {
    document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
    document.body.classList.remove('loading');
  }, 1200);
}
window.triggerRefresh = triggerRefresh;

function triggerSoftApply(event) {
  if (event) event.stopPropagation();
  if (syncCountdownInterval) {
    clearInterval(syncCountdownInterval);
    syncCountdownInterval = null;
  }
  if (syncHideTimeout) {
    clearTimeout(syncHideTimeout);
    syncHideTimeout = null;
  }
  syncRemainingMs = 0;
  currentSyncSkillsCount = 0;
  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  const strip = document.getElementById('sync-status-strip');
  const btn = document.getElementById('btn-sync-soft-apply');
  if (strip) strip.style.display = 'flex';
  if (badge) {
    badge.className = 'sync-status-badge syncing';
    badge.style.display = 'inline-flex';
    badge.style.opacity = '1';
  }
  if (text) text.textContent = t('syncFinalizing', 'IDE: синхр...');
  if (btn) btn.style.display = 'none';
  vscode.postMessage({ command: 'softApplyIde' });
}
window.triggerSoftApply = triggerSoftApply;

function scrollToStickyNav() {
  if (typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
}
window.scrollToStickyNav = scrollToStickyNav;

function switchTab(tabName) {
  currentTab = tabName;
  activePluginId = null; // Switching tabs exits plugin detail view
  
  // Update Tab button CSS classes
  document.getElementById('tab-btn-active')?.classList.toggle('active', tabName === 'active');
  document.getElementById('tab-btn-plugins')?.classList.toggle('active', tabName === 'plugins');
  document.getElementById('tab-btn-skills')?.classList.toggle('active', tabName === 'skills');
  document.getElementById('tab-btn-workflows')?.classList.toggle('active', tabName === 'workflows');
  document.getElementById('tab-btn-rules')?.classList.toggle('active', tabName === 'rules');
  document.getElementById('tab-btn-mcp')?.classList.toggle('active', tabName === 'mcp');
  document.getElementById('tab-btn-hooks')?.classList.toggle('active', tabName === 'hooks');
  
  // Update heading text
  if (tabName === 'active') {
    listSectionTitle.textContent = '⚡ ' + t('tabActive', 'Active Context');
  } else if (tabName === 'plugins') {
    listSectionTitle.textContent = t('tabPlugins', 'Plugins');
  } else if (tabName === 'skills') {
    listSectionTitle.textContent = t('tabSkills', 'Skills');
  } else if (tabName === 'workflows') {
    listSectionTitle.textContent = t('tabWorkflows', 'Workflows');
  } else if (tabName === 'rules') {
    listSectionTitle.textContent = t('tabRules', 'Rules');
  } else if (tabName === 'mcp') {
    listSectionTitle.textContent = t('tabMcp', 'MCP');
  } else if (tabName === 'hooks') {
    listSectionTitle.textContent = t('tabHooks', 'Hooks');
  }
  
  if (searchInput) searchInput.value = '';
  renderCurrentTab();
  scrollToStickyNav();
}
window.switchTab = switchTab;
