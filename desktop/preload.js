/**
 * desktop/preload.js
 * Preload script for Antigravity Plugin Manager Desktop.
 * Securely exposes desktopApi to renderer and bridges IPC events.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktopApi to renderer window
contextBridge.exposeInMainWorld('desktopApi', {
  postMessage: (msg) => {
    ipcRenderer.send('to-backend', msg);
  },
  onMessage: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('from-backend', (_event, msg) => callback(msg));
    }
  }
});

// Forward messages from backend to window.postMessage so that existing
// window.addEventListener('message', ...) in webview/main.js works transparently
ipcRenderer.on('from-backend', (_event, msg) => {
  window.postMessage(msg, '*');
});
