# 004 · Design

- **Shim, not fork.** `boot.js` loads the desktop page and scripts as they are, so features added to the app appear on the web without extra work. Only `window.api` differs.
- **export.js run as-is.** Its source is evaluated with a `require` that returns small `fs`/`path` stubs, so the filter graph is the same code on both platforms.
- **Single-threaded FFmpeg core.** The multi-threaded core needs SharedArrayBuffer, which requires COOP/COEP headers that GitHub Pages can't set. It is slower, but it works on any static host.
- **Our own worker instead of @ffmpeg/ffmpeg.** That package's worker can't be created from a CDN (cross-origin). A classic worker can `importScripts` the core from jsDelivr.
- **WORKERFS.** Inputs are read from the File/Blob on demand, so big videos don't fill the ~2 GB WebAssembly memory. Only the output is held in memory.
