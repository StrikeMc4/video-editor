# Export

Code: `export.js` (`buildExportArgs(clips, settings, outPath, texts)`: pure, testable from Node), `main.js` (`export:start`, progress, cancel), `src/renderer.js` (`doExport`, modal).

### Requirement: Output
Export SHALL produce H.264 + AAC MP4 (`libx264 veryfast crf 20`, 192k AAC, faststart) at 1080p / 720p / 480p 16:9, vertical 9:16 or square, at 24 / 30 / 60 fps. Ctrl+E starts it; a save dialog picks the path.

### Requirement: Video graph
Every clip and every transition SHALL become a full-frame transparent `rgba`/`yuva420p` layer, overlaid on a black canvas bottom track first, each with `enable='gte(t,S)*lt(t,E)'` (never `between`: it double-draws butted clips). Times SHALL be snapped to the frame grid with `q()`. Texts are drawn last.

### Requirement: Audio
Audio of every clip that has audio and is not muted SHALL be delayed to its timeline position and mixed with `amix` (`normalize=0`).

### Requirement: Progress and cancel
The modal SHALL show progress parsed from FFmpeg `-progress`, allow Cancel (kills FFmpeg and deletes the partial file), and offer **Show in folder** on success. On failure it shows the last lines of stderr.

### Requirement: Preview/export parity
Any new filter, transition, transform or text feature SHALL have both a CSS path (preview) and an FFmpeg path, verified by comparing a preview screenshot with an exported frame.

### Requirement: Binaries
`ffmpeg-static` (FFmpeg 6.1) and `ffprobe-static` (4.0.2, so probe fields differ) are used; `main.js` rewrites `app.asar` → `app.asar.unpacked` for packaged builds.
