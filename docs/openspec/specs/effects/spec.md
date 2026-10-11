# Effects

Code: `builtin-effects.js` (main only: renderer + `VERSION`), `main.js` (`effects:list`), `src/renderer.js` (`loadEffects`, `effectPlan`, `renderEffects`), `src/index.html` (Effects list, "With sound").

### Requirement: Built-in effects
The app SHALL provide Explosion, Fireworks, Lightning and Magic sparkle. They are rendered on first run (particle renderer → raw frames → FFmpeg, sound with `aevalsrc`) into `userData/builtin-effects/<key>-v<VERSION>.mp4`. **`VERSION` SHALL be bumped after changing an effect.**

### Requirement: Media model
Effects live in `state.media` with `builtin` set and `blend: 'screen'`. The media bin SHALL show only files without `builtin`; the Effects list only effects.

### Requirement: Adding
`+` or double-click adds an effect at the playhead on the top track if free, otherwise on a new top track. Dragging onto the timeline follows the normal placement rule.

### Requirement: Screen blend
Clips with `blend: 'screen'` SHALL make black see-through (preview: CSS `mix-blend-mode: screen`; export: RGB `blend=all_mode=screen` on a premultiplied layer). Any clip can switch Blend in the Inspector.

### Requirement: Sound
The "With sound" checkbox sets whether effects added *from now on* are muted. Any clip can be muted in the Inspector (`muted`). A clip without audio has the control disabled.
