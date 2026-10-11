# 003 · Text overlays

Date: 2026-10-11 (partly in commit `5b2d395`)

## Why
The user asked to add text to videos, with a sidebar at the top right, and then for texts to show up in the timeline.

## What
- **Text sidebar** at the top right (above the Inspector): add, list, edit, delete texts.
- **Preview**: HTML text over the videos, draggable, snaps to centre.
- **Timeline**: a T lane above the tracks with a bar per text; drag to move, drag edges to change start/end.
- **Export**: one `drawtext` per text after all video layers.
- Undo/redo covers texts.

## Impact
- New state: `state.texts`, `state.selectedTextId` (in undo snapshots).
- `buildExportArgs` gets a 4th argument `texts`; `main.js` passes `project.texts`.
- Specs: new `text`; `timeline` (T lane), `export` (texts drawn last).
- Docs: `VIDEDIT.md` section 10, `README.md`.
