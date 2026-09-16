/**
 * desktop/services/projects.js
 * Native Antigravity 2.0 (Desktop / CLI) Project Scanner & Custom Workspace Bridge
 * Isolated specifically for standalone Desktop execution.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CUSTOM_FOLDERS_FILE = path.join(os.homedir(), '.gemini', 'antigravity_desktop_custom_folders.json');

/**
 * Converts file URI (file:///e%3A/...) to local Windows filesystem path
 */
function uriToFsPath(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (!uri.startsWith('file:///')) return path.normalize(uri);

  let decoded = decodeURIComponent(uri.replace('file:///', ''));
  // Fix leading slash on Windows (e.g., /e:/... or e:/...)
  if (decoded.startsWith('/') && decoded.length >= 3 && decoded[2] === ':') {
    decoded = decoded.slice(1);
  }
  return path.normalize(decoded);
}

/**
 * Reads user custom folders (outside Antigravity)
 */
function getCustomFolders() {
  try {
    if (fs.existsSync(CUSTOM_FOLDERS_FILE)) {
      const raw = fs.readFileSync(CUSTOM_FOLDERS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list
          .filter((p) => typeof p === 'string' && fs.existsSync(p))
          .map((p) => {
            const norm = path.normalize(p);
            return {
              id: 'custom:' + norm.toLowerCase(),
              name: path.basename(norm),
              folders: [{ name: path.basename(norm), fsPath: norm, branch: null }],
              primaryPath: norm,
              isCustom: true,
              isActive: false,
              updatedAt: null
            };
          });
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Saves a new custom user workspace folder
 */
function addCustomFolder(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return getCustomFolders();
  const norm = path.normalize(folderPath);
  try {
    let existing = [];
    if (fs.existsSync(CUSTOM_FOLDERS_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(CUSTOM_FOLDERS_FILE, 'utf8'));
      } catch (_) {}
    }
    if (!Array.isArray(existing)) existing = [];
    const lower = norm.toLowerCase();
    if (!existing.some((p) => path.normalize(p).toLowerCase() === lower)) {
      existing.push(norm);
      fs.mkdirSync(path.dirname(CUSTOM_FOLDERS_FILE), { recursive: true });
      fs.writeFileSync(CUSTOM_FOLDERS_FILE, JSON.stringify(existing, null, 2), 'utf8');
    }
  } catch (_) {}
  return getCustomFolders();
}

/**
 * Removes a custom user workspace folder
 */
function removeCustomFolder(folderPath) {
  if (!folderPath) return getCustomFolders();
  const norm = path.normalize(folderPath).toLowerCase();
  try {
    if (fs.existsSync(CUSTOM_FOLDERS_FILE)) {
      let existing = JSON.parse(fs.readFileSync(CUSTOM_FOLDERS_FILE, 'utf8'));
      if (Array.isArray(existing)) {
        existing = existing.filter((p) => path.normalize(p).toLowerCase() !== norm);
        fs.writeFileSync(CUSTOM_FOLDERS_FILE, JSON.stringify(existing, null, 2), 'utf8');
      }
    }
  } catch (_) {}
  return getCustomFolders();
}

/**
 * Reads all native projects from Antigravity 2.0 configuration
 * Source 1: ~/.gemini/config/projects/*.json
 * Source 2: ~/.gemini/projects.json
 * Active State: %APPDATA%/Antigravity/app_storage.json (new-convo-last-selected-project)
 */
function getAntigravityProjects() {
  const projectsDir = path.join(os.homedir(), '.gemini', 'config', 'projects');
  const appStorageFile = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Antigravity',
    'app_storage.json'
  );

  let activeProjectId = null;
  try {
    if (fs.existsSync(appStorageFile)) {
      const appStorage = JSON.parse(fs.readFileSync(appStorageFile, 'utf8'));
      activeProjectId = appStorage['new-convo-last-selected-project'] || appStorage['lastCreatedProjectId'] || null;
    }
  } catch (_) {}

  const projects = [];
  const seenProjectIds = new Set();

  // 1. Parse ~/.gemini/config/projects/*.json
  if (fs.existsSync(projectsDir)) {
    try {
      const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json') && f !== 'outside-of-project.json');
      for (const file of files) {
        try {
          const filePath = path.join(projectsDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const id = data.id || path.basename(file, '.json');
          if (seenProjectIds.has(id)) continue;
          seenProjectIds.add(id);

          const name = data.name || id;
          const folders = [];
          const resources = data.projectResources?.resources || [];
          for (const res of resources) {
            const uri = res.gitFolder?.folderUri || res.folderUri;
            const fsPath = uriToFsPath(uri);
            if (fsPath && fs.existsSync(fsPath)) {
              folders.push({
                name: path.basename(fsPath),
                fsPath,
                branch: res.gitFolder?.defaultBranch || null
              });
            }
          }

          if (folders.length > 0) {
            projects.push({
              id,
              name,
              folders,
              primaryPath: folders[0].fsPath,
              isActive: id === activeProjectId,
              updatedAt: data.updatedAt || null
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 2. Parse ~/.gemini/projects.json (fallback/CLI registry)
  const projectsJson = path.join(os.homedir(), '.gemini', 'projects.json');
  if (fs.existsSync(projectsJson)) {
    try {
      const data = JSON.parse(fs.readFileSync(projectsJson, 'utf8'));
      if (data && data.projects) {
        for (const [folderPath, alias] of Object.entries(data.projects)) {
          const norm = path.normalize(folderPath);
          if (fs.existsSync(norm)) {
            const id = `cli-${alias || path.basename(norm)}`;
            if (!seenProjectIds.has(id)) {
              seenProjectIds.add(id);
              projects.push({
                id,
                name: alias || path.basename(norm),
                folders: [{ name: alias || path.basename(norm), fsPath: norm, branch: null }],
                primaryPath: norm,
                isActive: id === activeProjectId,
                updatedAt: null
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  // 3. Include user custom folders
  const customFolders = getCustomFolders();

  // Sorting: active first, then alphabetically
  projects.sort((a, b) => {
    if (a.isActive) return -1;
    if (b.isActive) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    projects,
    activeProjectId,
    customFolders
  };
}

/**
 * Persists active project in Desktop Antigravity app_storage.json
 */
function setAntigravityActiveProject(projectId) {
  const appStorageFile = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Antigravity',
    'app_storage.json'
  );

  try {
    let appStorage = {};
    if (fs.existsSync(appStorageFile)) {
      appStorage = JSON.parse(fs.readFileSync(appStorageFile, 'utf8'));
    }
    appStorage['new-convo-last-selected-project'] = projectId;
    fs.writeFileSync(appStorageFile, JSON.stringify(appStorage, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sets up filesystem watcher on Antigravity projects folder and app_storage.json
 */
function watchAntigravityProjects(onChangeCallback) {
  const projectsDir = path.join(os.homedir(), '.gemini', 'config', 'projects');
  const appStorageFile = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Antigravity',
    'app_storage.json'
  );

  let debounceTimer = null;
  const trigger = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        onChangeCallback();
      } catch (_) {}
    }, 500);
  };

  const watchers = [];
  if (fs.existsSync(projectsDir)) {
    try {
      const w = fs.watch(projectsDir, { recursive: false }, trigger);
      watchers.push(w);
    } catch (_) {}
  }
  if (fs.existsSync(appStorageFile)) {
    try {
      const w = fs.watch(appStorageFile, trigger);
      watchers.push(w);
    } catch (_) {}
  }

  return {
    dispose: () => {
      for (const w of watchers) {
        try { w.close(); } catch (_) {}
      }
    }
  };
}

module.exports = {
  uriToFsPath,
  getAntigravityProjects,
  setAntigravityActiveProject,
  getCustomFolders,
  addCustomFolder,
  removeCustomFolder,
  watchAntigravityProjects
};
