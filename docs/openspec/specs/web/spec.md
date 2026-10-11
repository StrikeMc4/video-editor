# Web version

Code: `web/` (`boot.js`, `web-api.js`, `ffmpeg-worker.js`, `web.css`, `build-effects.js`, `serve.js`), `.github/workflows/pages.yml`.

### Requirement: Same editor, no fork
The web version SHALL run `src/index.html`, `src/styles.css`, `src/effects.js`, `src/renderer.js` and `export.js` unchanged. `boot.js` copies the body of `src/index.html` (without scripts) and loads `effects.js`, then `web-api.js`, then `renderer.js`. Electron SHALL NOT load anything from `web/`.

### Requirement: window.api
`web-api.js` SHALL provide the same `window.api` as `preload.js`:
- `importMedia`: a file input; `pathForFile`: registers a `File` under a virtual path `/in/<n>_<name>`; `loadMedia`: probes those paths.
- Probe SHALL use FFmpeg-wasm's `ffprobe` and the same rules as `main.js` (SAR, `tags.rotate` / `side_data_list` rotation, attached pictures skipped, `hasAudio`). Thumbnails are a frame grabbed by a `<video>` element. A file the browser can't play is rejected with an error.
- `listEffects`: reads `web/effects/effects.json`, made by `build-effects.js` from the desktop `builtin-effects.js`.
- `exportVideo`: evaluates `export.js` with stub `fs`/`path`/`process`, so fonts resolve to `/Fonts/<windows name>`. It runs the args in the worker and saves through `showSaveFilePicker` (cancel → `{ canceled: true }`) or a download. Progress comes from `-progress pipe:1` like on the desktop. `cancelExport` terminates the worker.
- `revealFile` opens the exported video in a new tab, and the modal button reads **Play video**.

### Requirement: FFmpeg in the browser
`ffmpeg-worker.js` SHALL load `@ffmpeg/core@0.12.10` (single-threaded UMD) from jsDelivr, so no COOP/COEP headers are needed. The `.wasm` URL is passed through the `mainScriptUrlOrBlob` hash because the core ignores `locateFile`. Inputs are mounted from Blobs with WORKERFS (not copied into memory). The worker starts at page load so that FFmpeg is ready by the first import.

### Requirement: Fonts match
Text SHALL be drawn with the same files in the preview (`web.css` `@font-face` overriding Arial, Verdana, Times New Roman, Courier New, Impact, Comic Sans MS) and in the export (written to `/Fonts` under the Windows file names).

### Requirement: Hosting
`npm run web` SHALL build the effects if missing and serve the repo at `http://localhost:8080/web/`, with range requests. The Pages workflow SHALL build the effects and publish `src/`, `web/` and `export.js`, with a root redirect to `web/`.
