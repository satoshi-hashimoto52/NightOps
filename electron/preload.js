const { contextBridge, ipcRenderer } = require("electron");

console.log("preload loaded");

const exposedApi = {
  getSystemUsage: () => ipcRenderer.invoke("system:usage"),
  getCodexStats: () => ipcRenderer.invoke("codex:stats"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  getSystemStatus: (directoryPath) => ipcRenderer.invoke("system:status", directoryPath),
  browseDirectory: () => ipcRenderer.invoke("fs:browse-directory"),
  getRootDirectory: () => ipcRenderer.invoke("fs:root"),
  listDirectory: (dirPath) => ipcRenderer.invoke("fs:list", dirPath),
  watchFile: (filePath) => ipcRenderer.invoke("fs:watch", filePath),
  unwatchFile: () => ipcRenderer.invoke("fs:unwatch"),
  onFileChanged: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on("fs:file-changed", handler);
    return () => ipcRenderer.removeListener("fs:file-changed", handler);
  },
  readFile: (filePath) => ipcRenderer.invoke("fs:read", filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke("fs:save", filePath, content),
  renameFile: (filePath, nextName) => ipcRenderer.invoke("fs:rename", filePath, nextName),
  deleteFile: (filePath) => ipcRenderer.invoke("fs:delete", filePath),
  createFile: (directoryPath, nextName) => ipcRenderer.invoke("fs:create-file", directoryPath, nextName),
  createFileFromBuffer: (directoryPath, nextName, content) =>
    ipcRenderer.invoke("fs:create-file-from-buffer", directoryPath, nextName, content),
  createDirectory: (directoryPath, nextName) => ipcRenderer.invoke("fs:create-directory", directoryPath, nextName),
  moveFile: (sourcePath, targetDirectoryPath) => ipcRenderer.invoke("fs:move", sourcePath, targetDirectoryPath),
  copyFileToDirectory: (sourcePath, targetDirectoryPath) =>
    ipcRenderer.invoke("fs:copy-into", sourcePath, targetDirectoryPath),
  revealFile: (filePath) => ipcRenderer.invoke("fs:reveal", filePath),
  copyFilePath: (filePath) => ipcRenderer.invoke("fs:copy-path", filePath),
  launchCodex: (payload) => ipcRenderer.invoke("codex:launch", payload)
};

contextBridge.exposeInMainWorld("api", exposedApi);
contextBridge.exposeInMainWorld("nightOps", exposedApi);
contextBridge.exposeInMainWorld("electronAPI", {
  onExternalDrop: (paths) => {
    window.dispatchEvent(new CustomEvent("external-drop", { detail: paths }));
  }
});

ipcRenderer.on("nightops:external-drop", (_event, paths) => {
  window.electronAPI?.onExternalDrop?.(paths);
});
