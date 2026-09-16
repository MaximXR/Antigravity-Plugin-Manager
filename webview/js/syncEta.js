// Sync ETA calculation and loader tracking
let syncCountdownInterval = null;
let syncRemainingMs = 0;
let syncHideTimeout = null;
let currentSyncSkillsCount = 0;

function pluralSkills(n, lang = 'ru') {
  if (lang !== 'ru') return n === 1 ? '1 skill' : `${n} skills`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} навыков`;
  if (mod10 === 1) return `${n} навык`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} навыка`;
  return `${n} навыков`;
}
window.pluralSkills = pluralSkills;

function formatSyncTime(ms, skillsCount = 0) {
  const totalSec = Math.max(1, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  let timeStr = min > 0 ? `${min}м ${sec < 10 ? '0' : ''}${sec}с` : `${sec}с`;
  if (skillsCount > 1) {
    const plural = pluralSkills(skillsCount, window.LANG || 'ru');
    return `IDE: ~${timeStr} (${plural})`;
  }
  return `IDE: ~${timeStr}`;
}
window.formatSyncTime = formatSyncTime;

function calculatePluginSyncEta(pluginId, enable) {
  if (!enable) return 2500;
  const plugin = pluginsData.find(p => p.id === pluginId || p.name === pluginId);
  const count = (plugin && plugin.skillsCount) ? plugin.skillsCount : ((plugin && plugin.skills) ? plugin.skills.length : 1);
  return Math.max(3000, Math.round(2000 + count * 3000));
}
window.calculatePluginSyncEta = calculatePluginSyncEta;

function setSyncingState(etaMs = 2500, skillsCount = 0) {
  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  const strip = document.getElementById('sync-status-strip');
  if (!badge || !text) return;

  if (syncHideTimeout) {
    clearTimeout(syncHideTimeout);
    syncHideTimeout = null;
  }

  if (strip) strip.style.display = 'flex';
  badge.className = 'sync-status-badge syncing';
  badge.style.display = 'inline-flex';
  badge.style.opacity = '1';
  
  if (skillsCount > 0) {
    currentSyncSkillsCount = skillsCount;
  }
  syncRemainingMs = Math.max(syncRemainingMs, etaMs);

  const softApplyBtn = document.getElementById('btn-sync-soft-apply');
  if (softApplyBtn) {
    if (syncRemainingMs > 4000 || currentSyncSkillsCount > 1) {
      softApplyBtn.style.display = 'inline-flex';
    } else {
      softApplyBtn.style.display = 'none';
    }
  }

  const updateText = () => {
    text.textContent = formatSyncTime(syncRemainingMs, currentSyncSkillsCount);
  };

  updateText();

  if (syncCountdownInterval) clearInterval(syncCountdownInterval);
  syncCountdownInterval = setInterval(() => {
    syncRemainingMs -= 1000;
    if (syncRemainingMs <= 0) {
      clearInterval(syncCountdownInterval);
      syncCountdownInterval = null;
      text.textContent = t('syncFinalizing', 'IDE: синхр...');
      if (softApplyBtn) softApplyBtn.style.display = 'none';
    } else {
      updateText();
    }
  }, 1000);
}
window.setSyncingState = setSyncingState;

function handleSyncStatus(msg) {
  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  const strip = document.getElementById('sync-status-strip');
  const softApplyBtn = document.getElementById('btn-sync-soft-apply');
  if (!badge || !text) return;

  if (msg.state === 'syncing') {
    setSyncingState(msg.etaMs || 2500, msg.skillsCount || currentSyncSkillsCount);
  } else if (msg.state === 'synced') {
    if (syncCountdownInterval) {
      clearInterval(syncCountdownInterval);
      syncCountdownInterval = null;
    }
    if (softApplyBtn) softApplyBtn.style.display = 'none';
    if (strip) strip.style.display = 'flex';
    badge.className = 'sync-status-badge synced';
    badge.style.display = 'inline-flex';
    badge.style.opacity = '1';
    text.textContent = t('syncComplete', '✓ IDE синхронизирована');
    currentSyncSkillsCount = 0;
    syncRemainingMs = 0;

    if (syncHideTimeout) clearTimeout(syncHideTimeout);
    syncHideTimeout = setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => {
        if (badge && badge.className.includes('synced')) {
          badge.style.display = 'none';
          badge.style.opacity = '1';
          if (strip) strip.style.display = 'none';
        }
      }, 350);
    }, 3000);
  }
}
window.handleSyncStatus = handleSyncStatus;

// Active Item Toggle & Auto-Recovery Engine
const activeToggleTimers = new Map();

function trackItemLoading(itemId) {
  if (!itemId) return;
  const switchEl = document.getElementById('switch-container-' + itemId);
  const loaderEl = document.getElementById('loader-' + itemId);
  if (switchEl && loaderEl) {
    switchEl.style.display = 'none';
    loaderEl.style.display = 'block';
  }

  if (activeToggleTimers.has(itemId)) {
    clearTimeout(activeToggleTimers.get(itemId));
  }

  // Auto-recovery timeout: 2500ms
  // If backend re-render has not arrived within 2.5s, restore the switch!
  const timer = setTimeout(() => {
    activeToggleTimers.delete(itemId);
    if (switchEl && loaderEl) {
      switchEl.style.display = 'block';
      loaderEl.style.display = 'none';
      const cb = switchEl.querySelector('input[type="checkbox"]');
      if (cb) cb.disabled = false;
    }
    const dSwitch = document.getElementById('detail-switch-container');
    const dLoader = document.getElementById('detail-loader');
    if (dSwitch && dLoader) {
      dLoader.style.display = 'none';
      dSwitch.style.display = 'block';
    }
  }, 2500);

  activeToggleTimers.set(itemId, timer);
}
window.trackItemLoading = trackItemLoading;

function clearAllItemLoaders() {
  activeToggleTimers.forEach(timer => clearTimeout(timer));
  activeToggleTimers.clear();
  document.querySelectorAll('[id^="loader-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('[id^="switch-container-"]').forEach(el => el.style.display = 'block');
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);

  const dLoader = document.getElementById('detail-loader');
  const dSwitch = document.getElementById('detail-switch-container');
  if (dLoader && dSwitch) {
    dLoader.style.display = 'none';
    dSwitch.style.display = 'block';
  }
}
window.clearAllItemLoaders = clearAllItemLoaders;
