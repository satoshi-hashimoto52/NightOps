# Architecture

## Layers

- `electron/main.js` owns native file, settings, system, and launch work.
- `electron/preload.js` exposes the bridge into the renderer.
- `src/` contains the React UI and shared helpers.

## Renderer components

- `App.jsx` owns the top-level workspace state, the launch modal, the settings modal, and the active root directory.
- `TopBar.jsx` shows system and Codex status.
- `FileTree.jsx` handles tree rendering and tree operations.
- `PreviewPane.jsx` manages tabs, panes, previewing, and text editing.
- `LaunchPanel.jsx` opens Codex in Terminal.app.
- `SettingsPanel.jsx` edits persisted settings.
- `BootScreen.jsx` shows the startup overlay.

## Shared utilities

- `src/utils/fileLoader.js` wraps filesystem, launch, and settings IPC calls.
- `src/utils/system.js` wraps system and dialog IPC calls.
- `src/utils/codexLog.js` wraps Codex stats retrieval.
- `src/utils/codexLimits.js` contains reset and usage calculations.

## State ownership

- `settings.json` stores persisted app settings.
- `localStorage` stores the selected file, tree sort mode, recent files, and per-tab state that is kept on the client.
- The right side can keep multiple tabs per pane and up to two panes.

## Data flow

- App startup loads settings and system status.
- Tree actions call the filesystem bridge.
- Preview tabs read and watch the active file.
- Save writes back through the filesystem bridge.
- Launch Codex uses the bridge to open Terminal.app and run the command.
