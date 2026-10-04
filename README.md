# Vid Editor

A simple desktop video editor built with Electron and FFmpeg.

**Full guide: [VIDEDIT.md](VIDEDIT.md)**

## Run

    npm install
    npm start

FFmpeg ships with the app through `ffmpeg-static` and `ffprobe-static`, so you don't need to install it separately.

## Features

- **Import** videos with the Import button (Ctrl+I) or by dragging files into the window.
- **Multi-track timeline**: drag clips anywhere. If you drop a clip onto another clip, a new track is created above it. Dropping above or below all tracks also makes a new track, and empty tracks are removed. Higher tracks cover lower ones, and the audio from all tracks is mixed.
- **Snapping**: clips snap to the edges of other clips and to the playhead. Drag a clip's edges to trim it.
- **Split** the clip under the playhead by pressing **S**.
- **Resize, rotate and move** each clip: click it in the preview and drag the corners, the round handle, or the clip itself.
- **Filters** for each clip: B&W, Sepia, Vintage, Vivid, Warm, Cool, Invert, Blur, plus brightness, contrast, and saturation sliders.
- **Transitions** between two clips that touch on the same track (centered on the cut): fade through black, crossfade, dissolve, wipes, slides, circle, clock wipe, pixelize.
- **Export** to MP4 (H.264/AAC) at 1080p, 720p, 480p, vertical, or square, and at 24, 30, or 60 fps.
- **Undo/redo** with Ctrl+Z and Ctrl+Y.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play/pause |
| S | Split at playhead |
| Del | Delete selected clip |
| ← / → | Step one frame (hold Shift to step one second) |
| Home / End | Jump to start/end |
| + / − or Ctrl+wheel | Zoom the timeline |

## Files

- `main.js`: Electron main process (file dialogs, ffprobe, thumbnails, running the export)
- `export.js`: builds the FFmpeg `filter_complex` that renders the timeline
- `preload.js`: safe IPC bridge to the UI
- `src/effects.js`: filter and transition definitions shared by the preview (CSS) and the export (FFmpeg)
- `src/renderer.js`, `src/index.html`, `src/styles.css`: the editor UI
