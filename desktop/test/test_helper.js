/**
 * test_helper.js — Shared Test Harness and Sandbox for E2E Tests
 * Provides isolated file system environments, mock vscode shim,
 * service loader, IPC simulator, and assertion utilities.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

// Save original os.homedir for sandboxing
const originalHomedir = os.homedir;

// Global mock state for vscode
const mockVscodeState = {
  activeLanguage: 'en',
  storagePath: null,
  workspaceFolders: []
};

// Hook require('vscode') to provide headless shim
const originalResolveFilename = Module._resolveFilename;
let vscodeHookInstalled = false;

function setupVscodeShim() {
  if (vscodeHookInstalled) return;

  const mockVscode = {
    workspace: {
      getConfiguration: (section) => ({
        get: (key, defaultValue) => {
          if (key === 'language') return mockVscodeState.activeLanguage || defaultValue;
          if (key === 'storagePath') return mockVscodeState.storagePath || defaultValue;
          if (key === 'statusBar.showSkills') return true;
          if (key === 'statusBar.showRules') return true;
          if (key === 'statusBar.format') return 'icons';
          if (key === 'statusBar.iconSet') return 'extensions_book';
          return defaultValue;
        },
        update: (key, value) => {
          if (key === 'language') mockVscodeState.activeLanguage = value;
          if (key === 'storagePath') mockVscodeState.storagePath = value;
          return Promise.resolve();
        }
      }),
      get workspaceFolders() {
        return mockVscodeState.workspaceFolders.map((f) => ({
          name: typeof f === 'string' ? path.basename(f) : f.name,
          uri: { fsPath: typeof f === 'string' ? f : f.fsPath }
        }));
      },
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose: () => {} }),
        onDidCreate: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        dispose: () => {}
      }),
      fs: {
        readFile: async () => Buffer.from(''),
        writeFile: async () => {}
      }
    },
    window: {
      showInformationMessage: async (msg) => msg,
      showWarningMessage: async (msg, ...items) => {
        const buttons = items.filter(i => typeof i === 'string');
        return buttons.length > 0 ? buttons[0] : 'Да';
      },
      showErrorMessage: async (msg) => msg,
      showOpenDialog: async () => [],
      createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }),
      createStatusBarItem: () => ({ show: () => {}, hide: () => {}, dispose: () => {} })
    },
    env: {
      get language() {
        return mockVscodeState.activeLanguage || 'en';
      },
      openExternal: async () => true
    },
    Uri: {
      file: (p) => ({ fsPath: p, path: p, scheme: 'file', toString: () => 'file://' + p }),
      parse: (p) => ({ fsPath: p, path: p, scheme: 'file' })
    },
    commands: {
      executeCommand: async () => {}
    }
  };

  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'vscode') {
      return 'vscode-shim-mock';
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  require.cache['vscode-shim-mock'] = {
    id: 'vscode-shim-mock',
    filename: 'vscode-shim-mock',
    loaded: true,
    exports: mockVscode
  };

  vscodeHookInstalled = true;
}

// Ensure shim is active
setupVscodeShim();

/**
 * Load services from Desktop project if present, otherwise fall back to parent project
 */
function loadServices() {
  const desktopRoot = path.resolve(__dirname, '..');
  const parentRoot = path.resolve(desktopRoot, '..');

  let servicesDir = path.join(desktopRoot, 'services');
  let localesDir = path.join(desktopRoot, 'locales');
  let webviewDir = path.join(desktopRoot, 'webview');

  if (!fs.existsSync(servicesDir) || !fs.existsSync(path.join(servicesDir, 'fsUtils.js'))) {
    servicesDir = path.join(parentRoot, 'services');
  }
  if (!fs.existsSync(localesDir) || !fs.existsSync(path.join(localesDir, 'translations.js'))) {
    localesDir = path.join(parentRoot, 'locales');
  }
  if (!fs.existsSync(webviewDir) || !fs.existsSync(path.join(webviewDir, 'index.html'))) {
    webviewDir = path.join(parentRoot, 'webview');
  }

  const fsUtils = require(path.join(servicesDir, 'fsUtils.js'));
  // Ensure triggerIdeScannerFlush is present if not yet implemented
  if (typeof fsUtils.triggerIdeScannerFlush !== 'function') {
    fsUtils.triggerIdeScannerFlush = () => true;
  }

  const scanners = require(path.join(servicesDir, 'scanners.js'));
  const actions = require(path.join(servicesDir, 'actions.js'));
  let updater;
  try {
    updater = require(path.join(servicesDir, 'updater.js'));
  } catch (e) {
    updater = {
      parsePluginRepo: () => null,
      compareSemver: () => 0,
      checkPluginUpdate: async () => null,
      checkAllUpdates: async () => ({}),
      updatePlugin: async () => true
    };
  }
  const translations = require(path.join(localesDir, 'translations.js'));

  return {
    fsUtils,
    scanners,
    actions,
    updater,
    translations,
    paths: {
      servicesDir,
      localesDir,
      webviewDir,
      desktopRoot
    }
  };
}

/**
 * Creates an isolated sandboxed test environment in a temporary folder
 */
function createTestEnvironment(customOptions = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-desktop-test-'));
  const geminiDir = path.join(tmpDir, '.gemini');
  const configDir = path.join(geminiDir, 'config');
  const pluginsDir = path.join(configDir, 'plugins');
  const skillsDir = path.join(configDir, 'skills');
  const workflowsDir = path.join(configDir, 'global_workflows');
  const storageDir = path.join(configDir, 'plugins_storage');
  const antigravityIdeDir = path.join(geminiDir, 'antigravity-ide');
  const builtinDir = path.join(antigravityIdeDir, 'builtin');
  const projectDir = path.join(tmpDir, 'test-project');
  const projectAgentsDir = path.join(projectDir, '.agents');
  const projectRulesDir = path.join(projectAgentsDir, 'rules');
  const projectSkillsDir = path.join(projectAgentsDir, 'skills');
  const projectWorkflowsDir = path.join(projectAgentsDir, 'workflows');
  const externalLibDir = path.join(tmpDir, 'external-library');

  // Create directories
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(path.join(builtinDir, 'skills', 'agy-customizations'), { recursive: true });
  fs.mkdirSync(projectRulesDir, { recursive: true });
  fs.mkdirSync(projectSkillsDir, { recursive: true });
  fs.mkdirSync(projectWorkflowsDir, { recursive: true });
  fs.mkdirSync(externalLibDir, { recursive: true });

  // Initial standard config files
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ plugins: {} }, null, 2), 'utf8');
  fs.writeFileSync(path.join(configDir, 'plugins.json'), JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(configDir, 'skills.json'), JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(configDir, 'hooks.json'), JSON.stringify({ hooks: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(antigravityIdeDir, 'mcp_config.json'), JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');

  // Protected system rules
  fs.writeFileSync(path.join(geminiDir, 'GEMINI.md'), '# System GEMINI Rule\nAlways active.\n', 'utf8');
  fs.writeFileSync(path.join(geminiDir, 'AGENTS.md'), '# System AGENTS Rule\nProtected system file.\n', 'utf8');

  // Builtin skill
  fs.writeFileSync(
    path.join(builtinDir, 'skills', 'agy-customizations', 'SKILL.md'),
    '---\nname: agy-customizations\ndescription: Builtin customizations\n---\nBuiltin instructions\n',
    'utf8'
  );

  // Project .agents configs
  fs.writeFileSync(path.join(projectAgentsDir, 'plugins.json'), JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(projectAgentsDir, 'skills.json'), JSON.stringify({ entries: [], exclude: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(projectAgentsDir, 'hooks.json'), JSON.stringify({ hooks: [] }, null, 2), 'utf8');
  fs.writeFileSync(path.join(projectAgentsDir, 'mcp_config.json'), JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');

  // Override os.homedir to point to sandbox
  os.homedir = () => tmpDir;
  mockVscodeState.workspaceFolders = [projectDir];

  const env = {
    tmpDir,
    geminiDir,
    configDir,
    pluginsDir,
    skillsDir,
    workflowsDir,
    storageDir,
    antigravityIdeDir,
    builtinDir,
    projectDir,
    projectAgentsDir,
    projectRulesDir,
    projectSkillsDir,
    projectWorkflowsDir,
    externalLibDir,

    createPlugin(name, options = {}) {
      const targetDir = options.targetDir || pluginsDir;
      const pluginFolder = path.join(targetDir, name);
      fs.mkdirSync(pluginFolder, { recursive: true });

      const manifest = {
        name,
        displayName: options.displayName || name,
        description: options.description || `Test plugin ${name}`,
        version: options.version || '1.0.0',
        author: options.author || 'Tester',
        disabled: options.disabled === true
      };
      if (options.repository) manifest.repository = options.repository;

      fs.writeFileSync(path.join(pluginFolder, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');

      // Embedded skills
      if (options.skills) {
        options.skills.forEach((s) => {
          const sFolder = path.join(pluginFolder, 'skills', s.name);
          fs.mkdirSync(sFolder, { recursive: true });
          fs.writeFileSync(
            path.join(sFolder, 'SKILL.md'),
            `---\nname: ${s.name}\ndescription: ${s.description || 'Plugin skill'}\n---\nInstructions\n`,
            'utf8'
          );
        });
      }

      // Embedded rules
      if (options.rules) {
        const rFolder = path.join(pluginFolder, 'rules');
        fs.mkdirSync(rFolder, { recursive: true });
        options.rules.forEach((r) => {
          fs.writeFileSync(path.join(rFolder, `${r.name}.md`), `# ${r.name}\n${r.content || 'Content'}\n`, 'utf8');
        });
      }

      // Embedded hooks
      if (options.hooks) {
        fs.writeFileSync(path.join(pluginFolder, 'hooks.json'), JSON.stringify({ hooks: options.hooks }, null, 2), 'utf8');
      }

      // Embedded MCP
      if (options.mcpServers) {
        fs.writeFileSync(path.join(pluginFolder, 'mcp_config.json'), JSON.stringify({ mcpServers: options.mcpServers }, null, 2), 'utf8');
      }

      return { folder: pluginFolder, manifest };
    },

    createSkill(name, options = {}) {
      const targetDir = options.targetDir || skillsDir;
      const skillFolder = path.join(targetDir, name);
      fs.mkdirSync(skillFolder, { recursive: true });

      const desc = options.description || `Test skill ${name}`;
      const content = `---\nname: ${name}\ndescription: ${desc}\n---\n# ${name}\nSteps and instructions.\n`;
      fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), content, 'utf8');
      return { folder: skillFolder, name, description: desc };
    },

    createWorkflow(name, options = {}) {
      const targetDir = options.targetDir || workflowsDir;
      fs.mkdirSync(targetDir, { recursive: true });
      const filePath = path.join(targetDir, `${name}.md`);
      fs.writeFileSync(filePath, `# Workflow: ${name}\n${options.content || 'Steps'}\n`, 'utf8');
      return { filePath, name };
    },

    createRule(name, options = {}) {
      const targetDir = options.targetDir || projectRulesDir;
      fs.mkdirSync(targetDir, { recursive: true });
      const filePath = path.join(targetDir, `${name}.md`);
      fs.writeFileSync(filePath, `# Rule: ${name}\n${options.content || 'Rule instructions'}\n`, 'utf8');
      return { filePath, name };
    },

    createMcpServer(name, config = {}, scope = 'global') {
      const targetFile = scope === 'project'
        ? path.join(projectAgentsDir, 'mcp_config.json')
        : path.join(antigravityIdeDir, 'mcp_config.json');

      let current = {};
      try {
        current = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      } catch (e) {}
      if (!current.mcpServers) current.mcpServers = {};
      current.mcpServers[name] = {
        command: config.command || 'node',
        args: config.args || [],
        disabled: config.disabled === true
      };
      fs.writeFileSync(targetFile, JSON.stringify(current, null, 2), 'utf8');
      return current.mcpServers[name];
    },

    createHook(name, config = {}, scope = 'global') {
      const targetFile = scope === 'project'
        ? path.join(projectAgentsDir, 'hooks.json')
        : path.join(configDir, 'hooks.json');

      let current = {};
      try {
        current = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      } catch (e) {}
      if (typeof current !== 'object' || current === null || Array.isArray(current)) current = {};

      const hookObj = {
        PreToolUse: [{ command: config.command || 'echo hook' }],
        event: config.event || 'PreToolUse',
        enabled: config.enabled !== false
      };
      current[name] = hookObj;
      fs.writeFileSync(targetFile, JSON.stringify(current, null, 2), 'utf8');
      return hookObj;
    },

    cleanup() {
      os.homedir = originalHomedir;
      mockVscodeState.workspaceFolders = [];
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Retry once on Windows file lock
        try {
          setTimeout(() => fs.rmSync(tmpDir, { recursive: true, force: true }), 100);
        } catch (e2) {}
      }
    }
  };

  return env;
}

/**
 * Collect all data using service scanners
 */
function collectContextData(env, services = null) {
  const s = services || loadServices();
  const activePluginsPath = env.pluginsDir;
  const activeSkillsPath = env.skillsDir;
  const activeWorkflowsPath = env.workflowsDir;
  const workspaceRoots = [env.projectDir];

  const globalPlugins = s.scanners.scanPlugins(activePluginsPath, workspaceRoots);
  const seenPluginPaths = new Set(globalPlugins.map((p) => path.normalize(p.physicalPath).toLowerCase()));
  const localPlugins = s.scanners.scanLocalPlugins(workspaceRoots, seenPluginPaths);
  const plugins = [...globalPlugins, ...localPlugins];

  const builtinSkills = s.scanners.scanBuiltinSkills();
  const globalSkills = s.scanners.scanSkills(activeSkillsPath, workspaceRoots);
  const seenSkillPaths = new Set([
    ...builtinSkills.map((sk) => path.normalize(sk.physicalPath).toLowerCase()),
    ...globalSkills.map((sk) => path.normalize(sk.physicalPath).toLowerCase())
  ]);
  const localSkills = s.scanners.scanLocalSkills(workspaceRoots, seenSkillPaths);

  const pluginSkills = [];
  plugins.forEach((p) => {
    if (p.skills && p.skills.length > 0) {
      p.skills.forEach((sk) => {
        pluginSkills.push({
          ...sk,
          id: `plugin-${p.id}-${sk.id}`,
          pluginId: p.id,
          pluginName: p.displayName || p.name,
          isPlugin: true,
          isEnabled: p.isEnabled
        });
      });
    }
  });
  const skills = [...globalSkills, ...localSkills, ...builtinSkills, ...pluginSkills];

  const builtinWorkflows = s.scanners.scanBuiltinWorkflows();
  const globalWorkflows = s.scanners.scanWorkflows(activeWorkflowsPath);
  const localWorkflows = s.scanners.scanLocalWorkflows(workspaceRoots);
  const pluginWorkflows = [];
  plugins.forEach((p) => {
    if (p.workflows && p.workflows.length > 0) {
      p.workflows.forEach((w) => {
        pluginWorkflows.push({
          ...w,
          id: `plugin-${p.id}-${w.id}`,
          pluginId: p.id,
          pluginName: p.displayName || p.name,
          isPlugin: true,
          isEnabled: p.isEnabled
        });
      });
    }
  });
  const workflows = [...globalWorkflows, ...localWorkflows, ...builtinWorkflows, ...pluginWorkflows];

  const rules = s.scanners.scanAllRules(workspaceRoots, plugins);
  const mcpServers = s.scanners.scanAllMcpServers(workspaceRoots, plugins);
  const hooks = s.scanners.scanAllHooks(workspaceRoots, plugins);
  const stats = s.scanners.getContextStats(plugins, skills, workflows, rules, mcpServers, hooks);
  const connectedFolders = s.scanners.getConnectedFolders(workspaceRoots);

  return {
    plugins,
    skills,
    workflows,
    rules,
    mcpServers,
    hooks,
    stats,
    connectedFolders,
    conflicts: [],
    workspaceFolders: [{ name: 'test-project', fsPath: env.projectDir }]
  };
}

/**
 * IPC Simulator: routes messages through service actions and returns emitted events
 */
async function simulateIpc(env, message) {
  const services = loadServices();
  const emitted = [];

  function sendToRenderer(msg) {
    emitted.push(msg);
  }

  const cmd = message.command;

  switch (cmd) {
    case 'init':
    case 'ready':
    case 'refresh': {
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'togglePluginGlobal': {
      await services.actions.toggleItem(
        null,
        null,
        message.id,
        message.enable,
        'ru',
        'plugin',
        message.physicalPath
      );
      sendToRenderer({ command: 'syncStatus', state: 'synced', etaMs: 0, skillsCount: 0 });
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'togglePluginProject': {
      await services.actions.togglePluginProject(
        message.workspaceRoot || env.projectDir,
        message.physicalPath,
        message.id,
        message.action,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'toggleSkillGlobal': {
      await services.actions.toggleSkillGlobal(
        message.id,
        message.enable,
        'ru',
        message.altName,
        message.physicalPath
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'toggleSkillProject': {
      await services.actions.toggleSkillProject(
        message.workspaceRoot || env.projectDir,
        message.physicalPath,
        message.id,
        message.action,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'toggleMcpServer': {
      await services.actions.toggleMcpServer(
        message.physicalPath,
        message.serverName,
        message.enabled,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'toggleHook': {
      await services.actions.toggleHook(
        message.physicalPath,
        message.hookName,
        message.enabled,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'deleteMcpServer': {
      await services.actions.deleteMcpServer(
        message.physicalPath,
        message.serverName,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'deleteHook': {
      await services.actions.deleteHook(
        message.physicalPath,
        message.hookName,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'moveMcp':
    case 'moveMcpServer': {
      await services.actions.moveMcpServer(
        message.serverName,
        message.physicalPath,
        message.targetPath,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'moveHook': {
      await services.actions.moveHook(
        message.hookName,
        message.physicalPath,
        message.targetPath,
        'ru'
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'connectFolder':
    case 'addCustomFolder': {
      const targetConfig = message.type === 'skills'
        ? services.fsUtils.getGlobalSkillsJsonPath()
        : services.fsUtils.getGlobalPluginsJsonPath();
      services.fsUtils.addEntryToJsonConfig(targetConfig, message.folderPath);
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'disconnectFolder':
    case 'removeCustomFolder': {
      const targetConfig = message.type === 'skills'
        ? services.fsUtils.getGlobalSkillsJsonPath()
        : services.fsUtils.getGlobalPluginsJsonPath();
      services.fsUtils.removeEntryFromJsonConfig(targetConfig, message.folderPath);
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'createItem': {
      await services.actions.createItem({
        category: message.category,
        targetType: message.targetType || (message.workspaceRoot ? 'workspace' : 'global'),
        targetId: message.targetId || message.workspaceRoot || env.projectDir,
        name: message.name,
        displayName: message.displayName || message.name,
        description: message.description || '',
        activePluginsPath: env.pluginsDir,
        activeSkillsPath: env.skillsDir,
        activeWorkflowsPath: env.workflowsDir
      }, 'ru');
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'deleteItem': {
      await services.actions.deleteItem(
        message.category,
        message.id,
        message.displayName || message.id,
        message.physicalPath,
        'ru',
        env.skillsDir
      );
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'editPluginMetadata': {
      services.fsUtils.writePluginMetaField(message.physicalPath || message.id, message.field, message.currentValue);
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'changeLanguage': {
      mockVscodeState.activeLanguage = message.language;
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'checkUpdates': {
      const data = collectContextData(env, services);
      const updatesState = await services.updater.checkAllUpdates(data.plugins || []);
      sendToRenderer({ command: 'updatesChecked', updatesState });
      break;
    }

    case 'softApplyIde': {
      services.fsUtils.touchAntigravityConfigs();
      sendToRenderer({ command: 'syncStatus', state: 'synced', etaMs: 0, skillsCount: 0 });
      const data = collectContextData(env, services);
      sendToRenderer({ command: 'init', ...data });
      break;
    }

    case 'clientError': {
      services.fsUtils.logDebug(`Client error: ${message.error} (${message.source}:${message.lineno})`);
      break;
    }

    case 'openItemFolder':
    case 'openFolder':
    case 'openActive':
    case 'openActiveSkills':
    case 'openStorage':
    case 'openAgentsFolder':
    case 'openFileInEditor':
    case 'openConfigJson':
    case 'openPluginsJson':
    case 'openSkillsJson': {
      sendToRenderer({ command: 'osActionExecuted', targetCommand: cmd, payload: message });
      break;
    }

    default: {
      sendToRenderer({ command: 'unknownCommand', received: cmd });
      break;
    }
  }

  return {
    responses: emitted,
    lastResponse: emitted[emitted.length - 1] || null
  };
}

/**
 * Hydrate HTML template with dictionary translations and active language
 */
function hydrateTemplate(htmlTemplate, lang, translationsObj) {
  const dict = translationsObj[lang] || translationsObj['en'];
  let hydrated = htmlTemplate;

  // Replace lang attribute
  hydrated = hydrated.replace(/\{\{lang\}\}/g, lang);

  // Replace simple translation tokens {{key}}
  hydrated = hydrated.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    if (dict[key] !== undefined) {
      return dict[key];
    }
    // Check if key ends with Esc
    if (key.endsWith('Esc')) {
      const baseKey = key.slice(0, -3);
      if (dict[baseKey] !== undefined) {
        return dict[baseKey].replace(/"/g, '&quot;');
      }
    }
    return match;
  });

  return hydrated;
}

/**
 * Assertion Utilities
 */
function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message ? message + ' ' : ''}Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
  }
}

function assertNotEqual(actual, unexpected, message = '') {
  if (actual === unexpected) {
    throw new Error(`${message ? message + ' ' : ''}Expected value not to equal: ${JSON.stringify(unexpected)}`);
  }
}

function assertTrue(value, message = 'Expected true') {
  assertEqual(value, true, message);
}

function assertFalse(value, message = 'Expected false') {
  assertEqual(value, false, message);
}

function assertDeepEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message ? message + ' ' : ''}Deep equality mismatch.\nExpected:\n${expectedStr}\nActual:\n${actualStr}`);
  }
}

function assertContains(haystack, needle, message = '') {
  if (typeof haystack === 'string') {
    if (!haystack.includes(needle)) {
      throw new Error(`${message ? message + ' ' : ''}String does not contain "${needle}".`);
    }
  } else if (Array.isArray(haystack)) {
    if (!haystack.includes(needle)) {
      throw new Error(`${message ? message + ' ' : ''}Array does not contain ${JSON.stringify(needle)}.`);
    }
  } else {
    throw new Error(`assertContains target must be string or array.`);
  }
}

function assertNotContains(haystack, needle, message = '') {
  if (typeof haystack === 'string') {
    if (haystack.includes(needle)) {
      throw new Error(`${message ? message + ' ' : ''}String unexpectedly contains "${needle}".`);
    }
  } else if (Array.isArray(haystack)) {
    if (haystack.includes(needle)) {
      throw new Error(`${message ? message + ' ' : ''}Array unexpectedly contains ${JSON.stringify(needle)}.`);
    }
  }
}

function assertThrows(fn, errorMatcher, message = '') {
  let threw = false;
  let caughtError = null;
  try {
    fn();
  } catch (err) {
    threw = true;
    caughtError = err;
  }
  if (!threw) {
    throw new Error(`${message ? message + ' ' : ''}Expected function to throw, but it succeeded.`);
  }
  if (errorMatcher) {
    if (errorMatcher instanceof RegExp) {
      if (!errorMatcher.test(caughtError.message)) {
        throw new Error(`${message ? message + ' ' : ''}Error message "${caughtError.message}" did not match regex ${errorMatcher}`);
      }
    } else if (typeof errorMatcher === 'string') {
      if (!caughtError.message.includes(errorMatcher)) {
        throw new Error(`${message ? message + ' ' : ''}Error message "${caughtError.message}" did not contain "${errorMatcher}"`);
      }
    }
  }
}

function assertExists(filePath, message = '') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message ? message + ' ' : ''}File expected to exist: ${filePath}`);
  }
}

function assertNotExists(filePath, message = '') {
  if (fs.existsSync(filePath)) {
    throw new Error(`${message ? message + ' ' : ''}File expected NOT to exist: ${filePath}`);
  }
}

module.exports = {
  setupVscodeShim,
  loadServices,
  createTestEnvironment,
  collectContextData,
  simulateIpc,
  hydrateTemplate,
  assert,
  assertEqual,
  assertNotEqual,
  assertTrue,
  assertFalse,
  assertDeepEqual,
  assertContains,
  assertNotContains,
  assertThrows,
  assertExists,
  assertNotExists
};
