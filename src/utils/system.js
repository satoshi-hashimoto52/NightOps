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
