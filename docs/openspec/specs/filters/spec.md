# Filters

Code: `src/effects.js` (`PRESETS`, `cssFilter`, `ffmpegFilter`, `DEFAULT_ADJUST`), `src/renderer.js` (Inspector → Filter), `export.js`.

### Requirement: Presets
Each clip SHALL have one preset: None, Black & White, Sepia, Vintage, Vivid, Warm, Cool, Invert, Blur. Every preset has a CSS form (preview) and an FFmpeg form (export).

### Requirement: Adjustments
Each clip SHALL have `adjust { brightness -0.5…0.5, contrast 0.5…2, saturation 0…3 }`. Double-clicking a slider resets it. **Reset filter** restores the preset and all three.

### Requirement: Preview/export parity
A new filter SHALL be added to `PRESETS` with both `css` and `ff`, and checked by comparing a preview screenshot with an exported frame.
