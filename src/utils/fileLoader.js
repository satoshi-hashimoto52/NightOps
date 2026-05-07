function getApi() {
  return new Promise((resolve) => {
    if (window.api) {
      resolve(window.api);
      return;
    }

    const timer = setInterval(() => {
      if (window.api) {
        clearInterval(timer);
        resolve(window.api);
      }
    }, 50);
  });
}

export async function getRootDirectory() {
  const api = await getApi();
  return api.getRootDirectory();
}

export async function getSettings() {
  const api = await getApi();
  return api.getSettings();
}

export async function browseDirectory() {
  const api = await getApi();
  return api.browseDirectory();
}

export async function focusWindow() {
  const api = await getApi();
  return api.focusWindow();
}

export async function saveSettings(settings) {
  const api = await getApi();
  return api.saveSettings(settings);
}

export async function listDirectory(dirPath) {
  const api = await getApi();
  return api.listDirectory(dirPath);
}

export async function watchFile(filePath) {
  const api = await getApi();
  return api.watchFile(filePath);
}

export async function unwatchFile() {
  const api = await getApi();
  return api.unwatchFile();
}

export async function onFileChanged(callback) {
  const api = await getApi();
  return api.onFileChanged(callback);
}

export async function readFile(filePath) {
  const api = await getApi();
  return api.readFile(filePath);
}

export async function saveFile(filePath, content) {
  const api = await getApi();
  return api.saveFile(filePath, content);
}

export async function renameFile(filePath, nextName) {
  const api = await getApi();
  return api.renameFile(filePath, nextName);
}

export async function deleteFile(filePath) {
  const api = await getApi();
  return api.deleteFile(filePath);
}

export async function createFile(directoryPath, nextName) {
  const api = await getApi();
  return api.createFile(directoryPath, nextName);
}

export async function createFileFromBuffer(directoryPath, nextName, content) {
  const api = await getApi();
  return api.createFileFromBuffer(directoryPath, nextName, content);
}

export async function createDirectory(directoryPath, nextName) {
  const api = await getApi();
  return api.createDirectory(directoryPath, nextName);
}

export async function moveFile(sourcePath, targetDirectoryPath) {
  const api = await getApi();
  return api.moveFile(sourcePath, targetDirectoryPath);
}

export async function copyFileToDirectory(sourcePath, targetDirectoryPath) {
  const api = await getApi();
  return api.copyFileToDirectory(sourcePath, targetDirectoryPath);
}

export async function revealFile(filePath) {
  const api = await getApi();
  return api.revealFile(filePath);
}

export async function copyFilePath(filePath) {
  const api = await getApi();
  return api.copyFilePath(filePath);
}

export async function launchCodex(payload) {
  const api = await getApi();
  return api.launchCodex(payload);
}
