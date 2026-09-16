let vscode;
try {
  vscode = require('vscode');
} catch (e) {
  vscode = require('./vscodeShim');
}
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  logDebug,
  areDirsIdentical,
  areFilesIdentical,
  getSkillMdPath,
  parseFrontmatter,
  readPluginInfo,
  readSkillInfo,
  readWorkflowInfo,
  getBuiltinPath,
  getAntigravityIdePath,
  getActivePluginsPath,
  getGlobalPluginsJsonPath,
  getGlobalSkillsJsonPath,
  getWorkspacePluginConfigPath,
  getWorkspaceSkillConfigPath,
  readJsonConfigFile,
  resolveJsonConfigPath,
  isPatternMatch,
  isAntigravityPluginGloballyEnabled,
  isPathInJsonConfigEntries,
  isNameExcludedInJsonConfig,
  getWorkspaceCustomizationDirs,
  getMarkdownFilesRecursive
} = require('./fsUtils');

// Scan conflicts between active and storage folders (legacy stub, no storage conflicts in native mode)
function scanConflicts() {
  return [];
}

function attachPluginActivationState(p, workspaceRoots = []) {
  const pluginDirName = p.rawId || p.id || path.basename(p.physicalPath);
  
  // 1. Antigravity IDE state: plugin.json's disabled field is the primary source of truth
  const isManifestDisabled = p.disabled === true;

  // Global exclude list in ~/.gemini/config/plugins.json
  const globalPluginsJson = getGlobalPluginsJsonPath();
  const isGloballyExcluded = isNameExcludedInJsonConfig(globalPluginsJson, pluginDirName, p.physicalPath) ||
                             (p.name && isNameExcludedInJsonConfig(globalPluginsJson, p.name, p.physicalPath)) ||
                             (p.id && isNameExcludedInJsonConfig(globalPluginsJson, p.id, p.physicalPath));

  const isGloballyEnabled = !isManifestDisabled && !isGloballyExcluded;
  p.isGloballyEnabled = isGloballyEnabled;

  // 2. Workspace project state from .agents/plugins.json
  let isEnabledForProject = false;
  let isExcludedInProject = false;
  let matchingWorkspace = null;

  const roots = Array.isArray(workspaceRoots) ? workspaceRoots : [];
  if (roots.length > 0) {
    for (const wsRoot of roots) {
      const wsConfigPath = getWorkspacePluginConfigPath(wsRoot);
      const wsRootConfigPath = path.join(wsRoot, 'plugins.json');
      
      const inEntries = isPathInJsonConfigEntries(wsConfigPath, p.physicalPath, pluginDirName) ||
                        isPathInJsonConfigEntries(wsRootConfigPath, p.physicalPath, pluginDirName);
      const isExcl = isNameExcludedInJsonConfig(wsConfigPath, pluginDirName, p.physicalPath) ||
                     isNameExcludedInJsonConfig(wsRootConfigPath, pluginDirName, p.physicalPath);

      if (inEntries) {
        isEnabledForProject = true;
        matchingWorkspace = path.basename(wsRoot);
      }
      if (isExcl) {
        isExcludedInProject = true;
      }
    }
  }

  p.isEnabledForProject = isEnabledForProject;
  p.isExcludedInProject = isExcludedInProject;
  p.projectWorkspaceName = matchingWorkspace;
  p.projectActive = isEnabledForProject ? true : (isExcludedInProject ? false : null);
  p.projectOverride = isEnabledForProject ? 'enabled' : (isExcludedInProject ? 'disabled' : 'none');

  // Local plugins inside workspace are active by default unless disabled or excluded
  if (p.isLocal) {
    p.isEnabled = !isExcludedInProject && !isManifestDisabled;
  } else if (isEnabledForProject) {
    const isDefaultGlobalBlocked = p.source === 'global' && p.isGloballyEnabled === false;
    p.isEnabled = !isDefaultGlobalBlocked;
    p.isDefaultGlobalBlocked = isDefaultGlobalBlocked;
  } else if (isExcludedInProject) {
    p.isEnabled = false;
  } else {
    p.isEnabled = isGloballyEnabled;
  }
}

function scanPluginsInDirectory(dirPath, source, sourceLabel, workspaceRoots = [], isLocal = false, workspaceName = '', includeOnly = null, exclude = null) {
  const plugins = [];
  if (!fs.existsSync(dirPath)) return plugins;

  try {
    const manifestPath = path.join(dirPath, 'plugin.json');
    if (fs.existsSync(manifestPath)) {
      const dirName = path.basename(dirPath);
      if (isPatternMatch(dirName, exclude)) return plugins;
      if (includeOnly && includeOnly.length > 0 && !isPatternMatch(dirName, includeOnly)) return plugins;

      const pInfo = readPluginInfo(dirPath);
      pInfo.id = isLocal ? `local-${workspaceName}-${dirName}` : dirName;
      pInfo.rawId = dirName;
      pInfo.physicalPath = dirPath;
      pInfo.isLocal = isLocal;
      pInfo.workspaceName = workspaceName;
      pInfo.source = source;
      pInfo.sourceLabel = sourceLabel;
      attachPluginActivationState(pInfo, workspaceRoots);
      plugins.push(pInfo);
      return plugins;
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        if (isPatternMatch(item.name, exclude)) continue;
        if (includeOnly && includeOnly.length > 0 && !isPatternMatch(item.name, includeOnly)) continue;

        const pDir = path.join(dirPath, item.name);
        if (fs.existsSync(path.join(pDir, 'plugin.json'))) {
          const pInfo = readPluginInfo(pDir);
          pInfo.id = isLocal ? `local-${workspaceName}-${item.name}` : item.name;
          pInfo.rawId = item.name;
          pInfo.physicalPath = pDir;
          pInfo.isLocal = isLocal;
          pInfo.workspaceName = workspaceName;
          pInfo.source = source;
          pInfo.sourceLabel = sourceLabel;
          attachPluginActivationState(pInfo, workspaceRoots);
          plugins.push(pInfo);
        }
      }
    }
  } catch (e) {
    logDebug(`Error scanning plugins in ${dirPath}: ${e.message}`);
  }
  return plugins;
}

// Scan global plugins: ~/.gemini/config/plugins and declared in ~/.gemini/config/plugins.json
function scanPlugins(activePath, workspaceRoots = []) {
  activePath = activePath || getActivePluginsPath();
  const plugins = [];
  const seenPaths = new Set();

  logDebug(`scanPlugins: activePath=${activePath}`);

  // 1. Scan default active folder
  if (!fs.existsSync(activePath)) {
    try { fs.mkdirSync(activePath, { recursive: true }); } catch (e) {}
  }

  const defaultPlugins = scanPluginsInDirectory(activePath, 'global', 'Global', workspaceRoots, false, '');
  for (const p of defaultPlugins) {
    const norm = path.normalize(p.physicalPath).toLowerCase();
    if (!seenPaths.has(norm)) {
      seenPaths.add(norm);
      plugins.push(p);
    }
  }

  // 2. Scan external plugins from ~/.gemini/config/plugins.json
  const globalPluginsJson = getGlobalPluginsJsonPath();
  if (fs.existsSync(globalPluginsJson)) {
    const configData = readJsonConfigFile(globalPluginsJson);
    const entries = configData.entries || [];
    const topExclude = configData.exclude || [];
    const topIncludeOnly = configData.include_only || [];

    for (const entry of entries) {
      const rawPath = typeof entry === 'string' ? entry : entry.path;
      if (!rawPath) continue;

      const resolved = resolveJsonConfigPath(rawPath, path.dirname(globalPluginsJson));
      if (!fs.existsSync(resolved)) continue;

      const entryIncludeOnly = entry.include_only || (topIncludeOnly.length > 0 ? topIncludeOnly : null);
      const label = `plugins.json (${path.basename(resolved)})`;

      const found = scanPluginsInDirectory(resolved, 'configured', label, workspaceRoots, false, '', entryIncludeOnly, topExclude);
      for (const p of found) {
        const norm = path.normalize(p.physicalPath).toLowerCase();
        if (!seenPaths.has(norm)) {
          seenPaths.add(norm);
          plugins.push(p);
        }
      }
    }
  }

  plugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return plugins;
}

// Scan local workspace plugins: <wsRoot>/{.agents,.agent,_agents,_agent}/plugins/ and declared in plugins.json
function scanLocalPlugins(workspaceRoots = [], seenPaths = new Set()) {
  const localPlugins = [];
  if (!workspaceRoots || workspaceRoots.length === 0) return localPlugins;

  for (const wsRoot of workspaceRoots) {
    const wsName = path.basename(wsRoot);
    const customDirs = getWorkspaceCustomizationDirs(wsRoot);
    const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];

    // 1. Scan plugins folder in each customization directory
    for (const cDir of checkDirs) {
      const wsPluginsPath = path.join(cDir, 'plugins');
      if (fs.existsSync(wsPluginsPath)) {
        const found = scanPluginsInDirectory(wsPluginsPath, 'workspace', wsName, workspaceRoots, true, wsName);
        for (const p of found) {
          const norm = path.normalize(p.physicalPath).toLowerCase();
          if (!seenPaths.has(norm)) {
            seenPaths.add(norm);
            localPlugins.push(p);
          }
        }
      }
    }

    // 2. Custom entries in plugins.json
    const wsPluginsJson = getWorkspacePluginConfigPath(wsRoot);
    if (fs.existsSync(wsPluginsJson)) {
      const configData = readJsonConfigFile(wsPluginsJson);
      for (const entry of configData.entries || []) {
        const rawPath = typeof entry === 'string' ? entry : entry.path;
        if (!rawPath) continue;
        const resolved = resolveJsonConfigPath(rawPath, wsRoot);
        if (!fs.existsSync(resolved)) continue;

        const norm = path.normalize(resolved).toLowerCase();
        if (seenPaths.has(norm)) {
          continue; // Already scanned as global or earlier plugin!
        }

        // If plugin is inside workspace, consider it local; otherwise it's an imported plugin
        const isUnderWs = !path.relative(wsRoot, resolved).startsWith('..') && !path.isAbsolute(path.relative(wsRoot, resolved));
        const label = `${wsName} (plugins.json)`;
        const found = scanPluginsInDirectory(resolved, isUnderWs ? 'workspace' : 'imported', label, workspaceRoots, isUnderWs, wsName, entry.include_only);
        for (const p of found) {
          const pNorm = path.normalize(p.physicalPath).toLowerCase();
          if (!seenPaths.has(pNorm)) {
            seenPaths.add(pNorm);
            localPlugins.push(p);
          }
        }
      }
    }
  }
  return localPlugins;
}

function attachSkillActivationState(s, workspaceRoots = []) {
  const skillDirName = s.rawId || s.id || path.basename(s.physicalPath);
  const skillName = s.name || skillDirName;
  const globalSkillsJson = getGlobalSkillsJsonPath();

  // 1. Global state from global skills.json exclude list
  const isGloballyExcluded = isNameExcludedInJsonConfig(globalSkillsJson, skillDirName, s.physicalPath) ||
                             isNameExcludedInJsonConfig(globalSkillsJson, skillName, s.physicalPath) ||
                             isNameExcludedInJsonConfig(globalSkillsJson, s.id, s.physicalPath);
  s.isGloballyExcluded = isGloballyExcluded;
  s.isGloballyEnabled = !isGloballyExcluded;

  // 2. Workspace project state
  let isEnabledForProject = false;
  let isExcludedInProject = false;
  let matchingWorkspace = null;

  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsConfigPath = getWorkspaceSkillConfigPath(wsRoot);
      const wsRootConfigPath = path.join(wsRoot, 'skills.json');

      const inEntries = isPathInJsonConfigEntries(wsConfigPath, s.physicalPath, skillDirName) ||
                        isPathInJsonConfigEntries(wsConfigPath, s.physicalPath, skillName) ||
                        isPathInJsonConfigEntries(wsRootConfigPath, s.physicalPath, skillDirName) ||
                        isPathInJsonConfigEntries(wsRootConfigPath, s.physicalPath, skillName);
      const isExcl = isNameExcludedInJsonConfig(wsConfigPath, skillDirName) ||
                     isNameExcludedInJsonConfig(wsConfigPath, skillName) ||
                     isNameExcludedInJsonConfig(wsRootConfigPath, skillDirName) ||
                     isNameExcludedInJsonConfig(wsRootConfigPath, skillName);

      if (inEntries) {
        isEnabledForProject = true;
        matchingWorkspace = path.basename(wsRoot);
      }
      if (isExcl) {
        isExcludedInProject = true;
      }
    }
  }

  s.isEnabledForProject = isEnabledForProject;
  s.isExcludedInProject = isExcludedInProject;
  s.projectWorkspaceName = matchingWorkspace;
  s.isProjectExcluded = isExcludedInProject;
  s.isProjectExplicit = isEnabledForProject;
  s.projectActive = isEnabledForProject ? true : (isExcludedInProject ? false : null);
  s.projectOverride = isEnabledForProject ? 'enabled' : (isExcludedInProject ? 'disabled' : 'none');

  if (s.isLocal) {
    s.isEnabled = !isExcludedInProject;
  } else if (isEnabledForProject) {
    const isDefaultGlobalBlocked = s.source === 'global' && s.isGloballyEnabled === false;
    s.isEnabled = !isDefaultGlobalBlocked;
    s.isDefaultGlobalBlocked = isDefaultGlobalBlocked;
  } else if (isExcludedInProject) {
    s.isEnabled = false; // Excluded in project configuration
  } else {
    s.isEnabled = s.isGloballyEnabled;
  }
}

function scanSkillsInDirectory(dirPath, source, sourceLabel, workspaceRoots = [], isLocal = false, workspaceName = '', includeOnly = null, exclude = null) {
  const skills = [];
  if (!fs.existsSync(dirPath)) return skills;

  try {
    const selfSkillMd = getSkillMdPath(dirPath);
    if (selfSkillMd) {
      const dirName = path.basename(dirPath);
      if (isPatternMatch(dirName, exclude)) return skills;
      if (includeOnly && includeOnly.length > 0 && !isPatternMatch(dirName, includeOnly)) return skills;

      const sInfo = readSkillInfo(dirPath);
      sInfo.id = isLocal ? `local-${workspaceName}-${dirName}` : dirName;
      sInfo.rawId = dirName;
      sInfo.physicalPath = dirPath;
      sInfo.isLocal = isLocal;
      sInfo.workspaceName = workspaceName;
      sInfo.source = source;
      sInfo.sourceLabel = sourceLabel;
      attachSkillActivationState(sInfo, workspaceRoots);
      skills.push(sInfo);
      return skills;
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        if (isPatternMatch(item.name, exclude)) continue;
        if (includeOnly && includeOnly.length > 0 && !isPatternMatch(item.name, includeOnly)) continue;

        const sDir = path.join(dirPath, item.name);
        if (getSkillMdPath(sDir)) {
          const sInfo = readSkillInfo(sDir);
          sInfo.id = isLocal ? `local-${workspaceName}-${item.name}` : item.name;
          sInfo.rawId = item.name;
          sInfo.physicalPath = sDir;
          sInfo.isLocal = isLocal;
          sInfo.workspaceName = workspaceName;
          sInfo.source = source;
          sInfo.sourceLabel = sourceLabel;
          attachSkillActivationState(sInfo, workspaceRoots);
          skills.push(sInfo);
        }
      }
    }
  } catch (e) {
    logDebug(`Error scanning skills in ${dirPath}: ${e.message}`);
  }
  return skills;
}

// Scan global skills: ~/.gemini/config/skills and declared in ~/.gemini/config/skills.json
function scanSkills(activePath, workspaceRoots = []) {
  const skills = [];
  const seenPaths = new Set();

  logDebug(`scanSkills: activePath=${activePath}`);

  if (!fs.existsSync(activePath)) {
    try { fs.mkdirSync(activePath, { recursive: true }); } catch (e) {}
  }

  // 1. Scan default active skills folder
  const defaultSkills = scanSkillsInDirectory(activePath, 'global', 'Global', workspaceRoots, false, '');
  for (const s of defaultSkills) {
    const norm = path.normalize(s.physicalPath).toLowerCase();
    if (!seenPaths.has(norm)) {
      seenPaths.add(norm);
      skills.push(s);
    }
  }

  // 2. Scan external skills from ~/.gemini/config/skills.json
  const globalSkillsJson = getGlobalSkillsJsonPath();
  if (fs.existsSync(globalSkillsJson)) {
    const configData = readJsonConfigFile(globalSkillsJson);
    const entries = configData.entries || [];
    const topExclude = configData.exclude || [];
    const topIncludeOnly = configData.include_only || [];

    for (const entry of entries) {
      const rawPath = typeof entry === 'string' ? entry : entry.path;
      if (!rawPath) continue;

      const resolved = resolveJsonConfigPath(rawPath, path.dirname(globalSkillsJson));
      if (!fs.existsSync(resolved)) continue;

      const entryIncludeOnly = entry.include_only || (topIncludeOnly.length > 0 ? topIncludeOnly : null);
      const label = `skills.json (${path.basename(resolved)})`;

      const found = scanSkillsInDirectory(resolved, 'configured', label, workspaceRoots, false, '', entryIncludeOnly);
      for (const s of found) {
        const norm = path.normalize(s.physicalPath).toLowerCase();
        if (!seenPaths.has(norm)) {
          seenPaths.add(norm);
          skills.push(s);
        }
      }
    }
  }

  skills.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return skills;
}

// Scan local workspace skills: <wsRoot>/{.agents,.agent,_agents,_agent}/skills/ and declared in skills.json
function scanLocalSkills(workspaceRoots = [], seenPaths = new Set()) {
  const localSkills = [];
  if (!workspaceRoots || workspaceRoots.length === 0) return localSkills;

  for (const wsRoot of workspaceRoots) {
    const wsName = path.basename(wsRoot);
    const customDirs = getWorkspaceCustomizationDirs(wsRoot);
    const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];

    // 1. Scan skills in each customization directory
    for (const cDir of checkDirs) {
      const wsSkillsPath = path.join(cDir, 'skills');
      if (fs.existsSync(wsSkillsPath)) {
        const found = scanSkillsInDirectory(wsSkillsPath, 'workspace', wsName, workspaceRoots, true, wsName);
        for (const s of found) {
          const norm = path.normalize(s.physicalPath).toLowerCase();
          if (!seenPaths.has(norm)) {
            seenPaths.add(norm);
            localSkills.push(s);
          }
        }
      }
    }

    // 2. Custom entries in skills.json
    const wsSkillsJson = getWorkspaceSkillConfigPath(wsRoot);
    if (fs.existsSync(wsSkillsJson)) {
      const configData = readJsonConfigFile(wsSkillsJson);
      for (const entry of configData.entries || []) {
        const rawPath = typeof entry === 'string' ? entry : entry.path;
        if (!rawPath) continue;
        const resolved = resolveJsonConfigPath(rawPath, wsRoot);
        if (!fs.existsSync(resolved)) continue;

        const norm = path.normalize(resolved).toLowerCase();
        if (seenPaths.has(norm)) {
          continue; // Already scanned as global or builtin!
        }

        const isUnderWs = !path.relative(wsRoot, resolved).startsWith('..') && !path.isAbsolute(path.relative(wsRoot, resolved));
        const label = `${wsName} (skills.json)`;
        const found = scanSkillsInDirectory(resolved, isUnderWs ? 'workspace' : 'imported', label, workspaceRoots, isUnderWs, wsName, entry.include_only);
        for (const s of found) {
          const sNorm = path.normalize(s.physicalPath).toLowerCase();
          if (!seenPaths.has(sNorm)) {
            seenPaths.add(sNorm);
            localSkills.push(s);
          }
        }
      }
    }
  }
  return localSkills;
}

// Scan Built-in skills from Antigravity IDE (~/.gemini/antigravity-ide/builtin/skills)
function scanBuiltinSkills() {
  const builtinSkills = [];
  const builtinSkillsDir = path.join(getBuiltinPath(), 'skills');
  if (fs.existsSync(builtinSkillsDir)) {
    try {
      const items = fs.readdirSync(builtinSkillsDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const skillDir = path.join(builtinSkillsDir, item.name);
          if (getSkillMdPath(skillDir)) {
            const skillInfo = readSkillInfo(skillDir);
            skillInfo.id = `builtin-${item.name}`;
            skillInfo.rawName = item.name;
            skillInfo.isEnabled = true;
            skillInfo.isBuiltin = true;
            skillInfo.isProtected = true;
            skillInfo.scope = 'builtin';
            skillInfo.source = 'builtin';
            skillInfo.sourceLabel = 'Built-in';
            skillInfo.physicalPath = skillDir;
            builtinSkills.push(skillInfo);
          }
        }
      }
    } catch (e) {
      logDebug(`Error scanning builtin skills: ${e.message}`);
    }
  }
  return builtinSkills;
}

// Scan global workflows
function scanWorkflows(activePath) {
  const workflows = [];
  logDebug(`scanWorkflows: activePath=${activePath}`);

  if (!fs.existsSync(activePath)) {
    try { fs.mkdirSync(activePath, { recursive: true }); } catch (e) {}
    return workflows;
  }

  try {
    const items = fs.readdirSync(activePath, { withFileTypes: true });
    for (const item of items) {
      const activeItemPath = path.join(activePath, item.name);
      if (item.isFile() && item.name.endsWith('.md')) {
        const wfInfo = readWorkflowInfo(activeItemPath);
        wfInfo.id = item.name;
        wfInfo.isEnabled = true;
        wfInfo.physicalPath = activeItemPath;
        workflows.push(wfInfo);
      }
    }
  } catch (e) {
    logDebug(`Error scanning active workflows: ${e.message}`);
  }

  workflows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return workflows;
}

// Scan local workspace workflows: <wsRoot>/{.agents,.agent,_agents,_agent}/workflows/
function scanLocalWorkflows(workspaceRoots = []) {
  const localWorkflows = [];
  const roots = (Array.isArray(workspaceRoots) && workspaceRoots.length > 0)
    ? workspaceRoots.map(r => (typeof r === 'string' ? r : (r.fsPath || (r.uri ? r.uri.fsPath : '')))).filter(Boolean)
    : (vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map(f => f.uri.fsPath) : []);

  if (roots.length === 0) return localWorkflows;
  const seenPaths = new Set();
  
  for (const wsRoot of roots) {
    const wsName = path.basename(wsRoot);
    const customDirs = getWorkspaceCustomizationDirs(wsRoot);
    const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];

    for (const cDir of checkDirs) {
      const wsWorkflowsPath = path.join(cDir, 'workflows');
      if (fs.existsSync(wsWorkflowsPath)) {
        try {
          const mdFiles = getMarkdownFilesRecursive(wsWorkflowsPath);
          for (const item of mdFiles) {
            const norm = path.normalize(item.fullPath).toLowerCase();
            if (seenPaths.has(norm)) continue;
            seenPaths.add(norm);

            const wfInfo = readWorkflowInfo(item.fullPath);
            const relNorm = item.relPath.replace(/\\/g, '/');
            wfInfo.id = `local-${wsName}-${relNorm.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            wfInfo.isEnabled = true;
            wfInfo.isLocal = true;
            wfInfo.workspaceName = wsName;
            wfInfo.physicalPath = item.fullPath;
            localWorkflows.push(wfInfo);
          }
        } catch (e) {
          logDebug(`Error scanning local workflows in ${wsName}: ${e.message}`);
        }
      }
    }
  }
  return localWorkflows;
}

// Scan Built-in workflows from Antigravity IDE
function scanBuiltinWorkflows() {
  const builtinWorkflows = [];
  const dirsToCheck = [
    path.join(getBuiltinPath(), 'workflows'),
    path.join(getBuiltinPath(), 'global_workflows')
  ];
  for (const dir of dirsToCheck) {
    if (fs.existsSync(dir)) {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.isFile() && item.name.endsWith('.md')) {
            const wfFile = path.join(dir, item.name);
            const wfInfo = readWorkflowInfo(wfFile);
            wfInfo.id = `builtin-${item.name}`;
            wfInfo.isEnabled = true;
            wfInfo.isBuiltin = true;
            wfInfo.isProtected = true;
            wfInfo.scope = 'builtin';
            wfInfo.source = 'builtin';
            wfInfo.sourceLabel = 'Built-in';
            wfInfo.physicalPath = wfFile;
            builtinWorkflows.push(wfInfo);
          }
        }
      } catch (e) {
        logDebug(`Error scanning builtin workflows: ${e.message}`);
      }
    }
  }
  return builtinWorkflows;
}

// Scan all rules across Global (strictly 2 files: GEMINI.md & AGENTS.md), Builtin, Workspaces, and Plugins
function scanAllRules(workspaceRoots, plugins) {
  const allRules = [];
  const seenRulePaths = new Set();

  // 1. Global rules: strictly the 2 files in ~/.gemini
  const homeDir = os.homedir();
  const globalGemini = path.join(homeDir, '.gemini', 'GEMINI.md');
  const globalAgents = path.join(homeDir, '.gemini', 'AGENTS.md');

  if (fs.existsSync(globalGemini)) {
    seenRulePaths.add(path.normalize(globalGemini).toLowerCase());
    let desc = '';
    try {
      const content = fs.readFileSync(globalGemini, 'utf8');
      const fm = parseFrontmatter(content);
      desc = fm.description || 'Global GEMINI.md rules for AI agents';
    } catch (e) {}
    allRules.push({
      id: 'global-gemini-md',
      name: 'GEMINI.md',
      displayName: 'GEMINI.md (Global)',
      description: desc,
      physicalPath: globalGemini,
      source: 'global',
      sourceLabel: 'Global',
      isGlobal: true,
      isProtected: true,
      isEnabled: true
    });
  }

  if (fs.existsSync(globalAgents)) {
    seenRulePaths.add(path.normalize(globalAgents).toLowerCase());
    let desc = '';
    try {
      const content = fs.readFileSync(globalAgents, 'utf8');
      const fm = parseFrontmatter(content);
      desc = fm.description || 'Global AGENTS.md rules for AI agents';
    } catch (e) {}
    allRules.push({
      id: 'global-agents-md',
      name: 'AGENTS.md',
      displayName: 'AGENTS.md (Global)',
      description: desc,
      physicalPath: globalAgents,
      source: 'global',
      sourceLabel: 'Global',
      isGlobal: true,
      isProtected: true,
      isEnabled: true
    });
  }

  // 2. Builtin rules (if any in builtin/rules or antigravity-ide/rules)
  const builtinRulesDirs = [
    path.join(getBuiltinPath(), 'rules'),
    path.join(getAntigravityIdePath(), 'rules')
  ];
  for (const bDir of builtinRulesDirs) {
    if (fs.existsSync(bDir)) {
      try {
        const mdFiles = getMarkdownFilesRecursive(bDir);
        for (const item of mdFiles) {
          const normKey = path.normalize(item.fullPath).toLowerCase();
          if (seenRulePaths.has(normKey)) continue;
          seenRulePaths.add(normKey);

          let desc = '';
          try {
            const c = fs.readFileSync(item.fullPath, 'utf8');
            const fm = parseFrontmatter(c);
            desc = fm.description || 'Built-in Antigravity rule';
          } catch (e) {}
          allRules.push({
            id: `builtin-${item.name}`,
            name: item.name,
            displayName: `${item.name} (Built-in)`,
            description: desc,
            physicalPath: item.fullPath,
            source: 'builtin',
            sourceLabel: 'Built-in',
            isBuiltin: true,
            isProtected: true,
            isEnabled: true
          });
        }
      } catch (e) {}
    }
  }

  // 3. Workspace project rules
  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsName = path.basename(wsRoot);

      // Root rule files in workspace (strictly AGENTS.md and GEMINI.md per Antigravity spec)
      const rootRuleCandidates = ['AGENTS.md', 'GEMINI.md'];
      for (const rFile of rootRuleCandidates) {
        const fullP = path.join(wsRoot, rFile);
        if (fs.existsSync(fullP)) {
          const normKey = path.normalize(fullP).toLowerCase();
          if (seenRulePaths.has(normKey)) continue;
          seenRulePaths.add(normKey);

          let desc = '';
          try {
            const content = fs.readFileSync(fullP, 'utf8');
            const fm = parseFrontmatter(content);
            desc = fm.description || `Project rule in ${wsName}`;
          } catch (e) {}

          allRules.push({
            id: `ws-${wsName}-${rFile.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`,
            name: rFile,
            displayName: `${rFile} (${wsName})`,
            description: desc,
            physicalPath: fullP,
            source: 'workspace',
            sourceLabel: wsName,
            workspaceName: wsName,
            isWorkspace: true,
            isGlobal: false,
            isProtected: false,
            isEnabled: true
          });
        }
      }

      // Customization directories in workspace (.agents, .agent, _agents, _agent)
      const customDirs = getWorkspaceCustomizationDirs(wsRoot);
      const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];

      for (const cDir of checkDirs) {
        const wsRulesDir = path.join(cDir, 'rules');
        if (fs.existsSync(wsRulesDir)) {
          try {
            const mdFiles = getMarkdownFilesRecursive(wsRulesDir);
            for (const item of mdFiles) {
              const normKey = path.normalize(item.fullPath).toLowerCase();
              if (seenRulePaths.has(normKey)) continue;
              seenRulePaths.add(normKey);

              let desc = '';
              try {
                const c = fs.readFileSync(item.fullPath, 'utf8');
                const fm = parseFrontmatter(c);
                desc = fm.description || '';
              } catch (e) {}

              const baseFolder = path.basename(cDir);
              const relNorm = item.relPath.replace(/\\/g, '/');
              allRules.push({
                id: `ws-${wsName}-${baseFolder}-${relNorm.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
                name: item.name,
                displayName: item.relPath !== item.name ? `${item.relPath} (${wsName})` : `${item.name} (${wsName})`,
                description: desc,
                physicalPath: item.fullPath,
                source: 'workspace',
                sourceLabel: wsName,
                workspaceName: wsName,
                isWorkspace: true,
                isGlobal: false,
                isProtected: false,
                isEnabled: true
              });
            }
          } catch (e) {
            logDebug(`Error scanning rules in ${wsRulesDir}: ${e.message}`);
          }
        }
      }
    }
  }

  // 4. Plugin rules
  if (plugins && plugins.length > 0) {
    for (const p of plugins) {
      if (p.rules && p.rules.length > 0) {
        for (const r of p.rules) {
          const normKey = path.normalize(r.physicalPath).toLowerCase();
          if (seenRulePaths.has(normKey)) continue;
          seenRulePaths.add(normKey);

          allRules.push({
            id: `plugin-${p.id}-${r.id}`,
            name: r.name,
            displayName: r.displayName || r.name,
            description: r.description || '',
            physicalPath: r.physicalPath,
            source: 'plugin',
            sourceLabel: p.displayName || p.name,
            pluginId: p.id,
            pluginDisplayName: p.displayName || p.name,
            isPlugin: true,
            isGlobal: false,
            isProtected: false,
            isEnabled: p.isEnabled
          });
        }
      }
    }
  }

  allRules.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return allRules;
}

// Scan all MCP servers across Global, Built-in, Workspaces, and Plugins
function scanAllMcpServers(workspaceRoots, plugins) {
  const allMcp = [];

  function parseMcpFile(filePath, source, sourceLabel, isEnabled = true, pluginId = null, isProtected = false, isBuiltin = false) {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (content && content.mcpServers && typeof content.mcpServers === 'object') {
        for (const [serverName, conf] of Object.entries(content.mcpServers)) {
          if (allMcp.some(m => m.name === serverName && m.physicalPath.toLowerCase() === filePath.toLowerCase())) {
            continue;
          }
          const isExplicitlyDisabled = conf.disabled === true || conf.enabled === false;
          const activeStatus = isEnabled && !isExplicitlyDisabled;
          allMcp.push({
            id: `${source}-${serverName}`,
            name: serverName,
            displayName: serverName,
            command: conf.command || '',
            args: Array.isArray(conf.args) ? conf.args : [],
            env: conf.env || {},
            serverUrl: conf.serverUrl || '',
            physicalPath: filePath,
            source: source,
            sourceLabel: sourceLabel,
            pluginId: pluginId,
            enabled: !isExplicitlyDisabled,
            isEnabled: activeStatus,
            isProtected: isProtected,
            isBuiltin: isBuiltin,
            isWorkspace: source === 'workspace',
            isPlugin: source === 'plugin'
          });
        }
      }
    } catch (e) {
      logDebug(`Error parsing MCP file ${filePath}: ${e.message}`);
    }
  }

  const homeDir = os.homedir();
  const ideMcpPath = path.join(getAntigravityIdePath(), 'mcp_config.json');
  const geminiConfigMcp = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');

  // 1. Antigravity IDE Global MCP configuration (user's global editor MCP config)
  parseMcpFile(ideMcpPath, 'global', 'Global', true, null, false, false);

  // 2. ~/.gemini/config/mcp_config.json (if distinct and exists)
  if (fs.existsSync(geminiConfigMcp) && geminiConfigMcp.toLowerCase() !== ideMcpPath.toLowerCase()) {
    parseMcpFile(geminiConfigMcp, 'global', 'Global', true, null, false, false);
  }

  // 3. Builtin / System level (only if actually in builtin folder)
  const builtinMcp = path.join(getBuiltinPath(), 'mcp_config.json');
  if (fs.existsSync(builtinMcp)) {
    parseMcpFile(builtinMcp, 'builtin', 'Built-in', true, null, true, true);
  }

  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsName = path.basename(wsRoot);
      const customDirs = getWorkspaceCustomizationDirs(wsRoot);
      const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];
      for (const cDir of checkDirs) {
        parseMcpFile(path.join(cDir, 'mcp_config.json'), 'workspace', wsName, true, null, false, false);
      }
      parseMcpFile(path.join(wsRoot, 'mcp_config.json'), 'workspace', wsName, true, null, false, false);
    }
  }

  if (plugins && plugins.length > 0) {
    for (const p of plugins) {
      const pPath = p.physicalPath || '';
      if (pPath) {
        parseMcpFile(path.join(pPath, 'mcp_config.json'), 'plugin', p.displayName || p.name, p.isEnabled, p.id, false, false);
      }
    }
  }

  allMcp.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return allMcp;
}

// Scan all Hooks across Global, Builtin, Workspaces, and Plugins
function scanAllHooks(workspaceRoots, plugins) {
  const allHooks = [];

  function parseHooksFile(filePath, source, sourceLabel, isPluginEnabled = true, pluginId = null, isProtected = false, isBuiltin = false) {
    if (!fs.existsSync(filePath)) return;
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (content && typeof content === 'object') {
        for (const [hookName, hookData] of Object.entries(content)) {
          if (typeof hookData !== 'object' || hookData === null) continue;
          
          const events = [];
          ['PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation', 'Stop'].forEach(ev => {
            if (hookData[ev]) events.push(ev);
          });

          let cmd = '';
          for (const ev of events) {
            const arr = hookData[ev];
            if (Array.isArray(arr) && arr.length > 0) {
              const item = arr[0];
              if (item.command) cmd = item.command;
              else if (Array.isArray(item.hooks) && item.hooks.length > 0 && item.hooks[0].command) {
                cmd = item.hooks[0].command;
              }
              if (cmd) break;
            }
          }

          const isHookActive = hookData.enabled !== false;
          allHooks.push({
            id: `${source}-${hookName}`,
            name: hookName,
            displayName: hookName,
            command: cmd,
            events: events,
            enabled: isHookActive,
            isHookActive: isHookActive,
            isEnabled: isPluginEnabled && isHookActive,
            physicalPath: filePath,
            source: source,
            sourceLabel: sourceLabel,
            pluginId: pluginId,
            isProtected: isProtected,
            isBuiltin: isBuiltin,
            isWorkspace: source === 'workspace',
            isPlugin: source === 'plugin'
          });
        }
      }
    } catch (e) {
      logDebug(`Error parsing hooks file ${filePath}: ${e.message}`);
    }
  }

  const homeDir = os.homedir();
  parseHooksFile(path.join(homeDir, '.gemini', 'config', 'hooks.json'), 'global', 'Global', true, null, false, false);
  parseHooksFile(path.join(getBuiltinPath(), 'hooks.json'), 'builtin', 'Built-in', true, null, true, true);
  parseHooksFile(path.join(getAntigravityIdePath(), 'hooks.json'), 'builtin', 'IDE Config', true, null, true, true);

  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsName = path.basename(wsRoot);
      const customDirs = getWorkspaceCustomizationDirs(wsRoot);
      const checkDirs = customDirs.length > 0 ? customDirs : [path.join(wsRoot, '.agents')];
      for (const cDir of checkDirs) {
        parseHooksFile(path.join(cDir, 'hooks.json'), 'workspace', wsName, true, null, false, false);
      }
      parseHooksFile(path.join(wsRoot, 'hooks.json'), 'workspace', wsName, true, null, false, false);
    }
  }

  if (plugins && plugins.length > 0) {
    for (const p of plugins) {
      const pPath = p.physicalPath || '';
      if (pPath) {
        parseHooksFile(path.join(pPath, 'hooks.json'), 'plugin', p.displayName || p.name, p.isEnabled, p.id, false, false);
      }
    }
  }

  allHooks.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return allHooks;
}

// Compute statistics counts
function getContextStats(activePlugins, activeSkills, activeWorkflows, allRules, allMcp, allHooks) {
  let activePluginsCount = activePlugins.filter(p => p.isEnabled).length;
  let totalPluginsCount = activePlugins.length;

  let skillsCount = activeSkills.filter(s => s.isEnabled).length;
  let workflowsCount = activeWorkflows.filter(w => w.isEnabled).length;
  let rulesCount = (allRules || []).filter(r => r.isEnabled).length;
  let mcpCount = (allMcp || []).filter(m => m.isEnabled).length;
  let hooksCount = (allHooks || []).filter(h => h.isEnabled).length;

  return {
    activePlugins: activePluginsCount,
    totalPlugins: totalPluginsCount,
    skills: skillsCount,
    rules: rulesCount,
    workflows: workflowsCount,
    mcp: mcpCount,
    hooks: hooksCount
  };
}

// Collect all connected external folders from plugins.json and skills.json (global and workspaces)
function getConnectedFolders(workspaceRoots = []) {
  const list = [];
  const globalPluginsJson = getGlobalPluginsJsonPath();
  const globalSkillsJson = getGlobalSkillsJsonPath();

  if (fs.existsSync(globalPluginsJson)) {
    const data = readJsonConfigFile(globalPluginsJson);
    const normDefault = path.normalize(getActivePluginsPath()).toLowerCase();
    (data.entries || []).forEach(e => {
      const p = typeof e === 'string' ? e : e.path;
      if (p) {
        const resolved = resolveJsonConfigPath(p, path.dirname(globalPluginsJson));
        if (path.normalize(resolved).toLowerCase() === normDefault) {
          // Default global plugins folder is not an external repository chip
          return;
        }
        if (fs.existsSync(path.join(resolved, 'plugin.json')) || fs.existsSync(path.join(resolved, 'SKILL.md'))) {
          // Individual item override, not a repository folder
          return;
        }
        const fName = path.basename(resolved) || p;
        list.push({
          type: 'plugin',
          category: 'plugins',
          scope: 'global',
          sourceFile: globalPluginsJson,
          configuredPath: p,
          path: resolved,
          physicalPath: resolved,
          exists: fs.existsSync(resolved),
          label: fName,
          folderName: fName
        });
      }
    });
  }

  if (fs.existsSync(globalSkillsJson)) {
    const data = readJsonConfigFile(globalSkillsJson);
    (data.entries || []).forEach(e => {
      const p = typeof e === 'string' ? e : e.path;
      if (p) {
        const resolved = resolveJsonConfigPath(p, path.dirname(globalSkillsJson));
        if (fs.existsSync(path.join(resolved, 'plugin.json')) || fs.existsSync(path.join(resolved, 'SKILL.md'))) {
          // Individual item override, not a repository folder
          return;
        }
        const fName = path.basename(resolved) || p;
        list.push({
          type: 'skill',
          category: 'skills',
          scope: 'global',
          sourceFile: globalSkillsJson,
          configuredPath: p,
          path: resolved,
          physicalPath: resolved,
          exists: fs.existsSync(resolved),
          label: fName,
          folderName: fName
        });
      }
    });
  }

  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsName = path.basename(wsRoot);
      const wsPluginsJson = getWorkspacePluginConfigPath(wsRoot);
      const wsSkillsJson = getWorkspaceSkillConfigPath(wsRoot);

      if (fs.existsSync(wsPluginsJson)) {
        const data = readJsonConfigFile(wsPluginsJson);
        (data.entries || []).forEach(e => {
          const p = typeof e === 'string' ? e : e.path;
          if (p) {
            const resolved = resolveJsonConfigPath(p, wsRoot);
            if (fs.existsSync(path.join(resolved, 'plugin.json')) || fs.existsSync(path.join(resolved, 'SKILL.md'))) {
              // Individual item override in workspace, not a repository folder
              return;
            }
            const fName = path.basename(resolved) || p;
            list.push({
              type: 'plugin',
              category: 'plugins',
              scope: 'workspace',
              workspaceName: wsName,
              workspaceRoot: wsRoot,
              sourceFile: wsPluginsJson,
              configuredPath: p,
              path: resolved,
              physicalPath: resolved,
              exists: fs.existsSync(resolved),
              label: `${wsName}: ${fName}`,
              folderName: fName
            });
          }
        });
      }

      if (fs.existsSync(wsSkillsJson)) {
        const data = readJsonConfigFile(wsSkillsJson);
        (data.entries || []).forEach(e => {
          const p = typeof e === 'string' ? e : e.path;
          if (p) {
            const resolved = resolveJsonConfigPath(p, wsRoot);
            if (fs.existsSync(path.join(resolved, 'plugin.json')) || fs.existsSync(path.join(resolved, 'SKILL.md'))) {
              // Individual item override in workspace, not a repository folder
              return;
            }
            const fName = path.basename(resolved) || p;
            list.push({
              type: 'skill',
              category: 'skills',
              scope: 'workspace',
              workspaceName: wsName,
              workspaceRoot: wsRoot,
              sourceFile: wsSkillsJson,
              configuredPath: p,
              path: resolved,
              physicalPath: resolved,
              exists: fs.existsSync(resolved),
              label: `${wsName}: ${fName}`,
              folderName: fName
            });
          }
        });
      }
    }
  }

  return list;
}

let _cachedLiveContext = null;

function scanIdeLiveContext(forceRefresh = false) {
  try {
    const now = Date.now();
    if (!forceRefresh && _cachedLiveContext && (now - (_cachedLiveContext.timestamp || 0) < 2000)) {
      return _cachedLiveContext.result;
    }

    const candidateDirs = [
      path.join(os.homedir(), '.gemini', 'antigravity-ide', 'conversations'),
      path.join(os.homedir(), '.gemini', 'antigravity', 'conversations')
    ];

    let latestFile = null;
    let maxMtime = 0;

    for (const convDir of candidateDirs) {
      if (!fs.existsSync(convDir)) continue;
      try {
        const files = fs.readdirSync(convDir);
        for (const file of files) {
          if (!file.endsWith('.db')) continue;
          const fullPath = path.join(convDir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > maxMtime) {
              maxMtime = stat.mtimeMs;
              latestFile = fullPath;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    if (!latestFile) {
      return { available: false };
    }

    if (!forceRefresh && _cachedLiveContext && _cachedLiveContext.dbPath === latestFile && _cachedLiveContext.mtimeMs === maxMtime) {
      _cachedLiveContext.timestamp = now;
      return _cachedLiveContext.result;
    }

    const stat = fs.statSync(latestFile);
    const readSize = Math.min(stat.size, 4 * 1024 * 1024);
    let fd = null;
    let buf = null;
    try {
      fd = fs.openSync(latestFile, 'r');
      buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch (_) {}
      }
    }

    const content = buf ? buf.toString('utf8') : '';

    const pluginMatches = [...content.matchAll(/#\s+([a-zA-Z0-9_-]+)\s+\(file:\/\/\/[^\n\r]*?\/plugins\/([a-zA-Z0-9_-]+)\)/g)];
    const activePlugins = [...new Set(pluginMatches.map(m => m[1]))];

    const skillMatches = [...content.matchAll(/-\s+([a-zA-Z0-9_-]+)\s+\([^)]*?SKILL\.md\)/g)];
    const activeSkills = [...new Set(skillMatches.map(m => m[1]))];

    const result = {
      available: true,
      dbPath: latestFile,
      conversationId: path.basename(latestFile, '.db'),
      updatedAt: maxMtime,
      activePlugins,
      skillsCount: activeSkills.length,
      skillsSample: activeSkills.slice(0, 10)
    };

    _cachedLiveContext = {
      dbPath: latestFile,
      mtimeMs: maxMtime,
      timestamp: now,
      result
    };

    return result;
  } catch (err) {
    logDebug(`scanIdeLiveContext error: ${err.message}`);
    return { available: false, error: err.message };
  }
}

module.exports = {
  scanConflicts,
  scanPlugins,
  scanLocalPlugins,
  scanSkills,
  scanLocalSkills,
  scanBuiltinSkills,
  scanWorkflows,
  scanLocalWorkflows,
  scanBuiltinWorkflows,
  scanAllRules,
  scanAllMcpServers,
  scanAllHooks,
  getContextStats,
  getConnectedFolders,
  scanIdeLiveContext
};

