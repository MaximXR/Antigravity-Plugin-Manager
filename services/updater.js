/**
 * services/updater.js
 * Plugin Update Engine for Antigravity Plugin Manager
 * Supports checking updates via GitHub raw manifest and applying updates via git pull or git clone.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { exec } = require('child_process');
const { triggerIdeScannerFlush } = require('./fsUtils');

/**
 * Parses GitHub repository info from plugin manifest or .git config
 * Returns { owner, repo, repoUrl, cleanUrl } or null
 */
function parsePluginRepo(plugin) {
  let rawUrl = '';

  // 1. From plugin manifest
  if (typeof plugin.repository === 'string') {
    rawUrl = plugin.repository;
  } else if (plugin.repository && typeof plugin.repository.url === 'string') {
    rawUrl = plugin.repository.url;
  } else if (typeof plugin.homepage === 'string' && plugin.homepage.includes('github.com')) {
    rawUrl = plugin.homepage;
  }

  // 1b. Fallback: read directly from plugin.json if physicalPath exists
  if (!rawUrl && plugin.physicalPath) {
    const pjPath = path.join(plugin.physicalPath, 'plugin.json');
    if (fs.existsSync(pjPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
        if (typeof pj.repository === 'string') rawUrl = pj.repository;
        else if (pj.repository && typeof pj.repository.url === 'string') rawUrl = pj.repository.url;
        else if (typeof pj.homepage === 'string' && pj.homepage.includes('github.com')) rawUrl = pj.homepage;
      } catch (_) {}
    }
  }

  // 2. From .git directory if present
  if (!rawUrl && plugin.physicalPath) {
    const gitDir = path.join(plugin.physicalPath, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        const configPath = path.join(gitDir, 'config');
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf8');
          const match = configContent.match(/url\s*=\s*(.+)/);
          if (match && match[1]) {
            rawUrl = match[1].trim();
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }

  if (!rawUrl) return null;

  // Clean and parse GitHub URL
  // Matches: https://github.com/owner/repo or git@github.com:owner/repo.git
  const ghMatch = rawUrl.match(/(?:github\.com[/:]|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (!ghMatch) return null;

  const owner = ghMatch[1];
  const repo = ghMatch[2];
  const cleanUrl = `https://github.com/${owner}/${repo}`;

  return {
    owner,
    repo,
    repoUrl: rawUrl,
    cleanUrl
  };
}

/**
 * Semver comparison helper
 * Returns 1 if vA > vB, -1 if vA < vB, 0 if equal
 */
function compareSemver(vA, vB) {
  if (!vA && !vB) return 0;
  if (!vA) return -1;
  if (!vB) return 1;

  // Clean leading 'v'
  const cleanA = String(vA).replace(/^[vV]/, '').trim();
  const cleanB = String(vB).replace(/^[vV]/, '').trim();

  if (cleanA === cleanB) return 0;

  const partsA = cleanA.split(/[-.+]/).map(p => {
    const n = parseInt(p, 10);
    return isNaN(n) ? p : n;
  });
  const partsB = cleanB.split(/[-.+]/).map(p => {
    const n = parseInt(p, 10);
    return isNaN(n) ? p : n;
  });

  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = partsA[i] !== undefined ? partsA[i] : 0;
    const b = partsB[i] !== undefined ? partsB[i] : 0;

    if (typeof a === 'number' && typeof b === 'number') {
      if (a > b) return 1;
      if (a < b) return -1;
    } else {
      const strA = String(a);
      const strB = String(b);
      if (strA > strB) return 1;
      if (strA < strB) return -1;
    }
  }

  return 0;
}

/**
 * Performs a lightweight HTTPS GET request with timeout and redirect following
 */
function fetchHttpsJson(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const client = https.get(url, {
      headers: {
        'User-Agent': 'Antigravity-Plugin-Manager'
      },
      timeout: timeoutMs
    }, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHttpsJson(res.headers.location, timeoutMs));
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Request timeout'));
    });

    client.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Checks if a plugin has an update available on GitHub
 */
async function checkPluginUpdate(plugin) {
  const repoInfo = parsePluginRepo(plugin);
  if (!repoInfo) {
    return {
      pluginId: plugin.id,
      pluginName: plugin.displayName || plugin.name,
      hasUpdate: false,
      isUpdatable: false,
      reason: 'noRepository'
    };
  }

  const rawManifestUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/HEAD/plugin.json`;

  try {
    const remoteManifest = await fetchHttpsJson(rawManifestUrl);
    const localVersion = plugin.version || '0.0.0';
    const remoteVersion = remoteManifest.version || '0.0.0';

    const isNewer = compareSemver(remoteVersion, localVersion) > 0;

    return {
      pluginId: plugin.id,
      pluginName: plugin.displayName || plugin.name,
      isUpdatable: true,
      hasUpdate: isNewer,
      localVersion,
      remoteVersion,
      remoteDescription: remoteManifest.description || '',
      repoUrl: repoInfo.cleanUrl,
      owner: repoInfo.owner,
      repo: repoInfo.repo,
      checkedAt: Date.now()
    };
  } catch (err) {
    return {
      pluginId: plugin.id,
      pluginName: plugin.displayName || plugin.name,
      isUpdatable: true,
      hasUpdate: false,
      error: err.message,
      repoUrl: repoInfo.cleanUrl,
      checkedAt: Date.now()
    };
  }
}

/**
 * Checks updates for all given plugins in parallel
 */
async function checkAllUpdates(plugins, context) {
  const checkPromises = plugins.map(p => checkPluginUpdate(p));
  const results = await Promise.all(checkPromises);

  const updatesMap = {};
  let totalAvailableUpdates = 0;

  for (const res of results) {
    updatesMap[res.pluginId] = res;
    if (res.hasUpdate) {
      totalAvailableUpdates++;
    }
  }

  const statePayload = {
    lastCheckedAt: Date.now(),
    updates: updatesMap,
    totalAvailableUpdates
  };

  // Cache in globalState if available
  if (context && context.globalState) {
    try {
      await context.globalState.update('antigravity-plugin-manager.updatesState', statePayload);
    } catch (e) {
      // ignore
    }
  }

  return statePayload;
}

/**
 * Helper to execute a shell command asynchronously
 */
function execPromise(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { ...options, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr ? stderr.trim() : (stdout ? stdout.trim() : err.message)));
      }
      resolve(stdout ? stdout.trim() : '');
    });
  });
}

/**
 * Recursively copies a directory with Windows read-only permission resilience
 */
function copyDirRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      try {
        if (fs.existsSync(destPath)) {
          try { fs.chmodSync(destPath, 0o666); } catch (_) {}
        }
        fs.copyFileSync(srcPath, destPath);
      } catch (e) {
        try {
          fs.chmodSync(destPath, 0o666);
          fs.unlinkSync(destPath);
          fs.copyFileSync(srcPath, destPath);
        } catch (_) {}
      }
    }
  }
}

function safeRemoveDirSync(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) {
    try {
      const makeWritable = (p) => {
        if (!fs.existsSync(p)) return;
        try { fs.chmodSync(p, 0o666); } catch (_) {}
        if (fs.statSync(p).isDirectory()) {
          for (const c of fs.readdirSync(p)) makeWritable(path.join(p, c));
        }
      };
      makeWritable(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
}

/**
 * Updates a plugin using git pull (if .git exists) or git clone --depth 1
 */
async function updatePlugin(plugin, onProgress = () => {}) {
  if (!plugin || !plugin.physicalPath) {
    throw new Error('Plugin path not found.');
  }

  const targetDir = plugin.physicalPath;
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory ${targetDir} does not exist.`);
  }

  const repoInfo = parsePluginRepo(plugin);
  if (!repoInfo) {
    throw new Error('Plugin does not have a valid Git/GitHub repository configured.');
  }

  // Preserve local disabled state from current manifest
  let localDisabled = null;
  const manifestPath = path.join(targetDir, 'plugin.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (typeof parsed.disabled === 'boolean') {
        localDisabled = parsed.disabled;
      }
    } catch (e) {
      // ignore
    }
  }

  const gitDir = path.join(targetDir, '.git');
  const hasGit = fs.existsSync(gitDir);

  if (hasGit) {
    // Mode A: Native git pull
    onProgress(`Running "git pull" in ${targetDir}...`);
    try {
      const pullOutput = await execPromise('git pull', { cwd: targetDir });
      onProgress(`Git pull output: ${pullOutput || 'Already up to date.'}`);
    } catch (err) {
      throw new Error(`Git pull failed: ${err.message}`);
    }
  } else {
    // Mode B: Fast git clone to temp dir, then copy files and preserve .git
    const tempPrefix = path.join(os.tmpdir(), `agy-plugin-update-${plugin.id || 'plg'}-${Date.now()}`);
    onProgress(`Cloning latest version from ${repoInfo.cleanUrl} (depth 1)...`);

    try {
      await execPromise(`git clone --depth 1 "${repoInfo.cleanUrl}" "${tempPrefix}"`);
      onProgress(`Cloned successfully. Updating plugin files in ${targetDir}...`);

      // Copy all files including .git
      copyDirRecursiveSync(tempPrefix, targetDir);

      // Clean up temp dir
      safeRemoveDirSync(tempPrefix);
    } catch (err) {
      // Cleanup temp on error
      safeRemoveDirSync(tempPrefix);
      throw new Error(`Clone & update failed: ${err.message}`);
    }
  }

  // Restore preserved local "disabled" setting
  if (localDisabled !== null && fs.existsSync(manifestPath)) {
    try {
      const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      updatedManifest.disabled = localDisabled;
      fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf8');
      onProgress(`Restored local activation state (disabled: ${localDisabled}).`);
    } catch (e) {
      // ignore
    }
  }

  // Trigger Language Server scanner flush
  triggerIdeScannerFlush();
  onProgress('Plugin update completed successfully! Antigravity scanner notified.');

  // Read final new version
  let newVersion = '1.0.0';
  if (fs.existsSync(manifestPath)) {
    try {
      const finalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      newVersion = finalManifest.version || newVersion;
    } catch (e) {}
  }

  return {
    success: true,
    newVersion,
    message: `Plugin updated successfully to v${newVersion}!`
  };
}

module.exports = {
  parsePluginRepo,
  compareSemver,
  checkPluginUpdate,
  checkAllUpdates,
  updatePlugin
};
