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
