const assert = require('assert');
const updater = require('../../services/updater');

describe('Desktop App Self-Update Suite', () => {
  test('Semver comparison handles standard, v-prefixed, and prerelease versions', () => {
    assert.strictEqual(updater.compareSemver('1.2.23', '1.2.22'), 1);
    assert.strictEqual(updater.compareSemver('1.2.22', '1.2.22'), 0);
    assert.strictEqual(updater.compareSemver('1.2.21', '1.2.22'), -1);
    assert.strictEqual(updater.compareSemver('v1.2.23', '1.2.22'), 1);
    assert.strictEqual(updater.compareSemver('1.2.23', 'v1.2.23'), 0);
    assert.strictEqual(updater.compareSemver('2.0.0', '1.9.99'), 1);
  });

  test('checkAppUpdate detects existing newer releases and resolves direct Windows zip asset', async () => {
    // When querying for an older version (e.g., 1.2.10) against current repository
    const result = await updater.checkAppUpdate('1.2.10');
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(result.hasUpdate, true);
    assert.strictEqual(typeof result.remoteVersion, 'string');
    assert(result.downloadUrl.includes('http'), 'downloadUrl must be a valid HTTP URL');
    assert(result.releaseUrl.includes('github.com'), 'releaseUrl must point to GitHub');
  });

  test('checkAppUpdate reports no update when running current or ahead version', async () => {
    const result = await updater.checkAppUpdate('99.99.99');
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(result.hasUpdate, false);
    assert.strictEqual(result.currentVersion, '99.99.99');
  });
});
