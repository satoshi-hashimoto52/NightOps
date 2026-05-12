# API

## Electron IPC

### System

- `system:usage`
- `system:status`
- `system:get-top-status`
- `system:open-external-url`

### Dialog

- `dialog:confirm-discard-unsaved`

### Settings

- `settings:get`
- `settings:save`

### Filesystem

- `fs:browse-directory`
- `fs:root`
- `fs:list`
- `fs:watch`
- `fs:unwatch`
- `fs:read`
- `fs:save`
- `fs:rename`
- `fs:delete`
- `fs:create-file`
- `fs:create-file-from-buffer`
- `fs:create-directory`
- `fs:move`
- `fs:copy-into`
- `fs:reveal`
- `fs:copy-path`

### Codex

- `codex:stats`
- `codex:launch`

### Window

- `window:focus`

## preload API

`window.api` and `window.nightOps` expose the same bridge object.

Available methods:

- `getSystemUsage`
- `getCodexStats`
- `getSettings`
- `saveSettings`
- `getSystemStatus`
- `getTopStatus`
- `openExternalUrl`
- `confirmDiscardUnsaved`
- `focusWindow`
- `browseDirectory`
- `getRootDirectory`
- `listDirectory`
- `watchFile`
- `unwatchFile`
- `onFileChanged`
- `readFile`
- `saveFile`
- `renameFile`
- `deleteFile`
- `createFile`
- `createFileFromBuffer`
- `createDirectory`
- `moveFile`
- `copyFileToDirectory`
- `revealFile`
- `copyFilePath`
- `launchCodex`

`window.electronAPI.onExternalDrop(paths)` is also exposed for external drop events.
