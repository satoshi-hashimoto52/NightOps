function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean)));
}

export function extractPathsFromEvent(event) {
  const dataTransfer = event?.dataTransfer;
  const items = dataTransfer?.items;
  const files = dataTransfer?.files;
  const paths = [];

  if (items && items.length > 0) {
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry && entry.isFile) {
        const file = item.getAsFile();
        if (file && file.path) {
          paths.push(file.path);
        }
      }
    }
  }

  if (paths.length === 0 && files && files.length > 0) {
    for (const file of files) {
      if (file.path) {
        paths.push(file.path);
      }
    }
  }

  console.log("DND files:", files);
  console.log("paths:", paths);
  return uniquePaths(paths);
}

export function getDroppedFilePaths(dataTransfer) {
  return extractPathsFromEvent({ dataTransfer });
}

export function handleDragOver(event) {
  event.preventDefault();
}
