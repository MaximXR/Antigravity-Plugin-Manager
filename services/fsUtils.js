let vscode;
try {
  vscode = require('vscode');
} catch (e) {
  vscode = require('./vscodeShim');
}
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
  if (!content || typeof content !== 'string') return result;

  // Strip leading comments and blank lines before the first frontmatter separator
  const cleanHead = content.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, '');
  const match = cleanHead.match(/^---\r?\n([\s\S]*?)\r?\n---/) || content.match(/(?:^|\r?\n)---\r?\n([\s\S]*?)\r?\n---/);

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
        if (/^\s+/.test(rawLine)) {
          multiLineVal.push(rawLine.trim());
          continue;
        } else {
          let assembled = multiLineVal.join(' ').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
          result[currentKey] = assembled;
          isMultiLine = false;
          currentKey = null;
          multiLineVal = [];
        }
      }

      const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let val = kvMatch[2].trim();

        if (!val || /^[|>][-+]?$/.test(val)) {
          currentKey = key;
          isMultiLine = true;
          multiLineVal = [];
        } else {
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          val = val.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
          result[key] = val;
        }
      }
    }
    if (isMultiLine && currentKey) {
      let assembled = multiLineVal.join(' ').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
      result[currentKey] = assembled;
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

// Antigravity customization folder discovery (.agents, .agent, _agents, _agent)
function getWorkspaceCustomizationDirs(wsRoot) {
  if (!wsRoot) return [];
  const candidates = ['.agents', '.agent', '_agents', '_agent'];
  const found = [];
  for (const c of candidates) {
    const fullP = path.join(wsRoot, c);
    try {
      if (fs.existsSync(fullP) && fs.statSync(fullP).isDirectory()) {
        found.push(fullP);
      }
    } catch (_) {}
  }
  return found;
}

// Recursive Markdown file collector (for rules with subdirectories)
function getMarkdownFilesRecursive(dirPath, baseDir = dirPath) {
  const mdFiles = [];
  if (!fs.existsSync(dirPath)) return mdFiles;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullP = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        mdFiles.push(...getMarkdownFilesRecursive(fullP, baseDir));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push({
          fullPath: fullP,
          name: entry.name,
          relPath: path.relative(baseDir, fullP)
        });
      }
    }
  } catch (e) {
    logDebug(`getMarkdownFilesRecursive error in ${dirPath}: ${e.message}`);
  }
  return mdFiles;
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
    author: '',
    disabled: false
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
      info.disabled = data.disabled === true;
      info.repository = data.repository || '';
      info.homepage = data.homepage || '';
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
  
  // Scan rules in plugin (recursive inside rules/ and check plugin-root rule files)
  const rules = [];
  const rulesPath = path.join(pluginDir, 'rules');
  if (fs.existsSync(rulesPath)) {
    try {
      const mdFiles = getMarkdownFilesRecursive(rulesPath);
      for (const item of mdFiles) {
        let desc = '';
        try {
          const content = fs.readFileSync(item.fullPath, 'utf8');
          const fm = parseFrontmatter(content);
          if (fm.description) {
            desc = fm.description;
          } else {
            const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('---'));
            if (lines.length > 0) desc = lines[0].slice(0, 150);
          }
        } catch (e) {}
        const relNorm = item.relPath.replace(/\\/g, '/');
        rules.push({
          id: relNorm,
          name: item.name,
          displayName: item.relPath !== item.name ? item.relPath : item.name,
          description: desc,
          physicalPath: item.fullPath
        });
      }
    } catch (e) {
      logDebug(`Error scanning rules in plugin ${name}: ${e.message}`);
    }
  }

  // Scan root rule files in plugin directory (strictly AGENTS.md and GEMINI.md per Antigravity spec)
  const pluginRootRuleCandidates = ['AGENTS.md', 'GEMINI.md'];
  for (const rFile of pluginRootRuleCandidates) {
    const rPath = path.join(pluginDir, rFile);
    if (fs.existsSync(rPath) && !rules.some(r => r.physicalPath.toLowerCase() === rPath.toLowerCase())) {
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
        id: rFile,
        name: rFile,
        displayName: rFile,
        description: desc,
        physicalPath: rPath
      });
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
      if (titleMatch) {
        displayName = titleMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim();
      }
      
      const fm = parseFrontmatter(content);
      if (fm.name) {
        resolvedName = fm.name.trim();
      }
      if (fm.description) {
        description = fm.description.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
      } else {
        const cleanContent = content
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/^(?:\s*<!--[\s\S]*?-->\s*)*---\r?\n[\s\S]*?\r?\n---/, '')
          .replace(/^#{1,6}\s+.+$/gm, '')
          .trim();
        const firstParagraph = cleanContent.split(/\r?\n\r?\n/)[0] || '';
        description = firstParagraph.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
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

// Antigravity Native Config & JSON Config Helpers
function getAntigravityConfigPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'config.json');
}

function getGlobalPluginsJsonPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'plugins.json');
}

function getGlobalSkillsJsonPath() {
  return path.join(os.homedir(), '.gemini', 'config', 'skills.json');
}

function getWorkspacePluginConfigPath(wsRoot) {
  if (!wsRoot) return '';
  const customDirs = getWorkspaceCustomizationDirs(wsRoot);
  for (const cDir of customDirs) {
    const pJson = path.join(cDir, 'plugins.json');
    if (fs.existsSync(pJson)) return pJson;
  }
  const rootJson = path.join(wsRoot, 'plugins.json');
  if (fs.existsSync(rootJson)) return rootJson;
  return path.join(wsRoot, '.agents', 'plugins.json');
}

function getWorkspaceSkillConfigPath(wsRoot) {
  if (!wsRoot) return '';
  const customDirs = getWorkspaceCustomizationDirs(wsRoot);
  for (const cDir of customDirs) {
    const sJson = path.join(cDir, 'skills.json');
    if (fs.existsSync(sJson)) return sJson;
  }
  const rootJson = path.join(wsRoot, 'skills.json');
  if (fs.existsSync(rootJson)) return rootJson;
  return path.join(wsRoot, '.agents', 'skills.json');
}

function getAntigravityConfig() {
  const cfgPath = getAntigravityConfigPath();
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      logDebug(`Error reading config.json: ${e.message}`);
    }
  }
  return {};
}

function saveAntigravityConfig(config) {
  const cfgPath = getAntigravityConfigPath();
  try {
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    logDebug(`Error saving config.json: ${e.message}`);
    throw e;
  }
}

function setAntigravityPluginEnabled(pluginDirName, enabled) {
  const config = getAntigravityConfig();
  if (!config.plugins) config.plugins = {};
  if (!config.plugins[pluginDirName]) config.plugins[pluginDirName] = {};
  config.plugins[pluginDirName].enabled = !!enabled;
  saveAntigravityConfig(config);
}

function removeAntigravityPluginFromConfig(pluginDirName) {
  const config = getAntigravityConfig();
  if (config.plugins && config.plugins[pluginDirName]) {
    delete config.plugins[pluginDirName];
    saveAntigravityConfig(config);
  }
}

function setPluginManifestDisabled(pluginDir, disabled) {
  const manifestPath = path.join(pluginDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) return;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const data = JSON.parse(raw);
    data.disabled = !!disabled;
    fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    logDebug(`Error updating plugin.json in ${pluginDir}: ${e.message}`);
  }
}

function isAntigravityPluginGloballyEnabled(pluginDirName, defaultDisabled = false) {
  const config = getAntigravityConfig();
  if (config.plugins && config.plugins[pluginDirName] && config.plugins[pluginDirName].enabled !== undefined) {
    return !!config.plugins[pluginDirName].enabled;
  }
  return !defaultDisabled;
}

function normalizePathSeparators(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/');
}

function resolveJsonConfigPath(rawPath, baseDir) {
  if (!rawPath) return '';
  let resolved = rawPath.trim();
  if (resolved === '~' || resolved.startsWith('~/') || resolved.startsWith('~\\')) {
    resolved = path.join(os.homedir(), resolved.slice(1));
  } else if (!path.isAbsolute(resolved) && baseDir) {
    resolved = path.resolve(baseDir, resolved);
  }
  return path.normalize(resolved);
}

function formatPathForConfig(fullPath, wsRoot = null) {
  const normFull = path.normalize(fullPath);
  if (wsRoot) {
    const normWs = path.normalize(wsRoot);
    const rel = path.relative(normWs, normFull);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return normalizePathSeparators(rel);
    }
  }
  const normHome = path.normalize(os.homedir());
  const relHome = path.relative(normHome, normFull);
  if (!relHome.startsWith('..') && !path.isAbsolute(relHome)) {
    return normalizePathSeparators('~/' + relHome);
  }
  return normalizePathSeparators(normFull);
}

function readJsonConfigFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { entries: [], inherits: [], exclude: [], include_only: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      inherits: Array.isArray(data.inherits) ? data.inherits : [],
      exclude: Array.isArray(data.exclude) ? data.exclude : [],
      include_only: Array.isArray(data.include_only) ? data.include_only : []
    };
  } catch (e) {
    logDebug(`Error reading JSON config ${filePath}: ${e.message}`);
    return { entries: [], inherits: [], exclude: [], include_only: [] };
  }
}

function writeJsonConfigFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    logDebug(`Error writing JSON config ${filePath}: ${e.message}`);
    throw e;
  }
}

function isPatternMatch(name, patterns) {
  if (!name || !patterns || !Array.isArray(patterns) || patterns.length === 0) return false;
  const target = String(name).trim().toLowerCase();
  return patterns.some(pat => {
    if (!pat) return false;
    const str = String(pat).trim();
    if (str.toLowerCase() === target) return true;
    if (str.includes('*') || str.includes('?')) {
      try {
        const regexStr = '^' + str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$';
        return new RegExp(regexStr, 'i').test(name);
      } catch (e) {
        return false;
      }
    }
    return false;
  });
}

function addEntryToJsonConfig(configPath, targetPath, options = {}, wsRoot = null) {
  const config = readJsonConfigFile(configPath);
  const formatted = formatPathForConfig(targetPath, wsRoot);
  const normTarget = path.normalize(targetPath).toLowerCase();

  const existingIdx = config.entries.findIndex(entry => {
    const entryP = typeof entry === 'string' ? entry : entry.path;
    const resolved = resolveJsonConfigPath(entryP, path.dirname(configPath));
    return path.normalize(resolved).toLowerCase() === normTarget;
  });

  if (existingIdx === -1) {
    config.entries.push({ path: formatted, ...options });
  } else if (typeof config.entries[existingIdx] === 'object') {
    config.entries[existingIdx] = { ...config.entries[existingIdx], path: formatted, ...options };
  }
  writeJsonConfigFile(configPath, config);
}

function removeEntryFromJsonConfig(configPath, targetPath) {
  const config = readJsonConfigFile(configPath);
  const normTarget = path.normalize(targetPath).toLowerCase();
  const baseNameTarget = path.basename(targetPath).toLowerCase();

  config.entries = config.entries.filter(entry => {
    const entryP = typeof entry === 'string' ? entry : entry.path;
    const resolved = resolveJsonConfigPath(entryP, path.dirname(configPath));
    if (path.normalize(resolved).toLowerCase() === normTarget) return false;
    if (path.basename(resolved).toLowerCase() === baseNameTarget) return false;
    return true;
  });

  writeJsonConfigFile(configPath, config);
}

function addExcludeToJsonConfig(configPath, pattern, targetPhysicalPath = null) {
  const config = readJsonConfigFile(configPath);
  let handledInEntry = false;
  if (targetPhysicalPath && config.entries && Array.isArray(config.entries)) {
    const normTarget = path.normalize(targetPhysicalPath).toLowerCase();
    for (const entry of config.entries) {
      if (typeof entry === 'object' && entry.path) {
        const resolved = resolveJsonConfigPath(entry.path, path.dirname(configPath));
        const normEntry = path.normalize(resolved).toLowerCase();
        if (normTarget.startsWith(normEntry) && normTarget !== normEntry) {
          if (!entry.exclude) entry.exclude = [];
          if (!entry.exclude.includes(pattern)) {
            entry.exclude.push(pattern);
          }
          handledInEntry = true;
        }
      }
    }
  }

  if (!handledInEntry) {
    if (!config.exclude) config.exclude = [];
    if (!config.exclude.includes(pattern)) {
      config.exclude.push(pattern);
    }
  } else if (config.exclude && Array.isArray(config.exclude)) {
    // If handled in entry, remove from top-level universal blacklist to allow per-project overrides
    config.exclude = config.exclude.filter(p => p.toLowerCase() !== pattern.toLowerCase());
  }

  writeJsonConfigFile(configPath, config);
}

function removeExcludeFromJsonConfig(configPath, pattern) {
  const config = readJsonConfigFile(configPath);
  if (config.exclude && Array.isArray(config.exclude)) {
    config.exclude = config.exclude.filter(p => p.toLowerCase() !== pattern.toLowerCase());
  }
  if (config.entries && Array.isArray(config.entries)) {
    for (const entry of config.entries) {
      if (typeof entry === 'object' && entry.exclude && Array.isArray(entry.exclude)) {
        entry.exclude = entry.exclude.filter(p => p.toLowerCase() !== pattern.toLowerCase());
      }
    }
  }
  writeJsonConfigFile(configPath, config);
}

function isPathInJsonConfigEntries(configPath, targetPath, itemName = '') {
  if (!fs.existsSync(configPath)) return false;
  const config = readJsonConfigFile(configPath);
  const normTarget = targetPath ? path.normalize(targetPath).toLowerCase() : '';
  const nameToMatch = (itemName || (targetPath ? path.basename(targetPath) : '')).toLowerCase();

  return config.entries.some(entry => {
    const entryP = typeof entry === 'string' ? entry : entry.path;
    if (!entryP) return false;
    const resolved = resolveJsonConfigPath(entryP, path.dirname(configPath));
    if (normTarget && path.normalize(resolved).toLowerCase() === normTarget) return true;
    if (nameToMatch && path.basename(resolved).toLowerCase() === nameToMatch) return true;
    return false;
  });
}

function isNameExcludedInJsonConfig(configPath, name, targetPhysicalPath = null) {
  if (!fs.existsSync(configPath)) return false;
  const config = readJsonConfigFile(configPath);
  if (isPatternMatch(name, config.exclude)) return true;

  if (config.entries && Array.isArray(config.entries)) {
    const normTarget = targetPhysicalPath ? path.normalize(targetPhysicalPath).toLowerCase() : '';
    for (const entry of config.entries) {
      if (typeof entry === 'object' && entry.exclude && Array.isArray(entry.exclude)) {
        if (normTarget && entry.path) {
          const resolved = resolveJsonConfigPath(entry.path, path.dirname(configPath));
          const normEntry = path.normalize(resolved).toLowerCase();
          if (normTarget.startsWith(normEntry)) {
            if (isPatternMatch(name, entry.exclude)) return true;
          }
        } else if (!normTarget) {
          if (isPatternMatch(name, entry.exclude)) return true;
        }
      }
    }
  }
  return false;
}

function touchAntigravityConfigs() {
  try {
    const now = new Date();
    const paths = [
      getAntigravityConfigPath(),
      getGlobalPluginsJsonPath(),
      getGlobalSkillsJsonPath()
    ];
    if (vscode.workspace && vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) {
        paths.push(getWorkspacePluginConfigPath(wf.uri.fsPath));
        paths.push(getWorkspaceSkillConfigPath(wf.uri.fsPath));
      }
    }
    for (const p of paths) {
      if (fs.existsSync(p)) {
        try {
          fs.utimesSync(p, now, now);
        } catch (e) {}
      }
    }
  } catch (e) {
    logDebug(`touchAntigravityConfigs error: ${e.message}`);
  }
}

function triggerIdeScannerFlush(workspaceRoots = null) {
  try {
    touchAntigravityConfigs();
    if (workspaceRoots && Array.isArray(workspaceRoots)) {
      const now = new Date();
      for (const root of workspaceRoots) {
        if (!root) continue;
        const p1 = getWorkspacePluginConfigPath(root);
        const p2 = getWorkspaceSkillConfigPath(root);
        if (fs.existsSync(p1)) { try { fs.utimesSync(p1, now, now); } catch (_) {} }
        if (fs.existsSync(p2)) { try { fs.utimesSync(p2, now, now); } catch (_) {} }
      }
    }
  } catch (e) {
    logDebug(`triggerIdeScannerFlush error: ${e.message}`);
  }
}

// Ensures that the default global plugins folder (~/.gemini/config/plugins) is preserved
// in plugins.json.entries when external plugin repositories are configured.
// Without this, Antigravity IDE's scanner shadows/ignores ~/.gemini/config/plugins.
function ensureDefaultPluginsFolderInGlobalConfig() {
  try {
    const globalPluginsJson = getGlobalPluginsJsonPath();
    const defaultPluginsPath = getActivePluginsPath();
    if (!fs.existsSync(globalPluginsJson)) return;

    const data = readJsonConfigFile(globalPluginsJson);
    if (!data.entries || data.entries.length === 0) return;

    const normDefault = path.normalize(defaultPluginsPath).toLowerCase();
    const hasDefault = data.entries.some(e => {
      const p = typeof e === 'string' ? e : e.path;
      if (!p) return false;
      const resolved = resolveJsonConfigPath(p, path.dirname(globalPluginsJson));
      return path.normalize(resolved).toLowerCase() === normDefault;
    });

    if (!hasDefault) {
      data.entries.unshift({ path: defaultPluginsPath.replace(/\\/g, '/') });
      fs.writeFileSync(globalPluginsJson, JSON.stringify(data, null, 2), 'utf8');
      logDebug(`ensureDefaultPluginsFolderInGlobalConfig: added ${defaultPluginsPath} to plugins.json`);
    }
  } catch (e) {
    logDebug(`ensureDefaultPluginsFolderInGlobalConfig error: ${e.message}`);
  }
}


// Cleans up the default plugins folder from plugins.json if no external repositories remain
function cleanupDefaultPluginsFolderInGlobalConfig() {
  try {
    const globalPluginsJson = getGlobalPluginsJsonPath();
    const defaultPluginsPath = getActivePluginsPath();
    if (!fs.existsSync(globalPluginsJson)) return;

    const data = readJsonConfigFile(globalPluginsJson);
    if (!data.entries || data.entries.length === 0) return;

    const normDefault = path.normalize(defaultPluginsPath).toLowerCase();
    const otherEntries = data.entries.filter(e => {
      const p = typeof e === 'string' ? e : e.path;
      if (!p) return false;
      const resolved = resolveJsonConfigPath(p, path.dirname(globalPluginsJson));
      return path.normalize(resolved).toLowerCase() !== normDefault;
    });

    if (otherEntries.length === 0) {
      data.entries = [];
      fs.writeFileSync(globalPluginsJson, JSON.stringify(data, null, 2), 'utf8');
      logDebug('cleanupDefaultPluginsFolderInGlobalConfig: reset plugins.json entries to empty');
    }
  } catch (e) {
    logDebug(`cleanupDefaultPluginsFolderInGlobalConfig error: ${e.message}`);
  }
}

function migrateFromLegacyStorage(context) {
  try {
    const storagePath = getGlobalStoragePath(context);
    if (!fs.existsSync(storagePath)) return { migrated: 0 };

    logDebug(`Checking legacy storage for migration at ${storagePath}`);
    const activePluginsDir = getActivePluginsPath();
    const activeSkillsDir = getActiveSkillsPath();
    const activeWorkflowsDir = getActiveWorkflowsPath();

    if (!fs.existsSync(activePluginsDir)) fs.mkdirSync(activePluginsDir, { recursive: true });
    if (!fs.existsSync(activeSkillsDir)) fs.mkdirSync(activeSkillsDir, { recursive: true });
    if (!fs.existsSync(activeWorkflowsDir)) fs.mkdirSync(activeWorkflowsDir, { recursive: true });

    let migratedCount = 0;
    const disabledPlugins = [];

    // 1. Storage plugins
    const storagePluginsDir = path.join(storagePath, 'plugins');
    const pluginDirsToCheck = [];
    if (fs.existsSync(storagePluginsDir)) {
      pluginDirsToCheck.push(storagePluginsDir);
    }
    pluginDirsToCheck.push(storagePath);

    for (const sDir of pluginDirsToCheck) {
      if (!fs.existsSync(sDir)) continue;
      const entries = fs.readdirSync(sDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'plugins' && entry.name !== 'skills' && entry.name !== 'workflows') {
          const srcPath = path.join(sDir, entry.name);
          const destPath = path.join(activePluginsDir, entry.name);
          
          let isSymlink = false;
          try {
            isSymlink = fs.lstatSync(srcPath).isSymbolicLink();
          } catch (e) {}

          if (isSymlink) {
            try { fs.unlinkSync(srcPath); } catch (e) {}
            continue;
          }

          if (fs.existsSync(destPath)) {
            try {
              if (fs.lstatSync(destPath).isSymbolicLink()) {
                fs.unlinkSync(destPath);
              }
            } catch (e) {}
          }

          if (!fs.existsSync(destPath)) {
            safeMoveDir(srcPath, destPath);
            migratedCount++;
            disabledPlugins.push(entry.name);
          } else {
            mergeDirs(srcPath, destPath);
            try { fs.rmSync(srcPath, { recursive: true, force: true }); } catch (e) {}
            migratedCount++;
            disabledPlugins.push(entry.name);
          }
        }
      }
    }

    // 2. Storage skills
    const storageSkillsDir = path.join(storagePath, 'skills');
    if (fs.existsSync(storageSkillsDir)) {
      const entries = fs.readdirSync(storageSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const srcPath = path.join(storageSkillsDir, entry.name);
          const destPath = path.join(activeSkillsDir, entry.name);
          try {
            if (fs.existsSync(destPath) && fs.lstatSync(destPath).isSymbolicLink()) {
              fs.unlinkSync(destPath);
            }
          } catch (e) {}

          if (!fs.existsSync(destPath)) {
            safeMoveDir(srcPath, destPath);
            migratedCount++;
          } else {
            mergeDirs(srcPath, destPath);
            try { fs.rmSync(srcPath, { recursive: true, force: true }); } catch (e) {}
            migratedCount++;
          }
        }
      }
    }

    // 3. Storage workflows
    const storageWorkflowsDir = path.join(storagePath, 'workflows');
    if (fs.existsSync(storageWorkflowsDir)) {
      const entries = fs.readdirSync(storageWorkflowsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const srcPath = path.join(storageWorkflowsDir, entry.name);
          const destPath = path.join(activeWorkflowsDir, entry.name);
          try {
            if (fs.existsSync(destPath) && fs.lstatSync(destPath).isSymbolicLink()) {
              fs.unlinkSync(destPath);
            }
          } catch (e) {}

          if (!fs.existsSync(destPath)) {
            safeMoveDir(srcPath, destPath);
            migratedCount++;
          } else {
            try { fs.unlinkSync(srcPath); } catch (e) {}
          }
        }
      }
    }

    // 4. Mark migrated plugins as enabled: false in config.json
    if (disabledPlugins.length > 0) {
      const cfg = getAntigravityConfig();
      if (!cfg.plugins) cfg.plugins = {};
      for (const pName of disabledPlugins) {
        if (!cfg.plugins[pName]) {
          cfg.plugins[pName] = { enabled: false };
        }
      }
      saveAntigravityConfig(cfg);
    }

    // 5. Cleanup .linked_files.json and symlinks in active skills
    try {
      if (fs.existsSync(activeSkillsDir)) {
        const sEntries = fs.readdirSync(activeSkillsDir, { withFileTypes: true });
        for (const s of sEntries) {
          if (s.isDirectory()) {
            const linkJson = path.join(activeSkillsDir, s.name, '.linked_files.json');
            if (fs.existsSync(linkJson)) {
              try { fs.unlinkSync(linkJson); } catch (e) {}
            }
          }
        }
      }
    } catch (e) {}

    removeEmptyDirs(storagePath);

    return { migrated: migratedCount, disabledPlugins };
  } catch (err) {
    logDebug(`migrateFromLegacyStorage error: ${err.message}`);
    return { migrated: 0, error: err.message };
  }
}

/**
 * Assembles webview script content from modular webview/js/ directory,
 * falling back to webview/main.js if webview/js/ is not present.
 */
function getWebviewScript(webviewDir) {
  const jsDir = path.join(webviewDir, 'js');
  if (fs.existsSync(jsDir)) {
    const modules = [
      'state.js',
      'syncEta.js',
      'ipc.js',
      'controls.js',
      'actions.js',
      'cards.js',
      'pluginDetails.js',
      'activeContext.js',
      'modals.js',
      'main.js'
    ];
    return modules
      .filter((m) => fs.existsSync(path.join(jsDir, m)))
      .map((m) => fs.readFileSync(path.join(jsDir, m), 'utf8'))
      .join('\n\n');
  }
  const fallbackPath = path.join(webviewDir, 'main.js');
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf8');
  }
  return '';
}

// Calculate available move destinations for a resource (Clean 3-Tier Move Architecture)
function getMoveDestinations(moveMsg, workspaceRoots = [], lang = 'en') {
  if (!moveMsg) return { success: false, destinations: [] };
  const { itemId, category, sourcePluginId, isLocal, physicalPath } = moveMsg;

  const bPath = getBuiltinPath().toLowerCase();
  const isBuiltin = (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin'))) ||
    (physicalPath && physicalPath.toLowerCase().startsWith(bPath));

  if (isBuiltin) {
    return {
      success: false,
      isProtected: true,
      message: lang === 'ru' ? 'Встроенные системные компоненты нельзя перемещать.' : 'Built-in system components cannot be moved.',
      destinations: []
    };
  }

  let sourcePath = physicalPath || '';
  let currentParentDir = '';
  if (sourcePath) {
    currentParentDir = path.normalize(path.dirname(sourcePath)).toLowerCase();
  }

  const destinations = [];
  const activePluginsPath = getActivePluginsPath();
  const activeSkillsPath = getActiveSkillsPath();
  const activeWorkflowsPath = getActiveWorkflowsPath();

  // 1. Standard Global (~/.gemini/config/...)
  let standardGlobalDir = '';
  if (category === 'plugin') standardGlobalDir = activePluginsPath;
  else if (category === 'skill') standardGlobalDir = activeSkillsPath;
  else if (category === 'workflow') standardGlobalDir = activeWorkflowsPath;

  const standardGlobalNorm = standardGlobalDir ? path.normalize(standardGlobalDir).toLowerCase() : '';
  const isAlreadyInStandardGlobal = standardGlobalNorm && currentParentDir === standardGlobalNorm;

  if (category !== 'rule' && !isAlreadyInStandardGlobal && standardGlobalDir) {
    destinations.push({
      id: 'global',
      type: 'global',
      label: lang === 'ru' ? 'Стандартный глобальный (~/.gemini)' : 'Standard Global (~/.gemini)',
      description: standardGlobalDir,
      icon: '🌐',
      targetParent: standardGlobalDir
    });
  }

  // Lazy-require scanners to avoid circular require at load time
  let scanners = null;
  try {
    scanners = require('./scanners');
  } catch (_) {}

  const validRoots = Array.isArray(workspaceRoots) ? workspaceRoots.filter(Boolean) : [];

  // 1b. Dedicated handling for MCP servers (moves between mcp_config.json files)
  if (category === 'mcp') {
    const globalMcp = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(globalMcp).toLowerCase()) {
      destinations.push({
        id: 'global-mcp',
        type: 'global',
        label: lang === 'ru' ? 'Глобальный (mcp_config.json)' : 'Global (mcp_config.json)',
        description: globalMcp,
        icon: '🌐',
        targetParent: globalMcp
      });
    }
    validRoots.forEach(wsRoot => {
      const wsMcp = path.join(wsRoot, '.agents', 'mcp_config.json');
      if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(wsMcp).toLowerCase()) {
        destinations.push({
          id: 'workspace:' + wsRoot,
          type: 'workspace',
          label: `${lang === 'ru' ? 'Рабочий проект' : 'Workspace'}: ${path.basename(wsRoot)}`,
          description: wsMcp,
          icon: '💼',
          targetParent: wsMcp
        });
      }
    });
    if (scanners) {
      try {
        const globalPlugins = scanners.scanPlugins ? scanners.scanPlugins(activePluginsPath, validRoots) : [];
        const localPlugins = scanners.scanLocalPlugins ? scanners.scanLocalPlugins(validRoots) : [];
        [...globalPlugins, ...localPlugins].forEach(p => {
          if (p.physicalPath) {
            const pMcp = path.join(p.physicalPath, 'mcp_config.json');
            if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(pMcp).toLowerCase()) {
              destinations.push({
                id: 'plugin:' + (p.id || p.name),
                type: 'plugin',
                label: `${lang === 'ru' ? 'В плагин' : 'Into plugin'}: ${p.displayName || p.name}`,
                description: pMcp,
                icon: '🔌',
                targetParent: pMcp
              });
            }
          }
        });
      } catch (_) {}
    }
    return {
      success: true,
      itemId: itemId || '',
      sourcePath: sourcePath,
      currentParentDir: currentParentDir,
      category: category,
      destinations: destinations,
      enableInWorkspaceRoot: moveMsg.enableInWorkspaceRoot || null
    };
  }

  // 1c. Dedicated handling for Hooks (moves between hooks.json files)
  if (category === 'hook') {
    const globalHooks = path.join(os.homedir(), '.gemini', 'config', 'hooks.json');
    if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(globalHooks).toLowerCase()) {
      destinations.push({
        id: 'global-hooks',
        type: 'global',
        label: lang === 'ru' ? 'Глобальный (hooks.json)' : 'Global (hooks.json)',
        description: globalHooks,
        icon: '🌐',
        targetParent: globalHooks
      });
    }
    validRoots.forEach(wsRoot => {
      const wsHooks = path.join(wsRoot, '.agents', 'hooks.json');
      if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(wsHooks).toLowerCase()) {
        destinations.push({
          id: 'workspace:' + wsRoot,
          type: 'workspace',
          label: `${lang === 'ru' ? 'Рабочий проект' : 'Workspace'}: ${path.basename(wsRoot)}`,
          description: wsHooks,
          icon: '💼',
          targetParent: wsHooks
        });
      }
    });
    if (scanners) {
      try {
        const globalPlugins = scanners.scanPlugins ? scanners.scanPlugins(activePluginsPath, validRoots) : [];
        const localPlugins = scanners.scanLocalPlugins ? scanners.scanLocalPlugins(validRoots) : [];
        [...globalPlugins, ...localPlugins].forEach(p => {
          if (p.physicalPath) {
            const pHooks = path.join(p.physicalPath, 'hooks.json');
            if (!sourcePath || path.resolve(sourcePath).toLowerCase() !== path.resolve(pHooks).toLowerCase()) {
              destinations.push({
                id: 'plugin:' + (p.id || p.name),
                type: 'plugin',
                label: `${lang === 'ru' ? 'В плагин' : 'Into plugin'}: ${p.displayName || p.name}`,
                description: pHooks,
                icon: '🔌',
                targetParent: pHooks
              });
            }
          }
        });
      } catch (_) {}
    }
    return {
      success: true,
      itemId: itemId || '',
      sourcePath: sourcePath,
      currentParentDir: currentParentDir,
      category: category,
      destinations: destinations,
      enableInWorkspaceRoot: moveMsg.enableInWorkspaceRoot || null
    };
  }

  // 2. Connected custom folders (from plugins.json / skills.json)
  if (scanners && typeof scanners.getConnectedFolders === 'function') {
    const connectedFolders = scanners.getConnectedFolders(workspaceRoots);
    const relevantConnected = connectedFolders.filter(cf => {
      if (category === 'plugin') return cf.type === 'plugin' || cf.category === 'plugins';
      if (category === 'skill') return cf.type === 'skill' || cf.category === 'skills';
      return false;
    });

    relevantConnected.forEach(cf => {
      const cfNorm = path.normalize(cf.path).toLowerCase();
      if (currentParentDir !== cfNorm) {
        const scopeLabel = cf.scope === 'global' ? 'Global' : (cf.workspaceName || 'Workspace');
        destinations.push({
          id: 'connected:' + cf.path,
          type: 'connected',
          label: `${lang === 'ru' ? 'Подключенная папка' : 'Connected folder'}: ${path.basename(cf.path)}`,
          description: `${cf.scope === 'global' ? '🌐' : '📁'} ${scopeLabel} (${cf.path})`,
          icon: '📚',
          targetParent: cf.path
        });
      }
    });
  }

  // 3. Workspace projects (from workspaceRoots)
  validRoots.forEach(wsRoot => {
    let wsTargetParent = '';
    if (category === 'plugin') wsTargetParent = path.join(wsRoot, '.agents', 'plugins');
    else if (category === 'skill') wsTargetParent = path.join(wsRoot, '.agents', 'skills');
    else if (category === 'workflow') wsTargetParent = path.join(wsRoot, '.agents', 'workflows');
    else if (category === 'rule') wsTargetParent = path.join(wsRoot, '.agents', 'rules');

    if (wsTargetParent && currentParentDir !== path.normalize(wsTargetParent).toLowerCase()) {
      const wsName = path.basename(wsRoot);
      destinations.push({
        id: 'workspace:' + wsRoot,
        type: 'workspace',
        label: `${lang === 'ru' ? 'Рабочий проект' : 'Workspace Project'}: ${wsName}`,
        description: wsTargetParent,
        icon: '💼',
        targetParent: wsTargetParent,
        workspaceRoot: wsRoot
      });
    }
  });

  // 4. Inside plugins (for skills and rules)
  if (scanners && (category === 'skill' || category === 'rule')) {
    try {
      const globalPlugins = scanners.scanPlugins ? scanners.scanPlugins(activePluginsPath, validRoots) : [];
      const localPlugins = scanners.scanLocalPlugins ? scanners.scanLocalPlugins(validRoots) : [];
      const allPlugins = [...globalPlugins, ...localPlugins];
      const otherPlugins = allPlugins.filter(p => p.id !== sourcePluginId && p.name !== sourcePluginId);

      otherPlugins.forEach(p => {
        const pFolder = p.physicalPath || path.join(activePluginsPath, p.id);
        const pTargetParent = path.join(pFolder, category === 'skill' ? 'skills' : 'rules');
        if (currentParentDir !== path.normalize(pTargetParent).toLowerCase()) {
          destinations.push({
            id: 'plugin:' + (p.id || p.name),
            type: 'plugin',
            label: `${lang === 'ru' ? 'В плагин' : 'Into plugin'}: ${p.displayName || p.name}`,
            description: `ID: ${p.id} (${pTargetParent})`,
            icon: '🔌',
            targetParent: pTargetParent,
            pluginId: p.id
          });
        }
      });
    } catch (_) {}
  }

  return {
    success: true,
    itemId: itemId || (sourcePath ? path.basename(sourcePath) : ''),
    sourcePath: sourcePath,
    currentParentDir: currentParentDir,
    category: category,
    destinations: destinations,
    enableInWorkspaceRoot: moveMsg.enableInWorkspaceRoot || null
  };
}

module.exports = {
  getWebviewScript,
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
  writePluginMetaField,
  getAntigravityConfigPath,
  getGlobalPluginsJsonPath,
  getGlobalSkillsJsonPath,
  getWorkspacePluginConfigPath,
  getWorkspaceSkillConfigPath,
  getAntigravityConfig,
  saveAntigravityConfig,
  setAntigravityPluginEnabled,
  removeAntigravityPluginFromConfig,
  setPluginManifestDisabled,
  isAntigravityPluginGloballyEnabled,
  normalizePathSeparators,
  resolveJsonConfigPath,
  formatPathForConfig,
  readJsonConfigFile,
  writeJsonConfigFile,
  isPatternMatch,
  addEntryToJsonConfig,
  removeEntryFromJsonConfig,
  addExcludeToJsonConfig,
  removeExcludeFromJsonConfig,
  isPathInJsonConfigEntries,
  isNameExcludedInJsonConfig,
  touchAntigravityConfigs,
  triggerIdeScannerFlush,
  ensureDefaultPluginsFolderInGlobalConfig,
  cleanupDefaultPluginsFolderInGlobalConfig,
  migrateFromLegacyStorage,
  getWorkspaceCustomizationDirs,
  getMarkdownFilesRecursive,
  getMoveDestinations
};

