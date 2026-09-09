const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Helper to log errors or debug info
function logDebug(message) {
  try {
    const logDir = path.join(os.homedir(), '.gemini', 'antigravity-ide');
    const logPath = path.join(logDir, 'plugin_manager_debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch (e) {}
}

// Helper to escape JS string quotes/newlines
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

// System Paths
function getActivePluginsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins');
}

function getActiveSkillsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'skills');
}

function getActiveWorkflowsPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'global_workflows');
}

function getDefaultStoragePath() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins_storage');
}

function getGlobalStoragePath(context) {
  let configPath = vscode.workspace.getConfiguration('antigravity-plugin-manager').get('storagePath');
  if (configPath) {
    return path.resolve(configPath);
  }
  if (context && context.globalState) {
    let statePath = context.globalState.get('storagePath');
    if (statePath) {
      return path.resolve(statePath);
    }
  }
  return getDefaultStoragePath();
}

function getStorageSubpath(storagePath, category) {
  return path.join(storagePath, category);
}

function getBuiltinPath() {
  return path.join(os.homedir(), '.gemini', 'antigravity-ide', 'builtin');
}

function getAntigravityIdePath() {
  return path.join(os.homedir(), '.gemini', 'antigravity-ide');
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

function linkDirRecursively(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      linkDirRecursively(srcPath, destPath);
    } else if (entry.isFile()) {
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch (e) {}
      }
      try {
        fs.linkSync(srcPath, destPath);
      } catch (err) {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (copyErr) {
          logDebug(`Error copying file recursively: ${copyErr.message}`);
        }
      }
    }
  }
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(dir, entry.name);
        removeEmptyDirs(subPath);
        try {
          if (fs.readdirSync(subPath).length === 0) {
            fs.rmdirSync(subPath);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

function syncBackDir(activeDir, storageDir) {
  if (!fs.existsSync(activeDir)) return;
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  let linkedFiles = [];
  const linkedJsonPath = path.join(activeDir, '.linked_files.json');
  if (fs.existsSync(linkedJsonPath)) {
    try {
      linkedFiles = JSON.parse(fs.readFileSync(linkedJsonPath, 'utf8'));
    } catch (e) {
      logDebug(`Error reading .linked_files.json: ${e.message}`);
    }
  }
  const linkedSet = new Set(linkedFiles);

  const activeFiles = getDirFilesRelative(activeDir).filter(f => f.relPath !== '.linked_files.json');
  const storageFiles = getDirFilesRelative(storageDir);

  const activeMap = new Map(activeFiles.map(f => [f.relPath, f]));
  const storageMap = new Map(storageFiles.map(f => [f.relPath, f]));

  // 1. Handle Deletions
  for (const relPath of linkedSet) {
    const inActive = activeMap.has(relPath);
    const inStorage = storageMap.has(relPath);

    if (inActive && !inStorage) {
      const fActive = activeMap.get(relPath);
      if (!fActive.isDirectory) {
        try {
          fs.unlinkSync(fActive.fullPath);
          logDebug(`SyncBack: Deleted ${relPath} from active because it was deleted in storage.`);
        } catch (e) {}
        activeMap.delete(relPath);
      }
    } else if (!inActive && inStorage) {
      const fStorage = storageMap.get(relPath);
      if (!fStorage.isDirectory) {
        try {
          fs.unlinkSync(fStorage.fullPath);
          logDebug(`SyncBack: Deleted ${relPath} from storage because it was deleted in active.`);
        } catch (e) {}
        storageMap.delete(relPath);
      }
    }
  }

  // 2. Handle Creations
  for (const [relPath, fActive] of activeMap.entries()) {
    if (fActive.isDirectory) continue;
    if (!linkedSet.has(relPath) && !storageMap.has(relPath)) {
      const destPath = path.join(storageDir, relPath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      try {
        fs.copyFileSync(fActive.fullPath, destPath);
        logDebug(`SyncBack: Saved new file ${relPath} from active to storage.`);
      } catch (e) {
        logDebug(`SyncBack: Failed to copy new file ${relPath} to storage: ${e.message}`);
      }
    }
  }

  // 3. Handle Modifications
  for (const [relPath, fActive] of activeMap.entries()) {
    if (fActive.isDirectory) continue;
    if (storageMap.has(relPath)) {
      const fStorage = storageMap.get(relPath);
      let isHardLinked = false;
      try {
        const statActive = fs.statSync(fActive.fullPath);
        const statStorage = fs.statSync(fStorage.fullPath);
        isHardLinked = (statActive.ino === statStorage.ino && statActive.dev === statStorage.dev);
      } catch (e) {}

      if (!isHardLinked) {
        try {
          const statActive = fs.statSync(fActive.fullPath);
          const statStorage = fs.statSync(fStorage.fullPath);
          if (statActive.mtimeMs > statStorage.mtimeMs) {
            fs.unlinkSync(fStorage.fullPath);
            fs.copyFileSync(fActive.fullPath, fStorage.fullPath);
            logDebug(`SyncBack: Overwrote out-of-sync storage file ${relPath} with active copy.`);
          }
        } catch (e) {
          logDebug(`SyncBack: Failed to sync file ${relPath}: ${e.message}`);
        }
      }
    }
  }

  removeEmptyDirs(storageDir);
}

function createLink(target, link, isDirectory, category) {
  const isWin = os.platform() === 'win32';
  if (isDirectory) {
    if (category === 'skill') {
      linkDirRecursively(target, link);
      try {
        const files = getDirFilesRelative(link)
          .filter(f => !f.isDirectory && f.relPath !== '.linked_files.json')
          .map(f => f.relPath);
        fs.writeFileSync(path.join(link, '.linked_files.json'), JSON.stringify(files, null, 2), 'utf8');
      } catch (e) {
        logDebug(`Error writing .linked_files.json: ${e.message}`);
      }
    } else {
      if (isWin) {
        fs.symlinkSync(target, link, 'junction');
      } else {
        fs.symlinkSync(target, link, 'dir');
      }
    }
  } else {
    try {
      fs.linkSync(target, link);
    } catch (err) {
      if (isWin) {
        try {
          fs.symlinkSync(target, link, 'file');
        } catch (symErr) {
          throw new Error('CROSS_DRIVE_FILE_LINK_FAILED');
        }
      } else {
        try {
          fs.symlinkSync(target, link, 'file');
        } catch (symErr) {
          throw new Error('CROSS_DRIVE_FILE_LINK_FAILED');
        }
      }
    }
  }
}

function areFilesIdentical(file1, file2) {
  try {
    if (!fs.existsSync(file1) || !fs.existsSync(file2)) return false;
    const stat1 = fs.statSync(file1);
    const stat2 = fs.statSync(file2);
    if (stat1.size !== stat2.size) return false;
    const buf1 = fs.readFileSync(file1);
    const buf2 = fs.readFileSync(file2);
    return buf1.equals(buf2);
  } catch (e) {
    return false;
  }
}

function getDirFilesRelative(dir, baseDir = dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      files.push({ relPath, isDirectory: true });
      files = files.concat(getDirFilesRelative(fullPath, baseDir));
    } else {
      files.push({ relPath, isDirectory: false, fullPath });
    }
  }
  return files;
}

function areDirsIdentical(dir1, dir2) {
  try {
    if (!fs.existsSync(dir1) || !fs.existsSync(dir2)) return false;
    const files1 = getDirFilesRelative(dir1).sort((a, b) => a.relPath.localeCompare(b.relPath));
    const files2 = getDirFilesRelative(dir2).sort((a, b) => a.relPath.localeCompare(b.relPath));
    if (files1.length !== files2.length) return false;
    for (let i = 0; i < files1.length; i++) {
      if (files1[i].relPath !== files2[i].relPath) return false;
      if (files1[i].isDirectory !== files2[i].isDirectory) return false;
      if (!files1[i].isDirectory) {
        const path2 = path.join(dir2, files2[i].relPath);
        if (!areFilesIdentical(files1[i].fullPath, path2)) return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

function twoWayMergeDirs(dir1, dir2) {
  if (!fs.existsSync(dir1) || !fs.existsSync(dir2)) return;
  try {
    const files1 = getDirFilesRelative(dir1);
    const files2 = getDirFilesRelative(dir2);
    const map1 = new Map(files1.map(f => [f.relPath, f]));
    const map2 = new Map(files2.map(f => [f.relPath, f]));
    
    for (const [relPath, f1] of map1.entries()) {
      if (f1.isDirectory) continue;
      const f2 = map2.get(relPath);
      if (!f2) {
        const destPath = path.join(dir2, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(f1.fullPath, destPath);
      } else {
        try {
          const stat1 = fs.statSync(f1.fullPath);
          const stat2 = fs.statSync(f2.fullPath);
          if (stat1.mtimeMs > stat2.mtimeMs) {
            fs.copyFileSync(f1.fullPath, f2.fullPath);
          }
        } catch (e) {}
      }
    }
    
    for (const [relPath, f2] of map2.entries()) {
      if (f2.isDirectory) continue;
      if (!map1.has(relPath)) {
        const destPath = path.join(dir1, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(f2.fullPath, destPath);
      }
    }
  } catch (e) {
    logDebug(`twoWayMergeDirs error: ${e.message}`);
  }
}

function mergeDirs(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeDirs(srcPath, destPath);
    } else {
      if (fs.existsSync(destPath)) {
        const srcStat = fs.statSync(srcPath);
        const destStat = fs.statSync(destPath);
        if (srcStat.mtimeMs > destStat.mtimeMs) {
          try {
            fs.unlinkSync(destPath);
            fs.copyFileSync(srcPath, destPath);
          } catch (e) {
            logDebug(`Merge copy file error: ${e.message}`);
          }
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

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
      } else if (data.hooks && Array.isArray(data.hooks)) {
        count += data.hooks.length;
      } else if (typeof data === 'object') {
        count += Object.keys(data).length;
      }
    } catch (e) {}
  }
  return count;
}

function parseFrontmatter(content) {
  const result = {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match) {
    const yamlBlock = match[1];
    const lines = yamlBlock.split('\n');
    let currentKey = null;
    let isMultiLine = false;
    let multiLineVal = [];

    for (let rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line) continue;

      if (isMultiLine) {
        if (rawLine.startsWith('  ') || rawLine.startsWith('\t')) {
          multiLineVal.push(rawLine.trim());
          continue;
        } else {
          result[currentKey] = multiLineVal.join(' ');
          isMultiLine = false;
          currentKey = null;
          multiLineVal = [];
        }
      }

      const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let val = kvMatch[2].trim();

        if (val === '|' || val === '>') {
          currentKey = key;
          isMultiLine = true;
          multiLineVal = [];
        } else {
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          result[key] = val;
        }
      }
    }
    if (isMultiLine && currentKey) {
      result[currentKey] = multiLineVal.join(' ');
    }
  }
  return result;
}

function getSkillMdPath(skillDir) {
  const standard = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(standard)) return standard;
  const lowercase = path.join(skillDir, 'skill.md');
  if (fs.existsSync(lowercase)) return lowercase;
  return null;
}

function readPluginInfo(pluginDir) {
  const name = path.basename(pluginDir);
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  let info = {
    id: name,
    name: name,
    displayName: name,
    description: '',
    version: '1.0.0',
    author: ''
  };

  if (fs.existsSync(pluginJsonPath)) {
    try {
      const content = fs.readFileSync(pluginJsonPath, 'utf8');
      const data = JSON.parse(content);
      info.displayName = String(data.displayName || data.name || name);
      info.name = String(data.name || name);
      info.description = String(data.description || '');
      info.version = String(data.version || '1.0.0');
      info.author = (typeof data.author === 'object' && data.author !== null) 
        ? String(data.author.name || '') 
        : String(data.author || '');
    } catch (e) {
      logDebug(`Error parsing plugin.json for ${name}: ${e.message}`);
    }
  }

  // Scan skills in plugin
  const skills = [];
  const skillsPath = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsPath)) {
    try {
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sPath = path.join(skillsPath, entry.name);
          if (getSkillMdPath(sPath)) {
            const sInfo = readSkillInfo(sPath);
            sInfo.id = entry.name;
            sInfo.physicalPath = sPath;
            skills.push(sInfo);
          }
        }
      }
    } catch (e) {
      logDebug(`Error scanning skills in plugin ${name}: ${e.message}`);
    }
  }
  skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  // Scan rules in plugin
  const rules = [];
  const rulesPath = path.join(pluginDir, 'rules');
  if (fs.existsSync(rulesPath)) {
    try {
      const entries = fs.readdirSync(rulesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const rPath = path.join(rulesPath, entry.name);
          let desc = '';
          try {
            const content = fs.readFileSync(rPath, 'utf8');
            const fm = parseFrontmatter(content);
            if (fm.description) {
              desc = fm.description;
            } else {
              const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('---'));
              if (lines.length > 0) desc = lines[0].slice(0, 150);
            }
          } catch (e) {}
          rules.push({
            id: entry.name,
            name: path.basename(entry.name, path.extname(entry.name)),
            displayName: path.basename(entry.name, path.extname(entry.name)),
            description: desc,
            physicalPath: rPath
          });
        }
      }
    } catch (e) {
      logDebug(`Error scanning rules in plugin ${name}: ${e.message}`);
    }
  }
  rules.sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Scan hooks in plugin
  const hooks = [];
  const hooksJsonPath = path.join(pluginDir, 'hooks.json');
  if (fs.existsSync(hooksJsonPath)) {
    try {
      const content = fs.readFileSync(hooksJsonPath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        data.forEach((h, idx) => {
          hooks.push({
            id: h.id || `hook-${idx}`,
            name: h.name || h.id || `Hook ${idx + 1}`,
            description: h.description || '',
            command: h.command || '',
            event: h.event || '',
            enabled: h.enabled !== false,
            physicalPath: hooksJsonPath
          });
        });
      } else if (data && data.hooks && Array.isArray(data.hooks)) {
        data.hooks.forEach((h, idx) => {
          hooks.push({
            id: h.id || `hook-${idx}`,
            name: h.name || h.id || `Hook ${idx + 1}`,
            description: h.description || '',
            command: h.command || '',
            event: h.event || '',
            enabled: h.enabled !== false,
            physicalPath: hooksJsonPath
          });
        });
      }
    } catch (e) {
      logDebug(`Error scanning hooks in plugin ${name}: ${e.message}`);
    }
  }

  // Scan MCP servers in plugin
  const mcpServers = [];
  const mcpConfigPath = path.join(pluginDir, 'mcp_config.json');
  if (fs.existsSync(mcpConfigPath)) {
    try {
      const content = fs.readFileSync(mcpConfigPath, 'utf8');
      const data = JSON.parse(content);
      const serversObj = data.mcpServers || data;
      if (serversObj && typeof serversObj === 'object') {
        for (const [sName, sCfg] of Object.entries(serversObj)) {
          if (sCfg && typeof sCfg === 'object') {
            mcpServers.push({
              name: sName,
              command: sCfg.command || '',
              args: sCfg.args || [],
              env: sCfg.env || {},
              description: sCfg.description || '',
              physicalPath: mcpConfigPath
            });
          }
        }
      }
    } catch (e) {
      logDebug(`Error scanning MCP servers in plugin ${name}: ${e.message}`);
    }
  }

  // Scan workflows in plugin
  const workflows = [];
  const workflowsPath = path.join(pluginDir, 'workflows');
  if (fs.existsSync(workflowsPath)) {
    try {
      const entries = fs.readdirSync(workflowsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const wPath = path.join(workflowsPath, entry.name);
          const wInfo = readWorkflowInfo(wPath);
          wInfo.id = entry.name;
          wInfo.physicalPath = wPath;
          workflows.push(wInfo);
        }
      }
    } catch (e) {
      logDebug(`Error scanning workflows in plugin ${name}: ${e.message}`);
    }
  }
  workflows.sort((a, b) => a.displayName.localeCompare(b.displayName));

  info.skills = skills;
  info.skillsCount = skills.length;
  info.rules = rules;
  info.rulesCount = rules.length;
  info.workflows = workflows;
  info.workflowsCount = workflows.length;
  info.hooks = hooks;
  info.hooksCount = hooks.length;
  info.mcpServers = mcpServers;
  info.mcpList = mcpServers;
  info.hasMcp = mcpServers.length > 0;

  return info;
}

function readSkillInfo(skillDir) {
  const name = path.basename(skillDir);
  let displayName = name;
  let description = '';
  let resolvedName = name;
  const skillMdPath = getSkillMdPath(skillDir);
  if (skillMdPath) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      const titleMatch = content.match(/^#{1,6}\s+(.+)$/m);
      if (titleMatch) displayName = titleMatch[1].trim();
      
      const fm = parseFrontmatter(content);
      if (fm.name) {
        resolvedName = fm.name.trim();
      }
      if (fm.description) {
        description = fm.description.replace(/\s+/g, ' ').trim();
      } else {
        const cleanContent = content.replace(/^#{1,6}\s+.+$/m, '').trim();
        const firstParagraph = cleanContent.split('\n\n')[0] || '';
        description = firstParagraph.replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      logDebug(`Error parsing SKILL.md for ${name}: ${e.message}`);
    }
  }
  return {
    id: name,
    name: resolvedName,
    displayName,
    description: description || 'No description provided.'
  };
}

function readWorkflowInfo(workflowPath) {
  const name = path.basename(workflowPath);
  let displayName = name;
  let description = '';
  let resolvedName = path.basename(workflowPath, path.extname(workflowPath));

  if (fs.existsSync(workflowPath)) {
    try {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const titleMatch = content.match(/^#{1,6}\s+(.+)$/m);
      if (titleMatch) displayName = titleMatch[1].trim();

      const fm = parseFrontmatter(content);
      if (fm.name) {
        resolvedName = fm.name.trim();
      }
      if (fm.description) {
        description = fm.description.replace(/\s+/g, ' ').trim();
      } else {
        const cleanContent = content.replace(/^#{1,6}\s+.+$/m, '').trim();
        const firstParagraph = cleanContent.split('\n\n')[0] || '';
        description = firstParagraph.replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      logDebug(`Error parsing workflow for ${name}: ${e.message}`);
    }
  }
  return {
    id: name,
    name: resolvedName,
    displayName,
    description: description || 'No description provided.'
  };
}

function writePluginMetaField(pluginDir, field, value) {
  const pluginJsonPath = path.join(pluginDir, 'plugin.json');
  let data = {};
  if (fs.existsSync(pluginJsonPath)) {
    try {
      data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    } catch (e) {}
  }
  data[field] = value;
  fs.writeFileSync(pluginJsonPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  logDebug,
  escapeJsString,
  getActiveLanguage,
  getActivePluginsPath,
  getActiveSkillsPath,
  getActiveWorkflowsPath,
  getDefaultStoragePath,
  getGlobalStoragePath,
  getStorageSubpath,
  getBuiltinPath,
  getAntigravityIdePath,
  safeMoveDir,
  moveDirRecursive,
  createLink,
  linkDirRecursively,
  syncBackDir,
  areFilesIdentical,
  areDirsIdentical,
  getDirFilesRelative,
  twoWayMergeDirs,
  mergeDirs,
  countItemsInDir,
  countHooks,
  parseFrontmatter,
  getSkillMdPath,
  readPluginInfo,
  readSkillInfo,
  readWorkflowInfo,
  writePluginMetaField
};
