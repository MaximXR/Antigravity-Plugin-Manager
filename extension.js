const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getTranslation } = require('./locales/translations');

let activePanel = undefined;
let sidebarProvider = undefined;

// Helper to log errors or debug info
function logDebug(message) {
  try {
    const logPath = path.join(__dirname, 'plugin_manager_debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch (e) {}
}

// Helper to escape JS string quotes/newlines for Node.js to browser template interpolation
function escapeJsString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
}

// Helper to check language setting
function getActiveLanguage() {
  const configLang = vscode.workspace.getConfiguration('antigravity-plugin-manager').get('language', 'auto');
  if (configLang && configLang !== 'auto') {
    return configLang;
  }
  return vscode.env.language || 'en';
}

// Recursive directory copier (fallback for EXDEV cross-drive movement)
function moveDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDirRecursive(srcPath, destPath);
    } else {
      try {
        fs.renameSync(srcPath, destPath);
      } catch (err) {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
    }
  }
  fs.rmdirSync(src);
}

// Safe move directory supporting cross-drive operation
function safeMoveDir(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        moveDirRecursive(src, dest);
      } else {
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
    } else {
      throw err;
    }
  }
}

// Get standard active path for global plugins
function getActivePluginsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins');
}

// Get standard active path for global skills
function getActiveSkillsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'skills');
}

// Get standard active path for global workflows
function getActiveWorkflowsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'global_workflows');
}

// Get default storage path for global plugins (placed next to active plugins)
function getDefaultStoragePath() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins_storage');
}

// Get subfolders inside the chosen storage folder
function getStorageSubpath(storagePath, category) {
  return path.join(storagePath, category);
}

// Count files/subdirs in directory
function countItemsInDir(dirPath, extensionFilter = null) {
  if (!fs.existsSync(dirPath)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count++;
      } else if (entry.isFile()) {
        if (!extensionFilter || entry.name.endsWith(extensionFilter)) {
          count++;
        }
      }
    }
  } catch (e) {
    logDebug(`Error counting items in ${dirPath}: ${e.message}`);
  }
  return count;
}

// Count hooks in a base directory (checking hooks/ subfolder and hooks.json)
function countHooks(baseDir) {
  const hooksDir = path.join(baseDir, 'hooks');
  const hooksJsonPath = path.join(baseDir, 'hooks.json');
  let count = countItemsInDir(hooksDir);
  if (fs.existsSync(hooksJsonPath)) {
    try {
      const content = fs.readFileSync(hooksJsonPath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        count += data.length;
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.hooks)) count += data.hooks.length;
        else count += Object.keys(data).length;
      }
    } catch (e) {
      logDebug(`Error reading hooks.json in ${baseDir}: ${e.message}`);
    }
  }
  return count;
}

// Read plugin metadata (plugin.json) and resources
function readPluginInfo(pluginDir) {
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  let name = path.basename(pluginDir);
  let displayName = name;
  let version = '1.0.0';
  let description = '';
  let author = '';
  
  if (fs.existsSync(pluginJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      if (data.name) name = data.name;
      if (data.displayName) displayName = data.displayName;
      else displayName = name;
      if (data.version) version = data.version;
      if (data.description) description = data.description;
      if (data.author) {
        if (typeof data.author === 'object') {
          author = data.author.name || data.author.displayName || '';
        } else {
          author = data.author;
        }
      }
    } catch (e) {
      logDebug(`Failed to parse plugin.json for ${name}: ${e.message}`);
    }
  }
  
  // Scan skills
  const skills = [];
  const skillsPath = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsPath)) {
    try {
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sPath = path.join(skillsPath, entry.name);
          const sInfo = readSkillInfo(sPath);
          sInfo.id = entry.name;
          sInfo.physicalPath = sPath;
          skills.push(sInfo);
        }
      }
    } catch (e) {
      logDebug(`Error scanning skills in plugin ${name}: ${e.message}`);
    }
  }
  skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  // Scan rules
  const rules = [];
  const rulesPath = path.join(pluginDir, 'rules');
  if (fs.existsSync(rulesPath)) {
    try {
      const entries = fs.readdirSync(rulesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const rPath = path.join(rulesPath, entry.name);
          rules.push({
            id: entry.name,
            name: path.basename(entry.name, path.extname(entry.name)),
            displayName: path.basename(entry.name, path.extname(entry.name)),
            physicalPath: rPath
          });
        }
      }
    } catch (e) {
      logDebug(`Error scanning rules in plugin ${name}: ${e.message}`);
    }
  }
  rules.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  // Scan workflows (Disabled - workflows cannot reside in plugins)
  const workflows = [];

  // Scan hooks
  const hooks = [];
  const hooksPath = path.join(pluginDir, 'hooks');
  if (fs.existsSync(hooksPath)) {
    try {
      const entries = fs.readdirSync(hooksPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          hooks.push({
            id: `file-${entry.name}`,
            name: entry.name,
            displayName: entry.name,
            physicalPath: path.join(hooksPath, entry.name),
            type: 'file'
          });
        }
      }
    } catch (e) {
      logDebug(`Error scanning hooks folder in plugin ${name}: ${e.message}`);
    }
  }
  
  const hooksJsonPath = path.join(pluginDir, 'hooks.json');
  if (fs.existsSync(hooksJsonPath)) {
    try {
      const content = fs.readFileSync(hooksJsonPath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        data.forEach((entry, idx) => {
          const hName = entry.name || entry.id || `Hook #${idx}`;
          hooks.push({
            id: `json-${idx}`,
            name: hName,
            displayName: hName,
            physicalPath: hooksJsonPath,
            type: 'json'
          });
        });
      } else if (data && typeof data === 'object') {
        if (Array.isArray(data.hooks)) {
          data.hooks.forEach((entry, idx) => {
            const hName = entry.name || entry.id || `Hook #${idx}`;
            hooks.push({
              id: `json-hook-${idx}`,
              name: hName,
              displayName: hName,
              physicalPath: hooksJsonPath,
              type: 'json'
            });
          });
        } else {
          Object.keys(data).forEach(key => {
            hooks.push({
              id: `json-key-${key}`,
              name: key,
              displayName: key,
              physicalPath: hooksJsonPath,
              type: 'json'
            });
          });
        }
      }
    } catch (e) {
      logDebug(`Error scanning hooks.json in plugin ${name}: ${e.message}`);
    }
  }
  hooks.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  const hasMcp = fs.existsSync(path.join(pluginDir, 'mcp_config.json')) || fs.existsSync(path.join(pluginDir, 'mcp.json'));
  
  return {
    name,
    displayName,
    version,
    description,
    author,
    skills,
    rules,
    workflows,
    hooks,
    skillsCount: skills.length,
    rulesCount: rules.length,
    workflowsCount: workflows.length,
    hooksCount: hooks.length,
    hasMcp
  };
}

// Read skill metadata (SKILL.md)
function readSkillInfo(skillDir) {
  const name = path.basename(skillDir);
  let displayName = name;
  let description = '';
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) displayName = titleMatch[1].trim();
      
      const cleanContent = content.replace(/^#\s+.+$/m, '').trim();
      const firstParagraph = cleanContent.split('\n\n')[0] || '';
      description = firstParagraph.replace(/\s+/g, ' ').substring(0, 150).trim();
      if (description.length >= 148) description += '...';
    } catch (e) {
      logDebug(`Error parsing SKILL.md for ${name}: ${e.message}`);
    }
  }
  return {
    id: name,
    name,
    displayName,
    description: description || 'No description provided.'
  };
}

// Read workflow metadata (.md)
function readWorkflowInfo(workflowPath) {
  const filename = path.basename(workflowPath);
  const name = path.basename(workflowPath, '.md');
  let displayName = name;
  let description = '';
  try {
    const content = fs.readFileSync(workflowPath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) displayName = titleMatch[1].trim();
    
    const cleanContent = content.replace(/^#\s+.+$/m, '').trim();
    const firstParagraph = cleanContent.split('\n\n')[0] || '';
    description = firstParagraph.replace(/\s+/g, ' ').substring(0, 150).trim();
    if (description.length >= 148) description += '...';
  } catch (e) {
    logDebug(`Error parsing workflow md for ${name}: ${e.message}`);
  }
  return {
    id: filename,
    name,
    displayName,
    description: description || 'No description provided.'
  };
}
// Write updated metadata field to plugin.json
function updatePluginMetadata(pluginDir, field, value) {
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  let data = {};
  
  if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir, { recursive: true });
  }
  
  if (fs.existsSync(pluginJsonPath)) {
    try {
      data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    } catch (e) {
      logDebug(`Failed to parse plugin.json: ${e.message}`);
    }
  }
  data[field] = value;
  if (!data.name) {
    data.name = path.basename(pluginDir);
  }
  fs.writeFileSync(pluginJsonPath, JSON.stringify(data, null, 2), 'utf8');
}
// Scan global plugins
function scanPlugins(activePath, storagePath) {
  const plugins = [];
  const seenNames = new Set();

  logDebug(`scanPlugins: activePath=${activePath}, storagePath=${storagePath}`);

  // 1. Scan storage folder (disabled plugins)
  if (fs.existsSync(storagePath)) {
    try {
      const items = fs.readdirSync(storagePath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const pluginDir = path.join(storagePath, item.name);
          const pluginInfo = readPluginInfo(pluginDir);
          pluginInfo.id = item.name;
          pluginInfo.isEnabled = false;
          pluginInfo.physicalPath = pluginDir;
          plugins.push(pluginInfo);
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning storage plugins: ${e.message}`);
    }
  }

  // Check backwards compatibility with storage root folder
  const storageRootPath = path.dirname(storagePath);
  if (fs.existsSync(storageRootPath)) {
    try {
      const items = fs.readdirSync(storageRootPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && item.name !== 'plugins' && item.name !== 'skills' && item.name !== 'workflows') {
          if (!seenNames.has(item.name)) {
            const pluginDir = path.join(storageRootPath, item.name);
            const pluginInfo = readPluginInfo(pluginDir);
            pluginInfo.id = item.name;
            pluginInfo.isEnabled = false;
            pluginInfo.physicalPath = pluginDir;
            plugins.push(pluginInfo);
            seenNames.add(item.name);
          }
        }
      }
    } catch (e) {
      logDebug(`Error scanning legacy storage root: ${e.message}`);
    }
  }

  // Create active path if it doesn't exist
  if (!fs.existsSync(activePath)) {
    try {
      fs.mkdirSync(activePath, { recursive: true });
    } catch (e) {
      logDebug(`Failed to create active folder: ${e.message}`);
    }
  }

  // 2. Scan active folder (enabled plugins)
  if (fs.existsSync(activePath)) {
    try {
      const items = fs.readdirSync(activePath, { withFileTypes: true });
      for (const item of items) {
        const activeItemPath = path.join(activePath, item.name);
        
        let isDir = false;
        try {
          isDir = fs.statSync(activeItemPath).isDirectory();
        } catch (e) {}

        if (isDir) {
          const pluginInfo = readPluginInfo(activeItemPath);
          pluginInfo.id = item.name;
          pluginInfo.isEnabled = true;
          pluginInfo.physicalPath = activeItemPath;

          // Replace if already found in storage (collision, active wins) or push
          const idx = plugins.findIndex(p => p.id === item.name);
          if (idx !== -1) {
            plugins[idx] = pluginInfo;
          } else {
            plugins.push(pluginInfo);
          }
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning active plugins: ${e.message}`);
    }
  }

  plugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return plugins;
}

// Scan global skills
function scanSkills(activePath, storagePath) {
  const skills = [];
  const seenNames = new Set();

  logDebug(`scanSkills: activePath=${activePath}, storagePath=${storagePath}`);

  // 1. Scan storage folder (disabled skills)
  if (fs.existsSync(storagePath)) {
    try {
      const items = fs.readdirSync(storagePath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const skillDir = path.join(storagePath, item.name);
          const skillInfo = readSkillInfo(skillDir);
          skillInfo.id = item.name;
          skillInfo.isEnabled = false;
          skillInfo.physicalPath = skillDir;
          skills.push(skillInfo);
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning storage skills: ${e.message}`);
    }
  }

  // Create active path if it doesn't exist
  if (!fs.existsSync(activePath)) {
    try {
      fs.mkdirSync(activePath, { recursive: true });
    } catch (e) {}
  }

  // 2. Scan active folder (enabled skills)
  if (fs.existsSync(activePath)) {
    try {
      const items = fs.readdirSync(activePath, { withFileTypes: true });
      for (const item of items) {
        const activeItemPath = path.join(activePath, item.name);
        
        let isDir = false;
        try {
          isDir = fs.statSync(activeItemPath).isDirectory();
        } catch (e) {}

        if (isDir) {
          const skillInfo = readSkillInfo(activeItemPath);
          skillInfo.id = item.name;
          skillInfo.isEnabled = true;
          skillInfo.physicalPath = activeItemPath;

          const idx = skills.findIndex(s => s.id === item.name);
          if (idx !== -1) {
            skills[idx] = skillInfo;
          } else {
            skills.push(skillInfo);
          }
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning active skills: ${e.message}`);
    }
  }

  skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return skills;
}

// Scan global workflows
function scanWorkflows(activePath, storagePath) {
  const workflows = [];
  const seenNames = new Set();

  logDebug(`scanWorkflows: activePath=${activePath}, storagePath=${storagePath}`);

  // 1. Scan storage folder (disabled workflows)
  if (fs.existsSync(storagePath)) {
    try {
      const items = fs.readdirSync(storagePath, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile() && item.name.endsWith('.md')) {
          const workflowFile = path.join(storagePath, item.name);
          const wfInfo = readWorkflowInfo(workflowFile);
          wfInfo.id = item.name;
          wfInfo.isEnabled = false;
          wfInfo.physicalPath = workflowFile;
          workflows.push(wfInfo);
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning storage workflows: ${e.message}`);
    }
  }

  // Create active path if it doesn't exist
  if (!fs.existsSync(activePath)) {
    try {
      fs.mkdirSync(activePath, { recursive: true });
    } catch (e) {}
  }

  // 2. Scan active folder (enabled workflows)
  if (fs.existsSync(activePath)) {
    try {
      const items = fs.readdirSync(activePath, { withFileTypes: true });
      for (const item of items) {
        const activeItemPath = path.join(activePath, item.name);
        
        let isFile = false;
        try {
          isFile = fs.statSync(activeItemPath).isFile();
        } catch (e) {}

        if (isFile && item.name.endsWith('.md')) {
          const wfInfo = readWorkflowInfo(activeItemPath);
          wfInfo.id = item.name;
          wfInfo.isEnabled = true;
          wfInfo.physicalPath = activeItemPath;

          const idx = workflows.findIndex(w => w.id === item.name);
          if (idx !== -1) {
            workflows[idx] = wfInfo;
          } else {
            workflows.push(wfInfo);
          }
          seenNames.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning active workflows: ${e.message}`);
    }
  }

  workflows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return workflows;
}

// Scan local workspace skills
function scanLocalSkills() {
  const localSkills = [];
  if (!vscode.workspace.workspaceFolders) return localSkills;
  
  for (const folder of vscode.workspace.workspaceFolders) {
    const wsRoot = folder.uri.fsPath;
    const wsSkillsPath = path.join(wsRoot, '.agents', 'skills');
    if (fs.existsSync(wsSkillsPath)) {
      try {
        const items = fs.readdirSync(wsSkillsPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            const skillDir = path.join(wsSkillsPath, item.name);
            const skillInfo = readSkillInfo(skillDir);
            skillInfo.id = `local-${folder.name}-${item.name}`;
            skillInfo.isEnabled = true;
            skillInfo.isLocal = true;
            skillInfo.workspaceName = folder.name;
            skillInfo.physicalPath = skillDir;
            localSkills.push(skillInfo);
          }
        }
      } catch (e) {
        logDebug(`Error scanning local skills in ${folder.name}: ${e.message}`);
      }
    }
  }
  return localSkills;
}

// Scan local workspace workflows
function scanLocalWorkflows() {
  const localWorkflows = [];
  if (!vscode.workspace.workspaceFolders) return localWorkflows;
  
  for (const folder of vscode.workspace.workspaceFolders) {
    const wsRoot = folder.uri.fsPath;
    const wsWorkflowsPath = path.join(wsRoot, '.agents', 'workflows');
    if (fs.existsSync(wsWorkflowsPath)) {
      try {
        const items = fs.readdirSync(wsWorkflowsPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isFile() && item.name.endsWith('.md')) {
            const workflowFile = path.join(wsWorkflowsPath, item.name);
            const wfInfo = readWorkflowInfo(workflowFile);
            wfInfo.id = `local-${folder.name}-${item.name}`;
            wfInfo.isEnabled = true;
            wfInfo.isLocal = true;
            wfInfo.workspaceName = folder.name;
            wfInfo.physicalPath = workflowFile;
            localWorkflows.push(wfInfo);
          }
        }
      } catch (e) {
        logDebug(`Error scanning local workflows in ${folder.name}: ${e.message}`);
      }
    }
  }
  return localWorkflows;
}

// Compute statistics counts
function getContextStats(activePlugins, activeSkills, activeWorkflows, workspaceRoots) {
  let activePluginsCount = activePlugins.filter(p => p.isEnabled).length;
  let totalPluginsCount = activePlugins.length;

  // Active individual global/local skills count
  let skillsCount = activeSkills.filter(s => s.isEnabled).length;

  // Active individual global/local workflows count
  let workflowsCount = activeWorkflows.filter(w => w.isEnabled).length;

  // Active hooks count (combines global active, workspace, and active plugins contributions)
  let hooksCount = 0;
  
  // 1. Global hooks
  const globalConfigPath = path.join(os.homedir(), '.gemini', 'config');
  hooksCount += countHooks(globalConfigPath);

  // Local workspace items (rules and extra skills/workflows/hooks in project)
  let rulesCount = 0;
  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsRulesPath = path.join(wsRoot, '.agents', 'rules');
      rulesCount += countItemsInDir(wsRulesPath);

      // Count workspace hooks
      hooksCount += countHooks(path.join(wsRoot, '.agents'));
    }
  }

  // Active plugins resource contributions
  for (const plugin of activePlugins) {
    if (plugin.isEnabled) {
      skillsCount += plugin.skillsCount || 0;
      rulesCount += plugin.rulesCount || 0;
      workflowsCount += plugin.workflowsCount || 0;
      hooksCount += plugin.hooksCount || 0;
    }
  }

  return {
    activePlugins: activePluginsCount,
    totalPlugins: totalPluginsCount,
    skills: skillsCount,
    rules: rulesCount,
    workflows: workflowsCount,
    hooks: hooksCount
  };
}


// Generic toggle action (Enables or disables resource by moving file/folder)
async function toggleItem(activePath, storagePath, itemId, enable, lang, category) {
  const activeItemPath = path.join(activePath, itemId);
  let storageItemPath = path.join(storagePath, itemId);

  // Backwards compatibility check for legacy plugins directly in storage root
  if (category === 'plugin' && !fs.existsSync(storageItemPath)) {
    const legacyPath = path.join(path.dirname(storagePath), itemId);
    if (fs.existsSync(legacyPath)) {
      storageItemPath = legacyPath;
    }
  }

  logDebug(`toggleItem category=${category}: id=${itemId}, enable=${enable}`);

  // Ensure target parent directories exist
  if (!fs.existsSync(activePath)) {
    fs.mkdirSync(activePath, { recursive: true });
  }
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  if (enable) {
    if (fs.existsSync(storageItemPath)) {
      if (fs.existsSync(activeItemPath)) {
        const backupPath = activeItemPath + '_bak_' + Date.now();
        fs.renameSync(activeItemPath, backupPath);
      }
      safeMoveDir(storageItemPath, activeItemPath);
    } else {
      if (!fs.existsSync(activeItemPath)) {
        throw new Error(getTranslation('storagePathNotSet', lang));
      }
    }
  } else {
    if (fs.existsSync(activeItemPath)) {
      if (fs.existsSync(storageItemPath)) {
        const backupPath = storageItemPath + '_bak_' + Date.now();
        fs.renameSync(storageItemPath, backupPath);
      }
      safeMoveDir(activeItemPath, storageItemPath);
    }
  }
}

// Migrate storage folders to new structure on storage path change
async function migrateStorage(oldPath, newPath, lang) {
  if (!fs.existsSync(oldPath)) return;
  const entries = fs.readdirSync(oldPath, { withFileTypes: true });
  if (entries.length === 0) return;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: getTranslation('migratingTitle', lang),
    cancellable: false
  }, async () => {
    let count = 0;
    const categories = ['plugins', 'skills', 'workflows'];
    
    // Ensure destination folders exist
    categories.forEach(cat => {
      const destCatPath = path.join(newPath, cat);
      if (!fs.existsSync(destCatPath)) {
        fs.mkdirSync(destCatPath, { recursive: true });
      }
    });

    for (const entry of entries) {
      const src = path.join(oldPath, entry.name);
      
      if (categories.includes(entry.name)) {
        if (entry.isDirectory()) {
          try {
            const subEntries = fs.readdirSync(src);
            for (const subName of subEntries) {
              const subSrc = path.join(src, subName);
              const subDest = path.join(newPath, entry.name, subName);
              if (fs.existsSync(subDest)) {
                fs.renameSync(subDest, subDest + '_bak_' + Date.now());
              }
              safeMoveDir(subSrc, subDest);
              count++;
            }
            fs.rmdirSync(src);
          } catch (e) {
            logDebug(`Error migrating subcategory ${entry.name}: ${e.message}`);
          }
        }
      } else {
        // Legacy root plugin folder, migrate to newPath/plugins/
        const dest = path.join(newPath, 'plugins', entry.name);
        try {
          if (fs.existsSync(dest)) {
            fs.renameSync(dest, dest + '_bak_' + Date.now());
          }
          safeMoveDir(src, dest);
          count++;
        } catch (e) {
          logDebug(`Error migrating legacy item ${entry.name}: ${e.message}`);
        }
      }
    }

    const msg = getTranslation('migrationFinished', lang).replace('{count}', count);
    vscode.window.showInformationMessage(msg);
  });
}

class PluginManagerViewProvider {
  constructor(context, statusBarItem) {
    this._context = context;
    this._statusBarItem = statusBarItem;
    this._view = undefined;
  }

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;
    sidebarProvider = this;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(this._context.extensionPath)]
    };

    const activeLang = getActiveLanguage();
    webviewView.webview.html = getHtmlContentShared(webviewView.webview, this._context, activeLang);

    setupWebviewMessagingShared(webviewView.webview, this._context, this._statusBarItem, () => {
      this.sendInitialData();
      sendPanelData(this._context);
      updateStatusBarItem(this._statusBarItem, this._context);
    });

    this.sendInitialData();
  }

  sendInitialData() {
    if (!this._view) return;

    const context = this._context;
    const activePluginsPath = getActivePluginsPath();
    const activeSkillsPath = getActiveSkillsPath();
    const activeWorkflowsPath = getActiveWorkflowsPath();
    
    const storagePath = getGlobalStoragePath(context);
    const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
    const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
    const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

    const workspaceRoots = vscode.workspace.workspaceFolders 
      ? vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath) 
      : [];

    const plugins = scanPlugins(activePluginsPath, storagePluginsPath);
    
    const globalSkills = scanSkills(activeSkillsPath, storageSkillsPath);
    const localSkills = scanLocalSkills();
    localSkills.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const skills = [...globalSkills, ...localSkills];

    const globalWorkflows = scanWorkflows(activeWorkflowsPath, storageWorkflowsPath);
    const localWorkflows = scanLocalWorkflows();
    localWorkflows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const workflows = [...globalWorkflows, ...localWorkflows];

    const stats = getContextStats(plugins, skills, workflows, workspaceRoots);

    this._view.webview.postMessage({
      command: 'init',
      plugins,
      skills,
      workflows,
      stats,
      storagePath
    });
  }
}

function sendPanelData(context) {
  if (!activePanel) return;

  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();
  
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
  const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

  const workspaceRoots = vscode.workspace.workspaceFolders 
    ? vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath) 
    : [];

  const plugins = scanPlugins(activePluginsPath, storagePluginsPath);
  
  const globalSkills = scanSkills(activeSkillsPath, storageSkillsPath);
  const localSkills = scanLocalSkills();
  localSkills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const skills = [...globalSkills, ...localSkills];

  const globalWorkflows = scanWorkflows(activeWorkflowsPath, storageWorkflowsPath);
  const localWorkflows = scanLocalWorkflows();
  localWorkflows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const workflows = [...globalWorkflows, ...localWorkflows];

  const stats = getContextStats(plugins, skills, workflows, workspaceRoots);

  activePanel.webview.postMessage({
    command: 'init',
    plugins,
    skills,
    workflows,
    stats,
    storagePath
  });
}


function openPluginManagerPanel(context, statusBarItem) {
  const lang = getActiveLanguage();
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    sendPanelData(context);
    return;
  }

  activePanel = vscode.window.createWebviewPanel(
    'antigravity-plugin-manager-panel',
    getTranslation('title', lang),
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  activePanel.webview.html = getHtmlContentShared(activePanel.webview, context, lang);

  setupWebviewMessagingShared(activePanel.webview, context, statusBarItem, () => {
    sendPanelData(context);
    if (sidebarProvider) {
      sidebarProvider.sendInitialData();
    }
    updateStatusBarItem(statusBarItem, context);
  });

  sendPanelData(context);

  activePanel.onDidDispose(() => {
    activePanel = undefined;
  }, null, context.subscriptions);
}

function setupWebviewMessagingShared(webview, context, statusBarItem, onUpdate) {
  webview.onDidReceiveMessage(async (message) => {
    const activePluginsPath = getActivePluginsPath();
    const activeSkillsPath = getActiveSkillsPath();
    const activeWorkflowsPath = getActiveWorkflowsPath();
    
    const storagePath = getGlobalStoragePath(context);
    const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
    const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
    const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

    const lang = getActiveLanguage();

    switch (message.command) {
      case 'ready':
        onUpdate();
        break;
      case 'refresh':
        onUpdate();
        break;
      case 'toggle':
        try {
          if (message.category === 'skill') {
            await toggleItem(activeSkillsPath, storageSkillsPath, message.id, message.enable, lang, 'skill');
          } else if (message.category === 'workflow') {
            await toggleItem(activeWorkflowsPath, storageWorkflowsPath, message.id, message.enable, lang, 'workflow');
          } else {
            await toggleItem(activePluginsPath, storagePluginsPath, message.id, message.enable, lang, 'plugin');
          }
          onUpdate();
        } catch (e) {
          logDebug(`Toggle error: ${e.message}`);
          const errMsg = getTranslation('errorToggle', lang).replace('{error}', e.message);
          vscode.window.showErrorMessage(errMsg);
          webview.postMessage({ command: 'error' });
        }
        break;
      case 'selectStorage':
        const uri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: getTranslation('changeStorage', lang)
        });
        if (uri && uri[0]) {
          const folderPath = uri[0].fsPath;
          
          const activeDrive = path.parse(activePluginsPath).root.toLowerCase();
          const storageDrive = path.parse(folderPath).root.toLowerCase();
          const yes = lang === 'ru' ? 'Да' : 'Yes';
          const no = lang === 'ru' ? 'Нет' : 'No';

          if (activeDrive && storageDrive && activeDrive !== storageDrive) {
            const warnText = getTranslation('differentDriveWarning', lang)
              .replace('{storageDrive}', storageDrive.toUpperCase())
              .replace('{activeDrive}', activeDrive.toUpperCase());
            const driveChoice = await vscode.window.showWarningMessage(warnText, yes, no);
            if (driveChoice !== yes) {
              break;
            }
          }

          const confirmText = getTranslation('confirmChangeStorage', lang);
          const choice = await vscode.window.showWarningMessage(confirmText, yes, no);
          
          if (choice === yes) {
            const oldStoragePath = getGlobalStoragePath(context);
            await context.globalState.update('storagePath', folderPath);
            try {
              await vscode.workspace.getConfiguration('antigravity-plugin-manager').update('storagePath', folderPath, vscode.ConfigurationTarget.Global);
            } catch (e) {}

            if (fs.existsSync(oldStoragePath) && oldStoragePath !== folderPath) {
              const migrateChoice = await vscode.window.showInformationMessage(getTranslation('migrateOffer', lang), yes, no);
              if (migrateChoice === yes) {
                await migrateStorage(oldStoragePath, folderPath, lang);
              }
            }
            onUpdate();
          }
        }
        break;
      case 'openStorage':
        if (fs.existsSync(storagePath)) {
          vscode.env.openExternal(vscode.Uri.file(storagePath));
        } else {
          vscode.window.showWarningMessage('Storage folder does not exist yet.');
        }
        break;
      case 'openActive':
        if (fs.existsSync(activePluginsPath)) {
          vscode.env.openExternal(vscode.Uri.file(activePluginsPath));
        } else {
          vscode.window.showWarningMessage('Active plugins folder does not exist.');
        }
        break;
      case 'openItemFolder':
        let itemFolder = '';
        if (message.isLocal && message.physicalPath) {
          itemFolder = message.physicalPath;
        } else if (message.category === 'skill') {
          itemFolder = message.isEnabled ? path.join(activeSkillsPath, message.id) : path.join(storageSkillsPath, message.id);
        } else if (message.category === 'workflow') {
          itemFolder = message.isEnabled ? activeWorkflowsPath : storageWorkflowsPath;
        } else {
          itemFolder = message.isEnabled ? path.join(activePluginsPath, message.id) : path.join(storagePluginsPath, message.id);
          if (!message.isEnabled && !fs.existsSync(itemFolder)) {
            const rootPath = path.join(storagePath, message.id);
            if (fs.existsSync(rootPath)) itemFolder = rootPath;
          }
        }

        if (fs.existsSync(itemFolder)) {
          vscode.env.openExternal(vscode.Uri.file(itemFolder));
        } else {
          vscode.window.showWarningMessage('Folder does not exist: ' + itemFolder);
        }
        break;

      case 'editPluginMetadata':
        try {
          let pluginFolder = message.isEnabled ? path.join(activePluginsPath, message.id) : path.join(storagePluginsPath, message.id);
          if (!message.isEnabled && !fs.existsSync(pluginFolder)) {
            const rootPath = path.join(storagePath, message.id);
            if (fs.existsSync(rootPath)) pluginFolder = rootPath;
          }

          let displayField = message.field;
          if (message.field === 'displayName') displayField = getTranslation('metadataDisplayName', lang);
          else if (message.field === 'name') displayField = getTranslation('metadataName', lang);
          else if (message.field === 'description') displayField = getTranslation('metadataDescription', lang);
          else if (message.field === 'version') displayField = getTranslation('metadataVersion', lang);
          else if (message.field === 'author') displayField = getTranslation('metadataAuthor', lang);

          const prompt = getTranslation('editMetadataPrompt', lang).replace('{field}', displayField);

          const newValue = await vscode.window.showInputBox({
            value: message.value || '',
            prompt: prompt,
            placeHolder: `Enter ${displayField}...`
          });

          if (newValue !== undefined) {
            updatePluginMetadata(pluginFolder, message.field, newValue.trim());
            onUpdate();
          }
        } catch (e) {
          logDebug(`Metadata edit error: ${e.message}`);
          vscode.window.showErrorMessage('Failed to save metadata: ' + e.message);
        }
        break;

      case 'openFileInEditor':
        try {
          let filePath = message.physicalPath;
          if (message.category === 'skill') {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              filePath = path.join(filePath, 'SKILL.md');
            }
          }
          if (fs.existsSync(filePath)) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
          } else {
            vscode.window.showWarningMessage('File does not exist: ' + filePath);
          }
        } catch (e) {
          logDebug(`Open file error: ${e.message}`);
          vscode.window.showErrorMessage('Failed to open file: ' + e.message);
        }
        break;

      case 'requestMove':
        try {
          const { itemId, category, sourcePluginId, isEnabled } = message;
          
          const allPlugins = scanPlugins(activePluginsPath, storagePluginsPath);
          const otherPlugins = allPlugins.filter(p => p.id !== sourcePluginId);
          
          const quickPickItems = [];
          
          // 1. Add "Global" option (only for skills and workflows, rules cannot be global)
          // Exclude if already global (not in a plugin and not local)
          const isAlreadyGlobal = !sourcePluginId && !message.isLocal;
          if (category !== 'rule' && !isAlreadyGlobal) {
            quickPickItems.push({
              label: lang === 'ru' ? '$(globe) Глобальный' : '$(globe) Global',
              description: lang === 'ru' ? 'Переместить в общие папки' : 'Move to global folders',
              id: 'global',
              type: 'global'
            });
          }
          
          // 2. Add Plugins option (only for skills and rules, workflows cannot reside in plugins)
          if (category !== 'workflow') {
            otherPlugins.forEach(p => {
              quickPickItems.push({
                label: `$(package) ${p.displayName}`,
                description: `ID: ${p.id}`,
                id: p.id,
                type: 'plugin'
              });
            });
          }

          // 3. Add Workspace folders option (for skills, rules, workflows)
          if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            vscode.workspace.workspaceFolders.forEach(folder => {
              // Exclude if item is already in this workspace
              let isCurrentWorkspace = false;
              if (message.isLocal && message.physicalPath) {
                const relative = path.relative(folder.uri.fsPath, message.physicalPath);
                isCurrentWorkspace = !relative.startsWith('..') && !path.isAbsolute(relative);
              }
              
              if (!isCurrentWorkspace) {
                quickPickItems.push({
                  label: `$(folder) ${lang === 'ru' ? 'Рабочая область' : 'Workspace'}: ${folder.name}`,
                  description: folder.uri.fsPath,
                  id: folder.uri.fsPath,
                  type: 'workspace'
                });
              }
            });
          }
          
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: lang === 'ru' 
              ? `Выберите место назначения для элемента "${itemId}"`
              : `Select destination for "${itemId}"`
          });
          
          if (selected !== undefined) {
            const targetType = selected.type;
            const targetId = selected.id;
            
            let sourcePath = '';
            let targetParent = '';
            
            // Determine source path
            if (sourcePluginId) {
              const pluginFolder = isEnabled ? path.join(activePluginsPath, sourcePluginId) : path.join(storagePluginsPath, sourcePluginId);
              sourcePath = path.join(pluginFolder, category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'), itemId);
            } else if (message.isLocal && message.physicalPath) {
              sourcePath = message.physicalPath;
            } else {
              if (category === 'skill') {
                sourcePath = isEnabled ? path.join(activeSkillsPath, itemId) : path.join(storageSkillsPath, itemId);
              } else if (category === 'workflow') {
                sourcePath = isEnabled ? path.join(activeWorkflowsPath, itemId) : path.join(storageWorkflowsPath, itemId);
              }
            }
            
            // Determine target parent folder
            if (targetType === 'plugin') {
              const targetPlugin = allPlugins.find(p => p.id === targetId);
              const isTargetEnabled = targetPlugin ? targetPlugin.isEnabled : false;
              const targetPluginFolder = isTargetEnabled ? path.join(activePluginsPath, targetId) : path.join(storagePluginsPath, targetId);
              targetParent = path.join(targetPluginFolder, category === 'skill' ? 'skills' : 'rules');
            } else if (targetType === 'global') {
              if (category === 'skill') {
                targetParent = isEnabled ? activeSkillsPath : storageSkillsPath;
              } else if (category === 'workflow') {
                targetParent = isEnabled ? activeWorkflowsPath : storageWorkflowsPath;
              }
            } else if (targetType === 'workspace') {
              targetParent = path.join(targetId, '.agents', category === 'skill' ? 'skills' : (category === 'workflow' ? 'workflows' : 'rules'));
            }
            
            if (!sourcePath || !targetParent) {
              throw new Error(getTranslation('invalidPaths', lang));
            }
            
            if (!fs.existsSync(sourcePath)) {
              throw new Error(getTranslation('sourceNotExist', lang).replace('{path}', sourcePath));
            }
            
            if (!fs.existsSync(targetParent)) {
              fs.mkdirSync(targetParent, { recursive: true });
            }
            
            const filename = path.basename(sourcePath);
            const targetPath = path.join(targetParent, filename);
            
            // Safeguard: check if moving to the exact same file/folder
            if (path.resolve(sourcePath).toLowerCase() === path.resolve(targetPath).toLowerCase()) {
              vscode.window.showInformationMessage(
                getTranslation('alreadyInFolder', lang).replace('{itemId}', filename)
              );
              return;
            }
            
            if (fs.existsSync(targetPath)) {
              const yes = lang === 'ru' ? 'Да' : 'Yes';
              const no = lang === 'ru' ? 'Нет' : 'No';
              const overwriteText = getTranslation('overwritePrompt', lang).replace('{itemId}', filename);
              const overwriteChoice = await vscode.window.showWarningMessage(overwriteText, yes, no);
              if (overwriteChoice === yes) {
                const stat = fs.statSync(targetPath);
                if (stat.isDirectory()) {
                  fs.rmSync(targetPath, { recursive: true, force: true });
                } else {
                  fs.unlinkSync(targetPath);
                }
              } else {
                return;
              }
            }
            
            safeMoveDir(sourcePath, targetPath);
            onUpdate();
            
            vscode.window.showInformationMessage(
              getTranslation('moveSuccess', lang).replace('{itemId}', filename)
            );
          }
        } catch (e) {
          logDebug(`Move error: ${e.message}`);
          vscode.window.showErrorMessage(getTranslation('errorMove', lang).replace('{error}', e.message));
        }
        break;
    }
  });
}

function getHtmlContentShared_old(webview, context, lang) {
  const title = getTranslation('title', lang);
  const subtitle = getTranslation('subtitle', lang);
  const storagePathLabel = getTranslation('storagePath', lang);
  const changeStorageBtn = getTranslation('changeStorage', lang);
  const statsHeader = getTranslation('statsHeader', lang);
  const statPlugins = getTranslation('statPlugins', lang);
  const statSkills = getTranslation('statSkills', lang);
  const statRules = getTranslation('statRules', lang);
  const statWorkflows = getTranslation('statWorkflows', lang);
  
  const tabPlugins = getTranslation('tabPlugins', lang);
  const tabSkills = getTranslation('tabSkills', lang);
  const tabWorkflows = getTranslation('tabWorkflows', lang);

  const noPlugins = getTranslation('noPlugins', lang);
  const noSkills = getTranslation('noSkills', lang);
  const noWorkflows = getTranslation('noWorkflows', lang);

  const captionPlugins = getTranslation('captionPlugins', lang);
  const captionSkills = getTranslation('captionSkills', lang);
  const captionWorkflows = getTranslation('captionWorkflows', lang);


  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-gradient: linear-gradient(135deg, #6366f1, #a855f7);
      --success-gradient: linear-gradient(135deg, #10b981, #059669);
      --danger-gradient: linear-gradient(135deg, #ef4444, #dc2626);
      --bg-glass: rgba(255, 255, 255, 0.03);
      --border-glass: rgba(255, 255, 255, 0.06);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--vscode-editor-background, #1e1e2e);
      color: var(--text-main);
      margin: 0;
      padding: 16px;
      overflow-x: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    header {
      padding-bottom: 8px;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px 0;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.4;
    }

    .glass-card {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .glass-card:hover {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
    }

    .storage-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .storage-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .storage-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .storage-path {
      flex: 1;
      font-family: monospace;
      font-size: 11px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.04);
      padding: 6px 10px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: nowrap;
      color: #cbd5e1;
    }

    .btn {
      font-family: 'Outfit', sans-serif;
      font-size: 11px;
      font-weight: 500;
      background: var(--primary-gradient);
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .grid-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .stat-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
      text-align: center;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .stat-label {
      font-size: 10px;
      color: var(--text-muted);
    }

    .stat-blue .stat-value { color: #60a5fa; }
    .stat-purple .stat-value { color: #c084fc; }
    .stat-emerald .stat-value { color: #34d399; }
    .stat-amber .stat-value { color: #fbbf24; }

    /* Tabs Styling */
    .tabs-row {
      display: flex;
      gap: 4px;
      background: rgba(0, 0, 0, 0.15);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-glass);
      margin-top: 8px;
    }

    .tab-btn {
      flex: 1;
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tab-btn.active {
      background: var(--primary-gradient);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);
    }

    .tab-btn:hover:not(.active) {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }

    .list-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }

    .list-title {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .search-box {
      width: 100%;
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border-glass);
      color: var(--text-main);
      font-family: inherit;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-box:focus {
      border-color: rgba(99, 102, 241, 0.5);
    }

    /* Plugin List Grid (Adapts automatically to columns depending on available width) */
    .plugin-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
      margin-top: 4px;
    }

    .plugin-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .plugin-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .plugin-meta {
      flex: 1;
      min-width: 0;
    }

    .plugin-name {
      font-size: 13px;
      font-weight: 600;
      color: #f8fafc;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .plugin-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.35;
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .plugin-details {
      display: flex;
      gap: 8px;
      font-size: 10px;
      color: var(--text-muted);
    }

    .card-right-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .card-action-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
    }

    .card-action-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      color: var(--text-main);
      transform: scale(1.08);
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 20px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-glass);
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 20px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background-color: #cbd5e1;
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }

    input:checked + .slider {
      background: var(--success-gradient);
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
    }

    input:checked + .slider:before {
      transform: translateX(18px);
      background-color: #ffffff;
    }

    /* Resource tags (Enlarged to 11px to match description font size) */
    .resource-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .res-tag {
      font-size: 11px;
      padding: 3px 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 4px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .res-tag.active {
      color: #f1f5f9;
      background: rgba(99, 102, 241, 0.08);
      border-color: rgba(99, 102, 241, 0.15);
    }

    .res-indicator {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background-color: #94a3b8;
    }

    .res-tag.active .res-indicator {
      background-color: #818cf8;
    }

    .res-tag.active.res-mcp .res-indicator { background-color: #fb7185; }
    .res-tag.active.res-hooks .res-indicator { background-color: #f472b6; }

    .no-data {
      text-align: center;
      color: var(--text-muted);
      font-size: 11px;
      padding: 24px 0;
    }

    .explorer-buttons {
      display: flex;
      gap: 8px;
    }

    .edit-desc-container {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 6px 0;
      width: 100%;
    }

    .inline-desc-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 11px;
      padding: 6px;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
    }

    .inline-desc-input:focus {
      border-color: rgba(99, 102, 241, 0.4);
    }

    .edit-desc-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }

    .inline-edit-btn {
      padding: 4px 8px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Small spinner for local card load feedback */
    .spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </header>

    <div class="glass-card storage-section">
      <div class="storage-title">${storagePathLabel}</div>
      <div class="storage-row">
        <div class="storage-path" id="storage-path-display">...</div>
        <button class="btn" id="btn-select-storage">${changeStorageBtn}</button>
      </div>
      <div class="explorer-buttons">
        <button class="btn btn-secondary" style="flex: 1;" id="btn-open-active">${lang === 'ru' ? 'Открыть папку Plugins' : 'Open Active Folder'}</button>
        <button class="btn btn-secondary" style="flex: 1;" id="btn-open-storage">${lang === 'ru' ? 'Открыть Хранилище' : 'Open Storage Folder'}</button>
      </div>
    </div>

    <!-- Restored 2x2 Grid Statistics (without Pink Active Hooks Box) -->
    <div class="glass-card grid-stats">
      <div class="stat-box stat-blue">
        <span class="stat-value" id="val-plugins">0</span>
        <span class="stat-label">${statPlugins}</span>
      </div>
      <div class="stat-box stat-purple">
        <span class="stat-value" id="val-skills">0</span>
        <span class="stat-label">${statSkills}</span>
      </div>
      <div class="stat-box stat-emerald">
        <span class="stat-value" id="val-rules">0</span>
        <span class="stat-label">${statRules}</span>
      </div>
      <div class="stat-box stat-amber">
        <span class="stat-value" id="val-workflows">0</span>
        <span class="stat-label">${statWorkflows}</span>
      </div>
    </div>

    <!-- Tab Selection Row -->
    <div class="tabs-row">
      <button class="tab-btn active" id="tab-btn-plugins" onclick="switchTab('plugins')">${tabPlugins}</button>
      <button class="tab-btn" id="tab-btn-skills" onclick="switchTab('skills')">${tabSkills}</button>
      <button class="tab-btn" id="tab-btn-workflows" onclick="switchTab('workflows')">${tabWorkflows}</button>
    </div>

    <div class="list-subtitle-info" id="list-subtitle-info" style="font-size: 11px; color: var(--text-muted); font-style: italic; margin: 6px 0 10px 2px;">
      ${captionPlugins}
    </div>

    <div class="list-section-header">
      <div class="list-title" id="list-section-title">${tabPlugins}</div>
      <button class="btn btn-secondary" style="padding: 4px 8px;" id="btn-refresh">${lang === 'ru' ? 'Обновить' : 'Refresh'}</button>
    </div>

    <input type="text" class="search-box" id="search-input" placeholder="${lang === 'ru' ? 'Поиск...' : 'Search...'}">

    <div class="plugin-list" id="plugin-list-container">
      <div class="no-data">${noPlugins}</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    // Lists data
    let pluginsData = [];
    let skillsData = [];
    let workflowsData = [];
    
    let currentTab = 'plugins';

    // DOM Elements
    const storagePathDisplay = document.getElementById('storage-path-display');
    const valPlugins = document.getElementById('val-plugins');
    const valSkills = document.getElementById('val-skills');
    const valRules = document.getElementById('val-rules');
    const valWorkflows = document.getElementById('val-workflows');
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

          pluginsData = message.plugins || [];
          skillsData = message.skills || [];
          workflowsData = message.workflows || [];
          
          renderCurrentTab();
          break;
        case 'error':
          alert(message.message);
          // Re-enable checkboxes and hide loader on error
          document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);
          document.querySelectorAll('[id^="loader-"]').forEach(el => el.style.display = 'none');
          document.querySelectorAll('[id^="switch-container-"]').forEach(el => el.style.display = 'block');
          break;
      }
    });

    // Event Listeners
    document.getElementById('btn-select-storage').addEventListener('click', () => {
      vscode.postMessage({ command: 'selectStorage' });
    });

    document.getElementById('btn-open-active').addEventListener('click', () => {
      vscode.postMessage({ command: 'openActive' });
    });

    document.getElementById('btn-open-storage').addEventListener('click', () => {
      vscode.postMessage({ command: 'openStorage' });
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    searchInput.addEventListener('input', () => {
      renderCurrentTab();
    });

    // Switch Tabs
    window.switchTab = function(tabName) {
      currentTab = tabName;
      
      // Update Tab button CSS classes
      document.getElementById('tab-btn-plugins').classList.toggle('active', tabName === 'plugins');
      document.getElementById('tab-btn-skills').classList.toggle('active', tabName === 'skills');
      document.getElementById('tab-btn-workflows').classList.toggle('active', tabName === 'workflows');
      
      const subtitleInfo = document.getElementById('list-subtitle-info');
      // Update heading text and subtitle info description
      if (tabName === 'plugins') {
        listSectionTitle.textContent = '${tabPlugins}';
        subtitleInfo.textContent = "${escapeJsString(captionPlugins)}";
      } else if (tabName === 'skills') {
        listSectionTitle.textContent = '${tabSkills}';
        subtitleInfo.textContent = "${escapeJsString(captionSkills)}";
      } else if (tabName === 'workflows') {
        listSectionTitle.textContent = '${tabWorkflows}';
        subtitleInfo.textContent = "${escapeJsString(captionWorkflows)}";
      }
      
      searchInput.value = '';
      renderCurrentTab();
    };


    window.toggleItem = function(category, itemId, enable) {
      // Lock checkboxes during transition
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
      
      const switchEl = document.getElementById('switch-container-' + itemId);
      const loaderEl = document.getElementById('loader-' + itemId);
      if (switchEl && loaderEl) {
        switchEl.style.display = 'none';
        loaderEl.style.display = 'block';
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


    window.editPluginDescription = function(itemId, isEnabled, currentDesc) {
      vscode.postMessage({ command: 'editDescription', id: itemId, isEnabled: isEnabled, description: currentDesc });
    };

    window.startEditDescription = function(itemId) {
      const descEl = document.getElementById("desc-" + itemId);
      const editContainer = document.getElementById("edit-container-" + itemId);
      if (descEl && editContainer) {
        descEl.style.display = "none";
        editContainer.style.display = "flex";
        const input = document.getElementById("input-desc-" + itemId);
        if (input) {
          input.value = input.getAttribute("data-original");
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }
    };

    window.cancelEditDescription = function(itemId) {
      const descEl = document.getElementById("desc-" + itemId);
      const editContainer = document.getElementById("edit-container-" + itemId);
      if (descEl && editContainer) {
        descEl.style.display = "-webkit-box";
        editContainer.style.display = "none";
      }
    };

    window.saveEditDescription = function(itemId, isEnabled) {
      const input = document.getElementById("input-desc-" + itemId);
      if (input) {
        const newDesc = input.value.trim();
        input.disabled = true;
        
        const btnSave = document.getElementById("btn-save-" + itemId);
        const btnCancel = document.getElementById("btn-cancel-" + itemId);
        if (btnSave) btnSave.disabled = true;
        if (btnCancel) btnCancel.disabled = true;
        
        vscode.postMessage({
          command: 'saveDescriptionDirectly',
          id: itemId,
          isEnabled: isEnabled,
          description: newDesc
        });
      }
    };

    window.handleInputKey = function(event, itemId, isEnabled) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        saveEditDescription(itemId, isEnabled);
      } else if (event.key === 'Escape') {
        cancelEditDescription(itemId);
      }
    };

    function escapeQuotes(str) {
      if (!str) return '';
      return str.replace(/\\\\/g, '\\\\\\\\')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(new RegExp(String.fromCharCode(96), 'g'), '\\\\' + String.fromCharCode(96));
    }

    function renderCurrentTab() {
      const query = searchInput.value.toLowerCase().trim();
      
      if (currentTab === 'plugins') {
        const filtered = pluginsData.filter(p => 
          p.displayName.toLowerCase().includes(query) || 
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noPlugins}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(p => {
          const hasSkills = p.skillsCount > 0;
          const hasRules = p.rulesCount > 0;
          const hasWorkflows = p.workflowsCount > 0;
          const hasHooks = p.hooksCount > 0;
          const escapedDesc = escapeQuotes(p.description);
          
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name" title="\${p.displayName}">\${p.displayName}</div>
                  
                  <div class="plugin-desc" id="desc-\${p.id}" title="\${p.description}">
                    \${p.description || '${lang === 'ru' ? 'Описание отсутствует.' : 'No description.'}'}
                  </div>

                  <div class="edit-desc-container" id="edit-container-\${p.id}" style="display: none;">
                    <textarea class="inline-desc-input" id="input-desc-\${p.id}" rows="2" data-original="\${escapedDesc}" onkeydown="handleInputKey(event, '\${p.id}', \${p.isEnabled})"></textarea>
                    <div class="edit-desc-buttons">
                      <button class="btn btn-secondary inline-edit-btn" id="btn-cancel-\${p.id}" onclick="cancelEditDescription('\${p.id}')">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                      <button class="btn inline-edit-btn" id="btn-save-\${p.id}" onclick="saveEditDescription('\${p.id}', \${p.isEnabled})">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div class="plugin-details">
                    <span>v\${p.version}</span>
                    \${p.author ? \`<span>•</span> <span>\${p.author}</span>\` : ''}
                  </div>
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку' : 'Open folder'}" onclick="openItemFolder('plugin', '\${p.id}', \${p.isEnabled}, false, '\${escapeQuotes(p.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Изменить описание' : 'Edit description'}" onclick="startEditDescription('\${p.id}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
                      </svg>
                    </button>
                  </div>
                  <div id="switch-container-\${p.id}">
                    <label class="switch">
                      <input type="checkbox" \${p.isEnabled ? 'checked' : ''} onchange="toggleItem('plugin', '\${p.id}', this.checked)">
                      <span class="slider"></span>
                    </label>
                  </div>
                  <div id="loader-\${p.id}" style="display: none; padding-right: 6px;">
                    <div class="spinner-small"></div>
                  </div>
                </div>
              </div>
              
              <div class="resource-tags">
                <div class="res-tag \${hasSkills ? 'active' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.skillsCount} \${p.skillsCount === 1 ? '${lang === 'ru' ? 'навык' : 'skill'}' : (p.skillsCount >= 2 && p.skillsCount <= 4 ? '${lang === 'ru' ? 'навыка' : 'skills'}' : '${lang === 'ru' ? 'навыков' : 'skills'}')}</span>
                </div>
                <div class="res-tag \${hasRules ? 'active' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.rulesCount} \${p.rulesCount === 1 ? '${lang === 'ru' ? 'правило' : 'rule'}' : (p.rulesCount >= 2 && p.rulesCount <= 4 ? '${lang === 'ru' ? 'правила' : 'rules'}' : '${lang === 'ru' ? 'правил' : 'rules'}')}</span>
                </div>
                <div class="res-tag \${hasWorkflows ? 'active' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.workflowsCount} \${p.workflowsCount === 1 ? '${lang === 'ru' ? 'воркфлоу' : 'workflow'}' : '${lang === 'ru' ? 'воркфлоу' : 'workflows'}'}</span>
                </div>
                <div class="res-tag \${hasHooks ? 'active res-hooks' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.hooksCount} \${p.hooksCount === 1 ? '${lang === 'ru' ? 'хук' : 'hook'}' : (p.hooksCount >= 2 && p.hooksCount <= 4 ? '${lang === 'ru' ? 'хука' : 'hooks'}' : '${lang === 'ru' ? 'хуков' : 'hooks'}')}</span>
                </div>
                \${p.hasMcp ? \`
                  <div class="res-tag active res-mcp">
                    <span class="res-indicator"></span>
                    <span>MCP</span>
                  </div>
                \` : ''}
              </div>
            </div>
          \`;
        }).join('');
        
      } else if (currentTab === 'skills') {
        const filtered = skillsData.filter(s => 
          s.displayName.toLowerCase().includes(query) || 
          s.name.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noSkills}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(s => {
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name" title="\${s.displayName}">\${s.displayName}</div>
                  <div class="plugin-desc" title="\${s.description}">\${s.description}</div>
                  \${s.isLocal ? \`
                    <div class="resource-tags" style="margin-top: 4px;">
                      <div class="res-tag active res-mcp" style="font-size: 11px;">
                        <span class="res-indicator"></span>
                        <span>${lang === 'ru' ? 'Локальный' : 'Local'} • \${s.workspaceName}</span>
                      </div>
                    </div>
                  \` : ''}
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку' : 'Open folder'}" onclick="openItemFolder('skill', '\${s.id}', \${s.isEnabled}, \${s.isLocal ? 'true' : 'false'}, '\${escapeQuotes(s.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  </div>
                  \${s.isLocal ? '' : \`
                    <div id="switch-container-\${s.id}">
                      <label class="switch">
                        <input type="checkbox" \${s.isEnabled ? 'checked' : ''} onchange="toggleItem('skill', '\${s.id}', this.checked)">
                        <span class="slider"></span>
                      </label>
                    </div>
                    <div id="loader-\${s.id}" style="display: none; padding-right: 6px;">
                      <div class="spinner-small"></div>
                    </div>
                  \`}
                </div>
              </div>
            </div>
          \`;
        }).join('');
        
      } else if (currentTab === 'workflows') {
        const filtered = workflowsData.filter(w => 
          w.displayName.toLowerCase().includes(query) || 
          w.name.toLowerCase().includes(query) ||
          (w.description && w.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noWorkflows}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(w => {
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name" title="\${w.displayName}">\${w.displayName}</div>
                  <div class="plugin-desc" title="\${w.description}">\${w.description}</div>
                  \${w.isLocal ? \`
                    <div class="resource-tags" style="margin-top: 4px;">
                      <div class="res-tag active res-mcp" style="font-size: 11px;">
                        <span class="res-indicator"></span>
                        <span>${lang === 'ru' ? 'Локальный' : 'Local'} • \${w.workspaceName}</span>
                      </div>
                    </div>
                  \` : ''}
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку воркфлоу' : 'Open workflow folder'}" onclick="openItemFolder('workflow', '\${w.id}', \${w.isEnabled}, \${w.isLocal ? 'true' : 'false'}, '\${escapeQuotes(w.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  </div>
                  \${w.isLocal ? '' : \`
                    <div id="switch-container-\${w.id}">
                      <label class="switch">
                        <input type="checkbox" \${w.isEnabled ? 'checked' : ''} onchange="toggleItem('workflow', '\${w.id}', this.checked)">
                        <span class="slider"></span>
                      </label>
                    </div>
                    <div id="loader-\${w.id}" style="display: none; padding-right: 6px;">
                      <div class="spinner-small"></div>
                    </div>
                  \`}
                </div>
              </div>
            </div>
          \`;
        }).join('');
      }

    }
  </script>
</body>
</html>`;
}

// Get final configuration path or state
function getGlobalStoragePath(context) {
  let configPath = vscode.workspace.getConfiguration('antigravity-plugin-manager').get('storagePath');
  if (configPath) {
    return path.resolve(configPath);
  }
  let statePath = context.globalState.get('storagePath');
  if (statePath) {
    return path.resolve(statePath);
  }
  return getDefaultStoragePath();
}

function updateStatusBarItem(statusBarItem, context) {
  const activePath = getActivePluginsPath();
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const lang = getActiveLanguage();

  const plugins = scanPlugins(activePath, storagePluginsPath);
  const activeCount = plugins.filter(p => p.isEnabled).length;
  const totalCount = plugins.length;

  // Set status text
  let statusText = getTranslation('statusBarText', lang)
    .replace('{active}', activeCount)
    .replace('{total}', totalCount);
  
  statusBarItem.text = `$(extensions) ${statusText}`;

  // Form list for tooltip
  const activeList = plugins
    .filter(p => p.isEnabled)
    .map(p => `• ${p.displayName} (v${p.version})`)
    .join('\n') || (lang === 'ru' ? '• Нет активных плагов' : '• No active plugins');

  const disabledList = plugins
    .filter(p => !p.isEnabled)
    .map(p => `• ${p.displayName} (v${p.version})`)
    .join('\n') || (lang === 'ru' ? '• Нет выключенных плагов' : '• No disabled plugins');

  statusBarItem.tooltip = getTranslation('statusBarTooltip', lang)
    .replace('{activeList}', activeList)
    .replace('{disabledList}', disabledList);
}

function activate(context) {
  // Check if we are running in Antigravity IDE
  const isAntigravity = vscode.env.appName === 'Antigravity IDE' || (vscode.env.appName && vscode.env.appName.includes('Antigravity'));
  if (!isAntigravity) {
    vscode.window.showErrorMessage('Antigravity Plugin Manager is designed exclusively for Antigravity IDE and is not supported in standard VS Code.');
    return;
  }

  logDebug('Antigravity Plugin Manager activating...');

  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();
  
  const storagePath = getGlobalStoragePath(context);
  const storagePluginsPath = getStorageSubpath(storagePath, 'plugins');
  const storageSkillsPath = getStorageSubpath(storagePath, 'skills');
  const storageWorkflowsPath = getStorageSubpath(storagePath, 'workflows');

  // Safety: Create directories if needed on start
  [
    activePluginsPath, activeSkillsPath, activeWorkflowsPath,
    storagePath, storagePluginsPath, storageSkillsPath, storageWorkflowsPath
  ].forEach(p => {
    if (!fs.existsSync(p)) {
      try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
    }
  });

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  statusBarItem.command = 'antigravity-plugin-manager.open';
  updateStatusBarItem(statusBarItem, context);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register Webview View Provider
  const provider = new PluginManagerViewProvider(context, statusBarItem);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('antigravity-plugin-manager.view', provider)
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.open', () => {
      openPluginManagerPanel(context, statusBarItem);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.refresh', () => {
      if (provider) {
        provider.sendInitialData();
      }
      sendPanelData(context);
      updateStatusBarItem(statusBarItem, context);
      vscode.window.showInformationMessage(getActiveLanguage() === 'ru' ? 'Список обновлен' : 'List refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.refreshStatusBar', () => {
      updateStatusBarItem(statusBarItem, context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-plugin-manager.selectStorage', () => {
      if (activePanel) {
        activePanel.webview.postMessage({ command: 'selectStorage' });
      } else if (provider && provider._view) {
        provider._view.webview.postMessage({ command: 'selectStorage' });
      }
    })
  );

  // Listen for config changes to refresh UI
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('antigravity-plugin-manager.storagePath') || e.affectsConfiguration('antigravity-plugin-manager.language')) {
      const activeLang = getActiveLanguage();
      if (activePanel) {
        activePanel.webview.html = getHtmlContentShared(activePanel.webview, context, activeLang);
        sendPanelData(context);
      }
      if (provider && provider._view) {
        provider._view.webview.html = getHtmlContentShared(provider._view.webview, context, activeLang);
        provider.sendInitialData();
      }
      updateStatusBarItem(statusBarItem, context);
    }
  }, null, context.subscriptions);

  logDebug('Antigravity Plugin Manager activated successfully.');
}

function deactivate() {
  logDebug('Antigravity Plugin Manager deactivated.');
}

function getHtmlContentShared(webview, context, lang) {
  const title = getTranslation('title', lang);
  const subtitle = getTranslation('subtitle', lang);
  const storagePathLabel = getTranslation('storagePath', lang);
  const changeStorageBtn = getTranslation('changeStorage', lang);
  const statsHeader = getTranslation('statsHeader', lang);
  const statPlugins = getTranslation('statPlugins', lang);
  const statSkills = getTranslation('statSkills', lang);
  const statRules = getTranslation('statRules', lang);
  const statWorkflows = getTranslation('statWorkflows', lang);
  
  const tabPlugins = getTranslation('tabPlugins', lang);
  const tabSkills = getTranslation('tabSkills', lang);
  const tabWorkflows = getTranslation('tabWorkflows', lang);

  const noPlugins = getTranslation('noPlugins', lang);
  const noSkills = getTranslation('noSkills', lang);
  const noWorkflows = getTranslation('noWorkflows', lang);

  const captionPlugins = getTranslation('captionPlugins', lang);
  const captionSkills = getTranslation('captionSkills', lang);
  const captionWorkflows = getTranslation('captionWorkflows', lang);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-gradient: linear-gradient(135deg, #6366f1, #a855f7);
      --success-gradient: linear-gradient(135deg, #10b981, #059669);
      --danger-gradient: linear-gradient(135deg, #ef4444, #dc2626);
      --bg-glass: rgba(255, 255, 255, 0.03);
      --border-glass: rgba(255, 255, 255, 0.06);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    body {
      font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--vscode-editor-background, #1e1e2e);
      color: var(--text-main);
      margin: 0;
      padding: 16px;
      overflow-x: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    header {
      padding-bottom: 8px;
    }

    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px 0;
      background: var(--primary-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0;
      line-height: 1.4;
    }

    .glass-card {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-glass);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .glass-card:hover {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
    }

    .storage-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .storage-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .storage-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .storage-path {
      flex: 1;
      font-family: monospace;
      font-size: 11px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.04);
      padding: 6px 10px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: nowrap;
      color: #cbd5e1;
    }

    .btn {
      font-family: 'Outfit', sans-serif;
      font-size: 11px;
      font-weight: 500;
      background: var(--primary-gradient);
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .grid-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .stat-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
      text-align: center;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .stat-label {
      font-size: 10px;
      color: var(--text-muted);
    }

    .stat-blue .stat-value { color: #60a5fa; }
    .stat-purple .stat-value { color: #c084fc; }
    .stat-emerald .stat-value { color: #34d399; }
    .stat-amber .stat-value { color: #fbbf24; }

    /* Tabs Styling */
    .tabs-row {
      display: flex;
      gap: 4px;
      background: rgba(0, 0, 0, 0.15);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border-glass);
      margin-top: 8px;
    }

    .tab-btn {
      flex: 1;
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tab-btn.active {
      background: var(--primary-gradient);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(99, 102, 241, 0.2);
    }

    .tab-btn:hover:not(.active) {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }

    .list-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }

    .list-title {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .search-box {
      width: 100%;
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border-glass);
      color: var(--text-main);
      font-family: inherit;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 8px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-box:focus {
      border-color: rgba(99, 102, 241, 0.5);
    }

    /* Plugin List Grid (Adapts automatically to columns depending on available width) */
    .plugin-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
      margin-top: 4px;
    }

    .plugin-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .plugin-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .plugin-meta {
      flex: 1;
      min-width: 0;
    }

    .plugin-name {
      font-size: 13px;
      font-weight: 600;
      color: #f8fafc;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .plugin-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.35;
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .plugin-details {
      display: flex;
      gap: 8px;
      font-size: 10px;
      color: var(--text-muted);
    }

    .card-right-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .card-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .card-action-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
    }

    .card-action-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      color: var(--text-main);
      transform: scale(1.08);
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 20px;
      flex-shrink: 0;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-glass);
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 20px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background-color: #cbd5e1;
      transition: .25s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 50%;
    }

    input:checked + .slider {
      background: var(--success-gradient);
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
    }

    input:checked + .slider:before {
      transform: translateX(18px);
      background-color: #ffffff;
    }

    /* Resource tags (Enlarged to 11px to match description font size) */
    .resource-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .res-tag {
      font-size: 11px;
      padding: 3px 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 4px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .res-tag.active {
      color: #f1f5f9;
      background: rgba(99, 102, 241, 0.08);
      border-color: rgba(99, 102, 241, 0.15);
    }

    .res-indicator {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background-color: #94a3b8;
    }

    .res-tag.active .res-indicator {
      background-color: #818cf8;
    }

    .res-tag.active.res-mcp .res-indicator { background-color: #fb7185; }
    .res-tag.active.res-hooks .res-indicator { background-color: #f472b6; }

    .no-data {
      text-align: center;
      color: var(--text-muted);
      font-size: 11px;
      padding: 24px 0;
    }

    .explorer-buttons {
      display: flex;
      gap: 8px;
    }

    /* Small spinner for local card load feedback */
    .spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Plugin detail view styling */
    .detail-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: -16px -16px 16px -16px;
      padding: 12px 16px;
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background, #1e1e2e);
      z-index: 100;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .detail-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 11px;
    }

    .metadata-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .metadata-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding-bottom: 10px;
    }

    .metadata-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .metadata-label {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
      min-width: 120px;
    }

    .metadata-value-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      justify-content: flex-end;
      min-width: 0;
    }

    .metadata-value {
      font-size: 12px;
      color: var(--text-main);
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .edit-icon-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .edit-icon-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.08);
    }

    .resource-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }

    .resource-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      border-left: 2px solid #a855f7;
      padding-left: 6px;
    }

    .resource-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .resource-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      transition: all 0.2s;
    }

    .resource-item:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .resource-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }

    .resource-name {
      font-size: 12px;
      font-weight: 500;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-desc {
      font-size: 10px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .plugin-name.clickable {
      cursor: pointer;
      transition: color 0.2s;
    }

    .plugin-name.clickable:hover {
      text-decoration: underline;
      color: #a855f7;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Main view wrapper -->
    <div id="main-view">
      <header>
        <h1>${title}</h1>
        <p class="subtitle">${subtitle}</p>
      </header>

      <div class="glass-card storage-section">
        <div class="storage-title">${storagePathLabel}</div>
        <div class="storage-row">
          <div class="storage-path" id="storage-path-display">...</div>
          <button class="btn" id="btn-select-storage">${changeStorageBtn}</button>
        </div>
        <div class="explorer-buttons">
          <button class="btn btn-secondary" style="flex: 1;" id="btn-open-active">${lang === 'ru' ? 'Открыть папку Plugins' : 'Open Active Folder'}</button>
          <button class="btn btn-secondary" style="flex: 1;" id="btn-open-storage">${lang === 'ru' ? 'Открыть Хранилище' : 'Open Storage Folder'}</button>
        </div>
      </div>

      <!-- Restored 2x2 Grid Statistics -->
      <div class="glass-card grid-stats">
        <div class="stat-box stat-blue">
          <span class="stat-value" id="val-plugins">0</span>
          <span class="stat-label">${statPlugins}</span>
        </div>
        <div class="stat-box stat-purple">
          <span class="stat-value" id="val-skills">0</span>
          <span class="stat-label">${statSkills}</span>
        </div>
        <div class="stat-box stat-emerald">
          <span class="stat-value" id="val-rules">0</span>
          <span class="stat-label">${statRules}</span>
        </div>
        <div class="stat-box stat-amber">
          <span class="stat-value" id="val-workflows">0</span>
          <span class="stat-label">${statWorkflows}</span>
        </div>
      </div>

      <!-- Tab Selection Row -->
      <div class="tabs-row">
        <button class="tab-btn active" id="tab-btn-plugins" onclick="switchTab('plugins')">${tabPlugins}</button>
        <button class="tab-btn" id="tab-btn-skills" onclick="switchTab('skills')">${tabSkills}</button>
        <button class="tab-btn" id="tab-btn-workflows" onclick="switchTab('workflows')">${tabWorkflows}</button>
      </div>

      <div class="list-subtitle-info" id="list-subtitle-info" style="font-size: 11px; color: var(--text-muted); font-style: italic; margin: 6px 0 10px 2px;">
        ${captionPlugins}
      </div>

      <div class="list-section-header">
        <div class="list-title" id="list-section-title">${tabPlugins}</div>
        <button class="btn btn-secondary" style="padding: 4px 8px;" id="btn-refresh">${lang === 'ru' ? 'Обновить' : 'Refresh'}</button>
      </div>

      <input type="text" class="search-box" id="search-input" placeholder="${lang === 'ru' ? 'Поиск...' : 'Search...'}">

      <div class="plugin-list" id="plugin-list-container">
        <div class="no-data">${noPlugins}</div>
      </div>
    </div>

    <!-- Plugin Detail view wrapper -->
    <div id="detail-view" style="display: none;">
      <div class="detail-header">
        <button class="btn btn-secondary back-btn" onclick="closePluginDetails()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>${getTranslation('back', lang)}</span>
        </button>
        <h2>${getTranslation('pluginDetails', lang)}: <span id="detail-plugin-title-name">...</span></h2>
      </div>

      <div class="glass-card metadata-card">
        <div class="metadata-row">
          <div class="metadata-label">${getTranslation('metadataDisplayName', lang)}</div>
          <div class="metadata-value-group">
            <span class="metadata-value" id="meta-display-name">...</span>
            <button class="edit-icon-btn" onclick="editMetadata('displayName')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="metadata-row">
          <div class="metadata-label">${getTranslation('metadataName', lang)}</div>
          <div class="metadata-value-group">
            <span class="metadata-value" id="meta-name">...</span>
            <button class="edit-icon-btn" onclick="editMetadata('name')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="metadata-row">
          <div class="metadata-label">${getTranslation('metadataDescription', lang)}</div>
          <div class="metadata-value-group">
            <span class="metadata-value" id="meta-description">...</span>
            <button class="edit-icon-btn" onclick="editMetadata('description')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="metadata-row">
          <div class="metadata-label">${getTranslation('metadataVersion', lang)}</div>
          <div class="metadata-value-group">
            <span class="metadata-value" id="meta-version">...</span>
            <button class="edit-icon-btn" onclick="editMetadata('version')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="metadata-row">
          <div class="metadata-label">${getTranslation('metadataAuthor', lang)}</div>
          <div class="metadata-value-group">
            <span class="metadata-value" id="meta-author">...</span>
            <button class="edit-icon-btn" onclick="editMetadata('author')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="resource-section" id="detail-skills-section">
        <div class="resource-section-title">${getTranslation('tabSkills', lang)}</div>
        <div class="resource-list" id="detail-skills-list"></div>
      </div>
      <div class="resource-section" id="detail-rules-section">
        <div class="resource-section-title">${getTranslation('rulesCount', lang)}</div>
        <div class="resource-list" id="detail-rules-list"></div>
      </div>
      <div class="resource-section" id="detail-hooks-section">
        <div class="resource-section-title">${getTranslation('hooks', lang)}</div>
        <div class="resource-list" id="detail-hooks-list"></div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    // Lists data
    let pluginsData = [];
    let skillsData = [];
    let workflowsData = [];
    
    let currentTab = 'plugins';
    let activePluginId = null;

    // DOM Elements
    const storagePathDisplay = document.getElementById('storage-path-display');
    const valPlugins = document.getElementById('val-plugins');
    const valSkills = document.getElementById('val-skills');
    const valRules = document.getElementById('val-rules');
    const valWorkflows = document.getElementById('val-workflows');
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

          pluginsData = message.plugins || [];
          skillsData = message.skills || [];
          workflowsData = message.workflows || [];
          
          renderCurrentTab();
          break;
        case 'error':
          // Re-enable checkboxes and hide loader on error
          document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = false);
          document.querySelectorAll('[id^="loader-"]').forEach(el => el.style.display = 'none');
          document.querySelectorAll('[id^="switch-container-"]').forEach(el => el.style.display = 'block');
          break;
      }
    });

    // Event Listeners
    document.getElementById('btn-select-storage').addEventListener('click', () => {
      vscode.postMessage({ command: 'selectStorage' });
    });

    document.getElementById('btn-open-active').addEventListener('click', () => {
      vscode.postMessage({ command: 'openActive' });
    });

    document.getElementById('btn-open-storage').addEventListener('click', () => {
      vscode.postMessage({ command: 'openStorage' });
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    searchInput.addEventListener('input', () => {
      renderCurrentTab();
    });

    // Switch Tabs
    window.switchTab = function(tabName) {
      currentTab = tabName;
      activePluginId = null; // Switching tabs exits plugin detail view
      
      // Update Tab button CSS classes
      document.getElementById('tab-btn-plugins').classList.toggle('active', tabName === 'plugins');
      document.getElementById('tab-btn-skills').classList.toggle('active', tabName === 'skills');
      document.getElementById('tab-btn-workflows').classList.toggle('active', tabName === 'workflows');
      
      const subtitleInfo = document.getElementById('list-subtitle-info');
      // Update heading text and subtitle info description
      if (tabName === 'plugins') {
        listSectionTitle.textContent = '${tabPlugins}';
        subtitleInfo.textContent = "${escapeJsString(captionPlugins)}";
      } else if (tabName === 'skills') {
        listSectionTitle.textContent = '${tabSkills}';
        subtitleInfo.textContent = "${escapeJsString(captionSkills)}";
      } else if (tabName === 'workflows') {
        listSectionTitle.textContent = '${tabWorkflows}';
        subtitleInfo.textContent = "${escapeJsString(captionWorkflows)}";
      }
      
      searchInput.value = '';
      renderCurrentTab();
    };

    window.toggleItem = function(category, itemId, enable) {
      // Lock checkboxes during transition
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.disabled = true);
      
      const switchEl = document.getElementById('switch-container-' + itemId);
      const loaderEl = document.getElementById('loader-' + itemId);
      if (switchEl && loaderEl) {
        switchEl.style.display = 'none';
        loaderEl.style.display = 'block';
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

    window.openFileInEditor = function(category, physicalPath) {
      vscode.postMessage({
        command: 'openFileInEditor',
        category: category,
        physicalPath: physicalPath
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

    window.openPluginDetails = function(pluginId) {
      activePluginId = pluginId;
      renderCurrentTab();
    };

    window.closePluginDetails = function() {
      activePluginId = null;
      renderCurrentTab();
    };

    function escapeQuotes(str) {
      if (!str) return '';
      return str.replace(/\\\\/g, '\\\\\\\\')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(new RegExp(String.fromCharCode(96), 'g'), '\\\\' + String.fromCharCode(96));
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
    }

    function renderPluginDetailsView() {
      const plugin = pluginsData.find(p => p.id === activePluginId);
      if (!plugin) {
        closePluginDetails();
        return;
      }

      document.getElementById('main-view').style.display = 'none';
      document.getElementById('detail-view').style.display = 'block';

      document.getElementById('detail-plugin-title-name').textContent = plugin.displayName || plugin.name || plugin.id;

      document.getElementById('meta-name').textContent = plugin.name || plugin.id || '';
      document.getElementById('meta-display-name').textContent = plugin.displayName || '';
      document.getElementById('meta-description').textContent = plugin.description || '${lang === 'ru' ? 'Описание отсутствует.' : 'No description.'}';
      document.getElementById('meta-version').textContent = plugin.version || '1.0.0';
      document.getElementById('meta-author').textContent = plugin.author || '';

      // Render Skills
      const hasSkills = plugin.skills && plugin.skills.length > 0;
      document.getElementById('detail-skills-section').style.display = hasSkills ? 'block' : 'none';
      const skillsContainer = document.getElementById('detail-skills-list');
      if (plugin.skills && plugin.skills.length > 0) {
        skillsContainer.innerHTML = plugin.skills.map(s => \`
          <div class="resource-item">
            <div class="resource-info">
              <div class="resource-name" title="\${escapeHtml(s.displayName)}">\${escapeHtml(s.displayName)}</div>
              <div class="resource-desc" title="\${escapeHtml(s.description)}">\${escapeHtml(s.description)}</div>
            </div>
            <div class="resource-actions">
              <button class="card-action-btn" title="${getTranslation('openInEditor', lang)}" onclick="openFileInEditor('skill', '\${escapeQuotes(s.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </button>
              <button class="card-action-btn" title="${getTranslation('move', lang)}" onclick="moveItem('\${s.id}', 'skill', '\${plugin.id}', \${plugin.isEnabled})">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        \`).join('');
      } else {
        skillsContainer.innerHTML = '<div class="no-data">${noSkills}</div>';
      }

      // Render Rules
      const hasRules = plugin.rules && plugin.rules.length > 0;
      document.getElementById('detail-rules-section').style.display = hasRules ? 'block' : 'none';
      const rulesContainer = document.getElementById('detail-rules-list');
      if (plugin.rules && plugin.rules.length > 0) {
        rulesContainer.innerHTML = plugin.rules.map(r => \`
          <div class="resource-item">
            <div class="resource-info">
              <div class="resource-name" title="\${escapeHtml(r.displayName)}">\${escapeHtml(r.displayName)}</div>
            </div>
            <div class="resource-actions">
              <button class="card-action-btn" title="${getTranslation('openInEditor', lang)}" onclick="openFileInEditor('rule', '\${escapeQuotes(r.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </button>
              <button class="card-action-btn" title="${getTranslation('move', lang)}" onclick="moveItem('\${r.id}', 'rule', '\${plugin.id}', \${plugin.isEnabled})">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="17 8 21 12 17 16"></polyline>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        \`).join('');
      } else {
        rulesContainer.innerHTML = '<div class="no-data">${lang === 'ru' ? 'Правила не найдены.' : 'No rules found.'}</div>';
      }

      // Render Hooks
      const hasHooks = plugin.hooks && plugin.hooks.length > 0;
      document.getElementById('detail-hooks-section').style.display = hasHooks ? 'block' : 'none';
      const hooksContainer = document.getElementById('detail-hooks-list');
      if (plugin.hooks && plugin.hooks.length > 0) {
        hooksContainer.innerHTML = plugin.hooks.map(h => \`
          <div class="resource-item">
            <div class="resource-info">
              <div class="resource-name" title="\${escapeHtml(h.displayName)}">\${escapeHtml(h.displayName)}</div>
              <div class="resource-desc">\${h.type === 'file' ? '${lang === 'ru' ? 'Файл' : 'File'}' : 'JSON'}</div>
            </div>
            <div class="resource-actions">
              <button class="card-action-btn" title="${getTranslation('openInEditor', lang)}" onclick="openFileInEditor('hook', '\${escapeQuotes(h.physicalPath)}')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
        \`).join('');
      } else {
        hooksContainer.innerHTML = '<div class="no-data">${getTranslation('noHooks', lang)}</div>';
      }
    }

    function renderCurrentTab() {
      if (activePluginId) {
        renderPluginDetailsView();
        return;
      }

      document.getElementById('main-view').style.display = 'block';
      document.getElementById('detail-view').style.display = 'none';

      const query = searchInput.value.toLowerCase().trim();
      
      if (currentTab === 'plugins') {
        const filtered = pluginsData.filter(p => 
          p.displayName.toLowerCase().includes(query) || 
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noPlugins}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(p => {
          const hasSkills = p.skillsCount > 0;
          const hasRules = p.rulesCount > 0;
          const hasWorkflows = p.workflowsCount > 0;
          const hasHooks = p.hooksCount > 0;
          
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name clickable" title="\${escapeHtml(p.displayName)}" onclick="openPluginDetails('\${p.id}')">\${escapeHtml(p.displayName)}</div>
                  
                  <div class="plugin-desc" id="desc-\${p.id}" title="\${escapeHtml(p.description)}">
                    \${escapeHtml(p.description) || '${lang === 'ru' ? 'Описание отсутствует.' : 'No description.'}'}
                  </div>

                  <div class="plugin-details">
                    <span>v\${p.version}</span>
                    \${p.author ? \`<span>•</span> <span>\${escapeHtml(p.author)}</span>\` : ''}
                  </div>
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку' : 'Open folder'}" onclick="openItemFolder('plugin', '\${p.id}', \${p.isEnabled}, false, '\${escapeQuotes(p.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  </div>
                  <div id="switch-container-\${p.id}">
                    <label class="switch">
                      <input type="checkbox" \${p.isEnabled ? 'checked' : ''} onchange="toggleItem('plugin', '\${p.id}', this.checked)">
                      <span class="slider"></span>
                    </label>
                  </div>
                  <div id="loader-\${p.id}" style="display: none; padding-right: 6px;">
                    <div class="spinner-small"></div>
                  </div>
                </div>
              </div>
              
              <div class="resource-tags">
                <div class="res-tag \${hasSkills ? 'active' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.skillsCount} \${p.skillsCount === 1 ? '${lang === 'ru' ? 'навык' : 'skill'}' : (p.skillsCount >= 2 && p.skillsCount <= 4 ? '${lang === 'ru' ? 'навыка' : 'skills'}' : '${lang === 'ru' ? 'навыков' : 'skills'}')}</span>
                </div>
                <div class="res-tag \${hasRules ? 'active' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.rulesCount} \${p.rulesCount === 1 ? '${lang === 'ru' ? 'правило' : 'rule'}' : (p.rulesCount >= 2 && p.rulesCount <= 4 ? '${lang === 'ru' ? 'правила' : 'rules'}' : '${lang === 'ru' ? 'правил' : 'rules'}')}</span>
                </div>
                <div class="res-tag \${hasHooks ? 'active res-hooks' : ''}">
                  <span class="res-indicator"></span>
                  <span>\${p.hooksCount} \${p.hooksCount === 1 ? '${lang === 'ru' ? 'хук' : 'hook'}' : (p.hooksCount >= 2 && p.hooksCount <= 4 ? '${lang === 'ru' ? 'хука' : 'hooks'}' : '${lang === 'ru' ? 'хуков' : 'hooks'}')}</span>
                </div>
                \${p.hasMcp ? \`
                  <div class="res-tag active res-mcp">
                    <span class="res-indicator"></span>
                    <span>MCP</span>
                  </div>
                \` : ''}
              </div>
            </div>
          \`;
        }).join('');
        
      } else if (currentTab === 'skills') {
        const filtered = skillsData.filter(s => 
          s.displayName.toLowerCase().includes(query) || 
          s.name.toLowerCase().includes(query) ||
          (s.description && s.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noSkills}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(s => {
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name" title="\${escapeHtml(s.displayName)}">\${escapeHtml(s.displayName)}</div>
                  <div class="plugin-desc" title="\${escapeHtml(s.description)}">\${escapeHtml(s.description)}</div>
                  \${s.isLocal ? \`
                    <div class="resource-tags" style="margin-top: 4px;">
                      <div class="res-tag active res-mcp" style="font-size: 11px;">
                        <span class="res-indicator"></span>
                        <span>${lang === 'ru' ? 'Локальный' : 'Local'} • \${escapeHtml(s.workspaceName)}</span>
                      </div>
                    </div>
                  \` : ''}
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${getTranslation('openInEditor', lang)}" onclick="openFileInEditor('skill', '\${escapeQuotes(s.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку' : 'Open folder'}" onclick="openItemFolder('skill', '\${s.id}', \${s.isEnabled}, \${s.isLocal ? 'true' : 'false'}, '\${escapeQuotes(s.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                    <button class="card-action-btn" title="${getTranslation('move', lang)}" onclick="moveItem('\${s.id}', 'skill', null, \${s.isEnabled}, \${s.isLocal ? 'true' : 'false'}, '\${escapeQuotes(s.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 8 21 12 17 16"></polyline>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                      </svg>
                    </button>
                  </div>
                  \${s.isLocal ? '' : \`
                    <div id="switch-container-\${s.id}">
                      <label class="switch">
                        <input type="checkbox" \${s.isEnabled ? 'checked' : ''} onchange="toggleItem('skill', '\${s.id}', this.checked)">
                        <span class="slider"></span>
                      </label>
                    </div>
                    <div id="loader-\${s.id}" style="display: none; padding-right: 6px;">
                      <div class="spinner-small"></div>
                    </div>
                  \`}
                </div>
              </div>
            </div>
          \`;
        }).join('');
        
      } else if (currentTab === 'workflows') {
        const filtered = workflowsData.filter(w => 
          w.displayName.toLowerCase().includes(query) || 
          w.name.toLowerCase().includes(query) ||
          (w.description && w.description.toLowerCase().includes(query))
        );

        if (filtered.length === 0) {
          pluginListContainer.innerHTML = '<div class="no-data">${noWorkflows}</div>';
          return;
        }

        pluginListContainer.innerHTML = filtered.map(w => {
          return \`
            <div class="glass-card plugin-card">
              <div class="plugin-top">
                <div class="plugin-meta">
                  <div class="plugin-name" title="\${escapeHtml(w.displayName)}">\${escapeHtml(w.displayName)}</div>
                  <div class="plugin-desc" title="\${escapeHtml(w.description)}">\${escapeHtml(w.description)}</div>
                  \${w.isLocal ? \`
                    <div class="resource-tags" style="margin-top: 4px;">
                      <div class="res-tag active res-mcp" style="font-size: 11px;">
                        <span class="res-indicator"></span>
                        <span>${lang === 'ru' ? 'Локальный' : 'Local'} • \${escapeHtml(w.workspaceName)}</span>
                      </div>
                    </div>
                  \` : ''}
                </div>
                
                <div class="card-right-group">
                  <div class="card-actions">
                    <button class="card-action-btn" title="${getTranslation('openInEditor', lang)}" onclick="openFileInEditor('workflow', '\${escapeQuotes(w.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </button>
                    <button class="card-action-btn" title="${lang === 'ru' ? 'Открыть папку воркфлоу' : 'Open workflow folder'}" onclick="openItemFolder('workflow', '\${w.id}', \${w.isEnabled}, \${w.isLocal ? 'true' : 'false'}, '\${escapeQuotes(w.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                    <button class="card-action-btn" title="${getTranslation('move', lang)}" onclick="moveItem('\${w.id}', 'workflow', null, \${w.isEnabled}, \${w.isLocal ? 'true' : 'false'}, '\${escapeQuotes(w.physicalPath)}')">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 8 21 12 17 16"></polyline>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                      </svg>
                    </button>
                  </div>
                  \${w.isLocal ? '' : \`
                    <div id="switch-container-\${w.id}">
                      <label class="switch">
                        <input type="checkbox" \${w.isEnabled ? 'checked' : ''} onchange="toggleItem('workflow', '\${w.id}', this.checked)">
                        <span class="slider"></span>
                      </label>
                    </div>
                    <div id="loader-\${w.id}" style="display: none; padding-right: 6px;">
                      <div class="spinner-small"></div>
                    </div>
                  \`}
                </div>
              </div>
            </div>
          \`;
        }).join('');
      }

    }
  </script>
</body>
</html>`;
}

module.exports = {
  activate,
  deactivate
};
