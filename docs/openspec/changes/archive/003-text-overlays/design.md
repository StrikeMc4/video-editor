# 003 · Design notes

- **Texts are not clips.** Making them clips would drag them into placement, transitions, trim-by-source and media lookups. A separate `state.texts` with `start`/`duration` keeps all clip code untouched. Cost: a separate lane and drag code (`startTextBarDrag`).
- **Lane only when needed.** `laneH()` is 0 until a text exists, so projects without text look exactly as before. Every y-calculation in the timeline (`rowTop`, `trackFromEvent`, ghosts, empty hint, height) adds `laneH()`.
- **Escaping for drawtext.** Two parser layers: the option parser (`\ ' :`) then the graph parser. `ffQuote` escapes for the first, then single-quotes the whole value for the second, so `, ; [ ]` need nothing. `expansion=none` makes `%` literal. Tested with `It's 100%: a [test], b;c`.
- **Matching preview and export.** Both centre the text box on `x/y`; font size = `size × frame height` px. Box padding (`TEXT_PAD_EM`), box alpha (`TEXT_BG_ALPHA`) and outline (`TEXT_OUTLINE_EM`; CSS stroke is doubled because half of it is hidden by `paint-order`) are shared constants in `src/effects.js`.
- **Fonts.** Windows ships Arial/Verdana/Times/Courier/Impact/Comic with fixed file names, so `FONTS` maps a key to the regular/bold `.ttf` and a CSS family. Missing file → Arial.
- **Single line.** FFmpeg 6.1 `drawtext` can't centre multi-line text (`text_align` came later), so the input is single-line to keep the preview honest.
