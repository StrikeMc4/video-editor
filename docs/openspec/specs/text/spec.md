# Text overlays

Code: `src/renderer.js` (section "text overlays": `renderTexts`, `renderTextPanel`, `addText`, `deleteText`, `selectText`; `startTextBarDrag`; text lane in `renderTimeline`), `src/effects.js` (`FONTS`, `DEFAULT_TEXT`, `TEXT_*` constants), `export.js` (`drawtext`, `ffQuote`, `fontFile`), `src/index.html` (`#right-col`, `#text-panel`, `#texts`), `src/styles.css`.

### Requirement: Data model
Texts SHALL live in `state.texts`, separate from clips:
`{ id, text, font, bold, size, color, outline, bg, bgColor, x, y, start, duration }`. `size` = fraction of frame height; `x`/`y` = centre as a fraction of the frame (like a clip transform); `start`/`duration` in seconds. A text has no track and does not change the video's length.

### Requirement: Sidebar
A **Text** sidebar SHALL sit at the top right, above the Inspector. It has **+ Add text**, a list of all texts, and for the selected one: text, font, size, colour, Bold, Outline, Box (+ colour), Start, Duration, Position X/Y, **Start at playhead**, **Centre**, **Delete**.

#### Scenario: Add
- **WHEN** the user clicks + Add text with the playhead at 1.0 s
- **THEN** a 3 s text starts at 1.0 s, is selected, and its text box is focused

### Requirement: Preview
Active texts (`start <= playhead < start + duration`) SHALL be drawn as HTML in `#texts`, above the videos and below nothing else. Dragging a text moves it (snaps to centre, Alt disables) and updates the X/Y fields. Selecting a text from the list moves the playhead into it if it is outside.

### Requirement: Timeline lane
Once a text exists, a **T lane** SHALL appear above the tracks with one green bar per text. Dragging the bar moves it (snapping); dragging an edge changes start or end (min 0.1 s). The playhead jumps to the edge being dragged. The lane is the only thing that changes track geometry (`laneH()`). Timeline width includes texts running past the last clip.

### Requirement: Export
Each text SHALL be drawn with FFmpeg `drawtext` after all video layers, enabled between its start and end, centred like the preview (`x=(w-text_w)/2+X*W`). Outline = `borderw`, box = `box=1` with `boxcolor@0.6` and `boxborderw`. Text SHALL be escaped for both the option and graph parsers (`ffQuote`) and use `expansion=none`. Fonts are Windows fonts from `%windir%\Fonts`, falling back to Arial.

### Requirement: Undo
Text edits SHALL be undoable; snapshots include `texts` and `selectedTextId`. Typing/slider gestures are one step.

### Known limits
- Single line; no per-letter styling or animation.
- Windows font set only (Arial, Verdana, Times New Roman, Courier New, Impact, Comic Sans).
- A typed backslash is not drawn in the export.
- Text starting after the last clip is not in the export (`total` is clip-based).
