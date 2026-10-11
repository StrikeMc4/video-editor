# 004 · Web version

Date: 2026-10-11

## Why
The user asked for a version that opens in Chrome so it can be shared, without changing the desktop app.

## What
- `web/`: a browser `window.api` (in place of `preload.js` + `main.js`) on FFmpeg WebAssembly in a Web Worker. It reuses `src/` and `export.js` as they are.
- Built-in effects are pre-rendered by Node (`web/build-effects.js`) instead of at runtime.
- Open look-alike fonts, used by both the preview and the export.
- `npm run web` for local use, plus a GitHub Pages workflow.

## Impact
- No change to `main.js`, `preload.js`, `export.js`, `builtin-effects.js` or `src/`.
- `package.json`: `web` script. `.gitignore`: `web/effects/`.
- Specs: new `web`. Docs: `VIDEDIT.md` (§1 web version, known limitations), `README.md`.
