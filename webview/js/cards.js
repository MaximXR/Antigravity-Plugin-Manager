// Module: cards.js - Card renderers for plugins, rules, skills, workflows, MCP, hooks, and tab switching

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
  if (local.length > 0) groups.push({ key: 'local', title: t('groupWorkspace', 'Workspace / Local'), icon: '📁', items: local });
  if (global.length > 0) groups.push({ key: 'global', title: t('groupGlobal', 'Global'), icon: '🌐', items: global });
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
window.renderGroupedGrid = renderGroupedGrid;

function getScopeBadgeHtml(item) {
  if (item.isBuiltin || item.source === 'builtin') {
    return `<div class="res-tag active res-builtin" style="font-size: 10px; padding: 2px 5px;" title="${escapeHtml(item.physicalPath || '')}"><span class="res-indicator"></span><span>${t('badgeBuiltin', 'Built-in')}</span></div>`;
  }
  if (item.isLocal || item.isWorkspace) {
    const wsName = item.workspaceName ? ` • ${escapeHtml(item.workspaceName)}` : '';
    return `<div class="res-tag active res-local" style="font-size: 10px; padding: 2px 5px;" title="${escapeHtml(item.physicalPath || '')}"><span class="res-indicator"></span><span>${t('badgeLocal', 'Local')}${wsName}</span></div>`;
  }
  if (item.isPlugin || item.pluginId || item.pluginName) {
    const pName = item.pluginDisplayName || item.pluginName || item.pluginId || '';
    const pId = item.pluginId || item.pluginName || '';
    return `<div class="res-tag active res-plugin clickable" style="font-size: 10px; padding: 2px 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); openPluginDetails('${escapeQuotes(pId)}')" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(pName)} (${escapeHtml(item.physicalPath || '')})"><span class="res-indicator"></span><span>${t('badgePlugin', 'Plugin')}: ${escapeHtml(pName)}</span><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.8;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></div>`;
  }
  if (item.source === 'configured' || item.sourceLabel) {
    return `<div class="res-tag active res-custom-repo" style="font-size: 10px; padding: 2px 6px; background: rgba(147, 51, 234, 0.15); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.3);" title="${escapeHtml(item.physicalPath || '')}"><span class="res-indicator" style="background: #c084fc;"></span><span>📁 ${escapeHtml(item.sourceLabel || t('scopeCustomRepo', 'External Folder'))}</span></div>`;
  }
  return `<div class="res-tag active res-global" style="font-size: 10px; padding: 2px 5px;" title="${escapeHtml(item.physicalPath || '')}"><span class="res-indicator"></span><span>${t('scopeStandardGlobal', 'Global (~/.gemini)')}</span></div>`;
}
window.getScopeBadgeHtml = getScopeBadgeHtml;

function getCardStateClass(item) {
  if (!item) return '';
  if (item.isDefaultGlobalBlocked) return 'card-state-blocked';
  if (item.isEnabled) return 'card-state-active';
  return 'card-state-inactive';
}
window.getCardStateClass = getCardStateClass;

function getStatusPillHtml(item, category, currentWs) {
  let isActive = false;
  let label = '';
  let tooltip = '';

  if (category === 'plugin') {
    if (item.isLocal) {
      isActive = true;
      label = t('statusActiveWs', 'Вкл (проект)');
      tooltip = t('tooltipPluginLocal', 'Локальный плагин проекта (активен в этом проекте)');
    } else {
      const override = item.projectOverride || (item.projectActive === true ? 'enabled' : (item.projectActive === false ? 'disabled' : 'none'));
      if (override === 'enabled') {
        const isDefaultGlobalBlocked = item.source === 'global' && item.isGloballyEnabled === false;
        if (isDefaultGlobalBlocked) {
          isActive = false;
          label = t('statusBlockedWs', 'Заблокирован (ядро)');
          tooltip = t('tooltipPluginBlockedByRootExclude', 'Плагин подключен в .agents/plugins.json, но заблокирован ядром Antigravity из-за глобального отключения в ~/.gemini/config/plugins.json (или plugin.json). Переместите его в библиотеку [→] для работы в проекте.');
        } else {
          isActive = true;
          label = t('statusActiveWs', 'Вкл (проект)');
          tooltip = t('tooltipPluginActiveWs', 'Плагин работает, так как принудительно включен на уровне этого проекта (хотя глобально выключен)');
        }
      } else if (override === 'disabled') {
        isActive = false;
        label = t('statusDisabledWs', 'Выкл (проект)');
        tooltip = t('tooltipPluginDisabledWs', 'Плагин отключен для этого проекта, так как принудительно выключен на уровне проекта (хотя глобально включен)');
      } else {
        if (item.isGloballyEnabled !== false) {
          isActive = true;
          label = t('statusActive', 'Включен');
          tooltip = t('tooltipPluginActiveGlobal', 'Плагин активен по умолчанию (включен глобально)');
        } else {
          isActive = false;
          label = t('statusDisabled', 'Отключен');
          tooltip = t('tooltipPluginDisabledGlobal', 'Плагин отключен по умолчанию (выключен глобально)');
        }
      }
    }
  } else if (category === 'skill') {
    if (item.isBuiltin) {
      isActive = true;
      label = t('statusBuiltin', 'Встроенный');
      tooltip = t('tooltipSkillBuiltin', 'Встроенный системный навык IDE (всегда активен)');
    } else if (item.isPlugin) {
      if (item.isEnabled) {
        isActive = true;
        label = t('statusActivePlugin', 'Вкл (плагин)');
        tooltip = t('tooltipSkillPluginActive', 'Навык активен, так как родительский плагин включен');
      } else {
        isActive = false;
        label = t('statusDisabledPlugin', 'Выкл (плагин)');
        tooltip = t('tooltipSkillPluginDisabled', 'Навык отключен, так как родительский плагин отключен');
      }
    } else if (item.isLocal) {
      if (item.isEnabled !== false) {
        isActive = true;
        label = t('statusActiveWs', 'Вкл (проект)');
        tooltip = t('tooltipSkillLocal', 'Локальный навык текущего проекта (активен)');
      } else {
        isActive = false;
        label = t('statusDisabledWs', 'Выкл (проект)');
        tooltip = t('tooltipSkillDisabledWs', 'Навык отключен для этого проекта через exclude в .agents/skills.json');
      }
    } else {
      // Global skill
      const override = item.projectOverride || (item.projectActive === true ? 'enabled' : (item.projectActive === false ? 'disabled' : 'none'));
      if (override === 'enabled') {
        const isDefaultGlobalBlocked = item.source === 'global' && item.isGloballyEnabled === false;
        if (isDefaultGlobalBlocked) {
          isActive = false;
          label = t('statusBlockedWs', 'Заблокирован (ядро)');
          tooltip = t('tooltipSkillBlockedByRootExclude', 'Навык подключен в .agents/skills.json, но заблокирован ядром Antigravity из-за глобального отключения в ~/.gemini/config/skills.json. Переместите его в библиотеку [→] для работы в проекте.');
        } else {
          isActive = true;
          label = t('statusActiveWs', 'Вкл (проект)');
          tooltip = t('tooltipSkillActiveWs', 'Навык работает, так как принудительно подключен для этого проекта в .agents/skills.json');
        }
      } else if (override === 'disabled') {
        isActive = false;
        label = t('statusDisabledWs', 'Выкл (проект)');
        tooltip = t('tooltipSkillDisabledWs', 'Навык отключен для этого проекта через exclude в .agents/skills.json');
      } else {
        if (item.isGloballyEnabled !== false) {
          isActive = true;
          label = t('statusActive', 'Включен');
          tooltip = t('tooltipSkillActiveGlobal', 'Навык активен по умолчанию (включен глобально)');
        } else {
          isActive = false;
          label = t('statusDisabled', 'Отключен');
          tooltip = t('tooltipSkillDisabledGlobal', 'Навык отключен глобально (в exclude в ~/.gemini/config/skills.json)');
        }
      }
    }
  } else if (category === 'rule') {
    if (item.isPlugin) {
      if (item.isEnabled) {
        isActive = true;
        label = t('statusActivePlugin', 'Вкл (плагин)');
        tooltip = t('tooltipRulePluginActive', 'Правило активно, так как родительский плагин включен');
      } else {
        isActive = false;
        label = t('statusDisabledPlugin', 'Выкл (плагин)');
        tooltip = t('tooltipRulePluginDisabled', 'Правило не действует, так как родительский плагин выключен');
      }
    } else if (item.isWorkspace) {
      isActive = true;
      label = t('statusActiveWs', 'Вкл (проект)');
      tooltip = t('tooltipRuleWs', 'Локальное правило текущего проекта (активно)');
    } else {
      isActive = true;
      label = t('statusActive', 'Включен');
      tooltip = t('tooltipRuleGlobal', 'Глобальное системное правило (всегда активно во всех проектах)');
    }
  } else if (category === 'workflow') {
    if (item.isBuiltin) {
      isActive = true;
      label = t('statusBuiltin', 'Встроенный');
      tooltip = t('tooltipWorkflowBuiltin', 'Встроенный воркфлоу IDE (всегда активен)');
    } else if (item.isPlugin) {
      if (item.isEnabled) {
        isActive = true;
        label = t('statusActivePlugin', 'Вкл (плагин)');
        tooltip = t('tooltipWorkflowPluginActive', 'Воркфлоу активен, так как родительский плагин включен');
      } else {
        isActive = false;
        label = t('statusDisabledPlugin', 'Выкл (плагин)');
        tooltip = t('tooltipWorkflowPluginDisabled', 'Воркфлоу отключен, так как родительский плагин отключен');
      }
    } else if (item.isLocal) {
      isActive = true;
      label = t('statusActiveWs', 'Вкл (проект)');
      tooltip = t('tooltipWorkflowWs', 'Локальный воркфлоу проекта (активен)');
    } else {
      if (item.isEnabled !== false) {
        isActive = true;
        label = t('statusActive', 'Включен');
        tooltip = t('tooltipWorkflowActive', 'Воркфлоу активен');
      } else {
        isActive = false;
        label = t('statusDisabled', 'Отключен');
        tooltip = t('tooltipWorkflowDisabled', 'Воркфлоу отключен');
      }
    }
  } else if (category === 'mcp') {
    if (item.isBuiltin) {
      isActive = true;
      label = t('statusBuiltin', 'Встроенный');
      tooltip = t('tooltipMcpBuiltin', 'Встроенный системный MCP сервер IDE (всегда активен)');
    } else if (item.isPlugin) {
      if (item.isEnabled) {
        isActive = true;
        label = t('statusActivePlugin', 'Вкл (плагин)');
        tooltip = t('tooltipMcpPluginActive', 'MCP сервер активен, так как родительский плагин включен');
      } else {
        isActive = false;
        label = t('statusDisabledPlugin', 'Выкл (плагин)');
        tooltip = t('tooltipMcpPluginDisabled', 'MCP сервер отключен, так как родительский плагин отключен');
      }
    } else {
      const isAct = item.enabled !== false;
      isActive = isAct;
      label = isAct ? t('statusActive', 'Включен') : t('statusDisabled', 'Отключен');
      tooltip = isAct ? t('tooltipMcpActive', 'MCP сервер активен в конфигурации') : t('tooltipMcpDisabled', 'MCP сервер отключен в конфигурации (disabled: true)');
    }
  } else if (category === 'hook') {
    if (item.isProtected) {
      isActive = true;
      label = t('statusBuiltin', 'Встроенный');
      tooltip = t('tooltipHookBuiltin', 'Встроенный системный хук IDE (всегда активен)');
    } else if (item.isPlugin) {
      if (item.isEnabled) {
        isActive = true;
        label = t('statusActivePlugin', 'Вкл (плагин)');
        tooltip = t('tooltipHookPluginActive', 'Хук активен, так как родительский плагин включен');
      } else {
        isActive = false;
        label = t('statusDisabledPlugin', 'Выкл (плагин)');
        tooltip = t('tooltipHookPluginDisabled', 'Хук отключен, так как родительский плагин отключен');
      }
    } else {
      const isAct = item.enabled !== false;
      isActive = isAct;
      label = isAct ? t('statusActive', 'Включен') : t('statusDisabled', 'Отключен');
      tooltip = isAct ? t('tooltipHookActive', 'Хук активен в hooks.json (enabled: true)') : t('tooltipHookDisabled', 'Хук отключен в hooks.json (enabled: false)');
    }
  }

  return `
    <span class="card-status-pill ${isActive ? 'active' : 'inactive'}" title="${escapeQuotes(tooltip)}">
      <span class="status-dot ${isActive ? 'dot-active' : 'dot-inactive'}"></span>
      <span>${escapeHtml(label)}</span>
      <span class="status-help-q">?</span>
    </span>
  `;
}
window.getStatusPillHtml = getStatusPillHtml;

function renderPluginCard(p, idx) {
  const skillsCount = p.skillsCount !== undefined ? p.skillsCount : (p.skills ? p.skills.length : 0);
  const rulesCount = p.rulesCount !== undefined ? p.rulesCount : (p.rules ? p.rules.length : 0);
  const hooksCount = p.hooksCount !== undefined ? p.hooksCount : (p.hooks ? p.hooks.length : 0);
  const hasSkills = skillsCount > 0;
  const hasRules = rulesCount > 0;
  const hasHooks = hooksCount > 0;

  let projectOverrideHtml = '';
  if (workspaceFoldersList.length > 0 && !p.isLocal && p.physicalPath) {
    const currentWs = getActiveWorkspaceRoot();
    const overrideState = p.projectOverride || (p.projectActive === true ? 'enabled' : (p.projectActive === false ? 'disabled' : 'none'));
    const isAuto = overrideState === 'none';
    const isForcedOn = overrideState === 'enabled';
    const isForcedOff = overrideState === 'disabled';

    projectOverrideHtml = `
      <div class="project-segmented-control" title="${t('tooltipProjectSegmented', 'Project override: Default, Force On, or Force Off')}">
        <span class="project-seg-label">${t('projectPrefix', 'Проект:')}</span>
        <div class="project-seg-group">
          <button class="project-seg-btn ${isAuto ? 'active' : ''}" title="${t('tooltipSegAuto', 'Default: Inherits global status')}" onclick="event.stopPropagation(); togglePluginProject('${escapeQuotes(currentWs)}', '${escapeQuotes(p.physicalPath)}', '${escapeQuotes(p.id)}', 'reset')">${t('optAuto', 'По умолч.')}</button>
          <button class="project-seg-btn seg-on ${isForcedOn ? 'active' : ''}" title="${p.source === 'global' && !p.isGloballyEnabled ? t('tooltipPluginSegOnGlobalDisabledWarn', 'Внимание: плагин отключен глобально. Из-за ядра Antigravity в дефолтной папке проект не сможет его загрузить. Переместите в библиотеку [→]') : t('tooltipSegOn', 'Force enable for this project')}" onclick="event.stopPropagation(); togglePluginProject('${escapeQuotes(currentWs)}', '${escapeQuotes(p.physicalPath)}', '${escapeQuotes(p.id)}', 'enable')">✓ ${t('optOn', 'Вкл')}</button>
          <button class="project-seg-btn seg-off ${isForcedOff ? 'active' : ''}" title="${t('tooltipSegOff', 'Force disable for this project')}" onclick="event.stopPropagation(); togglePluginProject('${escapeQuotes(currentWs)}', '${escapeQuotes(p.physicalPath)}', '${escapeQuotes(p.id)}', 'disable')">✕ ${t('optOff', 'Выкл')}</button>
        </div>
      </div>
    `;
  }

  let scopeBadgeHtml = '';
  if (p.isLocal) {
    scopeBadgeHtml = `
      <div class="res-tag active res-local" style="font-size: 10px; padding: 2px 6px;" title="${escapeHtml(p.physicalPath || '')}">
        <span class="res-indicator"></span>
        <span>${t('badgeLocal', 'Local')} • ${escapeHtml(p.workspaceName || '')}</span>
      </div>
    `;
  } else if (p.source === 'configured' || p.sourceLabel) {
    scopeBadgeHtml = `
      <div class="res-tag active res-custom-repo" style="font-size: 10px; padding: 2px 6px; background: rgba(147, 51, 234, 0.15); color: #c084fc; border: 1px solid rgba(147, 51, 234, 0.3);" title="${escapeHtml(p.physicalPath || '')}">
        <span class="res-indicator" style="background: #c084fc;"></span>
        <span>📁 ${escapeHtml(p.sourceLabel || t('scopeCustomRepo', 'External Folder'))}</span>
      </div>
    `;
  } else {
    scopeBadgeHtml = `
      <div class="res-tag active res-global" style="font-size: 10px; padding: 2px 6px;" title="${escapeHtml(p.physicalPath || '')}">
        <span class="res-indicator"></span>
        <span>${t('scopeStandardGlobal', 'Global (~/.gemini)')}</span>
      </div>
    `;
  }
  const updateInfo = updatesData && updatesData.updates ? updatesData.updates[p.id] : null;
  const hasUpdate = updateInfo && updateInfo.hasUpdate;

  return `
    <div class="glass-card plugin-card ${getCardStateClass(p)}">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="card-index-num">#${idx}</span>
            <span class="plugin-title-text clickable" onclick="openPluginDetails('${p.id}')" title="${escapeHtml(p.displayName)}" style="cursor: pointer; font-weight: 700;">${escapeHtml(p.displayName)}</span>
            <button class="copy-name-btn" onclick="copyText(this, '${escapeQuotes(p.name || p.displayName)}')" title="${t('copyName', 'Copy name')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          
          <div class="card-status-subrow">
            ${getStatusPillHtml(p, 'plugin')}
          </div>

          ${hasUpdate ? `
            <div class="plugin-update-banner">
              <span class="plugin-update-tag">🚀 v${escapeHtml(updateInfo.remoteVersion)} ${t('updateAvailable', 'Update available')}</span>
              <button class="btn-update-now" onclick="openPluginUpdateModal('${escapeQuotes(p.id)}', event)">
                ⚡ ${t('updateNow', 'Update')}
              </button>
              ${updateInfo.repoUrl ? `
                <a class="btn-update-changelog" href="${escapeQuotes(updateInfo.repoUrl)}" target="_blank" onclick="event.stopPropagation()">
                  ↗ ${t('viewChangelog', 'Changelog')}
                </a>
              ` : ''}
            </div>
          ` : ''}

          <div class="plugin-desc" id="desc-${p.id}" title="${escapeHtml(p.description || '')}">
            ${escapeHtml(p.description) || t('noDescription', 'No description.')}
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions-top">
            <button class="card-action-btn" title="${t('openPluginJson', 'Open plugin.json')}" onclick="openFileInEditor('plugin', '${escapeQuotes(p.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('plugin', '${p.id}', ${p.isEnabled}, ${p.isLocal ? 'true' : 'false'}, '${escapeQuotes(p.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
          <div class="card-actions-middle">
            ${p.isLocal ? `
              <span class="card-badge-status">Workspace</span>
            ` : `
              <div id="switch-container-${p.id}">
                <label class="switch" title="${p.source === 'global' && (p.isEnabledForProject || p.projectOverride === 'enabled') ? t('tooltipPluginGlobalToggleProjectWarn', 'Внимание: плагин подключен к проекту. Глобальное отключение заблокирует его и в проекте!') : ''}">
                  <input type="checkbox" ${p.isGloballyEnabled ? 'checked' : ''} onchange="togglePluginGlobal('${escapeQuotes(p.id)}', this.checked, '${escapeQuotes(p.physicalPath || '')}')">
                  <span class="slider"></span>
                </label>
              </div>
              <div id="loader-${p.id}" style="display: none; padding-right: 6px;">
                <div class="spinner-small"></div>
              </div>
            `}
          </div>
          <div class="card-actions-bottom">
            <button class="card-action-btn plugin-move-btn" title="${t('move', 'Move')}" onclick="moveItem('${p.id}', 'plugin', null, ${p.isEnabled}, ${p.isLocal ? 'true' : 'false'}, '${escapeQuotes(p.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 8 21 12 17 16"></polyline>
                <line x1="3" y1="12" x2="21" y2="12"></line>
              </svg>
            </button>
            <button class="card-action-btn" title="${t('deleteBtn', 'Delete')}" onclick="deleteItem('plugin', '${p.id}', '${escapeQuotes(p.displayName)}', '${escapeQuotes(p.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadgeHtml}
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
          <div class="plugin-meta-chip">
            <span>v${escapeHtml(p.version || '1.0.0')}</span>
            ${p.author ? `<span>•</span> <span>${escapeHtml(p.author)}</span>` : ''}
          </div>
        </div>
        ${projectOverrideHtml ? `
          <div class="card-project-override-row">
            ${projectOverrideHtml}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
window.renderPluginCard = renderPluginCard;

function renderRuleCard(r, idx) {
  const scopeBadge = getScopeBadgeHtml(r);
  const ruleFileName = r.physicalPath ? r.physicalPath.split(/[\/\\]/).pop() : (r.name || r.displayName);
  const ruleTag = '@' + ruleFileName;

  return `
    <div class="glass-card plugin-card ${getCardStateClass(r)}">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="card-index-num">#${idx}</span>
            <span class="plugin-title-text clickable" onclick="openFileInEditor('rule', '${escapeQuotes(r.physicalPath)}')" title="${escapeHtml(r.displayName || r.name)}" style="cursor: pointer; font-weight: 700;">${escapeHtml(r.displayName || r.name)}</span>
            <button class="copy-name-btn" onclick="copyText(this, '${escapeQuotes(ruleTag)}')" title="${t('copyRuleTag', 'Copy context tag (@rule)')}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div class="card-status-subrow">
            ${getStatusPillHtml(r, 'rule')}
          </div>
          <div class="plugin-desc" title="${escapeHtml(r.description || '')}">${escapeHtml(r.description || '') || t('noDescription', 'No description.')}</div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions-top">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('rule', '${escapeQuotes(r.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
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
            ` : `
              <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('rule', '${r.id}', true, ${r.isWorkspace ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            `}
          </div>
          <div class="card-actions-middle">
            ${r.isProtected ? `
              <span class="card-badge-status">${t('protected', 'Protected')}</span>
            ` : (r.isPlugin ? `
              <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
            ` : (r.isWorkspace ? `
              <span class="card-badge-status">Workspace</span>
            ` : `
              <span class="card-badge-status">${t('badgeGlobal', 'Global')}</span>
            `))}
          </div>
          <div class="card-actions-bottom">
            ${!r.isProtected ? `
              ${r.isPlugin ? `
                <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('rule', '${r.id}', true, ${r.isWorkspace ? 'true' : 'false'}, '${escapeQuotes(r.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              ` : ''}
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
            ` : ''}
          </div>
        </div>
      </div>
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadge}
        </div>
      </div>
    </div>
  `;
}
window.renderRuleCard = renderRuleCard;

function renderSkillCard(s, idx) {
  const scopeBadge = getScopeBadgeHtml(s);

  let skillProjectOverrideHtml = '';
  if (workspaceFoldersList.length > 0 && !s.isLocal && !s.isBuiltin && !s.isPlugin && s.physicalPath) {
    const currentWs = getActiveWorkspaceRoot();
    const skillName = s.rawId || s.id || (s.name || '');
    const overrideState = s.projectOverride || (s.projectActive === true ? 'enabled' : (s.projectActive === false ? 'disabled' : 'none'));
    const isAuto = overrideState === 'none';
    const isForcedOn = overrideState === 'enabled';
    const isForcedOff = overrideState === 'disabled';

    skillProjectOverrideHtml = `
      <div class="project-segmented-control" title="${t('tooltipProjectSegmented', 'Project override: Default, Force On, or Force Off')}">
        <span class="project-seg-label">${t('projectPrefix', 'Проект:')}</span>
        <div class="project-seg-group">
          <button class="project-seg-btn ${isAuto ? 'active' : ''}" title="${t('tooltipSegAuto', 'Default: Inherits global status')}" onclick="event.stopPropagation(); toggleSkillProject('${escapeQuotes(currentWs)}', '${escapeQuotes(s.physicalPath)}', '${escapeQuotes(skillName)}', 'reset')">${t('optAuto', 'По умолч.')}</button>
          <button class="project-seg-btn seg-on ${isForcedOn ? 'active' : ''}" title="${s.source === 'global' && !s.isGloballyEnabled ? t('tooltipSegOnGlobalDisabledWarn', 'Внимание: навык отключен глобально. Из-за ядра Antigravity в дефолтной папке проект не сможет его загрузить. Переместите в библиотеку [→]') : t('tooltipSegOn', 'Force enable for this project')}" onclick="event.stopPropagation(); toggleSkillProject('${escapeQuotes(currentWs)}', '${escapeQuotes(s.physicalPath)}', '${escapeQuotes(skillName)}', 'enable')">✓ ${t('optOn', 'Вкл')}</button>
          <button class="project-seg-btn seg-off ${isForcedOff ? 'active' : ''}" title="${t('tooltipSegOff', 'Force disable for this project')}" onclick="event.stopPropagation(); toggleSkillProject('${escapeQuotes(currentWs)}', '${escapeQuotes(s.physicalPath)}', '${escapeQuotes(skillName)}', 'disable')">✕ ${t('optOff', 'Выкл')}</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="glass-card plugin-card ${getCardStateClass(s)}">
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
            ${s.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(s.pluginDisplayName || s.pluginName || s.pluginId)}" onclick="openPluginDetails('${escapeQuotes(s.pluginId || s.pluginName)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : `
              <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('skill', '${s.id}', ${s.isEnabled}, ${s.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            `}
          </div>
          <div class="card-actions-middle">
            ${s.isBuiltin ? `
              <span class="card-badge-status">${t('badgeBuiltin', 'Built-in')}</span>
            ` : (s.isPlugin ? `
              <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
            ` : (s.isLocal ? `
              <span class="card-badge-status">Workspace</span>
            ` : `
              <div id="switch-container-${s.id}">
                <label class="switch" title="${s.source === 'global' && (s.isEnabledForProject || s.projectOverride === 'enabled') ? t('tooltipGlobalToggleProjectWarn', 'Внимание: навык подключен к проекту. Глобальное отключение заблокирует его и в проекте!') : ''}">
                  <input type="checkbox" ${s.isGloballyEnabled ? 'checked' : ''} onchange="toggleSkillGlobal('${escapeQuotes(s.id)}', this.checked, '${escapeQuotes(s.name || '')}', '${escapeQuotes(s.physicalPath || '')}')">
                  <span class="slider"></span>
                </label>
              </div>
              <div id="loader-${s.id}" style="display: none; padding-right: 6px;">
                <div class="spinner-small"></div>
              </div>
            `))}
          </div>
          <div class="card-actions-bottom">
            ${!s.isBuiltin ? `
              ${s.isPlugin ? `
                <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('skill', '${s.id}', ${s.isEnabled}, ${s.isLocal ? 'true' : 'false'}, '${escapeQuotes(s.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              ` : ''}
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
      
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadge}
        </div>
        ${skillProjectOverrideHtml ? `
          <div class="card-project-override-row">
            ${skillProjectOverrideHtml}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
window.renderSkillCard = renderSkillCard;

function renderWorkflowCard(w, idx) {
  const scopeBadge = getScopeBadgeHtml(w);

  return `
    <div class="glass-card plugin-card ${getCardStateClass(w)}">
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
            <span class="plugin-human-title" style="font-size: 11px; opacity: 0.85;">${escapeHtml(w.displayName)}</span>
          </div>
          <div class="card-status-subrow">
            ${getStatusPillHtml(w, 'workflow')}
          </div>
          <div class="plugin-desc" title="${escapeHtml(w.description)}">${escapeHtml(w.description)}</div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions-top">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('workflow', '${escapeQuotes(w.physicalPath)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
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
            ` : `
              <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('workflow', '${w.id}', ${w.isEnabled}, ${w.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            `}
          </div>
          <div class="card-actions-middle">
            ${w.isBuiltin ? `
              <span class="card-badge-status">${t('protected', 'Protected')}</span>
            ` : (w.isPlugin ? `
              <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
            ` : (w.isLocal ? `
              <span class="card-badge-status">Workspace</span>
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
          <div class="card-actions-bottom">
            ${!w.isBuiltin ? `
              ${w.isPlugin ? `
                <button class="card-action-btn" title="${t('openFolder', 'Open Folder')}" onclick="openItemFolder('workflow', '${w.id}', ${w.isEnabled}, ${w.isLocal ? 'true' : 'false'}, '${escapeQuotes(w.physicalPath)}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              ` : ''}
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
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadge}
        </div>
      </div>
    </div>
  `;
}
window.renderWorkflowCard = renderWorkflowCard;

function renderMcpCard(m, idx) {
  const scopeBadge = getScopeBadgeHtml(m);
  const cmdArgs = (m.args || []).join(' ');
  const fullCmd = (m.command || '') + (cmdArgs ? ' ' + cmdArgs : '');

  return `
    <div class="glass-card plugin-card ${getCardStateClass(m)}">
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
          <div class="card-status-subrow">
            ${getStatusPillHtml(m, 'mcp')}
          </div>
          <div class="plugin-desc" style="font-family: monospace; font-size: 11px;" title="${escapeHtml(fullCmd)}">
            ${escapeHtml(fullCmd) || t('noCommand', 'No command specified')}
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions-top">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('mcp', '${escapeQuotes(m.physicalPath)}', '${escapeQuotes(m.name)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            ${m.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(m.sourceLabel || m.pluginId)}" onclick="openPluginDetails('${escapeQuotes(m.pluginId)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="card-actions-middle">
            ${m.isBuiltin ? `
              <span class="card-badge-status">${t('protected', 'Protected')}</span>
            ` : (m.isPlugin ? `
              <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
            ` : `
              <label class="switch">
                <input type="checkbox" ${m.enabled !== false ? 'checked' : ''} onchange="toggleMcpServer('${escapeQuotes(m.physicalPath)}', '${escapeQuotes(m.name)}', this.checked)">
                <span class="slider"></span>
              </label>
            `)}
          </div>
          <div class="card-actions-bottom">
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
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadge}
        </div>
      </div>
    </div>
  `;
}
window.renderMcpCard = renderMcpCard;

function renderHookCard(h, idx) {
  const scopeBadge = getScopeBadgeHtml(h);
  const eventBadge = h.event ? `<span class="slash-cmd" style="font-size: 11px; padding: 2px 6px; font-weight: 700;">${escapeHtml(h.event)}</span>` : '';

  return `
    <div class="glass-card plugin-card ${getCardStateClass(h)}">
      <div class="plugin-top">
        <div class="plugin-meta">
          <div class="plugin-name" style="margin-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="card-index-num">#${idx}</span>
            <span style="font-weight: 600;">${escapeHtml(h.name)}</span>
            ${eventBadge}
          </div>
          <div class="card-status-subrow">
            ${getStatusPillHtml(h, 'hook')}
          </div>
          <div class="plugin-desc" style="font-family: monospace; font-size: 11px;" title="${escapeHtml(h.command || '')}">
            ${escapeHtml(h.command || '') || t('noCommand', 'No command specified')}
          </div>
        </div>
        
        <div class="card-right-group">
          <div class="card-actions-top">
            <button class="card-action-btn" title="${t('openInEditor', 'Open in Editor')}" onclick="openFileInEditor('hook', '${escapeQuotes(h.physicalPath)}', '${escapeQuotes(h.name)}')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
            ${h.isPlugin ? `
              <button class="card-action-btn" title="${t('openPluginDetails', 'Manage Plugin')}: ${escapeHtml(h.sourceLabel || h.pluginId)}" onclick="openPluginDetails('${escapeQuotes(h.pluginId)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="card-actions-middle">
            ${h.isProtected ? `
              <span class="card-badge-status">${t('protected', 'Protected')}</span>
            ` : (h.isPlugin ? `
              <span class="card-badge-status">${t('tabPlugins', 'Plugin')}</span>
            ` : `
              <label class="switch">
                <input type="checkbox" ${h.enabled !== false ? 'checked' : ''} onchange="toggleHook('${escapeQuotes(h.physicalPath)}', '${escapeQuotes(h.name)}', this.checked)">
                <span class="slider"></span>
              </label>
            `)}
          </div>
          <div class="card-actions-bottom">
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
      <div class="card-footer-tags">
        <div class="resource-tags">
          ${scopeBadge}
        </div>
      </div>
    </div>
  `;
}
window.renderHookCard = renderHookCard;

function renderCurrentTab() {
  if (activePluginId) {
    renderPluginDetailsView();
    return;
  }

  const mainViewTop = document.getElementById('main-view-top');
  const mainNav = document.getElementById('main-nav-controls');
  const detailNav = document.getElementById('detail-nav-controls');
  const mainView = document.getElementById('main-view');
  const detailView = document.getElementById('detail-view');

  if (mainViewTop) {
    mainViewTop.style.display = currentTab === 'active' ? 'block' : 'none';
  }
  const configBody = document.getElementById('config-repos-body');
  const configChevron = document.getElementById('config-repos-chevron');
  if (configBody) configBody.classList.toggle('collapsed', !!isConfigReposCollapsed);
  if (configChevron) configChevron.classList.toggle('collapsed', !!isConfigReposCollapsed);

  if (mainNav) mainNav.style.display = 'block';
  if (detailNav) detailNav.style.display = 'none';
  if (mainView) mainView.style.display = 'block';
  if (detailView) detailView.style.display = 'none';

  // Restore navigation header elements for main tab view
  const backBtn = document.getElementById('nav-btn-back');
  if (backBtn) backBtn.style.display = 'none';

  const btnGrouping = document.getElementById('btn-toggle-grouping');
  if (btnGrouping) btnGrouping.style.display = 'inline-flex';

  const btnCreateLabel = document.getElementById('btn-create-label');
  if (btnCreateLabel) btnCreateLabel.textContent = t('btnCreateNew', 'Create New');

  if (searchInput) {
    searchInput.placeholder = t('searchPlaceholder', 'Search by name or description...');
  }

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

    renderGroupedGrid(filtered, renderPluginCard, 'noPlugins', 'No plugins found.');

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
window.renderCurrentTab = renderCurrentTab;
