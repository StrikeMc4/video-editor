# CLAUDE.md

Desktop video editor, Electron + FFmpeg, plain JS/HTML/CSS with no build step.

**Read first:**
- `README.md` → **File structure**: what every file does and where to look for a task.
- `docs/openspec/specs/<area>/spec.md`: the expected behaviour of the area you're changing.
- `VIDEDIT.md`: the user guide.

`npm install`, then `npm start`. There is no test suite, linter or build. Verify by driving the real app (see **Verifying changes**).

## After every change

1. Update the affected `docs/openspec/specs/<area>/spec.md` so it describes the app as it is now.
2. Add `docs/openspec/changes/archive/NNN-name/` (next number) with `proposal.md` and `tasks.md`. Add `design.md` only for a non-obvious decision.
3. If user-visible behaviour changed, update `VIDEDIT.md` (including **Known limitations**).
4. If files were added or moved, update the file structure in `README.md`.

## Data model (renderer `state`)

```js
media: [{ id, path, name, url, thumb, duration, width, height, hasAudio,
          builtin?, blend? }]                     // width/height = DISPLAY size; builtin = effect key
clips: [{ id, mediaId, track, start, in, out, effect, adjust,
          transform: { x, y, scale, rotation },   // x/y = fraction of frame, scale vs fit-to-frame, deg clockwise
          blend, muted,                           // 'normal' | 'screen'; muted drops the clip's audio
          transition: { type, duration } }]       // to the clip butted after it on the same track
texts: [{ id, text, font, bold, size, color, outline, bg, bgColor,
          x, y, start, duration }]                // not clips: no track; size = fraction of frame height
selectedId, selectedTextId, playhead, playing, zoom
```

Invariants (details in the specs):
- Tracks are implicit. After any move or delete, call `normalizeTracks()`. Place clips only through `planPlacement()` + `applyPlacement()`; never set `track` by hand. The user explicitly asked for the "new track above on overlap" rule.
- A transition exists only between clips that **butt** on one track. It is centred on the cut and never shifts timing.
- Old clips may lack `transform`, `blend` or `muted`. Read them through `tf(c)`, `isScreen(c)` and `!!c.muted`.
- Built-in effects are `state.media` items with `builtin` set. Bump `VERSION` in `builtin-effects.js` after changing one.
- The timeline's track y-positions include `laneH()` (the text lane, 0 when there are no texts).

## Conventions

- Every mutation is preceded by `commit()`. A continuous gesture (slider, drag) is one undo step: use `beginEdit()`/`endEdit()` or commit on the first move.
- Re-render with `renderAll()`. During drags use the cheap paths (`renderTimeline()`, `applyTransformLive()`, `renderTexts()`, `showFrame()`). Text edits re-render with `renderTextPanel()`, which also redraws the timeline.
- **Preview and export must match.** Anything visual needs a CSS path (renderer) and an FFmpeg path (`export.js` / `src/effects.js`). Compare a preview screenshot with an exported frame.
- Style: 2-space indent, single quotes, semicolons, small helpers, sparse comments that explain *why*.

## Gotchas (all of these have bitten before)

- `window.api` comes from `contextBridge` and is **non-configurable**. Writing `const api = …` in the renderer throws a SyntaxError, and the whole UI silently dies.
- HTML is built with template strings inside double-quoted `style="…"`. Use `cssUrl()` (single-quoted `url('…')`) and `esc()` for user text.
- `#workspace` uses `minmax(0, 1fr)` and `min-width: 0` so the preview can shrink. Without them it drifts off-centre after un-maximizing.
- `fitFrame()` leaves room for the rotate handle above the box. No `overflow: hidden` on `#stage`.
- `requestAnimationFrame` pauses in hidden windows. Automated runs need `win.webContents.setBackgroundThrottling(false); win.show()`.
- Export overlays use `enable='gte(t,S)*lt(t,E)'`, not `between` (which double-draws butted clips). Times are snapped with `q()`.
- `drawtext` values go through two parsers. Always use `ffQuote()` in `export.js`.
- ffmpeg-static is FFmpeg 6.1, but ffprobe-static is **4.0.2**: rotation comes from `tags.rotate` or `side_data_list[].rotation`.
- Packaged builds need `app.asar` → `app.asar.unpacked` for the binaries (already in `main.js`).
- A second `npm start` prints harmless `disk_cache … Erişim engellendi` errors, and the old window keeps running the old code.
- The Windows locale is Turkish. `<input type=number>` shows `0,00`, but `.value` is dot-decimal.
- Writing files from Bash heredocs mangles backslashes and quotes. For JS with regexes or escapes, use the Write/Edit tools.

## Verifying changes

Launch the real app headlessly with a throwaway script in your scratchpad, not in the repo:

```js
const { app, BrowserWindow, dialog } = require('electron');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [/* test videos */] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: '<scratch>/out.mp4' });
require('<repo>/main.js');
app.whenReady().then(() => setTimeout(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false); win.show();
  // executeJavaScript(...) calls renderer globals (state, importMedia, setPlayhead, renderAll, doExport…)
  // and dispatches real PointerEvent/KeyboardEvent; capturePage() for screenshots.
  app.quit();
}, 1500));
```

Run it with `npx electron <script>` from the repo root. Make test media with `node_modules/ffmpeg-static/ffmpeg.exe -f lavfi -i testsrc=…`. Include a clip without audio, mixed resolutions/fps, and a portrait clip (`-display_rotation 90 … -c copy`). For export changes, call `buildExportArgs` from Node, run FFmpeg, check the duration and look at extracted frames. Before finishing, re-check every `VIDEDIT.md` feature your change could affect.
