const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fsUtils = require('../../services/fsUtils');

function runHydrationChecks() {
  const htmlPath = path.join(__dirname, '..', '..', 'webview', 'index.html');
  const rawHtml = fs.readFileSync(htmlPath, 'utf8');

  for (const lang of ['ru', 'en']) {
    const hydrated = fsUtils.hydrateWebviewHtml(rawHtml, lang, 'auto');

    // Find any remaining unhydrated {{tokens}}
    const unhydrated = hydrated.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];

    assert.strictEqual(
      unhydrated.length,
      0,
      `Expected 0 unhydrated tokens for lang '${lang}', but found: ${unhydrated.join(', ')}`
    );

    // Verify critical move-modal translations are present
    if (lang === 'ru') {
      assert(hydrated.includes('Перемещение ресурса'), 'RU title missing');
      assert(hydrated.includes('Текущее расположение:'), 'RU current location missing');
      assert(hydrated.includes('Куда переместить:'), 'RU destination label missing');
      assert(hydrated.includes('Произвольная папка на диске:'), 'RU custom folder label missing');
      assert(hydrated.includes('Выбрать папку на диске...'), 'RU browse button missing');
      assert(hydrated.includes('Перезаписать'), 'RU overwrite missing');
    } else {
      assert(hydrated.includes('Move Resource'), 'EN title missing');
      assert(hydrated.includes('Current Location:'), 'EN current location missing');
      assert(hydrated.includes('Select Destination:'), 'EN destination label missing');
      assert(hydrated.includes('Custom Folder on disk:'), 'EN custom folder label missing');
      assert(hydrated.includes('Browse custom folder on disk...'), 'EN browse button missing');
      assert(hydrated.includes('Overwrite'), 'EN overwrite missing');
    }
  }
}

if (typeof describe === 'function') {
  describe('Universal Webview HTML Hydration Suite', () => {
    test('100% of {{tokens}} in index.html are resolved in both RU and EN without raw template leaks', () => {
      runHydrationChecks();
    });

    test('Move modal and dialog titles are properly translated in Russian', () => {
      const htmlPath = path.join(__dirname, '..', '..', 'webview', 'index.html');
      const rawHtml = fs.readFileSync(htmlPath, 'utf8');
      const hydratedRu = fsUtils.hydrateWebviewHtml(rawHtml, 'ru', 'auto');

      assert(hydratedRu.includes('Перемещение ресурса'));
      assert(hydratedRu.includes('Куда переместить:'));
      assert(hydratedRu.includes('Перезаписать'));
      assert(!hydratedRu.includes('{{modalMoveTitle}}'));
      assert(!hydratedRu.includes('{{moveDestinationLabel}}'));
      assert(!hydratedRu.includes('{{btnOverwrite}}'));
      assert(!hydratedRu.includes('{{btnMove}}'));
    });

    test('Move modal and dialog titles are properly translated in English', () => {
      const htmlPath = path.join(__dirname, '..', '..', 'webview', 'index.html');
      const rawHtml = fs.readFileSync(htmlPath, 'utf8');
      const hydratedEn = fsUtils.hydrateWebviewHtml(rawHtml, 'en', 'auto');

      assert(hydratedEn.includes('Move Resource'));
      assert(hydratedEn.includes('Select Destination:'));
      assert(hydratedEn.includes('Overwrite'));
      assert(!hydratedEn.includes('{{modalMoveTitle}}'));
      assert(!hydratedEn.includes('{{moveDestinationLabel}}'));
      assert(!hydratedEn.includes('{{btnOverwrite}}'));
      assert(!hydratedEn.includes('{{btnMove}}'));
    });
  });
} else {
  runHydrationChecks();
  console.log('✓ HTML Hydration tests passed standalone.');
}
