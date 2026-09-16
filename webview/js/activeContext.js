// Module: activeContext.js - Active Context dashboard view, collapsible categories

const collapsedActiveCategories = window.collapsedActiveCategories || {};
window.collapsedActiveCategories = collapsedActiveCategories;

function toggleActiveCategory(key) {
  collapsedActiveCategories[key] = !collapsedActiveCategories[key];
  renderCurrentTab();
}
window.toggleActiveCategory = toggleActiveCategory;

function renderActiveContextView(query) {
  const activePlugins = pluginsData.filter(p => p.isEnabled && (!query || String(p.displayName || p.name || '').toLowerCase().includes(query) || (p.description && String(p.description).toLowerCase().includes(query))));
  const activeRules = rulesData.filter(r => r.isEnabled !== false && (!query || String(r.displayName || r.name || '').toLowerCase().includes(query) || (r.description && String(r.description).toLowerCase().includes(query))));
  const activeSkills = skillsData.filter(s => s.isEnabled !== false && (!query || String(s.displayName || s.name || '').toLowerCase().includes(query) || (s.description && String(s.description).toLowerCase().includes(query))));
  const activeWorkflows = workflowsData.filter(w => w.isEnabled !== false && (!query || String(w.displayName || w.name || '').toLowerCase().includes(query) || (w.description && String(w.description).toLowerCase().includes(query))));
  const activeMcp = mcpData.filter(m => m.isEnabled && (!query || String(m.name || '').toLowerCase().includes(query) || String(m.command || '').toLowerCase().includes(query)));
  const activeHooks = hooksData.filter(h => h.isEnabled && (!query || String(h.name || '').toLowerCase().includes(query) || String(h.command || '').toLowerCase().includes(query) || String(h.event || '').toLowerCase().includes(query)));

  const totalActiveCount = activePlugins.length + activeRules.length + activeSkills.length + activeWorkflows.length + activeMcp.length + activeHooks.length;

  let html = '';

  if (totalActiveCount === 0) {
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
      if (local.length > 0) groups.push({ title: t('groupWorkspace', 'Workspace / Local'), icon: '📁', items: local });
      if (global.length > 0) groups.push({ title: t('groupGlobal', 'Global'), icon: '🌐', items: global });
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
      // Without intermediate tier headers (smooth compact flow): Local first, then Global, Builtin, Plugins
      const allSorted = [...local, ...global, ...builtin, ...plugins];
      for (const item of allSorted) {
        secHtml += cardFn(item, globalIndex++);
      }
    }

    secHtml += `</div>`;
    return secHtml;
  };

  html += renderSection('plugins', '🔌', t('activeSectionPlugins', 'Active Plugins'), activePlugins, renderPluginCard);
  html += renderSection('rules', '📜', t('activeSectionRules', 'Active Rules'), activeRules, renderRuleCard);
  html += renderSection('skills', '⚡', t('activeSectionSkills', 'Active Skills'), activeSkills, renderSkillCard);
  html += renderSection('workflows', '📋', t('activeSectionWorkflows', 'Active Workflows'), activeWorkflows, renderWorkflowCard);
  html += renderSection('mcp', '🛠️', t('activeSectionMcp', 'Active MCP Servers'), activeMcp, renderMcpCard);
  html += renderSection('hooks', '🪝', t('activeSectionHooks', 'Active Hooks'), activeHooks, renderHookCard);

  pluginListContainer.innerHTML = html;
}
window.renderActiveContextView = renderActiveContextView;
