# Transform

Code: `src/renderer.js` (`clipBox`, `renderXform`, `startTransformDrag`, Inspector → Transform), `src/effects.js` (`DEFAULT_TRANSFORM`), `export.js` (`layer()`).

### Requirement: Transform model
Each clip SHALL have `transform: { x, y, scale, rotation }`. `x`/`y` move the clip centre as a fraction of the frame; `scale` is relative to fit-to-frame (0.05–5); `rotation` is degrees clockwise. Old clips without `transform` are read through `tf(c)`.

### Requirement: Direct manipulation
Clicking a clip in the preview SHALL select it and show a box with four corner resize handles and a rotate handle above. Dragging inside moves it (snaps to centre; Alt disables), corners scale (snap to 100 %), the round handle rotates (snaps to 90°, Shift = 15° steps).

### Requirement: Numeric control
The Inspector SHALL expose Size %, Rotation °, Position X/Y %, a **Picture-in-picture** preset and **Reset**.

### Requirement: Layers below show through
Where a transformed clip does not cover the frame, lower tracks SHALL be visible (export: transparent full-frame layers).
