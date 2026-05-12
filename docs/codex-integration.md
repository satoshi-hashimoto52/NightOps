# Codex Integration

## Launch

- The Launch panel accepts a directory path and a model.
- It shows a command preview for the final Terminal.app command.
- Launching uses `osascript` to open Terminal.app and run `codex -m ...`.

## Settings

- Codex models are stored in `settings.json`.
- The selected launch model and usage model are saved separately.
- Usage divisors are stored for Weekly and 5H calculations.
- Current remaining percentages are stored as percentages from `0` to `100`.

## Usage metrics

- `codex:stats` reads `~/.codex/history.jsonl`.
- The app displays request count, session count, token estimate, 5H remaining, and Weekly remaining.
- The 5H and Weekly reset times are calculated from the saved reset settings.

## Top bar

- The top bar shows Codex request count, token estimate, 5H remaining, and Weekly remaining.
- Next reset timestamps are displayed next to the remaining percentages.
