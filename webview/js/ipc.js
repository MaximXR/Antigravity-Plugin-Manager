// Listen to messages from backend (extension or desktop)
function handleIncomingMessage(message) {
  if (!message || !message.command) return;

  switch (message.command) {
    case 'syncStatus':
      handleSyncStatus(message);
      break;

    case 'init':
      if (storagePathDisplay) {
        storagePathDisplay.textContent = message.storagePath || '';
        storagePathDisplay.title = message.storagePath || '';
      }
      
      // Set stats
      if (valPlugins && message.stats) valPlugins.textContent = message.stats.activePlugins + '/' + message.stats.totalPlugins;
      if (valSkills && message.stats) valSkills.textContent = message.stats.skills;
      if (valRules && message.stats) valRules.textContent = message.stats.rules;
      if (valWorkflows && message.stats) valWorkflows.textContent = message.stats.workflows;
      if (valMcp && message.stats) valMcp.textContent = message.stats.mcp !== undefined ? message.stats.mcp : 0;
      if (valHooks && message.stats) valHooks.textContent = message.stats.hooks !== undefined ? message.stats.hooks : 0;

      pluginsData = message.plugins || [];
      skillsData = message.skills || [];
      workflowsData = message.workflows || [];
      rulesData = message.rules || [];
      mcpData = message.mcpServers || [];
      hooksData = message.hooks || [];
      workspaceFoldersList = message.workspaceFolders || [];
      conflictsList = message.conflicts || [];
      connectedFoldersList = message.connectedFolders || [];
      if (message.antigravityProjects !== undefined) {
        antigravityProjectsList = message.antigravityProjects || [];
        customFoldersList = message.customFolders || [];
        activeProjectId = message.activeProjectId;
      }
      if (message.liveContext) {
        window.currentLiveContext = message.liveContext;
      }
      if (message.updatesState) {
        updatesData = message.updatesState;
        updateToolbarBadge();
      }
      clearAllItemLoaders();
      
      try {
        try { renderAntigravityProjectsSelector(); } catch (e) { console.error('renderAntigravityProjectsSelector error:', e); }
        try { renderConnectedFolders(); } catch (e) { console.error('renderConnectedFolders error:', e); }
        try { renderWorkspaceSelector(); } catch (e) { console.error('renderWorkspaceSelector error:', e); }
        try { renderConflicts(); } catch (e) { console.error('renderConflicts error:', e); }
        try { renderCurrentTab(); } catch (e) { console.error('renderCurrentTab error:', e); }
        
        if (!hasScrolledToTabs) {
          hasScrolledToTabs = true;
          scrollToStickyNav();
        }
      } catch (renderErr) {
        console.error('Error rendering webview:', renderErr);
      } finally {
        document.body.classList.remove('loading');
        document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
      }
      break;

    case 'updatesChecked':
      document.querySelectorAll('.update-icon').forEach(icon => icon.classList.remove('rotating'));
      const chkBtnText = document.getElementById('btn-check-updates-text');
      if (chkBtnText) chkBtnText.textContent = t('checkUpdates', 'Check Updates');
      if (message.updatesState) {
        updatesData = message.updatesState;
        updateToolbarBadge();
        try { renderCurrentTab(); } catch (e) {}
        if (activePluginId) {
          try { renderPluginDetailsView(); } catch (e) {}
        }
      }
      break;

    case 'updateProgress':
      appendUpdateLog(message.message);
      break;

    case 'pluginUpdated':
      appendUpdateLog('✓ ' + (message.message || 'Updated successfully!'));
      if (message.updatesState) {
        updatesData = message.updatesState;
        updateToolbarBadge();
      }
      const btnConfirmEl = document.getElementById('btn-confirm-update');
      if (btnConfirmEl) {
        btnConfirmEl.textContent = '✓ ' + (window.LANG === 'ru' ? 'Обновлено' : 'Updated');
        btnConfirmEl.style.background = '#059669';
        btnConfirmEl.disabled = true;
      }
      setTimeout(() => {
        closePluginUpdateModal();
      }, 1400);
      break;

    case 'updateFailed':
      appendUpdateLog('❌ ' + (message.error || 'Update failed'));
      const btnConfErr = document.getElementById('btn-confirm-update');
      if (btnConfErr) {
        btnConfErr.textContent = t('updateNow', 'Update');
        btnConfErr.disabled = false;
      }
      const btnCancelErr = document.getElementById('btn-cancel-update');
      if (btnCancelErr) btnCancelErr.disabled = false;
      break;

    case 'liveContextData':
      window.currentLiveContext = message.data;
      renderLiveContextModal();
      break;

    case 'error':
      document.body.classList.remove('loading');
      document.querySelectorAll('.refresh-spin-icon').forEach(icon => icon.classList.remove('rotating'));
      clearAllItemLoaders();
      
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
}

window.addEventListener('message', event => {
  handleIncomingMessage(event.data);
});

if (window.desktopApi && typeof window.desktopApi.onMessage === 'function') {
  window.desktopApi.onMessage(msg => {
    handleIncomingMessage(msg);
  });
}
