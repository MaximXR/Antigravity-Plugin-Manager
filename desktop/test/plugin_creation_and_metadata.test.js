const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const actions = require('../../services/actions');
const fsUtils = require('../../services/fsUtils');
const updater = require('../../services/updater');

if (typeof describe === 'function') {
  describe('Plugin Creation & Metadata Architecture Suite', () => {
    let tmpDir;
    let connectedDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-create-'));
      connectedDir = path.join(tmpDir, 'connected-plugins');
      fs.mkdirSync(connectedDir, { recursive: true });
    });

    afterEach(() => {
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('createItem creates plugin inside connected folder with repository URL', async () => {
      const pluginName = 'my-connected-plugin';
      await actions.createItem({
        category: 'plugin',
        targetType: 'connected',
        targetId: connectedDir,
        name: pluginName,
        displayName: 'My Connected Plugin',
        description: 'Test description',
        version: '1.2.3',
        author: 'John Doe',
        repository: 'https://github.com/myuser/my-connected-plugin'
      }, 'en');

      const expectedDir = path.join(connectedDir, pluginName);
      assert(fs.existsSync(expectedDir), 'Plugin directory should be created in connected folder');
      assert(fs.existsSync(path.join(expectedDir, 'skills')), 'skills/ folder should be created');
      assert(fs.existsSync(path.join(expectedDir, 'rules')), 'rules/ folder should be created');

      const manifestPath = path.join(expectedDir, 'plugin.json');
      assert(fs.existsSync(manifestPath), 'plugin.json manifest should be created');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.strictEqual(manifest.name, pluginName);
      assert.strictEqual(manifest.displayName, 'My Connected Plugin');
      assert.strictEqual(manifest.version, '1.2.3');
      assert.strictEqual(manifest.author, 'John Doe');
      assert.strictEqual(manifest.repository, 'https://github.com/myuser/my-connected-plugin');

      // Verify updater parses it
      const repoInfo = updater.parsePluginRepo(manifest);
      assert(repoInfo, 'updater should parse repoInfo');
      assert.strictEqual(repoInfo.owner, 'myuser');
      assert.strictEqual(repoInfo.repo, 'my-connected-plugin');
    });

    test('savePluginMetadata updates metadata and repository URL', async () => {
      const pluginDir = path.join(connectedDir, 'test-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        name: 'test-plugin',
        displayName: 'Old Name',
        version: '1.0.0'
      }, null, 2), 'utf8');

      await actions.savePluginMetadata(pluginDir, {
        displayName: 'New Awesome Name',
        version: '2.0.0',
        author: 'Alice',
        repository: 'https://github.com/alice/test-plugin',
        description: 'Updated description'
      }, 'en');

      const updated = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
      assert.strictEqual(updated.displayName, 'New Awesome Name');
      assert.strictEqual(updated.version, '2.0.0');
      assert.strictEqual(updated.author, 'Alice');
      assert.strictEqual(updated.repository, 'https://github.com/alice/test-plugin');
      assert.strictEqual(updated.description, 'Updated description');

      // Clearing repository deletes it from manifest
      await actions.savePluginMetadata(pluginDir, {
        repository: ''
      }, 'en');

      const cleared = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
      assert.strictEqual(cleared.repository, undefined, 'Empty repository should be removed from manifest');
      assert.strictEqual(cleared.displayName, 'New Awesome Name', 'Other fields should remain intact');
    });

    test('Hero Card single-field inline editing elements exist in index.html and old edit-plugin-modal is removed', () => {
      const htmlPath = path.join(__dirname, '..', '..', 'webview', 'index.html');
      const rawHtml = fs.readFileSync(htmlPath, 'utf8');

      // Old duplicate modal is removed
      assert(!rawHtml.includes('id="edit-plugin-modal"'), 'Old #edit-plugin-modal should be removed');
      assert(!rawHtml.includes('id="edit-plugin-display-name"'), 'Old modal inputs should be removed');

      // In-place single-field edit boxes exist
      assert(rawHtml.includes('id="hero-name-view"'), '#hero-name-view should exist');
      assert(rawHtml.includes('id="hero-edit-box-displayName"'), '#hero-edit-box-displayName should exist');
      assert(rawHtml.includes('id="hero-ver-chip"'), '#hero-ver-chip should exist');
      assert(rawHtml.includes('id="hero-edit-box-version"'), '#hero-edit-box-version should exist');
      assert(rawHtml.includes('id="hero-author-container"'), '#hero-author-container should exist');
      assert(rawHtml.includes('id="hero-edit-box-author"'), '#hero-edit-box-author should exist');
      assert(rawHtml.includes('id="hero-repo-container"'), '#hero-repo-container should exist');
      assert(rawHtml.includes('id="hero-edit-box-repository"'), '#hero-edit-box-repository should exist');
      assert(rawHtml.includes('id="hero-desc-box-view"'), '#hero-desc-box-view should exist');
      assert(rawHtml.includes('id="hero-edit-box-description"'), '#hero-edit-box-description should exist');

      // Single-field inputs exist
      assert(rawHtml.includes('id="inline-edit-displayName"'), '#inline-edit-displayName input should exist');
      assert(rawHtml.includes('id="inline-edit-version"'), '#inline-edit-version input should exist');
      assert(rawHtml.includes('id="inline-edit-author"'), '#inline-edit-author input should exist');
      assert(rawHtml.includes('id="inline-edit-repository"'), '#inline-edit-repository input should exist');
      assert(rawHtml.includes('id="inline-edit-description"'), '#inline-edit-description textarea should exist');
      assert(rawHtml.includes('class="btn-inline-apply"'), '.btn-inline-apply button should exist');
      assert(rawHtml.includes('class="btn-inline-cancel"'), '.btn-inline-cancel button should exist');
      assert(rawHtml.includes('class="btn-inline-clear"'), '.btn-inline-clear button should exist');
    });

    test('getWebviewScript bundles Hero inline editing functions', () => {
      const script = fsUtils.getWebviewScript();
      assert(script.includes('function startFieldEdit'), 'startFieldEdit should be in bundled script');
      assert(script.includes('function cancelFieldEdit'), 'cancelFieldEdit should be in bundled script');
      assert(script.includes('function saveFieldEdit'), 'saveFieldEdit should be in bundled script');
      assert(script.includes('function clearFieldInput'), 'clearFieldInput should be in bundled script');
      assert(script.includes('function enterHeroEditMode'), 'enterHeroEditMode should be in bundled script');
      assert(script.includes('function exitHeroEditMode'), 'exitHeroEditMode should be in bundled script');
      assert(script.includes('function saveHeroInlineEdit'), 'saveHeroInlineEdit should be in bundled script');
      assert(script.includes('window.startFieldEdit = startFieldEdit'), 'startFieldEdit should be exposed to window');
      assert(script.includes('window.cancelFieldEdit = cancelFieldEdit'), 'cancelFieldEdit should be exposed to window');
      assert(script.includes('window.saveFieldEdit = saveFieldEdit'), 'saveFieldEdit should be exposed to window');
      assert(script.includes('window.clearFieldInput = clearFieldInput'), 'clearFieldInput should be exposed to window');
    });

    test('getWebviewScript bundles resolveItemRepoUrl and openExternalUrl', () => {
      const script = fsUtils.getWebviewScript();
      assert(script.includes('function resolveItemRepoUrl'), 'resolveItemRepoUrl should be in bundled script');
      assert(script.includes('function openExternalUrl'), 'openExternalUrl should be in bundled script');
      assert(script.includes('window.resolveItemRepoUrl = resolveItemRepoUrl'), 'resolveItemRepoUrl should be exposed on window');
      assert(script.includes('window.openExternalUrl = openExternalUrl'), 'openExternalUrl should be exposed on window');
    });
  });
}
