# Data Flow

## Startup

- `App.jsx` loads settings from `settings.json`.
- The root directory is restored from settings, or the home directory is used as a fallback.
- Top bar status is refreshed from the main-process system APIs.

## Tree interaction

- The tree requests folder contents lazily through `fs:list`.
- The tree keeps selection and sorting state in the renderer.
- Tree edits use filesystem IPC calls for create, rename, delete, move, copy, and reveal.

## Preview / edit

- Opening a file creates or activates a tab in the active pane.
- Text files are watched with a single active file watcher.
- Editing stays in the renderer and saves through `fs:save`.
- Markdown tabs keep outline width and outline visibility in client state.

## Search and selection

- `Cmd/Ctrl+F` opens the editor search bar.
- `Cmd/Ctrl+D` adds the next matching selection.
- Multi-selection edits are applied in the renderer before saving.

## Codex and status

- `codex:stats` reads `~/.codex/history.jsonl` in the main process.
- `system:get-top-status` returns user, disk, and Git remote branch information.
- Clicking the Git branch label opens the remote URL in the default browser when it exists.

## Launch

- Launch Codex sends the selected directory and model to the main process.
- The main process opens Terminal.app and runs `codex -m ...`.
