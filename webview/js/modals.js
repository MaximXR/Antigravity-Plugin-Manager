// Module: modals.js - Modals for conflicts, creation wizard, plugin updates, and live context

// --- Conflicts Section ---
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
window.renderConflicts = renderConflicts;

function resolveConflict(id, category, resolution, activePath, storagePath, isDir) {
  vscode.postMessage({
    command: 'resolveConflict',
    id: id,
    category: category,
    resolution: resolution,
    activePath: decodeURIComponent(activePath),
    storagePath: decodeURIComponent(storagePath),
    isDir: isDir
  });
}
window.resolveConflict = resolveConflict;

// --- Creation Wizard Modal ---
const createModal = document.getElementById('create-modal');
const createCategorySelect = document.getElementById('create-category');
const createTargetSelect = document.getElementById('create-target');
const fieldFolderNameContainer = document.getElementById('field-folder-name-container');
const fieldDisplayNameContainer = document.getElementById('field-display-name-container');
const pluginFieldsContainer = document.getElementById('plugin-fields-container');
const skillFieldsContainer = document.getElementById('skill-fields-container');
const lblNameField = document.getElementById('lbl-name-field');
const createErrorMsg = document.getElementById('create-error-msg');

function openCreateModal(presetCategory = null, presetTargetType = null, presetTargetId = null) {
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
  
  const scEl = document.getElementById('create-scripts');
  if (scEl) scEl.checked = false;
  const exEl = document.getElementById('create-examples');
  if (exEl) exEl.checked = false;
  const docEl = document.getElementById('create-docs');
  if (docEl) docEl.checked = false;
  const resEl = document.getElementById('create-resources');
  if (resEl) resEl.checked = false;
  
  let defaultCat = 'plugin';
  if (presetCategory) {
    defaultCat = presetCategory;
  } else if (currentTab === 'skills') {
    defaultCat = 'skill';
  } else if (currentTab === 'workflows') {
    defaultCat = 'workflow';
  } else if (currentTab === 'rules') {
    defaultCat = 'rule';
  }
  if (createCategorySelect) {
    createCategorySelect.value = defaultCat;
  }
  
  handleCategoryChange();
  
  if (presetTargetType && createTargetSelect) {
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
}
window.openCreateModal = openCreateModal;

function closeCreateModal() {
  if (createModal) createModal.style.display = 'none';
}
window.closeCreateModal = closeCreateModal;

function handleCategoryChange() {
  if (!createCategorySelect || !createTargetSelect) return;
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
    if (fieldFolderNameContainer) fieldFolderNameContainer.style.display = 'flex';
    if (fieldDisplayNameContainer) fieldDisplayNameContainer.style.display = 'flex';
    if (pluginFieldsContainer) pluginFieldsContainer.style.display = 'grid';
    if (skillFieldsContainer) skillFieldsContainer.style.display = 'none';
  } else if (category === 'skill') {
    if (lblNameField) lblNameField.innerHTML = `${t('labelFolderName', 'Folder Name')} <span style="color: #ef4444;">*</span>`;
    if (fieldFolderNameContainer) fieldFolderNameContainer.style.display = 'flex';
    if (fieldDisplayNameContainer) fieldDisplayNameContainer.style.display = 'flex';
    if (pluginFieldsContainer) pluginFieldsContainer.style.display = 'none';
    if (skillFieldsContainer) skillFieldsContainer.style.display = 'flex';
  } else if (category === 'workflow' || category === 'rule') {
    if (lblNameField) lblNameField.innerHTML = `${t('labelFileName', 'File Name')} <span style="color: #ef4444;">*</span>`;
    if (fieldFolderNameContainer) fieldFolderNameContainer.style.display = 'flex';
    if (fieldDisplayNameContainer) fieldDisplayNameContainer.style.display = 'none';
    if (pluginFieldsContainer) pluginFieldsContainer.style.display = 'none';
    if (skillFieldsContainer) skillFieldsContainer.style.display = 'none';
  }
}
window.handleCategoryChange = handleCategoryChange;

function submitCreate() {
  if (createErrorMsg) {
    createErrorMsg.style.display = 'none';
    createErrorMsg.textContent = '';
  }
  
  const category = createCategorySelect ? createCategorySelect.value : '';
  const targetOption = createTargetSelect ? createTargetSelect.options[createTargetSelect.selectedIndex] : null;
  if (!targetOption) {
    showCreateError('No destination selected.');
    return;
  }
  const targetType = targetOption.value;
  const targetId = targetOption.getAttribute('data-id') || '';
  
  const name = document.getElementById('create-name')?.value.trim() || '';
  const displayName = document.getElementById('create-display-name')?.value.trim() || '';
  const description = document.getElementById('create-description')?.value.trim() || '';
  const version = document.getElementById('create-version')?.value.trim() || '';
  const author = document.getElementById('create-author')?.value.trim() || '';
  const createScripts = !!document.getElementById('create-scripts')?.checked;
  const createExamples = !!document.getElementById('create-examples')?.checked;
  const createDocs = !!document.getElementById('create-docs')?.checked;
  const createResources = !!document.getElementById('create-resources')?.checked;
  
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

  setSyncingState(2100);
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
window.submitCreate = submitCreate;

function showCreateError(msg) {
  if (createErrorMsg) {
    createErrorMsg.textContent = msg;
    createErrorMsg.style.display = 'block';
  }
}
window.showCreateError = showCreateError;

// --- Live Context Modal Handlers ---
function openLiveContextModal(event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById('live-context-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (!window.currentLiveContext) {
    requestLiveContext();
  } else {
    renderLiveContextModal();
  }
}
window.openLiveContextModal = openLiveContextModal;

function closeLiveContextModal() {
  const modal = document.getElementById('live-context-modal');
  if (modal) modal.style.display = 'none';
}
window.closeLiveContextModal = closeLiveContextModal;

function requestLiveContext() {
  vscode.postMessage({ command: 'getIdeLiveContext' });
}
window.requestLiveContext = requestLiveContext;

function renderLiveContextModal() {
  const body = document.getElementById('live-context-body');
  if (!body) return;
  const ctx = window.currentLiveContext;
  if (!ctx || !ctx.available) {
    body.innerHTML = `<div style="text-align:center; padding: 24px; color: var(--text-muted);">${t('liveContextNoData', 'Нет данных о недавних диалогах IDE')}</div>`;
    return;
  }

  const dateStr = ctx.updatedAt ? new Date(ctx.updatedAt).toLocaleTimeString() : '—';
  const activePluginsSet = new Set((ctx.activePlugins || []).map(p => p.toLowerCase()));

  const allPlugins = pluginsData || [];
  const managerActivePlugins = allPlugins.filter(p => p.isEnabled || p.isGloballyEnabled);

  let pluginsHtml = '';
  if (managerActivePlugins.length === 0) {
    pluginsHtml = '<div style="color: var(--text-muted); font-size: 11px;">(Нет активных плагинов)</div>';
  } else {
    pluginsHtml = managerActivePlugins.map(p => {
      const pid = (p.rawId || p.id || '').toLowerCase();
      const isLive = activePluginsSet.has(pid);
      const tagClass = isLive ? 'in-context' : 'pending';
      const statusIcon = isLive ? '✓' : '⏳';
      const statusText = isLive ? t('liveContextInPrompt', 'В контексте') : t('liveContextPending', 'Индексируется...');
      return `
        <div class="live-ctx-tag ${tagClass}">
          <span>${escapeHtml(p.displayName || p.name)}</span>
          <span style="opacity: 0.8; font-size: 9.5px;">${statusIcon} ${statusText}</span>
        </div>
      `;
    }).join('');
  }

  body.innerHTML = `
    <div class="live-ctx-card">
      <div class="live-ctx-header-meta">
        <span>${t('liveContextActiveConvo', 'Активный диалог:')} <code style="color: #93c5fd;">${escapeHtml(ctx.conversationId ? ctx.conversationId.slice(0, 8) + '...' : '—')}</code></span>
        <span>${t('liveContextLastUpdated', 'Обновлено:')} <b>${escapeHtml(dateStr)}</b></span>
      </div>
      <div style="font-size: 11.5px; color: var(--text-muted);">
        ${t('liveContextSkillsCount', 'Навыков в промпте:')} <b style="color: #34d399; font-size: 13px;">${ctx.skillsCount || 0}</b>
      </div>
    </div>

    <div>
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: #f1f5f9;">
        ${t('liveContextActivePlugins', 'Плагины в промпте:')}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${pluginsHtml}
      </div>
    </div>
  `;
}
window.renderLiveContextModal = renderLiveContextModal;

// --- Plugin Update Modal & Updates Checking ---

function updateToolbarBadge() {
  const badge = document.getElementById('update-count-badge');
  if (!badge) return;
  const count = updatesData && typeof updatesData.updatesCount === 'number' ? updatesData.updatesCount : 0;
  if (count > 0) {
    badge.textContent = String(count);
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}
window.updateToolbarBadge = updateToolbarBadge;

function triggerCheckUpdates(btnEl) {
  const icons = document.querySelectorAll('.update-icon');
  icons.forEach(i => i.classList.add('rotating'));
  const chkBtnText = document.getElementById('btn-check-updates-text');
  if (chkBtnText) chkBtnText.textContent = t('checkingUpdates', 'Checking...');
  vscode.postMessage({ command: 'checkUpdates' });
}
window.triggerCheckUpdates = triggerCheckUpdates;

function openPluginUpdateModal(pluginId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const modal = document.getElementById('plugin-update-modal');
  if (!modal) return;
  
  const p = (pluginsData || []).find(x => x.id === pluginId || x.rawId === pluginId || x.name === pluginId);
  if (!p) {
    console.warn(`Plugin with id ${pluginId} not found in pluginsData`);
    return;
  }
  targetUpdatePlugin = p;
  
  const uInfo = updatesData && updatesData.updates ? (updatesData.updates[pluginId] || (p && updatesData.updates[p.id]) || (p && updatesData.updates[p.name])) : null;
  const currentVer = p.version || '1.0.0';
  const newVer = uInfo && uInfo.remoteVersion ? uInfo.remoteVersion : currentVer;
  const repoUrl = uInfo && uInfo.repoUrl ? uInfo.repoUrl : (p.repository || '');
  const isGit = !!(uInfo && uInfo.hasGitDir);
  
  const titleEl = document.getElementById('update-modal-title');
  if (titleEl) titleEl.textContent = `${t('updateModalTitle', 'Update Plugin')}: ${p.displayName || p.name || p.id}`;
  
  const subEl = document.getElementById('update-modal-subtitle');
  if (subEl) subEl.textContent = p.physicalPath || '';
  
  const bodyEl = document.getElementById('plugin-update-body');
  if (bodyEl) {
    const methodText = isGit 
      ? t('updateMethodGitPull', 'Git Pull (native)') 
      : t('updateMethodGitClone', 'Git Clone & Replace (creates .git)');

    bodyEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px 14px;">
        <div>
          <div style="font-size: 11px; color: var(--text-muted);">${t('currentVersion', 'Current')}</div>
          <div style="font-size: 14px; font-weight: 700; color: #cbd5e1;">v${escapeHtml(currentVer)}</div>
        </div>
        <div style="font-size: 18px; color: var(--text-muted);">➔</div>
        <div>
          <div style="font-size: 11px; color: var(--text-muted);">${t('newVersion', 'New Version')}</div>
          <div style="font-size: 14px; font-weight: 700; color: #34d399;">v${escapeHtml(newVer)}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-glass); border-radius: 8px; padding: 10px 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted); font-size: 11px;">${t('repoUrl', 'Repository')}:</span>
          ${repoUrl ? `<a href="${escapeQuotes(repoUrl)}" target="_blank" style="color: #60a5fa; text-decoration: none; font-size: 11px;">${escapeHtml(repoUrl.replace('https://github.com/', ''))} ↗</a>` : `<span style="font-size: 11px; color: var(--text-muted);">—</span>`}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted); font-size: 11px;">${t('updateMethod', 'Update method')}:</span>
          <span style="font-size: 11px; font-family: var(--font-mono, monospace); color: ${isGit ? '#34d399' : '#60a5fa'};">
            ${escapeHtml(methodText)}
          </span>
        </div>
      </div>

      <div id="plugin-update-log-box" style="display: none; background: #0b0f19; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 12px; font-family: var(--font-mono, monospace); font-size: 11px; max-height: 140px; overflow-y: auto; white-space: pre-wrap; line-height: 1.4; color: #94a3b8;"></div>
    `;
  }
  
  const btnConfirm = document.getElementById('btn-confirm-update');
  if (btnConfirm) {
    const confirmLabel = t('btnConfirmUpdate', 'Update to v{version}').replace('{version}', newVer);
    btnConfirm.textContent = confirmLabel;
    btnConfirm.style.background = '#2563eb';
    btnConfirm.disabled = false;
  }
  const btnCancel = document.getElementById('btn-cancel-update');
  if (btnCancel) btnCancel.disabled = false;

  modal.style.display = 'flex';
}
window.openPluginUpdateModal = openPluginUpdateModal;

function closePluginUpdateModal() {
  const modal = document.getElementById('plugin-update-modal');
  if (modal) modal.style.display = 'none';
  targetUpdatePlugin = null;
}
window.closePluginUpdateModal = closePluginUpdateModal;

function appendUpdateLog(msg) {
  const logBox = document.getElementById('plugin-update-log-box');
  if (logBox) {
    logBox.style.display = 'block';
    const entry = document.createElement('div');
    entry.textContent = msg;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  }
}
window.appendUpdateLog = appendUpdateLog;

function executePluginUpdate() {
  if (!targetUpdatePlugin) return;
  const btnConfirm = document.getElementById('btn-confirm-update');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = t('updatingPlugin', 'Updating...');
  }
  const btnCancel = document.getElementById('btn-cancel-update');
  if (btnCancel) btnCancel.disabled = true;

  appendUpdateLog(`Starting update for ${targetUpdatePlugin.id}...`);
  vscode.postMessage({
    command: 'updatePlugin',
    pluginId: targetUpdatePlugin.id,
    physicalPath: targetUpdatePlugin.physicalPath
  });
}
window.executePluginUpdate = executePluginUpdate;

// --- Move Resource Modal (Clean 3-Tier Architecture) ---
let currentMoveData = null;

function openMoveModal(msgData) {
  const modal = document.getElementById('move-modal');
  if (!modal) return;

  const data = msgData.data || msgData;
  currentMoveData = {
    itemId: data.itemId || '',
    category: data.category || '',
    sourcePath: data.sourcePath || '',
    destinations: data.destinations || [],
    enableInWorkspaceRoot: data.enableInWorkspaceRoot || null
  };

  const subtitleEl = document.getElementById('move-modal-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = `${currentMoveData.itemId} (${currentMoveData.category})`;
  }

  const currentPathEl = document.getElementById('move-current-path');
  if (currentPathEl) {
    currentPathEl.textContent = currentMoveData.sourcePath || '—';
  }

  const conflictBox = document.getElementById('move-conflict-box');
  if (conflictBox) conflictBox.style.display = 'none';

  const errorBox = document.getElementById('move-error-box');
  if (errorBox) errorBox.style.display = 'none';

  const customPathInput = document.getElementById('move-custom-path-input');
  if (customPathInput) customPathInput.value = '';

  const listEl = document.getElementById('move-destinations-list');
  if (listEl) {
    if (currentMoveData.destinations.length === 0) {
      listEl.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); padding: 8px 4px;">${t('noDestinationsAvailable', 'No standard destinations available. Choose a custom folder below.')}</div>`;
    } else {
      listEl.innerHTML = currentMoveData.destinations.map((d, index) => {
        const isChecked = index === 0 ? 'checked' : '';
        return `
          <label style="display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; cursor: pointer; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
            <input type="radio" name="move-target-radio" value="${escapeHtml(d.targetParent)}" ${isChecked} style="margin-top: 2px;" onchange="onMoveTargetRadioChange()">
            <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;">
              <span style="font-size: 12px; font-weight: 500; color: #f1f5f9;">${d.icon || '📁'} ${escapeHtml(d.label)}</span>
              <span style="font-size: 10px; color: var(--text-muted); word-break: break-all; font-family: monospace;">${escapeHtml(d.description || d.targetParent)}</span>
            </div>
          </label>
        `;
      }).join('');
    }
  }

  modal.style.display = 'flex';
}
window.openMoveModal = openMoveModal;

function closeMoveModal() {
  const modal = document.getElementById('move-modal');
  if (modal) modal.style.display = 'none';
  currentMoveData = null;
}
window.closeMoveModal = closeMoveModal;

function onMoveTargetRadioChange() {
  const conflictBox = document.getElementById('move-conflict-box');
  if (conflictBox) conflictBox.style.display = 'none';
  const errorBox = document.getElementById('move-error-box');
  if (errorBox) errorBox.style.display = 'none';
}
window.onMoveTargetRadioChange = onMoveTargetRadioChange;

function onMoveCustomPathInput() {
  const customRadio = document.getElementById('move-radio-custom');
  if (customRadio) customRadio.checked = true;
  onMoveTargetRadioChange();
}
window.onMoveCustomPathInput = onMoveCustomPathInput;

function requestBrowseCustomFolder() {
  vscode.postMessage({
    command: 'chooseCustomMoveFolder'
  });
}
window.requestBrowseCustomFolder = requestBrowseCustomFolder;

function onCustomMoveFolderChosen(folderPath) {
  if (!folderPath) return;
  const input = document.getElementById('move-custom-path-input');
  if (input) {
    input.value = folderPath;
  }
  const customRadio = document.getElementById('move-radio-custom');
  if (customRadio) {
    customRadio.checked = true;
  }
  onMoveTargetRadioChange();
}
window.onCustomMoveFolderChosen = onCustomMoveFolderChosen;

function showMoveConflict(msg) {
  const conflictBox = document.getElementById('move-conflict-box');
  const msgEl = document.getElementById('move-conflict-msg');
  if (conflictBox && msgEl) {
    msgEl.textContent = msg || t('moveConflictWarning', 'Target already exists. Overwrite?');
    const chk = document.getElementById('move-overwrite-checkbox');
    if (chk) chk.checked = true;
    conflictBox.style.display = 'flex';
  }
}
window.showMoveConflict = showMoveConflict;

function showMoveError(msg) {
  const errorBox = document.getElementById('move-error-box');
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }
}
window.showMoveError = showMoveError;

function submitMoveItem() {
  if (!currentMoveData || !currentMoveData.sourcePath) return;

  const customRadio = document.getElementById('move-radio-custom');
  let selectedTargetDir = '';

  if (customRadio && customRadio.checked) {
    const customInput = document.getElementById('move-custom-path-input');
    selectedTargetDir = customInput ? customInput.value.trim() : '';
    if (!selectedTargetDir) {
      showMoveError(t('customFolderEmpty', 'Please specify or browse a destination folder.'));
      return;
    }
  } else {
    const checkedRadio = document.querySelector('input[name="move-target-radio"]:checked');
    if (checkedRadio) {
      selectedTargetDir = checkedRadio.value;
    }
  }

  if (!selectedTargetDir) {
    showMoveError(t('selectDestinationFolder', 'Please select a destination.'));
    return;
  }

  const overwriteCheckbox = document.getElementById('move-overwrite-checkbox');
  const isOverwrite = overwriteCheckbox ? overwriteCheckbox.checked : false;

  setSyncingState(2500);
  vscode.postMessage({
    command: 'executeMove',
    physicalPath: currentMoveData.sourcePath,
    targetDir: selectedTargetDir,
    overwrite: isOverwrite,
    category: currentMoveData.category,
    itemId: currentMoveData.itemId,
    enableInWorkspaceRoot: currentMoveData.enableInWorkspaceRoot
  });
}
window.submitMoveItem = submitMoveItem;

