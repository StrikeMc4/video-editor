# 004 · Tasks

- [x] `web/index.html` + `boot.js`: load `src/index.html` body and the renderer scripts
- [x] `web/web-api.js`: import, probe, thumbnails, effects, export (save picker / download), progress, cancel
- [x] `web/ffmpeg-worker.js`: @ffmpeg/core 0.12.10, WORKERFS inputs, fonts in `/Fonts`
- [x] `web/web.css` + `web/fonts/`: matching preview/export fonts
- [x] `web/build-effects.js`, `web/serve.js`, `npm run web`, `.github/workflows/pages.yml`
- [x] Verified in Chromium (Electron loading the page without a preload): imported a 720p clip with audio, a 640×480 clip without audio and a rotated portrait clip (probed as 360×640). Added an effect, a fade transition and a text, then exported a 10 s 720p video in about 44 s with correct duration, video and audio. The exported frame matches the preview screenshot.
