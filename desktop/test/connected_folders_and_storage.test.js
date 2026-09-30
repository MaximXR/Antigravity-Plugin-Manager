/**
 * connected_folders_and_storage.test.js — Connected Folders & Storage Operations Test Suite
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const fsUtils = require('../../services/fsUtils');
const scanners = require('../../services/scanners');

describe('Connected Folders & Storage Architecture Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-connected-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('removeEntryFromJsonConfig removes ONLY the target entry even if multiple entries share the same basename', () => {
    const configPath = path.join(tmpDir, 'skills.json');
    const folder1 = path.join(tmpDir, 'libA', 'skills');
    const folder2 = path.join(tmpDir, 'libB', 'skills');
    const folder3 = path.join(tmpDir, 'custom', 'my-skills');

    const initialConfig = {
      entries: [
        { path: folder1 },
        { path: folder2 },
        { path: folder3 }
      ]
    };
    fsUtils.writeJsonConfigFile(configPath, initialConfig);

    // Both folder1 and folder2 have basename 'skills'
    assert.strictEqual(path.basename(folder1), 'skills');
    assert.strictEqual(path.basename(folder2), 'skills');

    // Remove folder1 only
    fsUtils.removeEntryFromJsonConfig(configPath, folder1);

    const updated = fsUtils.readJsonConfigFile(configPath);
    assert.strictEqual(updated.entries.length, 2, 'Should leave exactly 2 entries');

    const remainingPaths = updated.entries.map(e => path.normalize(e.path || e).toLowerCase());
    assert.ok(!remainingPaths.includes(path.normalize(folder1).toLowerCase()), 'folder1 must be removed');
    assert.ok(remainingPaths.includes(path.normalize(folder2).toLowerCase()), 'folder2 MUST be preserved');
    assert.ok(remainingPaths.includes(path.normalize(folder3).toLowerCase()), 'folder3 MUST be preserved');
  });

  test('replaceEntryInJsonConfig replaces the target entry with new path and preserves other entries', () => {
    const configPath = path.join(tmpDir, 'plugins.json');
    const oldFolder = path.join(tmpDir, 'old-plugins');
    const newFolder = path.join(tmpDir, 'new-plugins');
    const otherFolder = path.join(tmpDir, 'other-plugins');

    const initialConfig = {
      entries: [
        { path: oldFolder, exclude: ['broken-plugin'] },
        { path: otherFolder }
      ]
    };
    fsUtils.writeJsonConfigFile(configPath, initialConfig);

    fsUtils.replaceEntryInJsonConfig(configPath, oldFolder, newFolder);

    const updated = fsUtils.readJsonConfigFile(configPath);
    assert.strictEqual(updated.entries.length, 2);

    const replacedEntry = updated.entries.find(e => {
      const p = e.path || e;
      return path.normalize(p).toLowerCase().includes('new-plugins');
    });
    assert.ok(replacedEntry, 'New path entry must exist');
    assert.deepStrictEqual(replacedEntry.exclude, ['broken-plugin'], 'Options on entry should be preserved');

    const otherEntry = updated.entries.find(e => {
      const p = e.path || e;
      return path.normalize(p).toLowerCase().includes('other-plugins');
    });
    assert.ok(otherEntry, 'Other entry must remain intact');
  });

  test('getConnectedFolders marks exists: false for non-existent folders', () => {
    const dummyWs = path.join(tmpDir, 'test-ws');
    const agentsDir = path.join(dummyWs, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const nonExistentPath = path.join(tmpDir, 'non_existent_library_skills');
    const wsSkillsJson = path.join(agentsDir, 'skills.json');

    fsUtils.writeJsonConfigFile(wsSkillsJson, {
      entries: [nonExistentPath]
    });

    const connected = scanners.getConnectedFolders([dummyWs]);
    const found = connected.find(cf => cf.configuredPath === nonExistentPath || cf.path === nonExistentPath);

    assert.ok(found, 'Should discover configured entry even if folder is missing');
    assert.strictEqual(found.exists, false, 'exists flag must be false when folder is missing');
  });

  test('hydrateWebviewHtml replaces btnConnectFolder and folderNotFound translation tokens', () => {
    const template = '<div>{{btnConnectFolder}} | {{btnConnectFolderGlobal}} | {{btnConnectFolderProject}} | {{folderNotFound}} | {{replaceFolder}} | {{openProjectRootFolderBtn}} | {{removeCustomFolderBtn}}</div>';
    const ruHydrated = fsUtils.hydrateWebviewHtml(template, 'ru');
    assert.ok(ruHydrated.includes('Подключить папку'), 'RU should contain Подключить папку');
    assert.ok(ruHydrated.includes('Подключить глобально'), 'RU should contain Подключить глобально');
    assert.ok(ruHydrated.includes('Подключить к проекту'), 'RU should contain Подключить к проекту');
    assert.ok(ruHydrated.includes('Не найдена'), 'RU should contain Не найдена');
    assert.ok(ruHydrated.includes('Заменить...'), 'RU should contain Заменить...');
    assert.ok(ruHydrated.includes('Папка проекта'), 'RU should contain Папка проекта');
    assert.ok(ruHydrated.includes('Убрать из списка'), 'RU should contain Убрать из списка');

    const enHydrated = fsUtils.hydrateWebviewHtml(template, 'en');
    assert.ok(enHydrated.includes('Connect Folder'), 'EN should contain Connect Folder');
    assert.ok(enHydrated.includes('Connect Globally'), 'EN should contain Connect Globally');
    assert.ok(enHydrated.includes('Connect to Project'), 'EN should contain Connect to Project');
    assert.ok(enHydrated.includes('Not found'), 'EN should contain Not found');
    assert.ok(enHydrated.includes('Project Folder'), 'EN should contain Project Folder');
    assert.ok(enHydrated.includes('Remove from List'), 'EN should contain Remove from List');
  });

  test('getCustomFolders purges invalid dot, relative or non-existent folders from custom storage', () => {
    const projectsService = require('../services/projects');
    const customFoldersFile = path.join(os.homedir(), '.gemini', 'antigravity_desktop_custom_folders.json');
    
    // Backup existing custom folders file if exists
    let backup = null;
    if (fs.existsSync(customFoldersFile)) {
      try { backup = fs.readFileSync(customFoldersFile, 'utf8'); } catch (_) {}
    }

    try {
      const validFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-custom-valid-'));
      const invalidEntries = [".", "..", "relative/path", "C:\\non_existent_folder_xyz_12345", validFolder];
      fs.writeFileSync(customFoldersFile, JSON.stringify(invalidEntries, null, 2), 'utf8');

      const customFolders = projectsService.getCustomFolders();
      
      // Should filter out ., .., relative paths, non-existent paths, keeping only validFolder
      assert.strictEqual(customFolders.length, 1);
      assert.strictEqual(path.normalize(customFolders[0].primaryPath).toLowerCase(), path.normalize(validFolder).toLowerCase());
      assert.notStrictEqual(customFolders[0].name, '.');

      // The file on disk should also be cleaned up
      const onDisk = JSON.parse(fs.readFileSync(customFoldersFile, 'utf8'));
      assert.strictEqual(onDisk.length, 1);
      assert.strictEqual(path.normalize(onDisk[0]).toLowerCase(), path.normalize(validFolder).toLowerCase());

      // Clean up validFolder
      try { fs.rmSync(validFolder, { recursive: true, force: true }); } catch (_) {}
    } finally {
      // Restore backup
      if (backup !== null) {
        fs.writeFileSync(customFoldersFile, backup, 'utf8');
      } else {
        try { fs.unlinkSync(customFoldersFile); } catch (_) {}
      }
    }
  });
});

