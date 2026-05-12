# NightOps

NightOps is an Electron + React helper app for using Codex CLI beside normal local development work.

The terminal remains the primary workspace. NightOps handles file navigation, light editing, launch helpers, and status monitoring around it.

## Current behavior

- Top bar shows:
  - Monitor: CPU name, CPU usage, memory usage, memory used / total
  - Codex: request count, token estimate, 5H remaining, Weekly remaining
  - a clickable Git branch label when a remote URL is available
  - user name and disk free / total
- Left tree supports:
  - name / ext / update sorting
  - multi-select and range select
  - rename, delete, copy, cut, paste
  - create file / folder
  - drag move and external drop
  - right-click context menu
- Right side supports:
  - multiple tabs
  - up to two panes
  - tab drag and drop
  - recent file chips
  - markdown outline
  - outline width resize
  - outline hide / show
  - text editing and save
  - editor search with `Cmd/Ctrl+F`
  - multi-selection editing with `Cmd/Ctrl+D`
  - undo / redo
  - PDF, image, and CSV preview
- Launch panel opens Terminal.app and runs `codex -m ...`.
- Settings panel controls:
  - model list
  - launch default model
  - usage model
  - usage divisors
  - current remaining percentages
  - reset schedule
  - background opacity and blur
  - markdown heading colors and sizes
- A boot screen is shown during startup.

## UI notes

- The app uses a dark translucent baseline for normal UI.
- Launch Codex and Settings use the same panel shell styling.
- The Settings opacity inputs are percentages from `0` to `100`.

## Setup

```bash
cd /Users/hashimoto/vscode/_app/NightOps
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

## Shortcuts

- `Cmd+B`: collapse / expand the tree
- `Ctrl+R`: reload
- `Ctrl+L`: open Launch or submit it when it is already open
- `Ctrl+P`: search for a file name
- `Ctrl/Cmd+Tab`: switch tabs
- `Ctrl/Cmd+W`: close the active tab
- `Cmd/Ctrl+F`: search in the editor
- `Cmd/Ctrl+D`: add the next matching selection
- `Cmd/Ctrl+Z`: undo
- `Cmd/Ctrl+Shift+Z` or `Ctrl+Y`: redo
- In the tree:
  - `Space`: open preview
  - `F2`: rename
  - `Delete` / `Backspace`: delete
  - `Home` / `End` / `PageUp` / `PageDown`: move focus

## Limits

- CSV preview uses a simple parser and renders up to 1000 rows.
- Non-PDF files larger than 5MB are not previewed.
- PDF rendering is page-based and preview-only.
