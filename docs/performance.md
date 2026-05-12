# Performance

## Current measures

- Tree loading is lazy and only expands folders that are opened.
- The app watches only the currently active file.
- Recent files are capped at 10 entries.
- CSV preview is capped at 1000 rows.
- PDF rendering clamps the rendered dimension to 1200px.
- System and Codex status are refreshed on timers instead of continuously polling the DOM.
- The preview editor keeps one active search layer and one active multi-selection model in memory.

## Notes

- These limits are intended to keep the app responsive during normal local development use.
- The app is not tuned for very large preview buffers beyond the existing file-size checks.
