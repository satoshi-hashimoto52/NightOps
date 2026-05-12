# SPEC

## Scope

- NightOps is a desktop helper app for local development work.
- The terminal is the primary workspace.

## Core flows

### Startup

- On startup, the app loads the saved initial directory.
- If no initial directory is configured, the home directory is used.
- If the previously selected file still exists under the current root, it is restored.

### Root directory

- The root directory can be changed from the Browse button.
- When the root changes, the current selection is cleared.
- If there are unsaved tabs, the app shows a Japanese confirmation dialog before discarding them.

### Tree

- The tree supports lazy loading of folders.
- Hidden entries include `.git`, `node_modules`, and `.cache`.
- Tree sorting is available for `name`, `ext`, and `update`.
- The tree supports multi-select, range select, rename, delete, copy, cut, paste, create file, create folder, drag move, and external drop.

### Preview / editor

- Tabs are kept per pane.
- Up to two panes can be shown.
- Markdown files render with an outline column and a resizable divider.
- The outline can be hidden.
- Text files can be edited and saved.
- `Cmd/Ctrl+F` opens editor search.
- `Cmd/Ctrl+D` adds the next matching selection.
- `Cmd/Ctrl+Z` undoes, and `Cmd/Ctrl+Shift+Z` or `Ctrl+Y` redoes.
- `Cmd/Ctrl+Tab` switches tabs and `Cmd/Ctrl+W` closes the active tab.

### Launch

- Launch Codex accepts a directory path and a model.
- It opens Terminal.app and runs `codex -m ...`.

### Settings

- Settings can be dragged and resized.
- Background opacity and container opacity are stored as percentages from `0` to `100`.
- Markdown heading colors and sizes are stored per heading level.
- Codex models, usage model, divisors, and reset schedule are saved in `settings.json`.

## I/O

### Inputs

- Directory selection
- Tree operations
- File edits
- Launch model selection
- Settings values

### Outputs

- Tree display
- Preview / editor panes
- Launch / Settings modals
- CPU / memory monitoring
- Codex usage display
- Status notifications

## File limits

- CSV preview is limited to 1000 rows.
- Non-PDF files larger than 5MB are not previewed.
- PDF rendering is preview-only.
