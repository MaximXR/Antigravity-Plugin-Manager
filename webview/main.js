const vscode = acquireVsCodeApi();

function t(key, defaultVal) {
  if (window.I18N && window.I18N[key] !== undefined) {
    return window.I18N[key];
  }
  return defaultVal !== undefined ? defaultVal : key;
}

window.copyText = function(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
};

// Lists data
let pluginsData = [];
let skillsData = [];
let workflowsData = [];
let rulesData = [];
let mcpData = [];
let hooksData = [];
let workspaceFoldersList = [];
let conflictsList = [];

let currentTab = 'active';
let activePluginId = null;
let hasScrolledToTabs = false;

// DOM Elements
const storagePathDisplay = document.getElementById('storage-path-display');
const valPlugins = document.getElementById('val-plugins');
const valSkills = document.getElementById('val-skills');
const valRules = document.getElementById('val-rules');
const valWorkflows = document.getElementById('val-workflows');
const valMcp = document.getElementById('val-mcp');
const valHooks = document.getElementById('val-hooks');
const pluginListContainer = document.getElementById('plugin-list-container');
const searchInput = document.getElementById('search-input');
const listSectionTitle = document.getElementById('list-section-title');

// Init
vscode.postMessage({ command: 'ready' });

// Listen to messages from extension
window.addEventListener('message', event => {
  const message = event.data;
  switch (message.command) {
    case 'init':
      storagePathDisplay.textContent = message.storagePath;
      storagePathDisplay.title = message.storagePath;
      
      // Set stats
      valPlugins.textContent = message.stats.activePlugins + '/' + message.stats.totalPlugins;
      valSkills.textContent = message.stats.skills;
      valRules.textContent = message.stats.rules;
      valWorkflows.textContent = message.stats.workflows;
      if (valMcp) valMcp.textContent = message.stats.mcp !== undefined ? message.stats.mcp : 0;
      if (valHooks) valHooks.textContent = message.stats.hooks !== undefined ? message.stats.hooks : 0;

      pluginsData = message.plugins || [];
      skillsData = message.skills || [];
      workflowsData = message.workflows || [];
      rulesData = message.rules || [];
      mcpData = message.mcpServers || [];
      hooksData = message.hooks || [];
      workspaceFoldersList = message.workspaceFolders || [];
      conflictsList = message.conflicts || [];
      
      try {
        renderConflicts();
        renderCurrentTab();
        
        if (!hasScrolledToTabs) {
          hasScrolledToTabs = true;
          const statsBlock = document.getElementById('stats-block');
          if (statsBlock) {
            statsBlock.scrollIntoView({ block: 'start' });
          }
        }
      } catch (renderErr) {
        console.error('Error rendering webview:', renderErr);
      } finally {
        document.body.classList.remove('loading');
        document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
      }
      break;
    case 'error':
      document.body.classList.remove('loading');
      document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
      // Re-enable checkboxes and hide loader on error
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);
      document.querySelectorAll('[id^="loader-"]').forEach(el => el.style.display = 'none');
      document.querySelectorAll('[id^="switch-container-"]').forEach(el => el.style.display = 'block');
      
      const dLoader = document.getElementById('detail-loader');
      const dSwitch = document.getElementById('detail-switch-container');
      if (dLoader && dSwitch && activePluginId) {
        const plugin = pluginsData.find(p => p.id === activePluginId);
        dLoader.style.display = 'none';
        dSwitch.style.display = plugin && plugin.isLocal ? 'none' : 'block';
        
        const detailToggle = document.getElementById('detail-plugin-toggle');
        if (detailToggle && plugin) {
          detailToggle.checked = plugin.isEnabled;
        }
      }
      break;
  }
});

// Refresh / Re-parse triggering
window.triggerRefresh = function(btn) {
  document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.add('rotating'));
  document.body.classList.add('loading');
  vscode.postMessage({ command: 'refresh' });
  setTimeout(() => {
    document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
    document.body.classList.remove('loading');
  }, 1200);
};

// Event Listeners
document.getElementById('btn-select-storage')?.addEventListener('click', () => {
  vscode.postMessage({ command: 'selectStorage' });
});

document.getElementById('btn-open-active')?.addEventListener('click', () => {
  vscode.postMessage({ command: 'openActive' });
});

document.getElementById('btn-open-storage')?.addEventListener('click', () => {
  vscode.postMessage({ command: 'openStorage' });
});

document.getElementById('btn-refresh')?.addEventListener('click', (e) => {
  window.triggerRefresh(e.currentTarget);
});

document.getElementById('btn-detail-refresh')?.addEventListener('click', (e) => {
  window.triggerRefresh(e.currentTarget);
});

searchInput?.addEventListener('input', () => {
  renderCurrentTab();
});

document.getElementById('lang-select')?.addEventListener('change', (e) => {
  vscode.postMessage({ command: 'changeLanguage', language: e.target.value });
});

// Switch Tabs
window.switchTab = function(tabName) {
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
};

window.toggleItem = function(category, itemId, enable) {
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
  
  const switchEl = document.getElementById('switch-container-' + itemId);
  const loaderEl = document.getElementById('loader-' + itemId);
  if (switchEl && loaderEl) {
    switchEl.style.display = 'none';
    loaderEl.style.display = 'block';
  }
  
  if (activePluginId && activePluginId === itemId) {
    const dSwitch = document.getElementById('detail-switch-container');
    const dLoader = document.getElementById('detail-loader');
    if (dSwitch && dLoader) {
      dSwitch.style.display = 'none';
      dLoader.style.display = 'block';
    }
  }
  
  vscode.postMessage({ command: 'toggle', category: category, id: itemId, enable: enable });
};

window.openItemFolder = function(category, itemId, isEnabled, isLocal, physicalPath) {
  vscode.postMessage({
    command: 'openItemFolder',
    category: category,
    id: itemId,
    isEnabled: isEnabled,
    isLocal: !!isLocal,
    physicalPath: physicalPath || ''
  });
};

window.openFileInEditor = function(category, physicalPath, itemId) {
  vscode.postMessage({
    command: 'openFileInEditor',
    category: category,
    physicalPath: physicalPath,
    id: itemId
  });
};

window.toggleMcpServer = function(physicalPath, serverName, enable) {
  vscode.postMessage({
    command: 'toggleMcpServer',
    physicalPath: physicalPath,
    serverName: serverName,
    enable: enable
  });
};

window.moveItem = function(itemId, category, sourcePluginId, isEnabled, isLocal, physicalPath) {
  vscode.postMessage({
    command: 'requestMove',
    itemId: itemId,
    category: category,
    sourcePluginId: sourcePluginId,
    isEnabled: isEnabled,
    isLocal: !!isLocal,
    physicalPath: physicalPath || ''
  });
};

window.deleteItem = function(category, itemId, displayName, physicalPath) {
  vscode.postMessage({
    command: 'deleteItem',
    category: category,
    itemId: itemId,
    displayName: displayName || itemId,
    physicalPath: physicalPath || ''
  });
};

window.toggleHook = function(physicalPath, hookName, enable) {
  vscode.postMessage({
    command: 'toggleHook',
    physicalPath: physicalPath,
    hookName: hookName,
    enable: enable
  });
};

window.deleteHook = function(hookName, physicalPath) {
  vscode.postMessage({
    command: 'deleteHook',
    hookName: hookName,
    physicalPath: physicalPath
  });
};

window.deleteMcpServer = function(serverName, physicalPath) {
  vscode.postMessage({
    command: 'deleteMcpServer',
    serverName: serverName,
    physicalPath: physicalPath
  });
};

window.moveMcpServer = function(serverName, physicalPath) {
  vscode.postMessage({
    command: 'moveMcp',
    serverName: serverName,
    physicalPath: physicalPath
  });
};

window.moveHook = function(hookName, physicalPath) {
  vscode.postMessage({
    command: 'moveHook',
    hookName: hookName,
    physicalPath: physicalPath
  });
};

window.editMetadata = function(field) {
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
};

let previousTabBeforePluginDetails = null;

window.openPluginDetails = function(pluginId) {
  if (currentTab !== 'plugins') {
    previousTabBeforePluginDetails = currentTab;
  }
  currentTab = 'plugins';
  activePluginId = pluginId;
  const detailContainer = document.getElementById('detail-view');
  if (detailContainer) {
    detailContainer.classList.toggle('detailed-mode', isDetailedView);
  }
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('tab-btn-plugins')?.classList.add('active');
  if (listSectionTitle) listSectionTitle.textContent = t('tabPlugins', 'Plugins');
  renderCurrentTab();
};

window.closePluginDetails = function() {
  activePluginId = null;
  if (previousTabBeforePluginDetails) {
    const prev = previousTabBeforePluginDetails;
    previousTabBeforePluginDetails = null;
    switchTab(prev);
  } else {
    renderCurrentTab();
  }
};

function escapeQuotes(str) {
  if (str === null || str === undefined) return '';
  if (typeof str === 'object') {
    str = str.name || str.displayName || JSON.stringify(str);
  }
  str = String(str);
  return str.replace(/\\/g, '\\\\')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '\\`');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  if (typeof str === 'object') {
    str = str.name || str.displayName || JSON.stringify(str);
  }
  str = String(str);
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

function renderPluginDetailsView() {
  const plugin = pluginsData.find(p => p.id === activePluginId || p.name === activePluginId);
  if (!plugin) {
    closePluginDetails();
    return;
  }

  document.getElementById('main-view').style.display = 'none';
  document.getElementById('detail-view').style.display = 'block';

  document.getElementById('detail-plugin-title-name').textContent = plugin.displayName || plugin.name || plugin.id;

  document.getElementById('meta-name').textContent = plugin.name || plugin.id || '';
  document.getElementById('meta-display-name').textContent = plugin.displayName || '';
  document.getElementById('meta-description').textContent = plugin.description || t('noDescription', 'No description.');
  document.getElementById('meta-version').textContent = plugin.version || '1.0.0';
  document.getElementById('meta-author').textContent = plugin.author || '';

  const openFolderBtn = document.getElementById('btn-open-plugin-folder');
  if (openFolderBtn) {
    openFolderBtn.onclick = () => {
      openItemFolder('plugin', plugin.id, plugin.isEnabled, plugin.isLocal, plugin.physicalPath);
    };
  }

  const detailToggle = document.getElementById('detail-plugin-toggle');
  const detailSwitchContainer = document.getElementById('detail-switch-container');
  const detailLoader = document.getElementById('detail-loader');
  
  if (detailSwitchContainer) {
    detailSwitchContainer.style.display = plugin.isLocal ? 'none' : 'block';
  }
  if (detailLoader) {
    detailLoader.style.display = 'none';
  }

  if (detailToggle) {
    detailToggle.disabled = false;
    detailToggle.checked = plugin.isEnabled;
    detailToggle.onchange = (e) => {
      toggleItem('plugin', plugin.id, e.target.checked);
    };
  }

  const btnMove = document.getElementById('detail-btn-move');
  if (btnMove) {
    btnMove.onclick = () => {
      moveItem(plugin.id, 'plugin', null, plugin.isEnabled, plugin.isLocal, plugin.physicalPath);
    };
  }

  const btnDelete = document.getElementById('detail-btn-delete');
  if (btnDelete) {
    btnDelete.onclick = () => {
      deleteItem('plugin', plugin.id, plugin.displayName, plugin.physicalPath);
    };
  }

  // Render Skills
  const hasSkills = plugin.skills && plugin.skills.length > 0;
  document.getElementById('detail-skills-section').style.display = hasSkills ? 'block' : 'none';
  const skillsContainer = document.getElementById('detail-skills-list');
  if (hasSkills) {
    skillsContainer.innerHTML = plugin.skills.map(s => {
      return `
        <div class="glass-card plugin-card">
          <div class="plugin-top">
            <div class="plugin-meta">
              <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;" title="/${s.name}">
                <span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">/${s.name}</span>
                <button class="copy-name-btn" onclick="copyText(this, '/${s.name}')" title="${t('copyName', 'Copy name')}">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
              <div class="plugin-desc" title="${escapeHtml(s.description)}">${escapeHtml(s.description)}</div>
              <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
                ${plugin.isLocal ? `
                  <div class="resource-tags" style="margin-top: 0;">
                    <div class="res-tag active res-mcp" style="font-size: 10px; padding: 2px 5px;">
                      <span class="res-indicator"></span>
                      <span>${t('local', 'Local')} • ${escapeHtml(plugin.workspaceName)}</span>
                    </div>
                  </div>
                ` : ''}
                <div class="plugin-human-title">
                  ${escapeHtml(s.displayName)}
                </div>
              </div>
            </div>
            
            <div class="card-right-group">
              <div class="card-actions">
                <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('skill', '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </button>
                <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('skill', '${s.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              </div>
              <div class="card-actions-row3">
                <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${s.id}', 'skill', '${plugin.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="17 8 21 12 17 16"></polyline>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                  </svg>
                </button>
                <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('skill', '${s.id}', '${escapeQuotes(s.displayName)}', '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    skillsContainer.classList.toggle('force-single-column', isDetailSingleColumn);
    skillsContainer.classList.toggle('detailed-mode', isDetailDetailedView);
    
    // Sync layout button text
    const layoutBtnText = document.getElementById('detail-layout-mode-text');
    const layoutBtnIcon = document.getElementById('detail-btn-toggle-layout')?.querySelector('svg');
    if (layoutBtnText && layoutBtnIcon) {
      if (isDetailSingleColumn) {
        layoutBtnText.textContent = t('twoColumns', '2 Columns');
        layoutBtnIcon.innerHTML = '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>';
      } else {
        layoutBtnText.textContent = t('oneColumn', '1 Column');
        layoutBtnIcon.innerHTML = '<rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect>';
      }
    }

    // Sync view mode button text
    const viewBtnText = document.getElementById('detail-view-mode-text');
    if (viewBtnText) {
      viewBtnText.textContent = isDetailDetailedView ? t('compact', 'Compact') : t('detailed', 'Detailed');
    }
  } else {
    skillsContainer.innerHTML = `<div class="no-data">${t('noSkills', 'No skills found.')}</div>`;
  }

  // Render Rules
  let rulesList = plugin.rules || [];
  if (rulesList.length === 0 && rulesData && rulesData.length > 0) {
    rulesList = rulesData.filter(r => r.pluginId === plugin.id || r.pluginId === plugin.name);
  }
  const hasRules = rulesList.length > 0;
  document.getElementById('detail-rules-section').style.display = hasRules ? 'block' : 'none';
  const rulesContainer = document.getElementById('detail-rules-list');
  if (hasRules) {
    rulesContainer.innerHTML = rulesList.map(r => {
      const isAct = plugin.isEnabled;
      return `
      <div class="resource-item">
        <div class="resource-info">
          <div class="resource-name" style="display: flex; align-items: center; gap: 6px;" title="${escapeHtml(r.displayName)}">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'}; display: inline-block; flex-shrink: 0;"></span>
            <span>${escapeHtml(r.displayName)}</span>
          </div>
          ${r.description ? `<div class="resource-desc" title="${escapeHtml(r.description)}">${escapeHtml(r.description)}</div>` : ''}
        </div>
        <div class="resource-actions">
          <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('rule', '${escapeQuotes(r.physicalPath)}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('rule', '${r.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
          <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${r.id}', 'rule', '${plugin.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 8 21 12 17 16"></polyline>
              <line x1="3" y1="12" x2="21" y2="12"></line>
            </svg>
          </button>
          <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('rule', '${r.id}', '${escapeQuotes(r.displayName || r.id)}', '${escapeQuotes(r.physicalPath)}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `}).join('');
  }

  // Render Workflows
  let workflowsList = plugin.workflows || [];
  if (workflowsList.length === 0 && workflowsData && workflowsData.length > 0) {
    workflowsList = workflowsData.filter(w => w.pluginId === plugin.id || w.pluginId === plugin.name);
  }
  const hasWorkflows = workflowsList.length > 0;
  const workflowsSection = document.getElementById('detail-workflows-section');
  if (workflowsSection) {
    workflowsSection.style.display = hasWorkflows ? 'block' : 'none';
    const workflowsContainer = document.getElementById('detail-workflows-list');
    if (workflowsContainer && hasWorkflows) {
      workflowsContainer.innerHTML = workflowsList.map(w => {
        const isAct = plugin.isEnabled;
        return `
        <div class="resource-item">
          <div class="resource-info">
            <div class="resource-name" style="display: flex; align-items: center; gap: 6px;" title="${escapeHtml(w.displayName || w.name)}">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'}; display: inline-block; flex-shrink: 0;"></span>
              <span class="slash-cmd" style="font-size: 11px; padding: 1px 5px; font-weight: 700;">/${escapeHtml(w.name || w.id)}</span>
              <span>${escapeHtml(w.displayName || w.name)}</span>
            </div>
            ${w.description ? `<div class="resource-desc" title="${escapeHtml(w.description)}">${escapeHtml(w.description)}</div>` : ''}
          </div>
          <div class="resource-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('workflow', '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('workflow', '${w.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${w.id}', 'workflow', '${plugin.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 8 21 12 17 16"></polyline>
                <line x1="3" y1="12" x2="21" y2="12"></line>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('workflow', '${w.id}', '${escapeQuotes(w.displayName || w.id)}', '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `}).join('');
    }
  }

  // Render MCP Servers
  let mcpList = plugin.mcpServers || plugin.mcpList || [];
  if (mcpList.length === 0 && mcpData && mcpData.length > 0) {
    mcpList = mcpData.filter(m => m.pluginId === plugin.id || m.pluginId === plugin.name);
  }
  const hasMcp = mcpList.length > 0;
  const mcpSection = document.getElementById('detail-mcp-section');
  if (mcpSection) {
    mcpSection.style.display = hasMcp ? 'block' : 'none';
    const mcpContainer = document.getElementById('detail-mcp-list');
    if (mcpContainer && hasMcp) {
      mcpContainer.innerHTML = mcpList.map(m => {
        const isAct = plugin.isEnabled && (m.enabled !== false) && (!m.disabled);
        const cmdArgs = Array.isArray(m.args) ? m.args.join(' ') : (m.args || '');
        const fullCmd = (m.command || '') + (cmdArgs ? ' ' + cmdArgs : '');
        return `
        <div class="resource-item">
          <div class="resource-info">
            <div class="resource-name" style="display: flex; align-items: center; gap: 6px;" title="${escapeHtml(m.name)}">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'}; display: inline-block; flex-shrink: 0;"></span>
              <span>${escapeHtml(m.name)}</span>
            </div>
            <div class="resource-desc" style="font-family: monospace;" title="${escapeHtml(fullCmd)}">${escapeHtml(fullCmd) || t('noCommand', 'No command')}</div>
          </div>
          <div class="resource-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('mcp', '${escapeQuotes(m.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('mcp', '${escapeQuotes(m.name)}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(m.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveMcpServer('${escapeQuotes(m.name)}', '${escapeQuotes(m.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 8 21 12 17 16"></polyline>
                <line x1="3" y1="12" x2="21" y2="12"></line>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteMcpServer('${escapeQuotes(m.name)}', '${escapeQuotes(m.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `}).join('');
    }
  }

  // Render Hooks
  let hooksList = plugin.hooks || [];
  if (hooksList.length === 0 && hooksData && hooksData.length > 0) {
    hooksList = hooksData.filter(h => h.pluginId === plugin.id || h.pluginId === plugin.name);
  }
  const hasHooks = hooksList.length > 0;
  const hooksSection = document.getElementById('detail-hooks-section');
  if (hooksSection) {
    hooksSection.style.display = hasHooks ? 'block' : 'none';
    const hooksContainer = document.getElementById('detail-hooks-list');
    if (hooksContainer && hasHooks) {
      hooksContainer.innerHTML = hooksList.map(h => {
        const isAct = plugin.isEnabled && (h.enabled !== false);
        return `
        <div class="resource-item">
          <div class="resource-info">
            <div class="resource-name" style="display: flex; align-items: center; gap: 6px;" title="${escapeHtml(h.displayName || h.name)}">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'}; display: inline-block; flex-shrink: 0;"></span>
              <span>${escapeHtml(h.displayName || h.name)}</span>
              ${h.event ? `<span class="slash-cmd" style="font-size: 10px; padding: 1px 5px; font-weight: 600;">${escapeHtml(h.event)}</span>` : ''}
            </div>
            <div class="resource-desc">${escapeHtml(h.command || '') || (h.type === 'file' ? t('file', 'File') : 'JSON')}</div>
          </div>
          <div class="resource-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('hook', '${escapeQuotes(h.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('hook', '${h.id}', ${plugin.isEnabled}, ${plugin.isLocal ? 'true' : 'false'}, '${escapeQuotes(h.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('hook', '${h.id}', '${escapeQuotes(h.displayName || h.id)}', '${escapeQuotes(h.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `}).join('');
    }
  }

  // Toggle empty state banner
  const hasAnyResources = hasSkills || hasRules || hasWorkflows || hasMcp || hasHooks;
  const emptyBanner = document.getElementById('detail-no-resources');
  if (emptyBanner) {
    emptyBanner.style.display = hasAnyResources ? 'none' : 'block';
  }
}

function renderGroupedGrid(items, renderCardFn, emptyMessageKey, emptyMessageDefault) {
  if (!items || items.length === 0) {
    pluginListContainer.innerHTML = `<div class="no-data">${t(emptyMessageKey, emptyMessageDefault)}</div>`;
    return;
  }

  const builtin = [];
  const global = [];
  const plugins = [];
  const local = [];

  for (const item of items) {
    if (item.isBuiltin || item.source === 'builtin') {
      builtin.push(item);
    } else if (item.isLocal || item.isWorkspace) {
      local.push(item);
    } else if (item.isPlugin || item.pluginId || item.pluginName) {
      plugins.push(item);
    } else {
      global.push(item);
    }
  }

  const sortFn = (a, b) => {
    const nameA = String(a.displayName || a.name || a.id || '');
    const nameB = String(b.displayName || b.name || b.id || '');
    return nameA.localeCompare(nameB);
  };

  global.sort(sortFn);
  local.sort(sortFn);
  builtin.sort(sortFn);
  plugins.sort(sortFn);

  const groups = [];
  if (global.length > 0) groups.push({ key: 'global', title: t('groupGlobal', 'Global'), icon: '🌐', items: global });
  if (local.length > 0) groups.push({ key: 'local', title: t('groupWorkspace', 'Workspace / Local'), icon: '📁', items: local });
  if (builtin.length > 0) groups.push({ key: 'builtin', title: t('groupBuiltin', 'Built-in'), icon: '🔷', items: builtin });
  if (plugins.length > 0) groups.push({ key: 'plugin', title: t('groupPlugins', 'From Plugins'), icon: '🔌', items: plugins });

  let html = '';
  let globalIndex = 1;

  if (isGroupingEnabled) {
    for (const grp of groups) {
      html += `
        <div class="group-header">
          <div class="group-title"><span>${grp.icon}</span> <span>${grp.title}</span></div>
          <span class="group-badge">${grp.items.length}</span>
        </div>
      `;
      for (const item of grp.items) {
        html += renderCardFn(item, globalIndex++);
      }
    }
  } else {
    for (const grp of groups) {
      for (const item of grp.items) {
        html += renderCardFn(item, globalIndex++);
      }
    }
  }

  pluginListContainer.innerHTML = html;
}

function getScopeBadgeHtml(item) {
  if (item.isBuiltin || item.source === 'builtin') {
    return `<div class="res-tag active res-builtin" style="font-size: 10px; padding: 2px 5px;"><span class="res-indicator"></span><span>${t('badgeBuiltin', 'Built-in')}</span></div>`;
  }
  if (item.isLocal || item.isWorkspace) {
    const wsName = item.workspaceName ? ` • ${escapeHtml(item.workspaceName)}` : '';
    return `<div class="res-tag active res-local" style="font-size: 10px; padding: 2px 5px;"><span class="res-indicator"></span><span>${t('badgeLocal', 'Local')}${wsName}</span></div>`;
  }
  if (item.isPlugin || item.pluginId || item.pluginName) {
    const pName = item.pluginDisplayName || item.pluginName || item.pluginId || '';
    const pId = item.pluginId || item.pluginName || '';
    return `<div class="res-tag active res-plugin clickable" style="font-size: 10px; padding: 2px 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); openPluginDetails('${escapeQuotes(pId)}')" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(pName)}"><span class="res-indicator"></span><span>${t('badgePlugin', 'Plugin')}: ${escapeHtml(pName)}</span><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.8;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></div>`;
  }
  return `<div class="res-tag active res-global" style="font-size: 10px; padding: 2px 5px;"><span class="res-indicator"></span><span>${t('badgeGlobal', 'Global')}</span></div>`;
}

function renderRuleCard(r, idx) {
  const scopeBadge = getScopeBadgeHtml(r);
  let statusBadgeHtml = '';
  if (r.isPlugin) {
    if (r.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpPluginActive', 'Active (Plugin enabled)')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('mcpPluginDisabled', 'Disabled (Plugin disabled)')}</span>`;
    }
  } else {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
  }

  return `
    <div class="glass-card plugin-card">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name clickable" style="margin-bottom: 4px;" title="${escapeHtml(r.displayName || r.name)}" onclick="openFileInEditor('rule', '${escapeQuotes(r.physicalPath)}')">
            <span class="card-index-num">#${idx}</span>
            ${escapeHtml(r.displayName || r.name)}
          </div>
          <div class="plugin-desc" title="${escapeHtml(r.description || '')}">${escapeHtml(r.description || '') || t('noDescription', 'No description.')}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
            <div class="resource-tags" style="margin-top: 0;">
              ${scopeBadge}
            </div>
            <div>
              ${statusBadgeHtml}
            </div>
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('rule', '${escapeQuotes(r.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('rule', '${r.id}', true, ${r.isWorkspace ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            ${r.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(r.pluginDisplayName || r.pluginName || r.pluginId)}" onclick="openPluginDetails('${escapeQuotes(r.pluginId || r.pluginName)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="card-actions-row3">
            ${!r.isProtected ? `
              <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${r.id}', 'rule', '${r.pluginId || ''}', true, ${r.isWorkspace ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              ${!r.isPlugin ? `
                <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('rule', '${r.id}', '${escapeQuotes(r.displayName || r.name)}', '${escapeQuotes(r.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              ` : ''}
            ` : `
              <span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">${t('protected', 'Protected')}</span>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSkillCard(s, idx) {
  const scopeBadge = getScopeBadgeHtml(s);
  let statusBadgeHtml = '';
  if (s.isBuiltin) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
  } else if (s.isPlugin) {
    if (s.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpPluginActive', 'Active (Plugin enabled)')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('mcpPluginDisabled', 'Disabled (Plugin disabled)')}</span>`;
    }
  } else if (s.isLocal) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
  } else {
    // Global skill
    if (s.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('inactive', 'Disabled')}</span>`;
    }
  }

  return `
    <div class="glass-card plugin-card">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;" title="/${s.name}">
            <span class="card-index-num">#${idx}</span>
            <span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">/${s.name}</span>
            <button class="copy-name-btn" onclick="copyText(this, '/${s.name}')" title="${t('copyName', 'Copy name')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="plugin-desc" title="${escapeHtml(s.description)}">${escapeHtml(s.description)}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
            <div class="resource-tags" style="margin-top: 0;">
              ${scopeBadge}
            </div>
            <div>
              ${statusBadgeHtml}
            </div>
            <div class="plugin-human-title">
              ${escapeHtml(s.displayName)}
            </div>
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('skill', '${escapeQuotes(s.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('skill', '${s.id}', ${s.isEnabled}, ${s.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            ${s.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(s.pluginDisplayName || s.pluginName || s.pluginId)}" onclick="openPluginDetails('${escapeQuotes(s.pluginId || s.pluginName)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="card-actions-bottom">
            ${s.isBuiltin ? `
              <span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">${t('protected', 'Protected')}</span>
            ` : (s.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}" onclick="openPluginDetails('${escapeQuotes(s.pluginId || s.pluginName)}')" style="font-size: 10px; padding: 2px 6px; gap: 3px; display: inline-flex; align-items: center;">🔌 ${escapeHtml(s.pluginDisplayName || s.pluginName || 'Plugin')}</button>
            ` : (s.isLocal ? `
              <span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">Workspace</span>
            ` : `
              <div id="switch-container-${s.id}">
                <label class="switch">
                  <input type="checkbox" ${s.isEnabled ? 'checked' : ''} onchange="toggleItem('skill', '${s.id}', this.checked)">
                  <span class="slider"></span>
                </label>
              </div>
              <div id="loader-${s.id}" style="display: none; padding-right: 6px;">
                <div class="spinner-small"></div>
              </div>
            `))}
          </div>
          <div class="card-actions-row3">
            ${!s.isBuiltin ? `
              <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${s.id}', 'skill', '${s.pluginId || ''}', ${s.isEnabled ? 'true' : 'false'}, ${s.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              ${!s.isPlugin ? `
                <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('skill', '${s.id}', '${escapeQuotes(s.displayName)}', '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              ` : ''}
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWorkflowCard(w, idx) {
  const scopeBadge = getScopeBadgeHtml(w);
  let statusBadgeHtml = '';
  if (w.isBuiltin) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
  } else if (w.isPlugin) {
    if (w.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpPluginActive', 'Active (Plugin enabled)')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('mcpPluginDisabled', 'Disabled (Plugin disabled)')}</span>`;
    }
  } else if (w.isLocal) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
  } else {
    // Global workflow
    if (w.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('active', 'Active')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('inactive', 'Disabled')}</span>`;
    }
  }

  return `
    <div class="glass-card plugin-card">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;" title="/${w.name}">
            <span class="card-index-num">#${idx}</span>
            <span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">/${w.name}</span>
            <button class="copy-name-btn" onclick="copyText(this, '/${w.name}')" title="${t('copyName', 'Copy name')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="plugin-desc" title="${escapeHtml(w.description)}">${escapeHtml(w.description)}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
            <div class="resource-tags" style="margin-top: 0;">
              ${scopeBadge}
            </div>
            <div>
              ${statusBadgeHtml}
            </div>
            <div class="plugin-human-title">
              ${escapeHtml(w.displayName)}
            </div>
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('workflow', '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('workflow', '${w.id}', ${w.isEnabled}, ${w.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            ${w.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(w.pluginDisplayName || w.pluginName || w.pluginId)}" onclick="openPluginDetails('${escapeQuotes(w.pluginId || w.pluginName)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="card-actions-bottom">
            ${w.isBuiltin ? `
              <span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">${t('protected', 'Protected')}</span>
            ` : (w.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}" onclick="openPluginDetails('${escapeQuotes(w.pluginId || w.pluginName)}')" style="font-size: 10px; padding: 2px 6px; gap: 3px; display: inline-flex; align-items: center;">🔌 ${escapeHtml(w.pluginDisplayName || w.pluginName || 'Plugin')}</button>
            ` : (w.isLocal ? `
              <span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">Workspace</span>
            ` : `
              <div id="switch-container-${w.id}">
                <label class="switch">
                  <input type="checkbox" ${w.isEnabled ? 'checked' : ''} onchange="toggleItem('workflow', '${w.id}', this.checked)">
                  <span class="slider"></span>
                </label>
              </div>
              <div id="loader-${w.id}" style="display: none; padding-right: 6px;">
                <div class="spinner-small"></div>
              </div>
            `))}
          </div>
          <div class="card-actions-row3">
            ${!w.isBuiltin ? `
              <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveItem('${w.id}', 'workflow', '${w.pluginId || ''}', ${w.isEnabled ? 'true' : 'false'}, ${w.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              ${!w.isPlugin ? `
                <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('workflow', '${w.id}', '${escapeQuotes(w.displayName)}', '${escapeQuotes(w.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              ` : ''}
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMcpCard(m, idx) {
  const scopeBadge = getScopeBadgeHtml(m);
  const cmdArgs = (m.args || []).join(' ');
  const fullCmd = (m.command || '') + (cmdArgs ? ' ' + cmdArgs : '');

  let statusBadgeHtml = '';
  let controlHtml = '';

  if (m.isBuiltin) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpActive', 'Active')}</span>`;
    controlHtml = `<span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">${t('protected', 'Protected')}</span>`;
  } else if (m.isPlugin) {
    if (m.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpPluginActive', 'Active (Plugin enabled)')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('mcpPluginDisabled', 'Disabled (Plugin disabled)')}</span>`;
    }
    controlHtml = `<button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}" onclick="openPluginDetails('${m.pluginId}')" style="font-size: 10px; padding: 2px 6px; gap: 3px; display: inline-flex; align-items: center;">🔌 ${escapeHtml(m.sourceLabel || 'Plugin')}</button>`;
  } else {
    const isAct = m.enabled !== false;
    statusBadgeHtml = `<span style="font-size: 10px; color: ${isAct ? '#34d399' : '#f87171'}; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; display: inline-block; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'};"></span> ${isAct ? t('mcpActive', 'Active') : t('mcpDisabled', 'Disabled')}</span>`;
    controlHtml = `
      <label class="switch">
        <input type="checkbox" ${isAct ? 'checked' : ''} onchange="toggleMcpServer('${escapeQuotes(m.physicalPath)}', '${escapeQuotes(m.name)}', this.checked)">
        <span class="slider"></span>
      </label>
    `;
  }

  return `
    <div class="glass-card plugin-card">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="card-index-num">#${idx}</span>
            <span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">${escapeHtml(m.name)}</span>
            <button class="copy-name-btn" onclick="copyText(this, '${escapeQuotes(m.name)}')" title="${t('copyName', 'Copy name')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="plugin-desc" style="font-family: monospace; font-size: 11px;" title="${escapeHtml(fullCmd)}">
            ${escapeHtml(fullCmd) || t('noCommand', 'No command specified')}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
            <div class="resource-tags" style="margin-top: 0;">
              ${scopeBadge}
            </div>
            <div>
              ${statusBadgeHtml}
            </div>
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('mcp', '${escapeQuotes(m.physicalPath)}', '${escapeQuotes(m.name)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
          </div>
          <div class="card-actions-bottom">
            ${controlHtml}
          </div>
          <div class="card-actions-row3">
            ${!m.isProtected && !m.isPlugin ? `
              <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveMcpServer('${escapeQuotes(m.name)}', '${escapeQuotes(m.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteMcpServer('${escapeQuotes(m.name)}', '${escapeQuotes(m.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHookCard(h, idx) {
  const scopeBadge = getScopeBadgeHtml(h);
  const eventBadge = h.event ? `<span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">${escapeHtml(h.event)}</span>` : '';

  let statusBadgeHtml = '';
  let controlHtml = '';

  if (h.isProtected) {
    statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpActive', 'Active')}</span>`;
    controlHtml = `<span style="font-size: 10px; color: var(--text-muted); opacity: 0.7; padding: 2px 4px;">${t('protected', 'Protected')}</span>`;
  } else if (h.isPlugin) {
    if (h.isEnabled) {
      statusBadgeHtml = `<span style="font-size: 10px; color: #34d399; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #34d399; display: inline-block; box-shadow: 0 0 6px rgba(52,211,153,0.6);"></span> ${t('mcpPluginActive', 'Active (Plugin enabled)')}</span>`;
    } else {
      statusBadgeHtml = `<span style="font-size: 10px; color: #f87171; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: #ef4444; display: inline-block; box-shadow: 0 0 6px rgba(239,68,68,0.6);"></span> ${t('mcpPluginDisabled', 'Disabled (Plugin disabled)')}</span>`;
    }
    controlHtml = `<button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}" onclick="openPluginDetails('${h.pluginId}')" style="font-size: 10px; padding: 2px 6px; gap: 3px; display: inline-flex; align-items: center;">🔌 ${escapeHtml(h.sourceLabel || 'Plugin')}</button>`;
  } else {
    const isAct = h.enabled !== false;
    statusBadgeHtml = `<span style="font-size: 10px; color: ${isAct ? '#34d399' : '#f87171'}; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 6px; height: 6px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; display: inline-block; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'};"></span> ${isAct ? t('mcpActive', 'Active') : t('mcpDisabled', 'Disabled')}</span>`;
    controlHtml = `
      <label class="switch">
        <input type="checkbox" ${isAct ? 'checked' : ''} onchange="toggleHook('${escapeQuotes(h.physicalPath)}', '${escapeQuotes(h.name)}', this.checked)">
        <span class="slider"></span>
      </label>
    `;
  }

  return `
    <div class="glass-card plugin-card">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="card-index-num">#${idx}</span>
            <span style="font-weight: 600;">${escapeHtml(h.name)}</span>
            ${eventBadge}
          </div>
          <div class="plugin-desc" style="font-family: monospace; font-size: 11px;" title="${escapeHtml(h.command || '')}">
            ${escapeHtml(h.command || '') || t('noCommand', 'No command specified')}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 4px;">
            <div class="resource-tags" style="margin-top: 0;">
              ${scopeBadge}
            </div>
            <div>
              ${statusBadgeHtml}
            </div>
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('hook', '${escapeQuotes(h.physicalPath)}', '${escapeQuotes(h.name)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
          </div>
          <div class="card-actions-bottom">
            ${controlHtml}
          </div>
          <div class="card-actions-row3">
            ${!h.isProtected && !h.isPlugin ? `
              <button class="card-action-btn" title="${t('move', 'Move')}" onclick="moveHook('${escapeQuotes(h.name)}', '${escapeQuotes(h.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteHook('${escapeQuotes(h.name)}', '${escapeQuotes(h.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

const collapsedActiveCategories = window.collapsedActiveCategories || {};
window.collapsedActiveCategories = collapsedActiveCategories;
window.toggleActiveCategory = function(key) {
  collapsedActiveCategories[key] = !collapsedActiveCategories[key];
  renderCurrentTab();
};

function renderActiveContextView(query) {
  const activePlugins = pluginsData.filter(p => p.isEnabled);
  const activeRules = rulesData.filter(r => r.isEnabled !== false && (!query || String(r.displayName || r.name || '').toLowerCase().includes(query) || (r.description && String(r.description).toLowerCase().includes(query))));
  const activeSkills = skillsData.filter(s => s.isEnabled !== false && (!query || String(s.displayName || s.name || '').toLowerCase().includes(query) || (s.description && String(s.description).toLowerCase().includes(query))));
  const activeWorkflows = workflowsData.filter(w => w.isEnabled !== false && (!query || String(w.displayName || w.name || '').toLowerCase().includes(query) || (w.description && String(w.description).toLowerCase().includes(query))));
  const activeMcp = mcpData.filter(m => m.isEnabled && (!query || String(m.name || '').toLowerCase().includes(query) || String(m.command || '').toLowerCase().includes(query)));
  const activeHooks = hooksData.filter(h => h.isEnabled && (!query || String(h.name || '').toLowerCase().includes(query) || String(h.command || '').toLowerCase().includes(query) || String(h.event || '').toLowerCase().includes(query)));

  const totalActiveCount = activeRules.length + activeSkills.length + activeWorkflows.length + activeMcp.length + activeHooks.length;

  let summaryText = t('activeContextSummary', 'Active AI Context: {rules} rules • {skills} skills • {plugins} plugins • {workflows} workflows • {mcp} MCP • {hooks} hooks')
    .replace('{rules}', activeRules.length)
    .replace('{skills}', activeSkills.length)
    .replace('{plugins}', activePlugins.length)
    .replace('{workflows}', activeWorkflows.length)
    .replace('{mcp}', activeMcp.length)
    .replace('{hooks}', activeHooks.length);

  let html = `
    <div class="active-plugins-bar">
      <div class="active-plugins-bar-header">
        <span>🔌 ${t('activePluginsBar', 'Enabled Plugins')} (${activePlugins.length})</span>
        <span style="font-size: 10px; text-transform: none; color: var(--text-muted); font-weight: normal;">${escapeHtml(summaryText)}</span>
      </div>
      <div class="active-plugins-chips">
        ${activePlugins.length > 0 ? activePlugins.map(p => `
          <div class="plugin-chip" title="${escapeHtml(p.description || p.displayName)}">
            <span class="plugin-chip-name" onclick="openPluginDetails('${p.id}')">🔌 ${escapeHtml(p.displayName)} <span style="opacity: 0.6; font-size: 10px;">v${p.version}</span></span>
            <button class="plugin-chip-toggle" title="${t('disabled', 'Disable')}" onclick="toggleItem('plugin', '${p.id}', false)">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `).join('') : `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">${t('noActivePlugins', 'No plugins currently enabled')}</span>`}
      </div>
    </div>
  `;

  if (totalActiveCount === 0 && activePlugins.length === 0) {
    html += `<div class="no-data" style="margin-top: 20px;">${t('noActiveRules', 'No active resources found.')}</div>`;
    pluginListContainer.innerHTML = html;
    return;
  }

  let globalIndex = 1;

  const renderSection = (secKey, icon, title, items, cardFn) => {
    if (!items || items.length === 0) return '';
    const isCollapsed = !!collapsedActiveCategories[secKey];
    
    let secHtml = `
      <div class="active-category-header" onclick="toggleActiveCategory('${secKey}')" title="${t('toggleCategory', 'Click to expand/collapse')}">
        <div class="active-category-title"><span>${icon}</span> <span>${title}</span></div>
        <div class="active-category-right">
          <span class="group-badge">${items.length}</span>
          <span class="active-category-chevron ${isCollapsed ? 'collapsed' : ''}">▼</span>
        </div>
      </div>
      <div class="active-category-items ${isCollapsed ? 'collapsed' : ''}">
    `;

    const builtin = [];
    const global = [];
    const plugins = [];
    const local = [];
    for (const item of items) {
      if (item.isBuiltin || item.source === 'builtin') builtin.push(item);
      else if (item.isLocal || item.isWorkspace) local.push(item);
      else if (item.isPlugin || item.pluginId || item.pluginName) plugins.push(item);
      else global.push(item);
    }
    const sortFn = (a, b) => String(a.displayName || a.name || a.id || '').localeCompare(String(b.displayName || b.name || b.id || ''));
    global.sort(sortFn);
    local.sort(sortFn);
    builtin.sort(sortFn);
    plugins.sort(sortFn);

    if (isGroupingEnabled) {
      const groups = [];
      if (global.length > 0) groups.push({ title: t('groupGlobal', 'Global'), icon: '🌐', items: global });
      if (local.length > 0) groups.push({ title: t('groupWorkspace', 'Workspace / Local'), icon: '📁', items: local });
      if (builtin.length > 0) groups.push({ title: t('groupBuiltin', 'Built-in'), icon: '🔷', items: builtin });
      if (plugins.length > 0) groups.push({ title: t('groupPlugins', 'From Plugins'), icon: '🔌', items: plugins });

      for (const grp of groups) {
        secHtml += `
          <div class="group-header">
            <div class="group-title"><span>${grp.icon}</span> <span>${grp.title}</span></div>
            <span class="group-badge">${grp.items.length}</span>
          </div>
        `;
        for (const item of grp.items) {
          secHtml += cardFn(item, globalIndex++);
        }
      }
    } else {
      // Without intermediate tier headers (smooth compact flow)
      const allSorted = [...global, ...local, ...builtin, ...plugins];
      for (const item of allSorted) {
        secHtml += cardFn(item, globalIndex++);
      }
    }

    secHtml += `</div>`;
    return secHtml;
  };

  html += renderSection('rules', '📜', t('activeSectionRules', 'Active Rules'), activeRules, renderRuleCard);
  html += renderSection('skills', '⚡', t('activeSectionSkills', 'Active Skills'), activeSkills, renderSkillCard);
  html += renderSection('workflows', '📋', t('activeSectionWorkflows', 'Active Workflows'), activeWorkflows, renderWorkflowCard);
  html += renderSection('mcp', '🛠️', t('activeSectionMcp', 'Active MCP Servers'), activeMcp, renderMcpCard);
  html += renderSection('hooks', '🪝', t('activeSectionHooks', 'Active Hooks'), activeHooks, renderHookCard);

  pluginListContainer.innerHTML = html;
}

function renderCurrentTab() {
  if (activePluginId) {
    renderPluginDetailsView();
    return;
  }

  document.getElementById('main-view').style.display = 'block';
  document.getElementById('detail-view').style.display = 'none';

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  if (currentTab === 'active') {
    renderActiveContextView(query);
    return;
  }

  if (currentTab === 'rules') {
    const filtered = rulesData.filter(r => 
      (r.displayName && String(r.displayName).toLowerCase().includes(query)) || 
      (r.name && String(r.name).toLowerCase().includes(query)) ||
      (r.description && String(r.description).toLowerCase().includes(query))
    );
    renderGroupedGrid(filtered, renderRuleCard, 'noRules', 'No rules found.');

  } else if (currentTab === 'skills') {
    const filtered = skillsData.filter(s => 
      String(s.displayName || '').toLowerCase().includes(query) || 
      String(s.name || '').toLowerCase().includes(query) ||
      (s.description && String(s.description).toLowerCase().includes(query))
    );
    renderGroupedGrid(filtered, renderSkillCard, 'noSkills', 'No skills found.');

  } else if (currentTab === 'plugins') {
    const filtered = pluginsData.filter(p => 
      String(p.displayName || '').toLowerCase().includes(query) || 
      String(p.name || '').toLowerCase().includes(query) ||
      (p.description && String(p.description).toLowerCase().includes(query))
    );

    renderGroupedGrid(filtered, (p, idx) => {
      const skillsCount = p.skillsCount !== undefined ? p.skillsCount : (p.skills ? p.skills.length : 0);
      const rulesCount = p.rulesCount !== undefined ? p.rulesCount : (p.rules ? p.rules.length : 0);
      const hooksCount = p.hooksCount !== undefined ? p.hooksCount : (p.hooks ? p.hooks.length : 0);
      const hasSkills = skillsCount > 0;
      const hasRules = rulesCount > 0;
      const hasHooks = hooksCount > 0;
      
      return `
        <div class="glass-card plugin-card">
          <div class="plugin-top">
            <div class="plugin-meta">
              <div class="plugin-name clickable" title="${escapeHtml(p.displayName)}" onclick="openPluginDetails('${p.id}')">
                <span class="card-index-num">#${idx}</span>
                ${escapeHtml(p.displayName)}
              </div>
              
              <div class="plugin-desc" id="desc-${p.id}" title="${escapeHtml(p.description)}">
                ${escapeHtml(p.description) || t('noDescription', 'No description.')}
              </div>

              <div class="plugin-details">
                <span>v${p.version}</span>
                ${p.author ? `<span>•</span> <span>${escapeHtml(p.author)}</span>` : ''}
              </div>
            </div>
            
            <div class="card-right-group">
              <div class="card-actions-bottom">
                ${p.isLocal ? '' : `
                  <div id="switch-container-${p.id}">
                    <label class="switch">
                      <input type="checkbox" ${p.isEnabled ? 'checked' : ''} onchange="toggleItem('plugin', '${p.id}', this.checked)">
                      <span class="slider"></span>
                    </label>
                  </div>
                  <div id="loader-${p.id}" style="display: none; padding-right: 6px;">
                    <div class="spinner-small"></div>
                  </div>
                `}
              </div>
              <div class="card-actions">
                <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('plugin', '${p.id}', ${p.isEnabled}, ${p.isLocal ? 'true' : 'false'}, '${escapeQuotes(p.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
                <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('plugin', '${p.id}', '${escapeQuotes(p.displayName)}', '${escapeQuotes(p.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              <div class="card-actions-row3">
                <button class="card-action-btn plugin-move-btn" title="${t('move', 'Move')}" onclick="moveItem('${p.id}', 'plugin', null, ${p.isEnabled}, ${p.isLocal ? 'true' : 'false'}, '${escapeQuotes(p.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="17 8 21 12 17 16"></polyline>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <div class="resource-tags">
            ${p.isLocal ? `
              <div class="res-tag active res-local" style="font-size: 11px;">
                <span class="res-indicator"></span>
                <span>${t('badgeLocal', 'Local')} • ${escapeHtml(p.workspaceName)}</span>
              </div>
            ` : `
              <div class="res-tag active res-global" style="font-size: 11px;">
                <span class="res-indicator"></span>
                <span>${t('badgeGlobal', 'Global')}</span>
              </div>
            `}
            ${hasSkills ? `
              <div class="res-tag active">
                <span class="res-indicator"></span>
                <span>${skillsCount} ${t('skillsCount', 'Skills')}</span>
              </div>
            ` : ''}
            ${hasRules ? `
              <div class="res-tag active">
                <span class="res-indicator"></span>
                <span>${rulesCount} ${t('rulesCount', 'Rules')}</span>
              </div>
            ` : ''}
            ${hasHooks ? `
              <div class="res-tag active res-hooks">
                <span class="res-indicator"></span>
                <span>${hooksCount} ${t('hooks', 'Hooks')}</span>
              </div>
            ` : ''}
            ${p.hasMcp ? `
              <div class="res-tag active res-mcp">
                <span class="res-indicator"></span>
                <span>MCP</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }, 'noPlugins', 'No plugins found.');

  } else if (currentTab === 'workflows') {
    const filtered = workflowsData.filter(w => 
      String(w.displayName || '').toLowerCase().includes(query) || 
      String(w.name || '').toLowerCase().includes(query) ||
      (w.description && String(w.description).toLowerCase().includes(query))
    );
    renderGroupedGrid(filtered, renderWorkflowCard, 'noWorkflows', 'No workflows found.');

  } else if (currentTab === 'mcp') {
    const filtered = mcpData.filter(m => 
      (m.name && String(m.name).toLowerCase().includes(query)) || 
      (m.command && String(m.command).toLowerCase().includes(query)) ||
      (m.description && String(m.description).toLowerCase().includes(query))
    );
    renderGroupedGrid(filtered, renderMcpCard, 'noMcp', 'No MCP servers found.');

  } else if (currentTab === 'hooks') {
    const filtered = hooksData.filter(h => 
      (h.name && String(h.name).toLowerCase().includes(query)) || 
      (h.event && String(h.event).toLowerCase().includes(query)) ||
      (h.command && String(h.command).toLowerCase().includes(query))
    );
    renderGroupedGrid(filtered, renderHookCard, 'noHooks', 'No hooks found.');
  }
}

// --- Conflicts & Creation Wizard Functions ---
function renderConflicts() {
  const section = document.getElementById('conflict-section');
  const container = document.getElementById('conflict-list');
  
  if (!section || !container) return;
  
  if (!conflictsList || conflictsList.length === 0) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  
  section.style.display = 'block';
  container.innerHTML = conflictsList.map(c => {
    const itemType = c.category === 'plugin' ? t('tabPlugins', 'Plugins') : (c.category === 'skill' ? t('tabSkills', 'Skills') : t('tabWorkflows', 'Workflows'));
    
    let warningText = t('conflictWarning', 'Conflict detected for {itemId}').replace('{itemId}', c.id);
    
    const showMerge = c.isDir && !c.isIdentical;
    const showKeepBoth = !c.isDir && !c.isIdentical;
    
    return `
      <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 11px; line-height: 1.4; color: #fda4af;">
          <strong>[${itemType}]</strong> ${warningText}
          ${c.isIdentical ? '<span style="color: #34d399; font-weight: 500; margin-left: 6px;">(' + t('copiesIdentical', 'Copies are identical') + ')</span>' : ''}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          <button class="btn" style="background: var(--success-gradient); padding: 4px 8px; font-size: 10px;" onclick="resolveConflict('${c.id}', '${c.category}', 'active', '${encodeURIComponent(c.activePath)}', '${encodeURIComponent(c.storagePath)}', ${c.isDir})">${t('btnKeepActive', 'Keep Active')}</button>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px;" onclick="resolveConflict('${c.id}', '${c.category}', 'storage', '${encodeURIComponent(c.activePath)}', '${encodeURIComponent(c.storagePath)}', ${c.isDir})">${t('btnKeepStorage', 'Keep Storage')}</button>
          ${showMerge ? `
            <button class="btn" style="background: var(--primary-gradient); padding: 4px 8px; font-size: 10px;" onclick="resolveConflict('${c.id}', '${c.category}', 'merge', '${encodeURIComponent(c.activePath)}', '${encodeURIComponent(c.storagePath)}', ${c.isDir})">${t('btnMerge', 'Merge')}</button>
          ` : ''}
          ${showKeepBoth ? `
            <button class="btn" style="background: var(--primary-gradient); padding: 4px 8px; font-size: 10px;" onclick="resolveConflict('${c.id}', '${c.category}', 'keepBoth', '${encodeURIComponent(c.activePath)}', '${encodeURIComponent(c.storagePath)}', ${c.isDir})">${t('btnKeepBoth', 'Keep Both')}</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.resolveConflict = function(id, category, resolution, activePath, storagePath, isDir) {
  vscode.postMessage({
    command: 'resolveConflict',
    id: id,
    category: category,
    resolution: resolution,
    activePath: decodeURIComponent(activePath),
    storagePath: decodeURIComponent(storagePath),
    isDir: isDir
  });
};

let isDetailedView = false;
window.toggleViewMode = function() {
  isDetailedView = !isDetailedView;
  const listContainer = document.getElementById('plugin-list-container');
  const detailContainer = document.getElementById('detail-view');
  const btnText = document.getElementById('view-mode-text');
  if (isDetailedView) {
    listContainer?.classList.add('detailed-mode');
    detailContainer?.classList.add('detailed-mode');
    if (btnText) btnText.textContent = t('compact', 'Compact');
  } else {
    listContainer?.classList.remove('detailed-mode');
    detailContainer?.classList.remove('detailed-mode');
    if (btnText) btnText.textContent = t('detailed', 'Detailed');
  }
};

let isSingleColumn = false;
window.toggleLayoutMode = function() {
  isSingleColumn = !isSingleColumn;
  const listContainer = document.getElementById('plugin-list-container');
  const btnText = document.getElementById('layout-mode-text');
  const btnIcon = document.getElementById('btn-toggle-layout')?.querySelector('svg');
  if (isSingleColumn) {
    listContainer?.classList.add('force-single-column');
    if (btnText) btnText.textContent = t('twoColumns', '2 Columns');
    if (btnIcon) btnIcon.innerHTML = '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>';
  } else {
    listContainer?.classList.remove('force-single-column');
    if (btnText) btnText.textContent = t('oneColumn', '1 Column');
    if (btnIcon) btnIcon.innerHTML = '<rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect>';
  }
};

let isGroupingEnabled = false;
window.toggleGroupingMode = function() {
  isGroupingEnabled = !isGroupingEnabled;
  const btnText = document.getElementById('grouping-mode-text');
  if (btnText) {
    btnText.textContent = isGroupingEnabled ? t('groupingOn', 'Grouping: On') : t('groupingOff', 'Grouping: Off');
  }
  renderCurrentTab();
};

let isDetailDetailedView = false;
window.toggleDetailViewMode = function() {
  isDetailDetailedView = !isDetailDetailedView;
  const listContainer = document.getElementById('detail-skills-list');
  const btnText = document.getElementById('detail-view-mode-text');
  if (isDetailDetailedView) {
    listContainer?.classList.add('detailed-mode');
    if (btnText) btnText.textContent = t('compact', 'Compact');
  } else {
    listContainer?.classList.remove('detailed-mode');
    if (btnText) btnText.textContent = t('detailed', 'Detailed');
  }
};

let isDetailSingleColumn = false;
window.toggleDetailLayoutMode = function() {
  isDetailSingleColumn = !isDetailSingleColumn;
  const listContainer = document.getElementById('detail-skills-list');
  const btnText = document.getElementById('detail-layout-mode-text');
  const btnIcon = document.getElementById('detail-btn-toggle-layout')?.querySelector('svg');
  if (isDetailSingleColumn) {
    listContainer?.classList.add('force-single-column');
    if (btnText) btnText.textContent = t('twoColumns', '2 Columns');
    if (btnIcon) btnIcon.innerHTML = '<line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line>';
  } else {
    listContainer?.classList.remove('force-single-column');
    if (btnText) btnText.textContent = t('oneColumn', '1 Column');
    if (btnIcon) btnIcon.innerHTML = '<rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect>';
  }
};

const createModal = document.getElementById('create-modal');
const createCategorySelect = document.getElementById('create-category');
const createTargetSelect = document.getElementById('create-target');
const fieldFolderNameContainer = document.getElementById('field-folder-name-container');
const fieldDisplayNameContainer = document.getElementById('field-display-name-container');
const pluginFieldsContainer = document.getElementById('plugin-fields-container');
const skillFieldsContainer = document.getElementById('skill-fields-container');
const lblNameField = document.getElementById('lbl-name-field');
const createErrorMsg = document.getElementById('create-error-msg');

document.getElementById('btn-open-create-modal')?.addEventListener('click', () => {
  openCreateModal();
});

document.getElementById('btn-cancel-create')?.addEventListener('click', () => {
  closeCreateModal();
});

document.getElementById('btn-submit-create')?.addEventListener('click', () => {
  submitCreate();
});

createCategorySelect?.addEventListener('change', () => {
  handleCategoryChange();
});

window.openCreateModal = function(presetCategory = null, presetTargetType = null, presetTargetId = null) {
  if (createErrorMsg) {
    createErrorMsg.style.display = 'none';
    createErrorMsg.textContent = '';
  }
  
  const nameEl = document.getElementById('create-name');
  if (nameEl) nameEl.value = '';
  const dNameEl = document.getElementById('create-display-name');
  if (dNameEl) dNameEl.value = '';
  const descEl = document.getElementById('create-description');
  if (descEl) descEl.value = '';
  const verEl = document.getElementById('create-version');
  if (verEl) verEl.value = '1.0.0';
  const authEl = document.getElementById('create-author');
  if (authEl) authEl.value = '';
  
  document.getElementById('create-scripts').checked = false;
  document.getElementById('create-examples').checked = false;
  document.getElementById('create-docs').checked = false;
  document.getElementById('create-resources').checked = false;
  
  let defaultCat = presetCategory;
  if (!defaultCat) {
    defaultCat = 'rule';
    if (currentTab === 'skills') defaultCat = 'skill';
    else if (currentTab === 'plugins') defaultCat = 'plugin';
    else if (currentTab === 'workflows') defaultCat = 'workflow';
  }
  createCategorySelect.value = defaultCat;
  
  handleCategoryChange();
  
  if (presetTargetType) {
    for (let i = 0; i < createTargetSelect.options.length; i++) {
      const opt = createTargetSelect.options[i];
      const isPluginMatch = presetTargetType === 'plugin' && opt.getAttribute('data-id') === presetTargetId;
      const isWorkspaceMatch = presetTargetType === 'workspace' && opt.getAttribute('data-id') === presetTargetId;
      const isGlobalMatch = presetTargetType === 'global';
      
      if (opt.value === presetTargetType && (isGlobalMatch || isPluginMatch || isWorkspaceMatch)) {
        createTargetSelect.selectedIndex = i;
        break;
      }
    }
  }
  
  if (createModal) createModal.style.display = 'flex';
};

function closeCreateModal() {
  if (createModal) createModal.style.display = 'none';
}

function handleCategoryChange() {
  const category = createCategorySelect.value;
  createTargetSelect.innerHTML = '';
  
  if (category !== 'rule') {
    const globalOption = document.createElement('option');
    globalOption.value = 'global';
    globalOption.textContent = t('optGlobalOption', 'Global');
    createTargetSelect.appendChild(globalOption);
  }
  
  workspaceFoldersList.forEach(folder => {
    const opt = document.createElement('option');
    opt.value = 'workspace';
    opt.setAttribute('data-id', folder.fsPath);
    let optText = t('optWorkspace', 'Workspace: {name}').replace('{name}', folder.name);
    opt.textContent = optText;
    createTargetSelect.appendChild(opt);
  });
  
  if (category === 'skill' || category === 'rule') {
    pluginsData.forEach(p => {
      const opt = document.createElement('option');
      opt.value = 'plugin';
      opt.setAttribute('data-id', p.id);
      let optText = t('optPlugin', 'Plugin: {name}').replace('{name}', p.displayName);
      opt.textContent = optText;
      createTargetSelect.appendChild(opt);
    });
  }
  
  const descLabel = document.getElementById('lbl-desc-field');
  if (descLabel) descLabel.innerHTML = t('labelDescription', 'Description');
  
  if (category === 'plugin') {
    if (lblNameField) lblNameField.innerHTML = `${t('labelFolderName', 'Folder Name')} <span style="color: #ef4444;">*</span>`;
    fieldFolderNameContainer.style.display = 'flex';
    fieldDisplayNameContainer.style.display = 'flex';
    pluginFieldsContainer.style.display = 'grid';
    skillFieldsContainer.style.display = 'none';
  } else if (category === 'skill') {
    if (lblNameField) lblNameField.innerHTML = `${t('labelFolderName', 'Folder Name')} <span style="color: #ef4444;">*</span>`;
    fieldFolderNameContainer.style.display = 'flex';
    fieldDisplayNameContainer.style.display = 'flex';
    pluginFieldsContainer.style.display = 'none';
    skillFieldsContainer.style.display = 'flex';
  } else if (category === 'workflow' || category === 'rule') {
    if (lblNameField) lblNameField.innerHTML = `${t('labelFileName', 'File Name')} <span style="color: #ef4444;">*</span>`;
    fieldFolderNameContainer.style.display = 'flex';
    fieldDisplayNameContainer.style.display = 'none';
    pluginFieldsContainer.style.display = 'none';
    skillFieldsContainer.style.display = 'none';
  }
}

function submitCreate() {
  if (createErrorMsg) {
    createErrorMsg.style.display = 'none';
    createErrorMsg.textContent = '';
  }
  
  const category = createCategorySelect.value;
  const targetOption = createTargetSelect.options[createTargetSelect.selectedIndex];
  if (!targetOption) {
    showCreateError('No destination selected.');
    return;
  }
  const targetType = targetOption.value;
  const targetId = targetOption.getAttribute('data-id') || '';
  
  const name = document.getElementById('create-name').value.trim();
  const displayName = document.getElementById('create-display-name').value.trim();
  const description = document.getElementById('create-description').value.trim();
  const version = document.getElementById('create-version').value.trim();
  const author = document.getElementById('create-author').value.trim();
  const createScripts = document.getElementById('create-scripts').checked;
  const createExamples = document.getElementById('create-examples').checked;
  const createDocs = document.getElementById('create-docs').checked;
  const createResources = document.getElementById('create-resources').checked;
  
  if (!name) {
    if (category === 'workflow' || category === 'rule') {
      showCreateError(t('validationFileEmpty', 'File name cannot be empty.'));
    } else {
      showCreateError(t('validationFolderEmpty', 'Folder name cannot be empty.'));
    }
    return;
  }
  
  const nameRegex = /^[a-zA-Z0-9_\-]+$/;
  if (!nameRegex.test(name)) {
    showCreateError(t('validationFolderFormat', 'Name can only contain Latin letters, numbers, hyphens and underscores.'));
    return;
  }

  vscode.postMessage({
    command: 'createItem',
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
    createResources
  });
  
  closeCreateModal();
}

function showCreateError(msg) {
  if (createErrorMsg) {
    createErrorMsg.textContent = msg;
    createErrorMsg.style.display = 'block';
  }
}

// Fallback to guarantee loading class is removed even if rendering is delayed
setTimeout(() => {
  document.body.classList.remove('loading');
}, 800);

