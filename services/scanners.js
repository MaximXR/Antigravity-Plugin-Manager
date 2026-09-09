const vscode = require('vscode');
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
  getAntigravityIdePath
} = require('./fsUtils');

// Scan conflicts between active and storage folders
function scanConflicts(activePath, storagePath, category) {
  const conflicts = [];
  if (!fs.existsSync(activePath) || !fs.existsSync(storagePath)) return conflicts;

  try {
    const activeItems = fs.readdirSync(activePath, { withFileTypes: true });
    for (const item of activeItems) {
      const name = item.name;
      const activeItemPath = path.join(activePath, name);

      // Ignore if active item is a symlink or directory junction
      try {
        const lstatActive = fs.lstatSync(activeItemPath);
        if (lstatActive.isSymbolicLink()) {
          continue;
        }
      } catch (e) {}

      const storageItemPath = path.join(storagePath, name);
      
      // Ignore if storage item is a symlink or directory junction (means it is active and linked to activePath)
      try {
        const lstatStorage = fs.lstatSync(storageItemPath);
        if (lstatStorage.isSymbolicLink()) {
          continue;
        }
      } catch (e) {}

      let existsInStorage = false;
      try {
        existsInStorage = fs.existsSync(storageItemPath);
      } catch (e) {}
      if (existsInStorage) {
        let isIdentical = false;
        const stat = fs.statSync(activeItemPath);
        if (stat.isDirectory()) {
          isIdentical = areDirsIdentical(activeItemPath, storageItemPath);
        } else {
          isIdentical = areFilesIdentical(activeItemPath, storageItemPath);
        }
        
        if (isIdentical) {
          continue;
        }

        conflicts.push({
          id: name,
          category: category,
          isDir: stat.isDirectory(),
          isIdentical: isIdentical,
          activePath: activeItemPath,
          storagePath: storageItemPath
        });
      }
    }
  } catch (e) {
    logDebug(`Error scanning conflicts for ${category}: ${e.message}`);
  }
  return conflicts;
}

// Scan global plugins
function scanPlugins(activePath, storagePath) {
  const plugins = [];
  const seenIds = new Set();

  logDebug(`scanPlugins: activePath=${activePath}, storagePath=${storagePath}`);

  // 1. Scan storage folder (disabled plugins)
  if (fs.existsSync(storagePath)) {
    try {
      const items = fs.readdirSync(storagePath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const pluginDir = path.join(storagePath, item.name);
          
          let isSymlink = false;
          try {
            const lstat = fs.lstatSync(pluginDir);
            isSymlink = lstat.isSymbolicLink();
          } catch (e) {}

          if (isSymlink) {
            logDebug(`Skipping junction in storage: ${pluginDir} (it points to active)`);
            continue;
          }

          const pluginInfo = readPluginInfo(pluginDir);
          pluginInfo.id = item.name;
          pluginInfo.isEnabled = false;
          pluginInfo.physicalPath = pluginDir;
          plugins.push(pluginInfo);
          seenIds.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning storage plugins: ${e.message}`);
    }
  }

  // Check backwards compatibility with storage root folder
  const legacyStorageRoot = path.dirname(storagePath);
  if (fs.existsSync(legacyStorageRoot)) {
    try {
      const legacyItems = fs.readdirSync(legacyStorageRoot, { withFileTypes: true });
      for (const item of legacyItems) {
        if (item.isDirectory() && item.name !== 'plugins' && item.name !== 'skills' && item.name !== 'workflows' && !seenIds.has(item.name)) {
          const pluginDir = path.join(legacyStorageRoot, item.name);
          const pluginJsonPath = path.join(pluginDir, 'plugin.json');
          if (fs.existsSync(pluginJsonPath)) {
            let isSymlink = false;
            try {
              const lstat = fs.lstatSync(pluginDir);
              isSymlink = lstat.isSymbolicLink();
            } catch (e) {}

            if (!isSymlink) {
              const pluginInfo = readPluginInfo(pluginDir);
              pluginInfo.id = item.name;
              pluginInfo.isEnabled = false;
              pluginInfo.physicalPath = pluginDir;
              plugins.push(pluginInfo);
              seenIds.add(item.name);
            }
          }
        }
      }
    } catch (e) {
      logDebug(`Error scanning legacy storage plugins: ${e.message}`);
    }
  }

  // Create active path if it doesn't exist
  if (!fs.existsSync(activePath)) {
    try {
      fs.mkdirSync(activePath, { recursive: true });
    } catch (e) {}
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

          const idx = plugins.findIndex(p => p.id === item.name);
          if (idx !== -1) {
            plugins[idx] = pluginInfo;
          } else {
            plugins.push(pluginInfo);
          }
          seenIds.add(item.name);
        }
      }
    } catch (e) {
      logDebug(`Error scanning active plugins: ${e.message}`);
    }
  }

  plugins.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return plugins;
}

// Scan local workspace plugins
function scanLocalPlugins() {
  const localPlugins = [];
  if (!vscode.workspace.workspaceFolders) return localPlugins;
  
  for (const folder of vscode.workspace.workspaceFolders) {
    const wsRoot = folder.uri.fsPath;
    const wsPluginsPath = path.join(wsRoot, '.agents', 'plugins');
    if (fs.existsSync(wsPluginsPath)) {
      try {
        const items = fs.readdirSync(wsPluginsPath, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            const pluginDir = path.join(wsPluginsPath, item.name);
            const pluginInfo = readPluginInfo(pluginDir);
            pluginInfo.id = `local-${folder.name}-${item.name}`;
            pluginInfo.isEnabled = true;
            pluginInfo.isLocal = true;
            pluginInfo.workspaceName = folder.name;
            pluginInfo.physicalPath = pluginDir;
            localPlugins.push(pluginInfo);
          }
        }
      } catch (e) {
        logDebug(`Error scanning local plugins in ${folder.name}: ${e.message}`);
      }
    }
  }
  return localPlugins;
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
          if (getSkillMdPath(skillDir)) {
            const skillInfo = readSkillInfo(skillDir);
            skillInfo.id = item.name;
            skillInfo.isEnabled = false;
            skillInfo.physicalPath = skillDir;
            skills.push(skillInfo);
            seenNames.add(item.name);
          }
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

        if (isDir && getSkillMdPath(activeItemPath)) {
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
            if (getSkillMdPath(skillDir)) {
              const skillInfo = readSkillInfo(skillDir);
              skillInfo.id = `local-${folder.name}-${item.name}`;
              skillInfo.isEnabled = true;
              skillInfo.isLocal = true;
              skillInfo.workspaceName = folder.name;
              skillInfo.physicalPath = skillDir;
              localSkills.push(skillInfo);
            }
          }
        }
      } catch (e) {
        logDebug(`Error scanning local skills in ${folder.name}: ${e.message}`);
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

  // 1. Global rules: strictly the 2 files in ~/.gemini
  const homeDir = os.homedir();
  const globalGemini = path.join(homeDir, '.gemini', 'GEMINI.md');
  const globalAgents = path.join(homeDir, '.gemini', 'AGENTS.md');

  if (fs.existsSync(globalGemini)) {
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
        const files = fs.readdirSync(bDir, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile() && f.name.endsWith('.md')) {
            const fullP = path.join(bDir, f.name);
            let desc = '';
            try {
              const c = fs.readFileSync(fullP, 'utf8');
              const fm = parseFrontmatter(c);
              desc = fm.description || 'Built-in Antigravity rule';
            } catch (e) {}
            allRules.push({
              id: `builtin-${f.name}`,
              name: f.name,
              displayName: `${f.name} (Built-in)`,
              description: desc,
              physicalPath: fullP,
              source: 'builtin',
              sourceLabel: 'Built-in',
              isBuiltin: true,
              isProtected: true,
              isEnabled: true
            });
          }
        }
      } catch (e) {}
    }
  }

  // 3. Workspace project rules
  if (workspaceRoots && workspaceRoots.length > 0) {
    for (const wsRoot of workspaceRoots) {
      const wsName = path.basename(wsRoot);

      // Root GEMINI.md in workspace
      const wsGemini = path.join(wsRoot, 'GEMINI.md');
      if (fs.existsSync(wsGemini)) {
        let desc = '';
        try {
          const content = fs.readFileSync(wsGemini, 'utf8');
          const fm = parseFrontmatter(content);
          desc = fm.description || `Project rule in ${wsName}`;
        } catch (e) {}
        allRules.push({
          id: `ws-${wsName}-gemini-md`,
          name: 'GEMINI.md',
          displayName: `GEMINI.md (${wsName})`,
          description: desc,
          physicalPath: wsGemini,
          source: 'workspace',
          sourceLabel: wsName,
          workspaceName: wsName,
          isWorkspace: true,
          isGlobal: false,
          isProtected: false,
          isEnabled: true
        });
      }

      // Root AGENTS.md in workspace
      const wsAgents = path.join(wsRoot, 'AGENTS.md');
      if (fs.existsSync(wsAgents)) {
        let desc = '';
        try {
          const content = fs.readFileSync(wsAgents, 'utf8');
          const fm = parseFrontmatter(content);
          desc = fm.description || `Project rule in ${wsName}`;
        } catch (e) {}
        allRules.push({
          id: `ws-${wsName}-agents-md`,
          name: 'AGENTS.md',
          displayName: `AGENTS.md (${wsName})`,
          description: desc,
          physicalPath: wsAgents,
          source: 'workspace',
          sourceLabel: wsName,
          workspaceName: wsName,
          isWorkspace: true,
          isGlobal: false,
          isProtected: false,
          isEnabled: true
        });
      }

      // .agents/rules/*.md
      const wsRulesDir = path.join(wsRoot, '.agents', 'rules');
      if (fs.existsSync(wsRulesDir)) {
        try {
          const files = fs.readdirSync(wsRulesDir, { withFileTypes: true });
          for (const f of files) {
            if (f.isFile() && f.name.endsWith('.md')) {
              const fullP = path.join(wsRulesDir, f.name);
              let desc = '';
              try {
                const c = fs.readFileSync(fullP, 'utf8');
                const fm = parseFrontmatter(c);
                desc = fm.description || '';
              } catch (e) {}
              allRules.push({
                id: `ws-${wsName}-${f.name}`,
                name: f.name,
                displayName: f.name,
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
        } catch (e) {}
      }
    }
  }

  // 4. Plugin rules
  if (plugins && plugins.length > 0) {
    for (const p of plugins) {
      if (p.rules && p.rules.length > 0) {
        for (const r of p.rules) {
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
      parseMcpFile(path.join(wsRoot, '.agents', 'mcp_config.json'), 'workspace', wsName, true, null, false, false);
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
      parseHooksFile(path.join(wsRoot, '.agents', 'hooks.json'), 'workspace', wsName, true, null, false, false);
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
  getContextStats
};
