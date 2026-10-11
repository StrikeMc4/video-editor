# 003 · Tasks

## Text sidebar and preview
- [x] `src/effects.js`: `FONTS`, `DEFAULT_TEXT`, `TEXT_BG_ALPHA`, `TEXT_PAD_EM`, `TEXT_OUTLINE_EM`
- [x] `src/index.html`: `#right-col` with `#text-panel` above `#inspector`; `#texts` layer in `#stage`
- [x] `src/styles.css`: right column, text panel, `.txt` preview styles
- [x] `src/renderer.js`: `state.texts`, undo snapshot, `renderTexts` (called from `syncPlayers` and `fitFrame`), `renderTextPanel`, add / delete / select, drag in preview
- [x] Export: `drawtext` in `export.js`, `texts` passed from renderer → `main.js` → `buildExportArgs`
- [x] Verified: Node export with special characters; app run → preview screenshot vs exported frame match; drag + undo

## Text in the timeline
- [x] T lane (`TEXT_H`, `laneH()`), `.tbar` bars with edge handles
- [x] `startTextBarDrag`: move / start edge / end edge, snapping, playhead follows the edge
- [x] Track geometry offset by `laneH()`; timeline width includes text ends
- [x] Verified in app: move +60 px = +1 s, edges, undo, clip row below lane

## Docs
- [x] `VIDEDIT.md` section 10 "Text", sections renumbered; `README.md`
- [x] `docs/openspec` created with specs for all areas and this change log
