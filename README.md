# Opus

A simple desktop video editor built with Electron and FFmpeg. Plain JS/HTML/CSS: no framework, no bundler, no build step.

## Run

    npm install
    npm start

FFmpeg ships with the app (`ffmpeg-static`, `ffprobe-static`); nothing else to install.

**Web version** (the same editor in Chrome; the desktop app is unchanged): `npm run web`, then open http://localhost:8080/web/. `.github/workflows/pages.yml` publishes it to GitHub Pages.

## What it does

Multi-track timeline (drop on a clip → new track above) · trim, split, snap · move / resize / rotate clips in the preview · filters · transitions between touching clips · built-in effects (explosion, fireworks, …) with optional sound · text titles · MP4 export (1080p–480p, vertical, square; 24/30/60 fps) · undo/redo.

How to use each feature: **[VIDEDIT.md](VIDEDIT.md)**.

## Documentation

| File | For | Contents |
|---|---|---|
| `README.md` | everyone | this page: run it, where everything is |
| `VIDEDIT.md` | users | the user guide, shortcuts, known limitations |
| `CLAUDE.md` | agents / developers | data model, conventions, gotchas, how to verify a change |
| `docs/openspec/specs/` | agents / developers | what each area is supposed to do now (one `spec.md` per area) |
| `docs/openspec/changes/archive/` | agents / developers | log of every change made: why, what, tasks |

## File structure

```
vid editor/
├── main.js               Main process: window, open/save dialogs, ffprobe (duration, display size,
│                         rotation, audio), thumbnails, built-in effects IPC, spawns the export + progress
├── preload.js            contextBridge → window.api (importMedia, loadMedia, listEffects, pathForFile,
│                         exportVideo, cancelExport, onExportProgress, revealFile)
├── export.js             buildExportArgs(clips, settings, outPath, texts): the whole FFmpeg command /
│                         filter_complex (video layers, transitions, text drawtext, audio mix). Pure, testable from Node
├── builtin-effects.js    Main only. Renders the built-in effects (particles → frames → FFmpeg, aevalsrc sound)
│                         into userData/builtin-effects/<key>-v<VERSION>.mp4 on first run
├── src/
│   ├── index.html        Layout: toolbar, media + effects (left), preview + transport (middle),
│   │                     text sidebar + inspector (right), timeline (bottom), export modal
│   ├── styles.css        All styling; colour tokens on :root
│   ├── renderer.js       All UI in one classic script: state, undo, timeline (tracks + text lane), playback,
│   │                     transform box, text overlays, inspector, export modal
│   └── effects.js        Shared by renderer and main (UMD): filter presets (CSS + FFmpeg), transitions,
│                         fonts, DEFAULT_ADJUST / DEFAULT_TRANSFORM / DEFAULT_TEXT, transition helpers
├── web/                  Browser version. Reuses src/ and export.js unchanged; Electron never loads it
│   ├── index.html        Entry page
│   ├── boot.js           Pulls in src/index.html's body, then effects.js, web-api.js, renderer.js
│   ├── web-api.js        Browser window.api (instead of preload.js + main.js): file picker, probe, thumbnails,
│   │                     runs export.js's buildExportArgs, save / download
│   ├── ffmpeg-worker.js  Web Worker running FFmpeg WebAssembly (@ffmpeg/core 0.12.10 from jsDelivr)
│   ├── web.css           @font-face so preview text uses the export's fonts
│   ├── fonts/            Open look-alikes of the Windows fonts (fonts/LICENSE.md)
│   ├── build-effects.js  Node: renders the built-in effects into web/effects/ (gitignored) + effects.json
│   └── serve.js          Node: `npm run web`, local static server
├── .github/workflows/pages.yml   Builds the effects and publishes the web version to GitHub Pages
├── docs/
│   ├── README.md         Index of the docs
│   └── openspec/         specs/<area>/spec.md + changes/archive/NNN-name/ (see docs/openspec/README.md)
├── VIDEDIT.md            User guide
├── CLAUDE.md             Agent instructions
└── package.json          Electron + ffmpeg-static + ffprobe-static; `npm start` = electron .
```

**Where to look for…**

| Task | Files |
|---|---|
| Timeline, tracks, drag/drop, trim, split | `src/renderer.js` (placement, timeline interaction) |
| Preview playback | `src/renderer.js` (`syncPlayers`, `tick`) |
| A new filter or transition | `src/effects.js` (CSS + FFmpeg) and `export.js` |
| Text overlays | `src/renderer.js` (text overlays section), `src/effects.js` (`FONTS`), `export.js` (`drawtext`) |
| Built-in effects | `builtin-effects.js`, `main.js` (`effects:list`) |
| Export output / codecs | `export.js`, `main.js` (`export:start`) |
| Import / probing / thumbnails | `main.js` (desktop), `web/web-api.js` (web) |
| Web version | `web/`, spec `docs/openspec/specs/web/` |
