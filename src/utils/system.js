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

export async function getSystemUsage() {
  const api = await getApi();
  return api.getSystemUsage();
}

export async function getTopStatus(rootPath) {
  const api = await getApi();
  return api.getTopStatus(rootPath);
}

export async function openExternalUrl(url) {
  const api = await getApi();
  return api.openExternalUrl(url);
}

export async function confirmDiscardUnsaved(count) {
  const api = await getApi();
  return api.confirmDiscardUnsaved(count);
}

export async function runTerminalCommand(command, cwd) {
  const api = await getApi();
  return api.runTerminalCommand({ command, cwd });
}

export async function startTerminalSession(payload) {
  const api = await getApi();
  return api.startTerminalSession(payload);
}

export async function writeTerminalSession(payload) {
  const api = await getApi();
  return api.writeTerminalSession(payload);
}

export async function resizeTerminalSession(payload) {
  const api = await getApi();
  return api.resizeTerminalSession(payload);
}

export async function killTerminalSession(payload) {
  const api = await getApi();
  return api.killTerminalSession(payload);
}

export async function killAllTerminalSessions() {
  const api = await getApi();
  return api.killAllTerminalSessions();
}

export async function onTerminalSessionData(callback) {
  const api = await getApi();
  return api.onTerminalSessionData(callback);
}

export async function onTerminalSessionExit(callback) {
  const api = await getApi();
  return api.onTerminalSessionExit(callback);
}
