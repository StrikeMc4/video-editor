# VIDEDIT: Vid Editor guide

Vid Editor is a desktop video editor for Windows, built with Electron and FFmpeg. It has a multi-track timeline, trimming and splitting, filters, transitions, and per-clip **resize, rotate and move**. It exports to MP4.

---

## 1. Install and run

```
cd "D:\omer-claude\vid editor"
npm install      # first time only
npm start        # opens the editor
```

FFmpeg is included through the `ffmpeg-static` and `ffprobe-static` npm packages, so you don't need to install it separately.

---

## 2. The screen

```
┌──────────────────────────────────────────────────────────────────────┐
│ + Import  Undo Redo  Split Delete           Size  FPS  [Export MP4] │  toolbar
├────────────┬──────────────────────────────────────┬─────────────────┤
│  MEDIA     │            PREVIEW                   │   INSPECTOR     │
│  thumbnails│   (click a video here to select it,  │   settings of   │
│  of your   │    then move / resize / turn it)     │   the selected  │
│  files     │   ⏮ ▶ ⏭  00:03.40 / 00:05.00         │   clip          │
├────────────┴──────────────────────────────────────┴─────────────────┤
│ TIMELINE   ruler                                                     │
│  V2   [ clip ]                        ← higher tracks are on top     │
│  V1   [ clip ][ clip ]   [ clip ]                                    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Media:** the files you imported. Drag them onto the timeline, double-click them, or click their **+** button.
- **Preview:** shows the frame at the playhead. Higher tracks are drawn over lower ones.
- **Inspector:** timing, transform, filter and transition settings for the selected clip.
- **Timeline:** your edit. Each row is a track (V1, V2, …).

---

## 3. Importing

- Click **+ Import** (or press **Ctrl+I**) and choose one or more videos, or drag video files from Explorer into the window.
- If the timeline is empty, imported videos are placed one after another on V1.
- Supported: mp4, mov, m4v, webm, mkv, avi, wmv, flv, mpg, ts, mts, 3gp. Phone videos recorded in portrait are detected correctly.

---

## 4. The timeline

### Moving clips
Drag a clip left or right to change when it plays, or up or down to change its track. Gaps between clips show as black.

### Tracks are created automatically
- **If you drop a clip onto another clip, a new track is created directly above it.** A blue **"New track"** line shows this while you drag.
- Dropping in the empty strip **above the top track** creates a new top track. Dropping **below V1** creates a new bottom track.
- When a track has no clips left, it disappears.
- **Higher tracks cover lower tracks.** If you make the upper clip smaller, turn it, or move it, the lower clip shows around it (see section 6).
- The audio of all tracks plays together.

### Snapping
Clips snap to the edges of other clips, to the playhead, and to 0. This makes it easy to put clips exactly back to back.

### Trimming
Drag the **left or right edge** of a clip to shorten or lengthen it. The preview shows the frame at the edge you're dragging. Trimming stops at neighbouring clips on the same track. You can also type exact values in the Inspector under **Timing** (Source in, Source out).

### Splitting
Put the playhead inside a clip and press **S** (or click **Split**). The selected clip is split. If the selected clip isn't under the playhead, the top-most clip under it is split.

### Deleting
Select a clip and press **Delete**.

### Zoom
Use the **Zoom** slider, the **+ / −** keys, or **Ctrl + mouse wheel**.

---

## 5. Playing

- **Space** plays and pauses.
- Click or drag on the **ruler** (or on an empty part of the timeline) to move the playhead.
- **← / →** step one frame. Hold **Shift** to step one second.
- **Home / End** jump to the start or end.

---

## 6. Resize, turn and move a clip ("picture in picture")

Every clip has its own **size, rotation and position**. This is how you show two videos at once.

### Step by step: split a clip and show it on top of the other one

1. **Split** the video: put the playhead where you want to cut and press **S**.
2. **Drag the piece you just split up** onto the empty strip above the tracks, or onto another clip. It lands on a new track (**V2**).
3. Move the playhead to a point where both clips play.
4. **Click on the video in the preview.** The top-most video under your mouse is selected, and a blue box with handles appears around it.
5. Edit it directly in the preview:

| Do this | Result |
|---|---|
| Drag a **corner square** | Resize (keeps the shape of the video). Snaps to 100% |
| Drag the **round handle** on top | Turn the video. Snaps to 0°/90°/180°. Hold **Shift** for 15° steps |
| Drag **inside the box** | Move the video. Snaps to the centre |
| Hold **Alt** while dragging | Turn snapping off |

Now you can see the lower video around the smaller, turned one. The export looks the same.

### Exact values in the Inspector → Transform
- **Size** (%): 100% = fit to the frame.
- **Rotation** (°): positive turns clockwise.
- **Position X / Y** (%): how far the clip's centre is moved, as a percentage of the frame's width or height.
- **Picture-in-picture:** one click makes the clip 40% size in the bottom-right corner.
- **Reset:** back to full frame, no rotation.

Clips with a transform show a **"Transformed"** badge on the timeline. If you split a transformed clip, both pieces keep the transform.

---

## 7. Filters

Select a clip and choose a filter in the Inspector: **None, Black & White, Sepia, Vintage, Vivid, Warm, Cool, Invert, Blur**. You can also adjust **Brightness, Contrast and Saturation** with the sliders (double-click a slider to reset it). Filters apply to that clip only.

---

## 8. Transitions

Transitions go between **two clips that touch on the same track**.

1. Drag the second clip until it snaps against the end of the first one.
2. Click the **+** circle that appears where they meet. It turns pink and selects **Crossfade**.
3. In the Inspector, pick a type and a duration.

Types: Fade through black, Crossfade, Dissolve, Wipe left/right, Slide left/right, Smooth left, Circle open/close, Clock wipe, Pixelize.

The transition is centred on the cut, so other clips on the timeline don't shift. The preview shows a simple fade. **The exported file has the real effect.**

---

## 9. Exporting

1. Choose **Size**: 1080p, 720p or 480p (16:9), Vertical 9:16, or Square 1:1. The preview frame changes to match.
2. Choose **FPS**: 24, 30 or 60.
3. Click **Export MP4** (or press **Ctrl+E**) and choose where to save.
4. A progress bar is shown and you can **Cancel**. When it finishes, click **Show in folder**.

The output is H.264 video with AAC audio, and it plays everywhere.

---

## 10. Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| S | Split at playhead |
| Delete / Backspace | Delete selected clip |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+I | Import |
| Ctrl+E | Export |
| ← / → | Step one frame (Shift: one second) |
| Home / End | Go to start / end |
| + / − or Ctrl+wheel | Zoom timeline |
| Shift (while turning) | Rotate in 15° steps |
| Alt (while moving/resizing/turning) | Turn snapping off |

---

## 11. How it works (for developers)

| File | Purpose |
|---|---|
| `main.js` | Electron main process: window, file dialogs, `ffprobe` (duration, size, rotation, audio), thumbnails, runs the export and reports progress |
| `preload.js` | Safe bridge (`window.api`) between the UI and the main process |
| `export.js` | Builds the FFmpeg `filter_complex` for the whole timeline |
| `src/effects.js` | Filters, transitions and the default transform. Shared by the preview (CSS) and the export (FFmpeg) so they match |
| `src/renderer.js` | The editor UI: state, timeline, tracks, playback, the transform box, the inspector, undo/redo |
| `src/index.html`, `src/styles.css` | Layout and styling |

**Clip data:**
```js
{ id, mediaId, track, start,        // where it sits on the timeline
  in, out,                          // which part of the source file
  effect, adjust,                   // filter
  transform: { x, y, scale, rotation },
  transition: { type, duration } }  // to the next touching clip on the same track
```

**Preview:** one `<video>` element per track, stacked in track order. Filters and transforms are CSS `filter`/`transform`. The playhead is the master clock, and each layer follows the clip under it.

**Export:** every clip (and every transition) becomes a full-frame layer with a transparent background. FFmpeg filters scale the clip, apply its filter, rotate it, and place it on that layer. The layers are overlaid on a black canvas from V1 upward, each only during its own time on the timeline. Transitions use FFmpeg `xfade` between the two clips' layers, centred on the cut. All audio is placed at its timeline position and mixed with `amix`.

---

## 12. Known limitations

- The **preview of transitions** is a simple fade. The exported file has the real wipe, slide, and so on.
- Some formats (for example HEVC/H.265 or certain MKV/AVI files) may show **black in the preview** because the built-in player can't decode them. They still **export correctly**.
- Clips can't be cropped, and there is no separate volume control per clip or audio-only track yet.
- Projects can't be saved yet. Closing the app loses the current edit (export it first).
