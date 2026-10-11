# 001 · Initial editor

Commit: `3eb8c7f initial commit`

## Why
A simple desktop video editor with no build step: Electron UI, FFmpeg for probing and export.

## What
- Import (button, Ctrl+I, drag from Explorer); ffprobe for duration, display size, rotation, audio; thumbnails.
- Multi-track timeline with implicit tracks, the "new track above on overlap" placement rule, snapping, trim, split, delete, zoom.
- Preview with one `<video>` per track; playhead as master clock.
- Per-clip transform (move / resize / rotate in the preview + Inspector, PIP preset).
- Filter presets + brightness / contrast / saturation (CSS and FFmpeg forms).
- Transitions between butted clips, centred on the cut (`xfade`).
- MP4 export with progress and cancel; undo / redo.

## Impact
Specs: `timeline`, `transform`, `filters`, `transitions`, `export`.
