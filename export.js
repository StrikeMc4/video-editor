// Builds the FFmpeg command line that renders the multi-track timeline to an MP4.
//
// Video: every clip (and every transition between two butted clips) becomes a
// full-frame layer with a transparent background, on which the clip is
// scaled, rotated and positioned by its transform. Layers are overlaid on a
// black canvas from the bottom track up, each only during its time range, so
// lower tracks show around clips that were made smaller or turned.
// Layers with the "screen" blend (built-in effects on black) are combined with
// what is below them by brightening it, so their black background vanishes.
// Audio: every clip's audio (unless muted) is delayed to its timeline position and mixed.
const { TRANSITIONS, DEFAULT_TRANSFORM, ffmpegFilter, transitionPairs } = require('./src/effects');

const f3 = (n) => Math.max(0, n).toFixed(3);
const even = (n) => Math.max(2, 2 * Math.round(n / 2));

/**
 * @param {Array<{id:string, path:string, hasAudio:boolean, mediaDuration:number,
 *   mediaWidth:number, mediaHeight:number, track:number, start:number, in:number,
 *   out:number, effect:string, adjust:object, transform:object, blend?:string,
 *   muted?:boolean, transition:{type:string,duration:number}}>} clips
 * @param {{width:number, height:number, fps:number}} settings
 * @param {string} outPath
 * @returns {{args:string[], duration:number}}
 */
function buildExportArgs(clips, settings, outPath) {
  const { width: W, height: H, fps } = settings;
  const q = (t) => Math.round(t * fps) / fps; // snap to the frame grid
  const clipEnd = (c) => c.start + c.out - c.in;

  const pairs = transitionPairs(clips);
  const incoming = new Map([...pairs.values()].map((p) => [p.b.id, p]));

  // Layers: each clip minus the halves taken by its transitions, plus the
  // transitions themselves. Bottom track first so higher tracks end up on top.
  const items = [];
  for (const c of clips) {
    const tin = incoming.get(c.id);
    const tout = pairs.get(c.id);
    const start = q(c.start + (tin ? tin.duration / 2 : 0));
    const end = q(clipEnd(c) - (tout ? tout.duration / 2 : 0));
    if (end - start >= 0.5 / fps) items.push({ kind: 'clip', c, track: c.track, start, end, screen: c.blend === 'screen' });
  }
  for (const p of pairs.values()) {
    const cut = clipEnd(p.a);
    const screen = p.a.blend === 'screen' && p.b.blend === 'screen';
    items.push({ kind: 'tr', p, track: p.a.track, start: q(cut - p.duration / 2), end: q(cut + p.duration / 2), screen });
  }
  items.sort((a, b) => a.track - b.track || a.start - b.start);
  const total = Math.max(...clips.map((c) => q(clipEnd(c))), ...items.map((i) => i.end));

  const args = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1'];
  const graph = [];
  let inputs = 0;
  const addInput = (file, ss, t) => {
    args.push('-ss', f3(ss), '-t', f3(t), '-i', file);
    return inputs++;
  };

  // A full-frame transparent layer of `dur` seconds showing clip `c` from
  // source time `srcStart`, transformed. Reading before the start or past the
  // end of the file freezes the first/last frame (transitions reach beyond a
  // clip's in/out points).
  function layer(c, srcStart, dur, label) {
    const t = c.transform || DEFAULT_TRANSFORM;
    const pre = Math.max(0, -srcStart);
    const readStart = Math.min(Math.max(0, srcStart), Math.max(0, c.mediaDuration - 0.5));
    const i = addInput(c.path, readStart, Math.max(0.1, dur - pre));
    const tpad = `${pre > 0 ? `start_mode=clone:start_duration=${f3(pre)}:` : ''}stop_mode=clone:stop_duration=${f3(dur + 1)}`;
    const fit = Math.min(W / c.mediaWidth, H / c.mediaHeight) * t.scale;
    const v = [
      'setpts=PTS-STARTPTS',
      `fps=${fps}`,
      `tpad=${tpad}`,
      `trim=duration=${f3(dur)}`,
      'setpts=PTS-STARTPTS',
    ];
    const fx = ffmpegFilter(c.effect, c.adjust);
    if (fx) v.push(fx);
    v.push(`scale=${even(c.mediaWidth * fit)}:${even(c.mediaHeight * fit)}`, 'setsar=1', 'format=rgba');
    if (t.rotation % 360 !== 0) {
      const a = ((t.rotation * Math.PI) / 180).toFixed(6);
      v.push(`rotate=${a}:ow=rotw(${a}):oh=roth(${a}):c=none`);
    }
    graph.push(`[${i}:v]${v.join(',')}[${label}s]`);
    graph.push(`color=c=black@0:s=${W}x${H}:r=${fps}:d=${f3(dur)},format=rgba[${label}c]`);
    graph.push(`[${label}c][${label}s]overlay=x=(W-w)/2+${(t.x * W).toFixed(2)}:y=(H-h)/2+${(t.y * H).toFixed(2)}`
      + `:format=auto:eof_action=pass,format=yuva420p,settb=AVTB[${label}]`);
  }

  items.forEach((it, k) => {
    const L = `l${k}`;
    const d = it.end - it.start;
    if (it.kind === 'clip') {
      layer(it.c, it.c.in + (it.start - it.c.start), d, L);
    } else {
      const { a, b, type } = it.p;
      layer(a, a.in + (it.start - a.start), d, `${L}a`);
      layer(b, b.in + (it.start - b.start), d, `${L}b`);
      graph.push(`[${L}a][${L}b]xfade=transition=${TRANSITIONS[type].xfade}:duration=${f3(d)}:offset=0[${L}]`);
    }
    graph.push(`[${L}]setpts=PTS-STARTPTS+${f3(it.start)}/TB[${L}t]`);
  });

  graph.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f3(total)},format=yuv420p[base0]`);
  items.forEach((it, k) => {
    const enable = `enable='gte(t,${f3(it.start)})*lt(t,${f3(it.end)})'`;
    if (!it.screen) {
      graph.push(`[base${k}][l${k}t]overlay=eof_action=pass:${enable}[base${k + 1}]`);
      return;
    }
    // Screen is done in RGB (in YUV it shifts colours). Premultiplying turns
    // the layer's transparent area into black, which screen leaves unchanged.
    graph.push(`[base${k}]format=gbrp[bg${k}]`);
    graph.push(`[l${k}t]format=rgba,premultiply=inplace=1,format=gbrp[fg${k}]`);
    graph.push(`[bg${k}][fg${k}]blend=all_mode=screen:eof_action=pass:${enable},format=yuv420p[base${k + 1}]`);
  });
  graph.push(`[base${items.length}]format=yuv420p,setsar=1[vout]`);

  // Audio: around a transition the outgoing clip plays on for half the
  // transition and fades out while the incoming one fades in.
  const audio = [];
  for (const c of clips) {
    if (!c.hasAudio || c.muted) continue;
    const tin = incoming.get(c.id);
    const tout = pairs.get(c.id);
    let srcStart = c.in - (tin ? tin.duration / 2 : 0);
    let tlStart = c.start - (tin ? tin.duration / 2 : 0);
    if (srcStart < 0) { tlStart -= srcStart; srcStart = 0; }
    const srcEnd = Math.min(c.mediaDuration, c.out + (tout ? tout.duration / 2 : 0));
    const len = srcEnd - srcStart;
    if (len < 0.02) continue;
    const i = addInput(c.path, srcStart, len);
    const a = ['aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo', 'asetpts=PTS-STARTPTS'];
    if (tin) a.push(`afade=t=in:st=0:d=${f3(Math.min(tin.duration, len))}`);
    if (tout) a.push(`afade=t=out:st=${f3(len - tout.duration)}:d=${f3(Math.min(tout.duration, len))}`);
    a.push(`adelay=delays=${Math.round(Math.max(0, tlStart) * 1000)}:all=1`);
    const label = `au${audio.length}`;
    graph.push(`[${i}:a]${a.join(',')}[${label}]`);
    audio.push(label);
  }
  graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(total)}[abase]`);
  graph.push(audio.length
    ? `[abase]${audio.map((l) => `[${l}]`).join('')}amix=inputs=${audio.length + 1}:duration=first:normalize=0[aout]`
    : '[abase]anull[aout]');

  args.push(
    '-filter_complex', graph.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outPath,
  );
  return { args, duration: total };
}

module.exports = { buildExportArgs };
