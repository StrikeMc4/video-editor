// Shared between the renderer (preview, via CSS filters) and the main process
// (export, via FFmpeg filters). Loaded as a plain <script> or with require().
(function (root) {
  const PRESETS = {
    none:      { label: 'None',          ff: '', css: '' },
    grayscale: { label: 'Black & White', ff: 'hue=s=0', css: 'grayscale(1)' },
    sepia:     { label: 'Sepia',         ff: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', css: 'sepia(1)' },
    vintage:   { label: 'Vintage',       ff: 'curves=preset=vintage', css: 'sepia(.35) contrast(1.1) saturate(.8) brightness(1.05)' },
    vivid:     { label: 'Vivid',         ff: 'eq=saturation=1.6:contrast=1.1', css: 'saturate(1.6) contrast(1.1)' },
    warm:      { label: 'Warm',          ff: 'colorbalance=rs=.15:gs=.05:bs=-.15:rm=.1:bm=-.1', css: 'sepia(.25) saturate(1.3)' },
    cool:      { label: 'Cool',          ff: 'colorbalance=rs=-.15:bs=.15:rm=-.1:bm=.1', css: 'hue-rotate(-10deg) saturate(1.1) brightness(1.03)' },
    invert:    { label: 'Invert',        ff: 'negate', css: 'invert(1)' },
    blur:      { label: 'Blur',          ff: 'gblur=sigma=6', css: 'blur(4px)' },
  };

  // `xfade` = name of the FFmpeg xfade transition. Transitions are centred on
  // the cut between two butted clips on the same track, so they never shift
  // anything else on the timeline.
  const TRANSITIONS = {
    none:        { label: 'Cut (none)' },
    fadeblack:   { label: 'Fade through black', xfade: 'fadeblack' },
    fade:        { label: 'Crossfade',     xfade: 'fade' },
    dissolve:    { label: 'Dissolve',      xfade: 'dissolve' },
    wipeleft:    { label: 'Wipe left',     xfade: 'wipeleft' },
    wiperight:   { label: 'Wipe right',    xfade: 'wiperight' },
    slideleft:   { label: 'Slide left',    xfade: 'slideleft' },
    slideright:  { label: 'Slide right',   xfade: 'slideright' },
    smoothleft:  { label: 'Smooth left',   xfade: 'smoothleft' },
    circleopen:  { label: 'Circle open',   xfade: 'circleopen' },
    circleclose: { label: 'Circle close',  xfade: 'circleclose' },
    radial:      { label: 'Clock wipe',    xfade: 'radial' },
    pixelize:    { label: 'Pixelize',      xfade: 'pixelize' },
  };

  const DEFAULT_ADJUST = { brightness: 0, contrast: 1, saturation: 1 };

  // Per-clip placement in the frame. x/y move the clip's centre as a fraction
  // of the frame width/height, scale is relative to "fit to frame", rotation
  // is in degrees clockwise.
  const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0 };

  function adjustIsDefault(a) {
    return !a || (a.brightness === 0 && a.contrast === 1 && a.saturation === 1);
  }

  function ffmpegFilter(effect, adjust) {
    const parts = [];
    if (!adjustIsDefault(adjust)) {
      parts.push(`eq=brightness=${adjust.brightness}:contrast=${adjust.contrast}:saturation=${adjust.saturation}`);
    }
    const p = PRESETS[effect];
    if (p && p.ff) parts.push(p.ff);
    return parts.join(',');
  }

  function cssFilter(effect, adjust) {
    const parts = [];
    if (!adjustIsDefault(adjust)) {
      parts.push(`brightness(${1 + adjust.brightness}) contrast(${adjust.contrast}) saturate(${adjust.saturation})`);
    }
    const p = PRESETS[effect];
    if (p && p.css) parts.push(p.css);
    return parts.join(' ') || 'none';
  }

  // A transition takes half its duration from each clip, so limiting it to the
  // shorter clip means a clip's incoming and outgoing transitions never overlap.
  function clampTransition(t, durA, durB) {
    if (!t || !TRANSITIONS[t.type] || t.type === 'none') return { type: 'none', duration: 0 };
    const d = Math.min(t.duration, durA, durB);
    return d >= 0.05 ? { type: t.type, duration: +d.toFixed(3) } : { type: 'none', duration: 0 };
  }

  const BUTT_EPS = 0.01; // clips closer than this count as touching

  // The clip that starts exactly where `a` ends on the same track, if any.
  function buttedNext(clips, a) {
    const aEnd = a.start + a.out - a.in;
    return clips.find((c) => c !== a && c.track === a.track && Math.abs(c.start - aEnd) < BUTT_EPS) || null;
  }

  // Map of clip id -> {a, b, type, duration} for every active transition.
  function transitionPairs(clips) {
    const pairs = new Map();
    for (const a of clips) {
      if (!a.transition || a.transition.type === 'none') continue;
      const b = buttedNext(clips, a);
      if (!b) continue;
      const t = clampTransition(a.transition, a.out - a.in, b.out - b.in);
      if (t.type !== 'none') pairs.set(a.id, { a, b, type: t.type, duration: t.duration });
    }
    return pairs;
  }

  const Effects = {
    PRESETS, TRANSITIONS, DEFAULT_ADJUST, DEFAULT_TRANSFORM,
    ffmpegFilter, cssFilter, clampTransition, buttedNext, transitionPairs,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Effects;
  else root.Effects = Effects;
})(this);
