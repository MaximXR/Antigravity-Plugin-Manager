// Module: pluginDetails.js - Plugin Details view, Hero card, sub-resource rendering

function openPluginDetails(pluginId) {
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
  if (typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
}
window.openPluginDetails = openPluginDetails;

function closePluginDetails() {
  activePluginId = null;
  if (searchInput) searchInput.value = '';
  if (previousTabBeforePluginDetails) {
    const prev = previousTabBeforePluginDetails;
    previousTabBeforePluginDetails = null;
    switchTab(prev);
  } else {
    renderCurrentTab();
    if (typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  }
}
window.closePluginDetails = closePluginDetails;

function renderPluginDetailsView() {
  const plugin = pluginsData.find(p => p.id === activePluginId || p.name === activePluginId);
  if (!plugin) {
    closePluginDetails();
    return;
  }

  const mainViewTop = document.getElementById('main-view-top');
  const mainNav = document.getElementById('main-nav-controls');
  const detailNav = document.getElementById('detail-nav-controls');
  const mainView = document.getElementById('main-view');
  const detailView = document.getElementById('detail-view');

  if (mainViewTop) mainViewTop.style.display = 'none';
  if (mainNav) mainNav.style.display = 'none';
  if (detailNav) detailNav.style.display = 'block';
  if (mainView) mainView.style.display = 'none';
  if (detailView) detailView.style.display = 'block';

  const pluginDisplayName = plugin.displayName || plugin.name || plugin.id;
  const rawId = plugin.id || plugin.name;

  // Unified Header elements update
  const backBtn = document.getElementById('nav-btn-back');
  if (backBtn) backBtn.style.display = 'inline-flex';

  const listTitle = document.getElementById('list-section-title');
  if (listTitle) {
    listTitle.textContent = t('pluginDetails', 'Plugin Details') + ': ' + pluginDisplayName;
  }

  const btnGrouping = document.getElementById('btn-toggle-grouping');
  if (btnGrouping) btnGrouping.style.display = 'none';

  const btnCreateLabel = document.getElementById('btn-create-label');
  if (btnCreateLabel) btnCreateLabel.textContent = t('createSkill', 'Create Skill');

  if (searchInput) {
    searchInput.placeholder = t('searchPluginResources', 'Search plugin skills, rules, MCP...');
  }

  // Title in header
  const titleNameEl = document.getElementById('detail-plugin-title-name');
  if (titleNameEl) {
    titleNameEl.textContent = pluginDisplayName;
  }

  // Hero Display Name & ID
  const heroNameEl = document.getElementById('hero-display-name');
  if (heroNameEl) heroNameEl.textContent = pluginDisplayName;

  const heroCopyTitleBtn = document.getElementById('hero-copy-title-btn');
  if (heroCopyTitleBtn) {
    heroCopyTitleBtn.onclick = function() { copyText(this, rawId); };
  }

  const heroIdBadge = document.getElementById('hero-id-badge');
  const heroIdEl = document.getElementById('hero-id-text');
  const heroCopyIdBtn = document.getElementById('hero-copy-id-btn');

  // Only display the separate ID badge if displayName is distinct from the raw ID
  if (heroIdBadge) {
    if (plugin.displayName && plugin.displayName !== rawId) {
      heroIdBadge.style.display = 'inline-flex';
      if (heroIdEl) heroIdEl.textContent = 'id: ' + rawId;
      if (heroCopyIdBtn) {
        heroCopyIdBtn.onclick = function() { copyText(this, rawId); };
      }
    } else {
      heroIdBadge.style.display = 'none';
    }
  }

  // Hero Version & Author
  const heroVerEl = document.getElementById('hero-version');
  if (heroVerEl) heroVerEl.textContent = 'v' + (plugin.version || '1.0.0');

  const heroAuthorContainer = document.getElementById('hero-author-container');
  const heroAuthorEl = document.getElementById('hero-author');
  if (heroAuthorContainer && heroAuthorEl) {
    if (plugin.author) {
      heroAuthorEl.textContent = plugin.author;
      heroAuthorContainer.style.display = 'inline-flex';
    } else {
      heroAuthorContainer.style.display = 'none';
    }
  }

  // Hero Scope Badge
  const scopeContainer = document.getElementById('hero-scope-badge');
  if (scopeContainer) {
    if (plugin.isLocal) {
      scopeContainer.innerHTML = `
        <div class="res-tag active res-local" style="font-size: 10px; padding: 2px 6px;">
          <span class="res-indicator"></span>
          <span>${t('badgeLocal', 'Local')} • ${escapeHtml(plugin.workspaceName || '')}</span>
        </div>
      `;
    } else if (plugin.source === 'configured' || plugin.sourceLabel) {
      scopeContainer.innerHTML = `
        <div class="res-tag active res-custom-repo" style="font-size: 10px; padding: 2px 6px; background: rgba(147, 51, 234, 0.15); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.3);">
          <span class="res-indicator" style="background: #c084fc;"></span>
          <span>📁 ${escapeHtml(plugin.sourceLabel || t('scopeCustomRepo', 'External Folder'))}</span>
        </div>
      `;
    } else {
      scopeContainer.innerHTML = `
        <div class="res-tag active res-global" style="font-size: 10px; padding: 2px 6px;">
          <span class="res-indicator"></span>
          <span>${t('scopeStandardGlobal', 'Global (~/.gemini)')}</span>
        </div>
      `;
    }
  }

  // Hero Status Badge
  const statusContainer = document.getElementById('hero-status-badge');
  if (statusContainer) {
    statusContainer.innerHTML = getStatusPillHtml(plugin, 'plugin');
  }

  // Global Toggle & Workspace Badge
  const heroSwitch = document.getElementById('hero-switch-container');
  const heroWsBadge = document.getElementById('hero-workspace-badge');
  const heroToggle = document.getElementById('hero-plugin-toggle');
  if (plugin.isLocal) {
    if (heroSwitch) heroSwitch.style.display = 'none';
    if (heroWsBadge) heroWsBadge.style.display = 'block';
  } else {
    if (heroSwitch) heroSwitch.style.display = 'flex';
    if (heroWsBadge) heroWsBadge.style.display = 'none';
    if (heroToggle) {
      heroToggle.disabled = false;
      heroToggle.checked = plugin.isGloballyEnabled;
      heroToggle.title = plugin.source === 'global' && (plugin.isEnabledForProject || plugin.projectOverride === 'enabled') ? t('tooltipPluginGlobalToggleProjectWarn', 'Внимание: плагин подключен к проекту. Глобальное отключение заблокирует его и в проекте!') : '';
      heroToggle.onchange = (e) => {
        togglePluginGlobal(plugin.id, e.target.checked, plugin.physicalPath);
      };
    }
  }

  // Project Override in Hero Card
  const heroProjContainer = document.getElementById('hero-project-override-container');
  if (heroProjContainer) {
    const activeWs = getActiveWorkspaceRoot();
    if (activeWs && !plugin.isLocal && plugin.physicalPath) {
      heroProjContainer.style.display = 'block';
      const overrideState = plugin.projectOverride || (plugin.projectActive === true ? 'enabled' : (plugin.projectActive === false ? 'disabled' : 'none'));
      const isAuto = overrideState === 'none';
      const isForcedOn = overrideState === 'enabled';
      const isForcedOff = overrideState === 'disabled';
      heroProjContainer.innerHTML = `
        <div class="project-segmented-control" title="${t('tooltipProjectSegmented', 'Project override')}">
          <span class="project-seg-label">${t('projectPrefix', 'Проект:')}</span>
          <div class="project-seg-group">
            <button class="project-seg-btn ${isAuto ? 'active' : ''}" title="${t('tooltipSegAuto', 'Default: Inherits global status')}" onclick="togglePluginProject('${escapeQuotes(activeWs)}', '${escapeQuotes(plugin.physicalPath)}', '${escapeQuotes(plugin.id)}', 'reset')">${t('optAuto', 'По умолч.')}</button>
            <button class="project-seg-btn seg-on ${isForcedOn ? 'active' : ''}" title="${plugin.source === 'global' && !plugin.isGloballyEnabled ? t('tooltipPluginSegOnGlobalDisabledWarn', 'Внимание: плагин отключен глобально. Из-за ядра Antigravity в дефолтной папке проект не сможет его загрузить. Переместите в библиотеку [→]') : t('tooltipSegOn', 'Force enable for this project')}" onclick="togglePluginProject('${escapeQuotes(activeWs)}', '${escapeQuotes(plugin.physicalPath)}', '${escapeQuotes(plugin.id)}', 'enable')">✓ ${t('optOn', 'Вкл')}</button>
            <button class="project-seg-btn seg-off ${isForcedOff ? 'active' : ''}" title="${t('tooltipSegOff', 'Force disable for this project')}" onclick="togglePluginProject('${escapeQuotes(activeWs)}', '${escapeQuotes(plugin.physicalPath)}', '${escapeQuotes(plugin.id)}', 'disable')">✕ ${t('optOff', 'Выкл')}</button>
          </div>
        </div>
      `;
    } else {
      heroProjContainer.style.display = 'none';
      heroProjContainer.innerHTML = '';
    }
  }

  // Hero Update Container
  const heroUpdateBox = document.getElementById('hero-update-container');
  if (heroUpdateBox) {
    const uInfo = updatesData && updatesData.updates ? updatesData.updates[plugin.id] : null;
    if (uInfo && uInfo.hasUpdate) {
      heroUpdateBox.style.display = 'block';
      heroUpdateBox.innerHTML = `
        <div class="hero-update-alert">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🚀</span>
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #93c5fd;">${t('updateAvailable', 'Update available')}: v${escapeHtml(uInfo.remoteVersion)}</div>
              <div style="font-size: 10px; color: var(--text-muted);">${t('currentVersion', 'Current')}: v${escapeHtml(plugin.version || '1.0.0')}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${uInfo.repoUrl ? `<a href="${escapeQuotes(uInfo.repoUrl)}" target="_blank" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px; height: 24px; text-decoration: none; display: inline-flex; align-items: center;">${t('viewChangelog', 'Changelog')} ↗</a>` : ''}
            <button class="btn" style="padding: 3px 10px; font-size: 11px; height: 24px; background: #2563eb; color: white; display: inline-flex; align-items: center; gap: 4px;" onclick="openPluginUpdateModal('${escapeQuotes(plugin.id)}', event)">
              <span>⚡ ${t('updateNow', 'Update')}</span>
            </button>
          </div>
        </div>
      `;
    } else {
      heroUpdateBox.style.display = 'none';
      heroUpdateBox.innerHTML = '';
    }
  }

  // Hero Actions Bar
  const btnHeroFolder = document.getElementById('btn-hero-open-folder');
  if (btnHeroFolder) {
    btnHeroFolder.onclick = () => {
      openItemFolder('plugin', plugin.id, plugin.isEnabled, plugin.isLocal, plugin.physicalPath);
    };
  }
  const btnHeroManifest = document.getElementById('btn-hero-open-manifest');
  if (btnHeroManifest) {
    btnHeroManifest.onclick = () => {
      openFileInEditor('plugin', plugin.physicalPath);
    };
  }
  const btnHeroMove = document.getElementById('btn-hero-move');
  if (btnHeroMove) {
    btnHeroMove.onclick = () => {
      moveItem(plugin.id, 'plugin', null, plugin.isEnabled, plugin.isLocal, plugin.physicalPath);
    };
  }
  const btnHeroDelete = document.getElementById('btn-hero-delete');
  if (btnHeroDelete) {
    btnHeroDelete.onclick = () => {
      deleteItem('plugin', plugin.id, plugin.displayName, plugin.physicalPath);
    };
  }

  // Hero Path Strip
  const heroPathVal = document.getElementById('hero-path-value');
  if (heroPathVal) {
    heroPathVal.textContent = plugin.physicalPath || '';
    heroPathVal.onclick = () => {
      openItemFolder('plugin', plugin.id, plugin.isEnabled, plugin.isLocal, plugin.physicalPath);
    };
  }
  const heroCopyPathBtn = document.getElementById('hero-copy-path-btn');
  if (heroCopyPathBtn) {
    heroCopyPathBtn.onclick = (e) => {
      copyText(e.currentTarget, plugin.physicalPath || '');
    };
  }

  // Hero Description
  const heroDescEl = document.getElementById('hero-description');
  if (heroDescEl) {
    heroDescEl.textContent = plugin.description || t('noDescription', 'No description.');
  }

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Render Skills
  let skillsList = plugin.skills || [];
  if (query) {
    skillsList = skillsList.filter(s =>
      String(s.displayName || '').toLowerCase().includes(query) ||
      String(s.name || '').toLowerCase().includes(query) ||
      (s.description && String(s.description).toLowerCase().includes(query))
    );
  }
  const hasSkills = skillsList.length > 0;
  document.getElementById('detail-skills-section').style.display = hasSkills ? 'block' : 'none';
  const skillsContainer = document.getElementById('detail-skills-list');
  if (hasSkills) {
    skillsContainer.innerHTML = skillsList.map(s => {
      return `
        <div class="glass-card plugin-card ${getCardStateClass(s)}">
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
                ${s.displayName && s.displayName !== s.name ? `<span class="plugin-human-title" style="font-size: 11px; opacity: 0.85;">${escapeHtml(s.displayName)}</span>` : ''}
              </div>
              <div class="card-status-subrow">
                ${getStatusPillHtml(s, 'skill')}
              </div>
              <div class="plugin-desc" title="${escapeHtml(s.description)}">${escapeHtml(s.description)}</div>
            </div>
            
            <div class="card-right-group">
              <div class="card-actions-top">
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
              <div class="card-actions-middle">
                <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
              </div>
              <div class="card-actions-bottom">
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
          ${plugin.isLocal ? `
            <div class="card-footer-tags">
              <div class="resource-tags">
                <div class="res-tag active res-local" style="font-size: 10px; padding: 2px 5px;">
                  <span class="res-indicator"></span>
                  <span>${t('local', 'Local')} • ${escapeHtml(plugin.workspaceName)}</span>
                </div>
              </div>
            </div>
          ` : ''}
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
  if (query) {
    rulesList = rulesList.filter(r =>
      String(r.displayName || '').toLowerCase().includes(query) ||
      String(r.name || '').toLowerCase().includes(query) ||
      (r.description && String(r.description).toLowerCase().includes(query))
    );
  }
  const hasRules = rulesList.length > 0;
  document.getElementById('detail-rules-section').style.display = hasRules ? 'block' : 'none';
  const rulesContainer = document.getElementById('detail-rules-list');
  if (hasRules) {
    rulesContainer.innerHTML = rulesList.map(r => {
      const isAct = plugin.isEnabled;
      const rFileName = r.physicalPath ? r.physicalPath.split(/[\/\\]/).pop() : (r.name || r.displayName);
      const rTag = '@' + rFileName;
      return `
      <div class="resource-item">
        <div class="resource-info">
          <div class="resource-name" style="display: flex; align-items: center; gap: 6px;" title="${escapeHtml(r.displayName)}">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isAct ? '#34d399' : '#ef4444'}; box-shadow: 0 0 6px ${isAct ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.6)'}; display: inline-block; flex-shrink: 0;"></span>
            <span>${escapeHtml(r.displayName)}</span>
            <button class="copy-name-btn" onclick="copyText(this, '${escapeQuotes(rTag)}')" title="${t('copyRuleTag', 'Copy context tag (@rule)')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
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
  if (query) {
    workflowsList = workflowsList.filter(w =>
      String(w.displayName || '').toLowerCase().includes(query) ||
      String(w.name || '').toLowerCase().includes(query) ||
      (w.description && String(w.description).toLowerCase().includes(query))
    );
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
  if (query) {
    mcpList = mcpList.filter(m =>
      String(m.name || '').toLowerCase().includes(query) ||
      String(m.command || '').toLowerCase().includes(query) ||
      (m.description && String(m.description).toLowerCase().includes(query))
    );
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
  if (query) {
    hooksList = hooksList.filter(h =>
      String(h.displayName || '').toLowerCase().includes(query) ||
      String(h.name || '').toLowerCase().includes(query) ||
      String(h.event || '').toLowerCase().includes(query) ||
      String(h.command || '').toLowerCase().includes(query)
    );
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
window.renderPluginDetailsView = renderPluginDetailsView;
