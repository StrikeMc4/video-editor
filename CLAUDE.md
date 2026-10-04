# CLAUDE.md

Desktop video editor built with Electron and FFmpeg. It has no framework, no bundler, and no build step: the code is plain JS, HTML and CSS. The user guide is `VIDEDIT.md`; keep it in sync when you change user-visible behaviour.

## Commands

```
npm install      # Electron + ffmpeg-static + ffprobe-static
npm start        # launches the app (electron .)
```

There is no test suite, linter or build in the repo. Verify changes by driving the real app (see **Verifying changes**).

## Layout

| File | Role |
|---|---|
| `main.js` | Main process: window, open/save dialogs, `ffprobe` (duration, display size, rotation, audio), thumbnails into a temp dir, spawns the export and streams progress |
| `preload.js` | `contextBridge` → `window.api` (importMedia, loadMedia, pathForFile, exportVideo, cancelExport, onExportProgress, revealFile) |
| `export.js` | `buildExportArgs(clips, settings, outPath)`: builds the whole FFmpeg command/`filter_complex`. Pure function, can be tested from Node |
| `src/effects.js` | Shared by renderer **and** main (UMD: `<script>` sets `window.Effects`, Node uses `require`). Filter presets (CSS + FFmpeg equivalents), transitions, `DEFAULT_ADJUST`, `DEFAULT_TRANSFORM`, `clampTransition`, `buttedNext`, `transitionPairs` |
| `src/renderer.js` | All UI: state, undo, timeline, playback, transform box, inspector, export modal. One classic script; top-level `const`s/functions are globals |
| `src/index.html`, `src/styles.css` | Layout; CSS colour tokens live on `:root` |

## Data model (renderer `state`)

```js
media: [{ id, path, name, url, thumb, duration, width, height, hasAudio }]  // width/height = DISPLAY size
clips: [{ id, mediaId, track, start, in, out, effect, adjust,
          transform: { x, y, scale, rotation },   // x/y = fraction of frame, scale vs fit-to-frame, deg clockwise
          transition: { type, duration } }]       // to the clip butted after it on the same track
```

- Timeline position is `start`. Length is `out - in`. Track 0 is V1 (bottom). Higher tracks draw on top.
- Tracks are **implicit**: `trackCount()` is derived from the clips. After any move or delete, call `normalizeTracks()` so empty tracks vanish.
- Placement rule (the user explicitly asked for it): if a dropped clip overlaps a clip on the target track, it goes on a **new track directly above** that track. Dropping above all tracks or below V1 creates a top or bottom track. Use `planPlacement()` + `applyPlacement()`, and never set `track` by hand.
- A transition exists only when two clips **butt** on the same track (`|b.start - aEnd| < BUTT_EPS`). It is centred on the cut and must never shift timing. `clampTransition` caps it at the shorter clip.
- Old clips may lack `transform`. Always read it through `tf(c)`.

## Conventions

- Every mutation is preceded by `commit()` (undo snapshot). For continuous gestures (sliders, drags) use `beginEdit()`/`endEdit()` or commit once on the first move, so one gesture equals one undo step.
- Re-render with `renderAll()` (timeline, inspector, buttons, transform box). During drags, use the cheaper live paths (`renderTimeline()`, `applyTransformLive()`, `showFrame()`).
- **Preview and export must match.** Any new filter, transition or transform needs both a CSS path (renderer) and an FFmpeg path (`export.js` / `effects.js`). Check by comparing a preview screenshot with an exported frame.
- Match the existing style: 2-space indent, single quotes, semicolons, small helpers, sparse comments that explain *why*.

## Gotchas (all of these have bitten before)

- `window.api` is defined by `contextBridge` and is **non-configurable**. Never write `const api = …` in the renderer; it throws a SyntaxError and the whole UI silently dies.
- HTML is built with template strings inside double-quoted `style="…"` attributes. Use `cssUrl()` (single-quoted `url('…')`) and `esc()` for user text.
- The `#workspace` grid uses `minmax(0, 1fr)` and `min-width: 0` so the preview can shrink when the window does. Without it, the preview drifts off-centre after un-maximizing.
- `fitFrame()` leaves vertical room for the rotate handle, which sits above the box. Don't put `overflow: hidden` on `#stage`, or the handle gets clipped.
- Preview playback and scrubbing use `requestAnimationFrame`, which Chromium pauses for hidden or occluded windows. In automated runs call `win.webContents.setBackgroundThrottling(false); win.show()`, or playback looks broken when it isn't.
- Export layers are full-frame `rgba`/`yuva420p` with transparent backgrounds, overlaid with `enable='gte(t,S)*lt(t,E)'` (not `between`, which double-draws butted clips). Times are snapped to the frame grid with `q()`.
- ffmpeg-static is FFmpeg 6.1, but ffprobe-static is **4.0.2**. Probe output fields can differ: rotation comes from `tags.rotate` or `side_data_list[].rotation`.
- Packaged builds need the binaries outside asar. `main.js` already rewrites `app.asar` → `app.asar.unpacked`, so keep that if you add packaging.
- Running `npm start` while another instance is open prints harmless `disk_cache … Erişim engellendi` (access denied) errors, and the old window keeps running old code.
- The user's Windows locale is Turkish. `<input type=number>` displays `0,00`, but `.value` is always dot-decimal.

## Verifying changes

Don't stop at "it should work". Launch the real app headlessly with a throwaway Electron entry script kept in your scratchpad, not in the repo:

```js
const { app, BrowserWindow, dialog, shell } = require('electron');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [/* test videos */] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: '<scratch>/out.mp4' });
require('<repo>/main.js');
app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false); win.show();
  // executeJavaScript(...) can call renderer globals (state, importMedia, setPlayhead, renderAll…)
  // and dispatch real PointerEvent/KeyboardEvent to exercise the UI; capturePage() for screenshots.
  app.quit();
}, 1500));
```

Run it with `npx electron <script>` from the repo root. Make test media with the bundled FFmpeg (`node_modules/ffmpeg-static/ffmpeg.exe -f lavfi -i testsrc=…`). Include a clip without audio, mixed resolutions/fps, and a portrait clip made with `-display_rotation 90 … -c copy`. For export changes, call `buildExportArgs` directly from Node, run FFmpeg, check the duration, and look at extracted frames.

Before finishing, re-check every feature listed in `VIDEDIT.md` that your change could affect, and update `VIDEDIT.md` (and the short `README.md`) if behaviour changed.

## Not implemented yet

Project save/load, cropping, per-clip volume, audio-only tracks, packaging/installer. These are listed as limitations in `VIDEDIT.md`, so update that section when adding one.
