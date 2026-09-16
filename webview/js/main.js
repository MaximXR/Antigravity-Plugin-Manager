// Module: main.js - Entry point, view modes, event wiring, and initial lifecycle

function toggleViewMode() {
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
}
window.toggleViewMode = toggleViewMode;

function toggleLayoutMode() {
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
}
window.toggleLayoutMode = toggleLayoutMode;

function toggleGroupingMode() {
  isGroupingEnabled = !isGroupingEnabled;
  const btnText = document.getElementById('grouping-mode-text');
  if (btnText) {
    btnText.textContent = isGroupingEnabled ? t('groupingOn', 'Grouping: On') : t('groupingOff', 'Grouping: Off');
  }
  renderCurrentTab();
}
window.toggleGroupingMode = toggleGroupingMode;

function toggleDetailViewMode() {
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
}
window.toggleDetailViewMode = toggleDetailViewMode;

function toggleDetailLayoutMode() {
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
}
window.toggleDetailLayoutMode = toggleDetailLayoutMode;

function openConnectedFolder(folderPath) {
  if (folderPath) {
    vscode.postMessage({ command: 'openFolder', path: folderPath });
  }
}
window.openConnectedFolder = openConnectedFolder;

// Wire DOM Event Listeners
function attachEventListeners() {
  // Global & Workspace JSON configuration files
  document.getElementById('btn-open-config-json')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openConfigJson' });
  });

  document.getElementById('btn-open-plugins-json')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openPluginsJson' });
  });

  document.getElementById('btn-open-skills-json')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openSkillsJson' });
  });

  // Project Workspace JSON & Folder buttons
  document.getElementById('btn-open-project-plugins-json')?.addEventListener('click', () => {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'openPluginsJson', workspaceRoot: wsRoot });
  });

  document.getElementById('btn-open-project-skills-json')?.addEventListener('click', () => {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'openSkillsJson', workspaceRoot: wsRoot });
  });

  document.getElementById('btn-open-project-agents-folder')?.addEventListener('click', () => {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'openAgentsFolder', workspaceRoot: wsRoot });
  });

  // Explicit Global Connect buttons
  document.getElementById('btn-connect-plugins-global')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'connectFolder', type: 'plugins', scope: 'global' });
  });

  document.getElementById('btn-connect-skills-global')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'connectFolder', type: 'skills', scope: 'global' });
  });

  // Explicit Workspace Connect buttons
  document.getElementById('btn-connect-plugins-project')?.addEventListener('click', () => {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'connectFolder', type: 'plugins', scope: 'workspace', workspaceRoot: wsRoot });
  });

  document.getElementById('btn-connect-skills-project')?.addEventListener('click', () => {
    const wsRoot = getActiveWorkspaceRoot();
    vscode.postMessage({ command: 'connectFolder', type: 'skills', scope: 'workspace', workspaceRoot: wsRoot });
  });

  // Fallback legacy connect buttons
  document.getElementById('btn-connect-plugins')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'connectFolder', type: 'plugins' });
  });

  document.getElementById('btn-connect-skills')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'connectFolder', type: 'skills' });
  });

  document.getElementById('btn-select-storage')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'selectStorage' });
  });

  document.getElementById('btn-open-active')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openActive' });
  });

  document.getElementById('btn-open-skills-folder')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openActiveSkills' });
  });

  document.getElementById('btn-open-storage')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openStorage' });
  });

  document.getElementById('btn-refresh')?.addEventListener('click', (e) => {
    triggerRefresh(e.currentTarget);
  });

  document.getElementById('btn-detail-refresh')?.addEventListener('click', (e) => {
    triggerRefresh(e.currentTarget);
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderCurrentTab();
    });
  }

  document.getElementById('lang-select')?.addEventListener('change', (e) => {
    vscode.postMessage({ command: 'changeLanguage', language: e.target.value });
  });

  // Creation Wizard buttons
  document.getElementById('btn-open-create-modal')?.addEventListener('click', () => {
    if (activePluginId) {
      openCreateModal('skill', 'plugin', activePluginId);
    } else {
      openCreateModal();
    }
  });

  document.getElementById('btn-cancel-create')?.addEventListener('click', () => {
    closeCreateModal();
  });

  document.getElementById('btn-submit-create')?.addEventListener('click', () => {
    submitCreate();
  });

  if (createCategorySelect) {
    createCategorySelect.addEventListener('change', () => {
      handleCategoryChange();
    });
  }

  // Update Modal buttons
  document.getElementById('btn-confirm-update')?.addEventListener('click', () => {
    executePluginUpdate();
  });

  document.getElementById('btn-cancel-update')?.addEventListener('click', () => {
    closePluginUpdateModal();
  });

  document.getElementById('btn-check-updates')?.addEventListener('click', (e) => {
    triggerCheckUpdates(e.currentTarget);
  });

  // Request initial data from backend if not received yet
  try {
    vscode.postMessage({ command: 'ready' });
  } catch (_) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachEventListeners);
} else {
  attachEventListeners();
}

// Fallback to guarantee loading class is removed even if rendering is delayed
setTimeout(() => {
  document.body.classList.remove('loading');
}, 800);
