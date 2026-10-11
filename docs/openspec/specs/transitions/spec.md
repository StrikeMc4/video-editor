# Transitions

Code: `src/effects.js` (`TRANSITIONS`, `clampTransition`, `buttedNext`, `transitionPairs`, `BUTT_EPS`), `src/renderer.js` (`layerOpacity`, `.tr-badge`, Inspector), `export.js` (xfade layers).

### Requirement: Existence
A transition SHALL exist only when two clips **butt** on the same track (`|b.start - aEnd| < BUTT_EPS`). It is stored on the first clip: `transition { type, duration }`.

#### Scenario: Clips pulled apart
- **WHEN** the clips no longer touch
- **THEN** the transition is ignored (no error, no timing change)

### Requirement: Timing
A transition SHALL be centred on the cut and SHALL never shift any clip's timing. Duration is capped by `clampTransition` at the shorter clip.

### Requirement: Types
Cut, fade through black, crossfade, dissolve, wipe left/right, slide left/right, smooth left, circle open/close, clock wipe, pixelize (FFmpeg `xfade` names in `TRANSITIONS`).

### Requirement: Preview approximation
The preview SHALL show a simple fade (outgoing fades out over the first half, incoming in over the second). The export renders the real effect. The Inspector says so.

### Requirement: Audio
Around a transition the outgoing clip's audio plays on for half the duration and fades out while the incoming fades in.
