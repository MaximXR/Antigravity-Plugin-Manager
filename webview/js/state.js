const vscode = window.desktopApi || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : {
  postMessage: (msg) => console.warn('No bridge available for postMessage', msg)
});
if (typeof window !== 'undefined' && !window.vscode) {
  window.vscode = vscode;
}

// Global Webview Client Error Logger
window.onerror = function(message, source, lineno, colno, error) {
  try {
    vscode.postMessage({
      command: 'clientError',
      error: String(message) + (error && error.stack ? '\n' + error.stack : ''),
      source: source,
      lineno: lineno
    });
  } catch (e) {}
};

function t(key, defaultVal) {
  if (window.I18N && window.I18N[key] !== undefined) {
    return window.I18N[key];
  }
  return defaultVal !== undefined ? defaultVal : key;
}
window.t = t;

function copyText(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}
window.copyText = copyText;

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
window.escapeQuotes = escapeQuotes;

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
window.escapeHtml = escapeHtml;

function normalizePathStr(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}
window.normalizePathStr = normalizePathStr;

// Lists and Application State
let pluginsData = [];
let skillsData = [];
let workflowsData = [];
let rulesData = [];
let mcpData = [];
let hooksData = [];
let workspaceFoldersList = [];
let selectedWorkspaceRoot = null;
let conflictsList = [];
let connectedFoldersList = [];
let updatesData = null;
let targetUpdatePlugin = null;
let antigravityProjectsList = [];
let customFoldersList = [];
let activeProjectId = null;
let multiRootTargetMode = 'primary'; // 'primary' | 'all' | 'specific'
let multiRootSpecificFolder = null;

let currentTab = 'active';
let activePluginId = null;
let hasScrolledToTabs = false;
let isDetailedView = false;
let isSingleColumn = false;
let isGroupingEnabled = false;
let isDetailDetailedView = false;
let isDetailSingleColumn = false;
let previousTabBeforePluginDetails = null;

function getActiveWorkspaceRoot() {
  if (selectedWorkspaceRoot && workspaceFoldersList.some(w => w.fsPath === selectedWorkspaceRoot)) {
    return selectedWorkspaceRoot;
  }
  if (workspaceFoldersList && workspaceFoldersList.length > 0) {
    selectedWorkspaceRoot = workspaceFoldersList[0].fsPath;
    return selectedWorkspaceRoot;
  }
  return null;
}
window.getActiveWorkspaceRoot = getActiveWorkspaceRoot;

// Common DOM Elements
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
