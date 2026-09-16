/**
 * services/vscodeShim.js
 * Fallback shim for VS Code APIs in standalone Electron / Node.js execution.
 * Decouples services layer (fsUtils, scanners, actions) from vscode extension host.
 */

const path = require('path');
const os = require('os');

const shimState = {
  activeLanguage: 'ru',
  storagePath: null,
  workspaceFolders: []
};

const vscodeShim = {
  workspace: {
    getConfiguration: (section = 'antigravity-plugin-manager') => ({
      get: (key, defaultValue) => {
        if (key === 'language') return shimState.activeLanguage || defaultValue;
        if (key === 'storagePath') return shimState.storagePath || defaultValue;
        if (key === 'statusBar.showSkills') return true;
        if (key === 'statusBar.showRules') return true;
        if (key === 'statusBar.format') return 'icons';
        if (key === 'statusBar.iconSet') return 'extensions_book';
        return defaultValue;
      },
      update: (key, value) => {
        if (key === 'language') shimState.activeLanguage = value;
        if (key === 'storagePath') shimState.storagePath = value;
        return Promise.resolve();
      }
    }),
    get workspaceFolders() {
      return shimState.workspaceFolders.map((f) => {
        if (typeof f === 'string') {
          return {
            name: path.basename(f),
            uri: { fsPath: f }
          };
        }
        return {
          name: f.name || (f.uri ? path.basename(f.uri.fsPath) : 'workspace'),
          uri: f.uri || { fsPath: f.fsPath }
        };
      });
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
    showInformationMessage: async (msg) => {
      return msg;
    },
    showWarningMessage: async (msg, ...items) => {
      const stringOptions = items.filter((i) => typeof i === 'string');
      return stringOptions.length > 0 ? stringOptions[0] : 'Да';
    },
    showErrorMessage: async (msg) => {
      return msg;
    },
    showQuickPick: async (items) => {
      return Array.isArray(items) && items.length > 0 ? items[0] : null;
    },
    withProgress: async (_opts, task) => {
      return await task({ report: () => {} });
    },
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {}
    }),
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {}
    })
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10,
    SourceControl: 1
  },
  env: {
    get language() {
      return shimState.activeLanguage || 'ru';
    },
    openExternal: async () => true
  },
  Uri: {
    file: (p) => ({
      fsPath: p,
      path: p,
      scheme: 'file',
      toString: () => 'file:///' + p.replace(/\\/g, '/')
    }),
    parse: (p) => ({
      fsPath: p,
      path: p,
      scheme: 'file'
    })
  },
  commands: {
    executeCommand: async () => {}
  },
  _setState: (newState) => {
    Object.assign(shimState, newState);
  },
  _getState: () => ({ ...shimState })
};

module.exports = vscodeShim;
