# 002 · Built-in effects with optional sound

Commit: `a39ab8a Add built-in effects with optional sound`

## Why
Users wanted ready-made overlays (explosion, fireworks, …) without hunting for stock footage.

## What
- `builtin-effects.js`: particle renderer → raw frames → FFmpeg, sound via `aevalsrc`; cached as `userData/builtin-effects/<key>-v<VERSION>.mp4`.
- Effects list under the media bin; `+` adds at the playhead on top.
- Screen blend (`blend: 'screen'`) in preview (CSS) and export (RGB `blend`), selectable for any clip.
- "With sound" default for new effects; per-clip mute in the Inspector (`muted`).

## Impact
Specs: `effects`, `export`. New clip fields `blend`, `muted` (old clips read via `isScreen(c)` / `!!c.muted`).
