const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getTranslation } = require('../locales/translations');
const {
  logDebug,
  safeMoveDir,
  createLink,
  syncBackDir,
  twoWayMergeDirs,
  escapeJsString
} = require('./fsUtils');

// Generic toggle action (Enables or disables resource by physical move + junction, or link)
async function toggleItem(activePath, storagePath, itemId, enable, lang, category) {
  // Builtin protection: cannot toggle builtin items
  if (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin'))) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }

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

  const isDir = (category !== 'workflow');

  if (enable) {
    if (category === 'plugin') {
      // 1. If active is currently a symlink or junction, remove it
      let activeIsSym = false;
      try {
        const stats = fs.lstatSync(activeItemPath);
        activeIsSym = stats.isSymbolicLink();
      } catch (e) {}
      if (activeIsSym) {
        fs.unlinkSync(activeItemPath);
      }

      // 2. Storage check
      let storageIsSym = false;
      try {
        const st = fs.lstatSync(storageItemPath);
        storageIsSym = st.isSymbolicLink();
      } catch (e) {}

      if (storageIsSym) {
        // storage was already a symlink/junction pointing to active
      } else if (fs.existsSync(storageItemPath)) {
        if (fs.existsSync(activeItemPath)) {
          const backupPath = activeItemPath + '_bak_' + Date.now();
          fs.renameSync(activeItemPath, backupPath);
        }
        // Move real physical folder to active
        safeMoveDir(storageItemPath, activeItemPath);

        // Create junction in storage pointing to active
        try {
          if (os.platform() === 'win32') {
            fs.symlinkSync(activeItemPath, storageItemPath, 'junction');
          } else {
            fs.symlinkSync(activeItemPath, storageItemPath, 'dir');
          }
        } catch (jErr) {
          logDebug(`Could not create junction in storage: ${jErr.message}`);
        }
      } else {
        if (!fs.existsSync(activeItemPath)) {
          throw new Error(getTranslation('storagePathNotSet', lang));
        }
      }
    } else {
      if (fs.existsSync(storageItemPath)) {
        let existingIsSymlink = false;
        try {
          const stats = fs.lstatSync(activeItemPath);
          existingIsSymlink = stats.isSymbolicLink();
        } catch (e) {}

        if (existingIsSymlink) {
          fs.unlinkSync(activeItemPath);
        } else if (fs.existsSync(activeItemPath)) {
          const backupPath = activeItemPath + '_bak_' + Date.now();
          fs.renameSync(activeItemPath, backupPath);
        }

        try {
          createLink(storageItemPath, activeItemPath, isDir, category);
        } catch (err) {
          if (err.message === 'CROSS_DRIVE_FILE_LINK_FAILED') {
            fs.copyFileSync(storageItemPath, activeItemPath);
            const activeDrive = path.parse(activePath).root;
            const storageDrive = path.parse(storagePath).root;
            const warningMsg = getTranslation('workflowLinkWarning', lang)
              .replace('{activeDrive}', activeDrive.toUpperCase())
              .replace('{storageDrive}', storageDrive.toUpperCase());
            vscode.window.showWarningMessage(warningMsg);
          } else {
            throw err;
          }
        }
      } else {
        if (!fs.existsSync(activeItemPath)) {
          throw new Error(getTranslation('storagePathNotSet', lang));
        }
      }
    }
  } else {
    if (category === 'plugin') {
      // 1. If storage is a symlink/junction, remove it
      let storageIsSym = false;
      try {
        const st = fs.lstatSync(storageItemPath);
        storageIsSym = st.isSymbolicLink();
      } catch (e) {}
      if (storageIsSym) {
        fs.unlinkSync(storageItemPath);
      } else if (fs.existsSync(storageItemPath)) {
        const backupPath = storageItemPath + '_bak_' + Date.now();
        fs.renameSync(storageItemPath, backupPath);
      }

      // 2. Active directory
      let activeIsSym = false;
      try {
        const stats = fs.lstatSync(activeItemPath);
        activeIsSym = stats.isSymbolicLink();
      } catch (e) {}

      if (activeIsSym) {
        fs.unlinkSync(activeItemPath);
      } else if (fs.existsSync(activeItemPath)) {
        // Move real physical folder from active back to storage!
        safeMoveDir(activeItemPath, storageItemPath);
      }
    } else {
      let exists = false;
      let isSym = false;
      try {
        const stats = fs.lstatSync(activeItemPath);
        exists = true;
        isSym = stats.isSymbolicLink();
      } catch (e) {}

      if (exists) {
        if (isSym) {
          fs.unlinkSync(activeItemPath);
        } else {
          if (isDir) {
            if (category === 'skill') {
              syncBackDir(activeItemPath, storageItemPath);
              fs.rmSync(activeItemPath, { recursive: true, force: true });
            } else {
              if (fs.existsSync(storageItemPath)) {
                const backupPath = storageItemPath + '_bak_' + Date.now();
                fs.renameSync(storageItemPath, backupPath);
              }
              safeMoveDir(activeItemPath, storageItemPath);
            }
          } else {
            // It is a file (workflow)
            let isHardLinked = false;
            try {
              if (fs.existsSync(storageItemPath)) {
                const statActive = fs.statSync(activeItemPath);
                const statStorage = fs.statSync(storageItemPath);
                isHardLinked = (statActive.ino === statStorage.ino && statActive.dev === statStorage.dev);
              }
            } catch (e) {}

            if (!isHardLinked) {
              try {
                if (fs.existsSync(storageItemPath)) {
                  const statActive = fs.statSync(activeItemPath);
                  const statStorage = fs.statSync(storageItemPath);
                  if (statActive.mtimeMs > statStorage.mtimeMs) {
                    fs.copyFileSync(activeItemPath, storageItemPath);
                  }
                } else {
                  fs.copyFileSync(activeItemPath, storageItemPath);
                }
              } catch (e) {}
            }
            fs.unlinkSync(activeItemPath);
          }
        }
      }
    }
  }
}

// Toggle hook enabled flag directly in hooks.json
async function toggleHook(physicalPath, hookName, enabled, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content[hookName]) {
    content[hookName].enabled = enabled;
  } else if (content && content.hooks && Array.isArray(content.hooks)) {
    const item = content.hooks.find(h => (h.name === hookName || h.id === hookName));
    if (item) item.enabled = enabled;
  }
  fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
}

// Delete hook from hooks.json
async function deleteHook(physicalPath, hookName, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content[hookName]) {
    delete content[hookName];
  } else if (content && content.hooks && Array.isArray(content.hooks)) {
    content.hooks = content.hooks.filter(h => !(h.name === hookName || h.id === hookName));
  }
  fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
}

// Toggle MCP server enabled/disabled
async function toggleMcpServer(physicalPath, serverName, enabled, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content.mcpServers && content.mcpServers[serverName]) {
    if (enabled) {
      delete content.mcpServers[serverName].disabled;
    } else {
      content.mcpServers[serverName].disabled = true;
    }
    fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
  }
}

// Delete MCP server from mcp_config.json
async function deleteMcpServer(physicalPath, serverName, lang) {
  if (physicalPath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File not found: ${physicalPath}`);
  }
  const content = JSON.parse(fs.readFileSync(physicalPath, 'utf8'));
  if (content && content.mcpServers && content.mcpServers[serverName]) {
    delete content.mcpServers[serverName];
    fs.writeFileSync(physicalPath, JSON.stringify(content, null, 2), 'utf8');
  }
}

// Move MCP server between mcp_config.json files
async function moveMcpServer(serverName, sourcePath, targetPath, lang) {
  if (sourcePath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const srcContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!srcContent.mcpServers || !srcContent.mcpServers[serverName]) {
    throw new Error(`MCP server "${serverName}" not found in source.`);
  }
  const serverConfig = srcContent.mcpServers[serverName];

  // Target file
  let tgtContent = { mcpServers: {} };
  if (fs.existsSync(targetPath)) {
    try {
      tgtContent = JSON.parse(fs.readFileSync(targetPath, 'utf8')) || { mcpServers: {} };
      if (!tgtContent.mcpServers) tgtContent.mcpServers = {};
    } catch (e) {
      tgtContent = { mcpServers: {} };
    }
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  tgtContent.mcpServers[serverName] = serverConfig;
  delete srcContent.mcpServers[serverName];

  fs.writeFileSync(targetPath, JSON.stringify(tgtContent, null, 2), 'utf8');
  fs.writeFileSync(sourcePath, JSON.stringify(srcContent, null, 2), 'utf8');
}

// Move hook between hooks.json files
async function moveHook(hookName, sourcePath, targetPath, lang) {
  if (sourcePath.includes('builtin')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const srcContent = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!srcContent[hookName]) {
    throw new Error(`Hook "${hookName}" not found in source.`);
  }
  const hookConfig = srcContent[hookName];

  // Target file
  let tgtContent = {};
  if (fs.existsSync(targetPath)) {
    try {
      tgtContent = JSON.parse(fs.readFileSync(targetPath, 'utf8')) || {};
    } catch (e) {
      tgtContent = {};
    }
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  tgtContent[hookName] = hookConfig;
  delete srcContent[hookName];

  fs.writeFileSync(targetPath, JSON.stringify(tgtContent, null, 2), 'utf8');
  fs.writeFileSync(sourcePath, JSON.stringify(srcContent, null, 2), 'utf8');
}

// Create new resource (plugin, skill, workflow, rule)
async function createItem(data, lang) {
  const {
    category,
    targetType,
    targetId,
    name,
    displayName,
    description,
    version,
    author,
    createScripts,
    createExamples,
    createDocs,
    createResources,
    activePluginsPath,
    activeSkillsPath,
    activeWorkflowsPath
  } = data;

  let targetDir = '';
  if (targetType === 'global') {
    if (category === 'skill') targetDir = path.join(activeSkillsPath, name);
    else if (category === 'workflow') targetDir = activeWorkflowsPath;
    else if (category === 'plugin') targetDir = path.join(activePluginsPath, name);
    else if (category === 'rule') {
      throw new Error(lang === 'ru' 
        ? 'Создание глобальных правил заблокировано: система поддерживает только 2 глобальных системных файла правил (GEMINI.md и AGENTS.md).' 
        : 'Global rule creation is locked: only 2 system global rule files are supported (GEMINI.md and AGENTS.md).');
    }
  } else if (targetType === 'workspace') {
    const wsRoot = targetId;
    if (category === 'plugin') targetDir = path.join(wsRoot, '.agents', 'plugins', name);
    else if (category === 'skill') targetDir = path.join(wsRoot, '.agents', 'skills', name);
    else if (category === 'workflow') targetDir = path.join(wsRoot, '.agents', 'workflows');
    else if (category === 'rule') targetDir = path.join(wsRoot, '.agents', 'rules');
  } else if (targetType === 'plugin') {
    if (category === 'skill') targetDir = path.join(targetId, 'skills', name);
    else if (category === 'rule') targetDir = path.join(targetId, 'rules');
  }

  if (!targetDir) {
    throw new Error(getTranslation('invalidPaths', lang));
  }

  if (category === 'workflow') {
    const workflowFile = path.join(targetDir, `${name}.md`);
    if (fs.existsSync(workflowFile)) {
      throw new Error(`File ${name}.md already exists in destination.`);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const cleanTitle = displayName || name;
    const nameField = displayName ? `name: "${displayName}"\n` : '';
    const content = `---
${nameField}description: "${escapeJsString(description || '')}"
---

#### ${cleanTitle}

## Шаги / Steps
1. Шаг первый...
`;
    fs.writeFileSync(workflowFile, content, 'utf8');
    vscode.window.showInformationMessage(`Workflow "${name}" created successfully.`);
  } else if (category === 'rule') {
    const ruleFile = path.join(targetDir, `${name}.md`);
    if (fs.existsSync(ruleFile)) {
      throw new Error(`File ${name}.md already exists in destination.`);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const cleanTitle = displayName || name;
    const content = `---
trigger: always_on
description: "${escapeJsString(description || cleanTitle)}"
---

# ${cleanTitle}

## Правила / Rules
- Описание правила...
`;
    fs.writeFileSync(ruleFile, content, 'utf8');
    vscode.window.showInformationMessage(`Rule "${name}" created successfully.`);
  } else {
    if (fs.existsSync(targetDir)) {
      throw new Error(`Folder "${name}" already exists in destination.`);
    }
    fs.mkdirSync(targetDir, { recursive: true });
    if (category === 'plugin') {
      fs.mkdirSync(path.join(targetDir, 'skills'), { recursive: true });
      fs.mkdirSync(path.join(targetDir, 'rules'), { recursive: true });
      const manifest = {
        name: name,
        displayName: displayName || name,
        description: description || '',
        version: version || '1.0.0',
        author: author || ''
      };
      fs.writeFileSync(path.join(targetDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Plugin "${name}" created successfully.`);
    } else if (category === 'skill') {
      if (createScripts) fs.mkdirSync(path.join(targetDir, 'scripts'), { recursive: true });
      if (createExamples) fs.mkdirSync(path.join(targetDir, 'examples'), { recursive: true });
      if (createDocs) fs.mkdirSync(path.join(targetDir, 'docs'), { recursive: true });
      if (createResources) fs.mkdirSync(path.join(targetDir, 'resources'), { recursive: true });

      const cleanTitle = displayName || name;
      const nameField = displayName ? `name: "${displayName}"\n` : '';
      const content = `---
${nameField}description: "${escapeJsString(description || '')}"
---

#### ${cleanTitle}

## Когда использовать (When to use)
- Используй этот навык при...

## Как использовать (How to use)
1. Шаги...
`;
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content, 'utf8');
      vscode.window.showInformationMessage(`Skill "${name}" created successfully.`);
    }
  }
}

// Delete item (with protection for built-in and global protected items)
async function deleteItem(category, itemId, displayName, physicalPath, lang, activeSkillsPath) {
  // Builtin and protected checks
  if (itemId && (itemId.startsWith('builtin-') || itemId.includes('builtin')) || 
      physicalPath.includes('builtin') ||
      physicalPath.endsWith('GEMINI.md') || physicalPath.endsWith('AGENTS.md')) {
    throw new Error(getTranslation('cannotModifyBuiltin', lang));
  }

  if (!fs.existsSync(physicalPath)) {
    throw new Error(`File or folder not found: ${physicalPath}`);
  }

  if (category === 'plugin') {
    const optDeleteAll = lang === 'ru' ? 'Удалить всё' : 'Delete all';
    const optMoveSkills = lang === 'ru' ? 'Переместить вложенные навыки' : 'Move nested skills';
    
    const skillsDir = path.join(physicalPath, 'skills');
    const hasSkills = fs.existsSync(skillsDir) && fs.readdirSync(skillsDir).filter(f => {
      const p = path.join(skillsDir, f);
      return fs.statSync(p).isDirectory();
    }).length > 0;

    let choice;
    if (hasSkills) {
      choice = await vscode.window.showWarningMessage(
        lang === 'ru' 
          ? `Удалить плагин "${displayName || itemId}"? Внутри него есть вложенные навыки. Вы можете переместить их перед удалением.`
          : `Delete plugin "${displayName || itemId}"? It contains nested skills. You can move them before deleting.`,
        { modal: true },
        optDeleteAll,
        optMoveSkills
      );
    } else {
      choice = await vscode.window.showWarningMessage(
        lang === 'ru' 
          ? `Вы уверены, что хотите удалить плагин "${displayName || itemId}"?`
          : `Are you sure you want to delete plugin "${displayName || itemId}"?`,
        { modal: true },
        lang === 'ru' ? 'Да' : 'Yes'
      );
      if (choice === (lang === 'ru' ? 'Да' : 'Yes')) {
        choice = optDeleteAll;
      }
    }

    if (!choice) return false;

    if (choice === optMoveSkills) {
      const optGlobal = lang === 'ru' ? 'Глобальные навыки' : 'Global Skills';
      const optWorkspace = lang === 'ru' ? 'Навыки текущей рабочей области' : 'Workspace Skills';
      
      const destChoice = await vscode.window.showQuickPick(
        [
          { label: optGlobal, id: 'global' },
          { label: optWorkspace, id: 'workspace' }
        ],
        { placeHolder: lang === 'ru' ? 'Выберите назначение для вложенных навыков' : 'Select destination for nested skills' }
      );
      
      if (!destChoice) return false;

      let targetSkillsDir = '';
      if (destChoice.id === 'global') {
        targetSkillsDir = activeSkillsPath;
      } else {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
          throw new Error(lang === 'ru' ? 'Нет открытой рабочей области.' : 'No open workspace folder.');
        }
        targetSkillsDir = path.join(wsFolder.uri.fsPath, '.agents', 'skills');
      }

      if (!fs.existsSync(targetSkillsDir)) {
        fs.mkdirSync(targetSkillsDir, { recursive: true });
      }

      const files = fs.readdirSync(skillsDir);
      for (const f of files) {
        const srcPath = path.join(skillsDir, f);
        if (fs.statSync(srcPath).isDirectory()) {
          let destPath = path.join(targetSkillsDir, f);
          let counter = 1;
          while (fs.existsSync(destPath)) {
            destPath = path.join(targetSkillsDir, `${f}-${counter}`);
            counter++;
          }
          fs.renameSync(srcPath, destPath);
        }
      }
      
      vscode.window.showInformationMessage(
        lang === 'ru' ? 'Вложенные навыки успешно перемещены.' : 'Nested skills moved successfully.'
      );
    }

    if (choice === optDeleteAll || choice === optMoveSkills) {
      fs.rmSync(physicalPath, { recursive: true, force: true });
      vscode.window.showInformationMessage(
        lang === 'ru' ? `Плагин "${displayName || itemId}" успешно удален.` : `Plugin "${displayName || itemId}" deleted successfully.`
      );
      return true;
    }
    return false;
  } else {
    const confirmMsg = lang === 'ru'
      ? `Вы уверены, что хотите удалить ${category === 'skill' ? 'навык' : category === 'workflow' ? 'воркфлоу' : category === 'rule' ? 'правило' : 'хук'} "${displayName || itemId}"?`
      : `Are you sure you want to delete ${category === 'skill' ? 'skill' : category === 'workflow' ? 'workflow' : category === 'rule' ? 'rule' : 'hook'} "${displayName || itemId}"?`;
    
    const choice = await vscode.window.showWarningMessage(
      confirmMsg,
      { modal: true },
      lang === 'ru' ? 'Да' : 'Yes'
    );

    if (choice === (lang === 'ru' ? 'Да' : 'Yes')) {
      if (fs.statSync(physicalPath).isDirectory()) {
        fs.rmSync(physicalPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(physicalPath);
      }
      vscode.window.showInformationMessage(
        lang === 'ru' ? 'Ресурс успешно удален.' : 'Resource deleted successfully.'
      );
      return true;
    }
    return false;
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

// Resolve conflict between active and storage versions
async function resolveConflict(data, lang) {
  const { id, category, resolution, activePath, storagePath, isDir } = data;
  logDebug(`resolveConflict id=${id}, resolution=${resolution}, category=${category}`);
  
  if (resolution === 'merge') {
    if (isDir) {
      twoWayMergeDirs(activePath, storagePath);
      if (fs.existsSync(activePath)) {
        fs.rmSync(activePath, { recursive: true, force: true });
      }
      createLink(storagePath, activePath, true, category);
    } else {
      const parsed = path.parse(storagePath);
      const backupName = `${parsed.name}_backup_${Date.now()}${parsed.ext}`;
      const backupPath = path.join(parsed.dir, backupName);
      fs.copyFileSync(storagePath, backupPath);
      if (fs.existsSync(activePath)) {
        fs.unlinkSync(activePath);
      }
      createLink(storagePath, activePath, false, category);
    }
    vscode.window.showInformationMessage(getTranslation('mergeSuccess', lang));
  } else if (resolution === 'active') {
    if (fs.existsSync(storagePath)) {
      fs.rmSync(storagePath, { recursive: true, force: true });
    }
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  } else if (resolution === 'storage') {
    if (fs.existsSync(activePath)) {
      fs.rmSync(activePath, { recursive: true, force: true });
    }
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  } else if (resolution === 'keepBoth') {
    const parsed = path.parse(storagePath);
    const backupName = `${parsed.name}_backup_${Date.now()}${parsed.ext}`;
    const backupPath = path.join(parsed.dir, backupName);
    fs.renameSync(storagePath, backupPath);
    vscode.window.showInformationMessage(getTranslation('conflictResolved', lang));
  }
}

module.exports = {
  toggleItem,
  toggleHook,
  toggleMcpServer,
  deleteHook,
  deleteMcpServer,
  moveMcpServer,
  moveHook,
  createItem,
  deleteItem,
  resolveConflict,
  migrateStorage
};

