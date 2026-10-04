'use strict';

const { PRESETS, TRANSITIONS, DEFAULT_ADJUST, DEFAULT_TRANSFORM, cssFilter, buttedNext, transitionPairs } = window.Effects;

const MIN_CLIP = 0.1; // seconds
const ROW_H = 58;     // track row height (px)
const PAD = 28;       // drop zone above/below the tracks for creating new tracks (px)
const SNAP_PX = 8;
const GUTTER = 34;    // left margin for track labels (px)
const xOf = (t) => GUTTER + t * state.zoom;

const $ = (sel) => document.querySelector(sel);
const el = {
  players: $('#players'), noVideo: $('#no-video'), frame: $('#frame'), stage: $('#stage'),
  xform: $('#xform'), xformBox: $('#xform-box'),
  mediaList: $('#media-list'), inspector: $('#inspector-body'),
  scroll: $('#tl-scroll'), content: $('#tl-content'), ruler: $('#ruler'), tracks: $('#tracks'), playhead: $('#playhead'),
  timecode: $('#timecode'), exportLength: $('#export-length'), play: $('#btn-play'), zoom: $('#zoom'),
  size: $('#set-size'), fps: $('#set-fps'),
};

const state = {
  media: [],        // imported files: {id, path, name, url, thumb, duration, width, height, hasAudio}
  clips: [],        // {id, mediaId, track, start, in, out, effect, adjust, transition:{type, duration}}
  selectedId: null,
  playhead: 0,      // seconds on the timeline
  playing: false,
  zoom: 60,         // pixels per second
};

let nextId = 1;
const uid = (p) => `${p}${nextId++}`;

// ---------------------------------------------------------------- helpers

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mediaById = (id) => state.media.find((m) => m.id === id);
const clipById = (id) => state.clips.find((c) => c.id === id);
const clipDur = (c) => c.out - c.in;
const clipEnd = (c) => c.start + clipDur(c);
const selectedClip = () => clipById(state.selectedId);
const tf = (c) => c.transform || DEFAULT_TRANSFORM;
const transformCss = (c) => {
  const t = tf(c);
  return `translate(${t.x * 100}%, ${t.y * 100}%) rotate(${t.rotation}deg) scale(${t.scale})`;
};
const totalDuration = () => state.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
const trackCount = () => Math.max(1, ...state.clips.map((c) => c.track + 1));
const rowTop = (track) => PAD + (trackCount() - 1 - track) * ROW_H; // top track is drawn first

const onTrack = (track, exceptId) => state.clips
  .filter((c) => c.track === track && c.id !== exceptId)
  .sort((a, b) => a.start - b.start);

function overlaps(track, start, end, exceptId) {
  return onTrack(track, exceptId).some((c) => c.start < end - 1e-3 && clipEnd(c) > start + 1e-3);
}

const clipOnTrackAt = (track, t) => state.clips.find((c) => c.track === track && c.start <= t && t < clipEnd(c));

// Top-most clip whose inside (not its edges) contains t.
function topClipAt(t) {
  return state.clips
    .filter((c) => t > c.start + MIN_CLIP && t < clipEnd(c) - MIN_CLIP)
    .sort((a, b) => b.track - a.track)[0] || null;
}

// Neighbours on the same track, used to stop trims from overlapping them.
function neighbours(c) {
  const list = onTrack(c.track, c.id);
  const prev = list.filter((o) => clipEnd(o) <= c.start + 1e-3).pop();
  const next = list.find((o) => o.start >= clipEnd(c) - 1e-3);
  return { prevEnd: prev ? clipEnd(prev) : 0, nextStart: next ? next.start : Infinity };
}

// Renumbers tracks so there are no empty ones (tracks appear and disappear as needed).
function normalizeTracks() {
  const used = [...new Set(state.clips.map((c) => c.track))].sort((a, b) => a - b);
  for (const c of state.clips) c.track = used.indexOf(c.track);
}

function fmt(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// Single quotes: the result is embedded in double-quoted style="" attributes.
const cssUrl = (u) => (u ? `url('${u.replace(/'/g, '%27').replace(/"/g, '%22')}')` : 'none');
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------- placement (dynamic tracks)

// Where a clip of length `dur` dropped at (track, start) ends up:
//  - on that track if there is room,
//  - on a NEW track directly above it if it would overlap a clip there,
//  - on a new top/bottom track when dropped above/below all tracks.
function planPlacement(track, start, dur, exceptId) {
  const n = trackCount();
  start = Math.max(0, start);
  if (!state.clips.some((c) => c.id !== exceptId)) return { track: 0, start, insert: null };
  if (track >= n) return { track: n, start, insert: 'top' };
  if (track < 0) return { track: -1, start, insert: 'bottom' };
  if (overlaps(track, start, start + dur, exceptId)) return { track, start, insert: 'above' };
  return { track, start, insert: null };
}

function applyPlacement(clip, plan) {
  const shiftFrom = (from) => state.clips.forEach((c) => { if (c !== clip && c.track >= from) c.track++; });
  if (plan.insert === 'bottom') { shiftFrom(0); clip.track = 0; }
  else if (plan.insert === 'above') { shiftFrom(plan.track + 1); clip.track = plan.track + 1; }
  else clip.track = plan.track;
  clip.start = plan.start;
  normalizeTracks();
}

// Snaps a clip's start or end to nearby clip edges, the playhead or 0.
function snapStart(start, dur, exceptId) {
  const points = [0, state.playhead];
  for (const c of state.clips) if (c.id !== exceptId) points.push(c.start, clipEnd(c));
  const tol = SNAP_PX / state.zoom;
  let best = null;
  for (const p of points) {
    for (const off of [0, dur]) {
      const d = Math.abs(p - (start + off));
      if (d < tol && (!best || d < best.d)) best = { d, start: p - off };
    }
  }
  return Math.max(0, best ? best.start : start);
}

function snapTime(t, exceptId) {
  return snapStart(t, 0, exceptId);
}

// ---------------------------------------------------------------- undo / redo

const history = { past: [], future: [] };
const snapshot = () => JSON.stringify({ clips: state.clips, selectedId: state.selectedId });

function commit() {
  history.past.push(snapshot());
  if (history.past.length > 200) history.past.shift();
  history.future = [];
  updateButtons();
}

// For continuous edits (sliders): one undo step per gesture.
let editOpen = false;
function beginEdit() {
  if (!editOpen) { commit(); editOpen = true; }
}
function endEdit() { editOpen = false; }

function restore(snap) {
  const s = JSON.parse(snap);
  state.clips = s.clips;
  state.selectedId = s.selectedId;
  pause();
  state.playhead = clamp(state.playhead, 0, totalDuration());
  renderAll();
  showFrame();
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  restore(history.past.pop());
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restore(history.future.pop());
}

// ---------------------------------------------------------------- media import

async function importMedia(paths) {
  const res = paths ? await api.loadMedia(paths) : await api.importMedia();
  if (!res) return;
  if (res.errors.length) toast(`Couldn't import: ${res.errors.join('; ')}`);
  const wasEmpty = state.clips.length === 0;
  for (const m of res.items) {
    m.id = uid('m');
    state.media.push(m);
  }
  renderMedia();
  if (wasEmpty && res.items.length) {
    commit();
    let t = 0;
    for (const m of res.items) {
      const c = makeClip(m, 0, t);
      state.clips.push(c);
      t = clipEnd(c);
    }
    state.selectedId = state.clips[0].id;
    renderAll();
    showFrame();
  }
}

function makeClip(m, track, start) {
  return {
    id: uid('c'),
    mediaId: m.id,
    track,
    start,
    in: 0,
    out: m.duration,
    effect: 'none',
    adjust: { ...DEFAULT_ADJUST },
    transform: { ...DEFAULT_TRANSFORM },
    transition: { type: 'none', duration: 1 },
  };
}

// Adds media to the timeline; without a plan it goes at the end of track 1.
function addClip(mediaId, plan) {
  const m = mediaById(mediaId);
  if (!m) return;
  commit();
  const c = makeClip(m, 0, 0);
  state.clips.push(c);
  if (plan) applyPlacement(c, plan);
  else c.start = onTrack(0, c.id).reduce((e, o) => Math.max(e, clipEnd(o)), 0);
  state.selectedId = c.id;
  renderAll();
  if (!state.playing) setPlayhead(c.start);
}

// ---------------------------------------------------------------- editing ops

function splitAtPlayhead() {
  const t = state.playhead;
  let clip = selectedClip();
  if (!clip || !(t > clip.start + MIN_CLIP && t < clipEnd(clip) - MIN_CLIP)) clip = topClipAt(t);
  if (!clip) {
    toast('Put the playhead inside a clip to split it');
    return;
  }
  commit();
  const cut = clip.in + (t - clip.start);
  const second = { ...structuredClone(clip), id: uid('c'), in: cut, start: t };
  clip.out = cut;
  clip.transition = { type: 'none', duration: clip.transition.duration };
  state.clips.push(second);
  state.selectedId = second.id;
  renderAll();
}

function deleteSelected() {
  const c = selectedClip();
  if (!c) return;
  commit();
  state.clips = state.clips.filter((o) => o !== c);
  normalizeTracks();
  const next = topClipAt(state.playhead) || state.clips[0];
  state.selectedId = next ? next.id : null;
  pause();
  state.playhead = clamp(state.playhead, 0, totalDuration());
  renderAll();
  showFrame();
}

function select(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  renderTimeline();
  renderInspector();
  updateButtons();
  renderXform();
}

// ---------------------------------------------------------------- preview / playback
//
// One <video> per track, stacked so higher tracks cover lower ones. The
// playhead is the master clock; each player follows the clip under it.

const players = [];

function ensurePlayers(n) {
  while (players.length < n) {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.className = 'layer';
    el.players.appendChild(v);
    players.push({ el: v, clipId: null, src: '', busy: false, token: 0 });
  }
  while (players.length > n) {
    const p = players.pop();
    p.el.pause();
    p.el.removeAttribute('src');
    p.el.load();
    p.el.remove();
  }
}

async function seekPlayer(p, url, time, autoplay) {
  const token = ++p.token;
  const v = p.el;
  p.busy = true;
  v.pause();
  await new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('error', done);
      resolve();
    };
    const seek = () => {
      if (Math.abs(v.currentTime - time) < 0.005) return done();
      v.addEventListener('seeked', done, { once: true });
      v.currentTime = time;
    };
    v.addEventListener('error', done, { once: true });
    if (p.src !== url) {
      p.src = url;
      v.src = url;
      v.addEventListener('loadedmetadata', seek, { once: true });
    } else if (v.readyState >= 1) {
      seek();
    } else {
      v.addEventListener('loadedmetadata', seek, { once: true });
    }
  });
  if (token !== p.token) return; // superseded by a newer seek
  p.busy = false;
  if (autoplay && state.playing) v.play().catch(() => {});
}

// Preview approximation of transitions: the outgoing clip fades out over the
// first half and the incoming clip fades in over the second half, revealing
// whatever is underneath. The export renders the real effect.
function layerOpacity(c, t, pairs, incoming) {
  let o = 1;
  const out = pairs.get(c.id);
  if (out) o = Math.min(o, (clipEnd(c) - t) / (out.duration / 2));
  const inn = incoming.get(c.id);
  if (inn) o = Math.min(o, (t - c.start) / (inn.duration / 2));
  return clamp(o, 0, 1);
}

function syncPlayers(t, playing) {
  const n = trackCount();
  ensurePlayers(n);
  const pairs = transitionPairs(state.clips);
  const incoming = new Map([...pairs.values()].map((p) => [p.b.id, p]));
  for (let track = 0; track < n; track++) {
    const p = players[track];
    const c = clipOnTrackAt(track, t);
    if (!c) {
      if (p.clipId) { p.clipId = null; p.token++; p.busy = false; p.el.pause(); }
      p.el.style.visibility = 'hidden';
      continue;
    }
    const m = mediaById(c.mediaId);
    const target = c.in + (t - c.start);
    p.el.style.visibility = 'visible';
    p.el.style.filter = cssFilter(c.effect, c.adjust);
    p.el.style.transform = transformCss(c);
    p.el.style.opacity = layerOpacity(c, t, pairs, incoming);
    if (p.clipId !== c.id) {
      p.clipId = c.id;
      seekPlayer(p, m.url, target, playing);
    } else if (p.busy) {
      // wait for the pending seek
    } else if (playing) {
      if (Math.abs(p.el.currentTime - target) > 0.3) seekPlayer(p, m.url, target, true);
      else if (p.el.paused) p.el.play().catch(() => {});
    } else if (Math.abs(p.el.currentTime - target) > 0.001) {
      seekPlayer(p, m.url, target, false);
    }
  }
  el.noVideo.classList.toggle('hidden', state.clips.length > 0);
  renderXform();
}

// Throttle scrubbing to one sync per animation frame.
let frameQueued = false;
function showFrame() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    if (!state.playing) syncPlayers(state.playhead, false);
  });
}

function setPlayhead(t) {
  state.playhead = clamp(t, 0, totalDuration());
  updatePlayheadUI();
  if (state.playing) syncPlayers(state.playhead, true);
  else showFrame();
}

let lastTick = 0;
function play() {
  if (!state.clips.length) return;
  if (state.playhead >= totalDuration() - 0.02) state.playhead = 0;
  state.playing = true;
  el.play.textContent = '❚❚';
  lastTick = 0;
  syncPlayers(state.playhead, true);
  requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  players.forEach((p) => p.el.pause());
  el.play.textContent = '▶';
  renderXform();
}

function togglePlay() {
  if (state.playing) pause(); else play();
}

function tick(now) {
  if (!state.playing) return;
  const dt = lastTick ? (now - lastTick) / 1000 : 0;
  lastTick = now;
  // Follow the top-most playing video so the visible clip plays smoothly;
  // fall back to the wall clock in gaps or while videos are seeking.
  let t = state.playhead + dt;
  for (let k = players.length - 1; k >= 0; k--) {
    const p = players[k];
    const c = clipById(p.clipId);
    if (c && !p.busy && !p.el.paused) {
      const vt = c.start + (p.el.currentTime - c.in);
      if (Math.abs(vt - t) < 0.25) t = vt;
      break;
    }
  }
  const total = totalDuration();
  if (t >= total) {
    state.playhead = total;
    pause();
    updatePlayheadUI(true);
    return;
  }
  state.playhead = t;
  syncPlayers(t, true);
  updatePlayheadUI(true);
  requestAnimationFrame(tick);
}

function updatePlayheadUI(follow) {
  const x = xOf(state.playhead);
  el.playhead.style.left = `${x}px`;
  el.timecode.innerHTML = `${fmt(state.playhead)} <span>/ ${fmt(totalDuration())}</span>`;
  if (follow) {
    const s = el.scroll;
    if (x > s.scrollLeft + s.clientWidth - 40) s.scrollLeft = x - 80;
    else if (x < s.scrollLeft) s.scrollLeft = Math.max(0, x - 80);
  }
}

function fitFrame() {
  const [w, h] = el.size.value.split('x').map(Number);
  const box = el.stage.getBoundingClientRect();
  // Leave room above/below for the rotate handle of a full-frame clip.
  const scale = Math.max(0.01, Math.min((box.width - 32) / w, (box.height - 72) / h));
  el.frame.style.width = `${Math.floor(w * scale)}px`;
  el.frame.style.height = `${Math.floor(h * scale)}px`;
  renderXform();
}

// ---------------------------------------------------------------- transform (resize / turn / move in the preview)

// Where clip c is drawn inside the preview frame, in frame pixels.
function clipBox(c) {
  const m = mediaById(c.mediaId);
  const t = tf(c);
  const FW = el.frame.clientWidth;
  const FH = el.frame.clientHeight;
  const fit = Math.min(FW / m.width, FH / m.height) * t.scale;
  return { cx: FW / 2 + t.x * FW, cy: FH / 2 + t.y * FH, w: m.width * fit, h: m.height * fit, r: t.rotation, FW, FH };
}

function insideBox(b, px, py) {
  const a = (-b.r * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= b.w / 2 && Math.abs(ry) <= b.h / 2;
}

// Top-most clip drawn under a point of the preview.
function clipAtPoint(px, py) {
  for (let track = trackCount() - 1; track >= 0; track--) {
    const c = clipOnTrackAt(track, state.playhead);
    if (c && insideBox(clipBox(c), px, py)) return c;
  }
  return null;
}

// Selection box with resize corners and a rotate handle, drawn over the
// selected clip while paused.
function renderXform() {
  el.xform.style.left = `${el.frame.offsetLeft}px`;
  el.xform.style.top = `${el.frame.offsetTop}px`;
  el.xform.style.width = `${el.frame.clientWidth}px`;
  el.xform.style.height = `${el.frame.clientHeight}px`;
  const c = selectedClip();
  const show = c && !state.playing && clipOnTrackAt(c.track, state.playhead) === c;
  el.xformBox.classList.toggle('hidden', !show);
  if (!show) return;
  const b = clipBox(c);
  Object.assign(el.xformBox.style, {
    left: `${b.cx - b.w / 2}px`,
    top: `${b.cy - b.h / 2}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
    transform: `rotate(${b.r}deg)`,
  });
}

// Live update while dragging (cheaper than a full re-render).
function applyTransformLive(c) {
  const p = players[c.track];
  if (p && p.clipId === c.id) p.el.style.transform = transformCss(c);
  renderXform();
  const t = tf(c);
  const values = {
    x: Math.round(t.x * 100), y: Math.round(t.y * 100),
    scale: Math.round(t.scale * 100), rotation: Math.round(t.rotation),
  };
  el.inspector.querySelectorAll('[data-tf]').forEach((input) => {
    if (document.activeElement !== input) input.value = values[input.dataset.tf];
  });
}

el.xform.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const rect = el.xform.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const handle = e.target.closest('[data-h]');
  let c = selectedClip();
  if (!handle) {
    c = clipAtPoint(px, py);
    if (!c) return;
    select(c.id);
  }
  e.preventDefault();
  pause();
  startTransformDrag(e, c, handle ? handle.dataset.h : 'move', rect);
});

function startTransformDrag(e, c, mode, rect) {
  const t0 = { ...tf(c) };
  const b0 = clipBox(c);
  const p0 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const a0 = Math.atan2(p0.y - b0.cy, p0.x - b0.cx);
  const d0 = Math.hypot(p0.x - b0.cx, p0.y - b0.cy) || 1;
  let changed = false;

  const move = (ev) => {
    const p = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    if (!changed && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
    if (!changed) {
      commit();
      changed = true;
      c.transform = { ...t0 };
    }
    const t = c.transform;
    if (mode === 'move') {
      let x = t0.x + (p.x - p0.x) / b0.FW;
      let y = t0.y + (p.y - p0.y) / b0.FH;
      if (!ev.altKey) {
        if (Math.abs(x * b0.FW) < 6) x = 0; // snap to centre
        if (Math.abs(y * b0.FH) < 6) y = 0;
      }
      t.x = +x.toFixed(4);
      t.y = +y.toFixed(4);
    } else if (mode === 'scale') {
      let sc = t0.scale * (Math.hypot(p.x - b0.cx, p.y - b0.cy) / d0);
      if (!ev.altKey && Math.abs(sc - 1) < 0.03) sc = 1;
      t.scale = +clamp(sc, 0.05, 5).toFixed(4);
    } else {
      let r = t0.rotation + ((Math.atan2(p.y - b0.cy, p.x - b0.cx) - a0) * 180) / Math.PI;
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      if (ev.shiftKey) r = Math.round(r / 15) * 15;
      else if (!ev.altKey && Math.abs(r - Math.round(r / 90) * 90) < 3) r = Math.round(r / 90) * 90;
      t.rotation = +r.toFixed(2);
    }
    applyTransformLive(c);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (changed) renderAll();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// ---------------------------------------------------------------- rendering

function renderAll() {
  renderTimeline();
  renderInspector();
  updateButtons();
  renderXform();
}

function updateButtons() {
  $('#btn-undo').disabled = !history.past.length;
  $('#btn-redo').disabled = !history.future.length;
  $('#btn-delete').disabled = !selectedClip();
  $('#btn-split').disabled = !state.clips.length;
  $('#btn-export').disabled = !state.clips.length;
}

function renderMedia() {
  if (!state.media.length) return;
  el.mediaList.innerHTML = state.media.map((m) => `
    <div class="media-item" draggable="true" data-id="${m.id}" title="${esc(m.path)}">
      <div class="thumb" style="background-image:${cssUrl(m.thumb)}">
        <span class="dur">${fmt(m.duration).slice(0, 5)}</span>
      </div>
      <div class="name">${esc(m.name)}</div>
      <button class="add" title="Add to end of track V1">+</button>
    </div>`).join('');
}

function pickRulerStep() {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * state.zoom >= 80) || 600;
}

function renderTimeline() {
  const n = trackCount();
  const total = totalDuration();
  const width = Math.max(el.scroll.clientWidth, xOf(total + 10));
  el.content.style.width = `${width}px`;
  el.tracks.style.height = `${PAD * 2 + n * ROW_H}px`;

  // ruler
  const step = pickRulerStep();
  const minor = step / 5;
  let ticks = '';
  for (let t = 0, i = 0; xOf(t) <= width; i++, t = i * minor) {
    const major = i % 5 === 0;
    ticks += `<div class="tick${major ? ' major' : ''}" style="left:${xOf(t)}px"></div>`;
    if (major) ticks += `<div class="tick-label" style="left:${xOf(t)}px">${fmt(t).replace(/\.00$/, '')}</div>`;
  }
  el.ruler.innerHTML = ticks;

  // track rows, top track first
  let html = '';
  for (let track = n - 1; track >= 0; track--) {
    html += `<div class="track-row" style="top:${rowTop(track)}px;height:${ROW_H}px">
      <span class="track-label">V${track + 1}</span></div>`;
  }
  if (!state.clips.length) {
    html += `<div class="track-empty" style="top:${PAD}px;height:${ROW_H}px">Drag media here, or click + on a media item</div>`;
  }

  // clips
  for (const c of state.clips) {
    const m = mediaById(c.mediaId);
    const fx = [];
    if (c.effect !== 'none') fx.push(PRESETS[c.effect].label);
    if (c.adjust.brightness !== 0 || c.adjust.contrast !== 1 || c.adjust.saturation !== 1) fx.push('Adjusted');
    const t = tf(c);
    if (t.scale !== 1 || t.rotation !== 0 || t.x !== 0 || t.y !== 0) fx.push('Transformed');
    html += `
      <div class="clip${c.id === state.selectedId ? ' selected' : ''}" data-id="${c.id}"
           style="left:${xOf(c.start)}px;width:${clipDur(c) * state.zoom}px;top:${rowTop(c.track) + 4}px;height:${ROW_H - 8}px">
        <div class="clip-bg" style="background-image:${cssUrl(m.thumb)};filter:${cssFilter(c.effect, c.adjust)}"></div>
        <div class="clip-label">${esc(m.name)} · ${clipDur(c).toFixed(1)}s</div>
        ${fx.length ? `<div class="fx-badge">${esc(fx.join(' + '))}</div>` : ''}
        <div class="handle left" data-edge="in"></div>
        <div class="handle right" data-edge="out"></div>
      </div>`;
  }

  // transition buttons where two clips touch on the same track
  const pairs = transitionPairs(state.clips);
  for (const a of state.clips) {
    if (!buttedNext(state.clips, a)) continue;
    const p = pairs.get(a.id);
    html += `<div class="tr-badge${p ? ' on' : ''}" data-id="${a.id}"
                  style="left:${xOf(clipEnd(a))}px;top:${rowTop(a.track) + ROW_H / 2 - 13}px"
                  title="${p ? `${TRANSITIONS[p.type].label} · ${p.duration}s` : 'Add transition'}">${p ? '⧓' : '+'}</div>`;
  }
  el.tracks.innerHTML = html;

  el.exportLength.textContent = state.clips.length
    ? `${n} track${n > 1 ? 's' : ''} · ${state.clips.length} clip${state.clips.length > 1 ? 's' : ''}`
    : '';
  updatePlayheadUI();
}

function renderInspector() {
  const c = selectedClip();
  if (!c) {
    el.inspector.innerHTML = '<div class="empty-hint">Select a clip on the timeline</div>';
    return;
  }
  const m = mediaById(c.mediaId);
  const next = buttedNext(state.clips, c);
  const t = c.transition;
  const maxT = next ? Math.min(clipDur(c), clipDur(next)) : 0;

  el.inspector.innerHTML = `
    <div class="insp-name">${esc(m.name)}</div>
    <div class="small-note">Track V${c.track + 1}</div>

    <div class="insp-section">
      <h4>Timing</h4>
      <div class="row"><label>Position</label><input type="number" id="i-start" step="0.1" min="0" value="${c.start.toFixed(2)}"> s</div>
      <div class="row"><label>Source in</label><input type="number" id="i-in" step="0.1" min="0" value="${c.in.toFixed(2)}"> s</div>
      <div class="row"><label>Source out</label><input type="number" id="i-out" step="0.1" min="0" value="${c.out.toFixed(2)}"> s</div>
      <div class="small-note">Clip length ${clipDur(c).toFixed(2)}s of ${m.duration.toFixed(2)}s source</div>
      <div class="btn-row">
        <button id="i-split">Split at playhead</button>
        <button id="i-reset">Reset trim</button>
      </div>
    </div>

    <div class="insp-section">
      <h4>Transform</h4>
      <div class="small-note">Or drag the clip in the preview: corners resize, the round handle turns it.</div>
      ${tfRow('scale', 'Size', 5, 300, 1, '%')}
      ${tfRow('rotation', 'Rotation', -180, 180, 1, '°')}
      ${tfRow('x', 'Position X', -100, 100, 1, '%')}
      ${tfRow('y', 'Position Y', -100, 100, 1, '%')}
      <div class="btn-row">
        <button id="i-pip">Picture-in-picture</button>
        <button id="i-reset-tf">Reset</button>
      </div>
    </div>

    <div class="insp-section">
      <h4>Filter</h4>
      <div class="presets">
        ${Object.entries(PRESETS).map(([key, p]) => `
          <button class="preset${c.effect === key ? ' active' : ''}" data-preset="${key}">
            <div class="pthumb" style="background-image:${cssUrl(m.thumb)};filter:${p.css || 'none'}"></div>
            <div class="plabel">${p.label}</div>
          </button>`).join('')}
      </div>
      ${slider('brightness', 'Brightness', -0.5, 0.5, 0.01, c.adjust.brightness)}
      ${slider('contrast', 'Contrast', 0.5, 2, 0.01, c.adjust.contrast)}
      ${slider('saturation', 'Saturation', 0, 3, 0.01, c.adjust.saturation)}
      <div class="btn-row"><button id="i-reset-fx">Reset filter</button></div>
    </div>

    <div class="insp-section">
      <h4>Transition to next clip</h4>
      ${!next ? '<div class="small-note">Place another clip directly after this one on the same track (it snaps) to add a transition.</div>' : `
        <div class="row"><label>Type</label>
          <select id="i-tr-type">
            ${Object.entries(TRANSITIONS).map(([key, tr]) =>
              `<option value="${key}"${t.type === key ? ' selected' : ''}>${tr.label}</option>`).join('')}
          </select>
        </div>
        <div class="row"><label>Duration</label>
          <input type="number" id="i-tr-dur" step="0.1" min="0.1" max="${maxT.toFixed(2)}" value="${t.duration}"
                 ${t.type === 'none' ? 'disabled' : ''}> s
        </div>
        <div class="small-note">Centred on the cut, max ${maxT.toFixed(2)}s. The preview shows a simple fade; the export renders the real effect.</div>
      `}
    </div>`;

  const num = (id, fn) => {
    const input = $(id);
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) { commit(); fn(v); }
      renderAll();
      showFrame();
    });
  };
  num('#i-start', (v) => applyPlacement(c, planPlacement(c.track, v, clipDur(c), c.id)));
  num('#i-in', (v) => {
    const { nextStart } = neighbours(c);
    c.in = clamp(v, Math.max(0, c.out - (nextStart - c.start)), c.out - MIN_CLIP);
  });
  num('#i-out', (v) => {
    const { nextStart } = neighbours(c);
    c.out = clamp(v, c.in + MIN_CLIP, Math.min(m.duration, c.in + (nextStart - c.start)));
  });
  $('#i-split').onclick = splitAtPlayhead;
  $('#i-reset').onclick = () => {
    commit();
    const { nextStart } = neighbours(c);
    c.in = 0;
    c.out = Math.min(m.duration, nextStart - c.start);
    renderAll();
    showFrame();
  };

  el.inspector.querySelectorAll('.preset').forEach((b) => {
    b.onclick = () => {
      commit();
      c.effect = b.dataset.preset;
      renderAll();
      showFrame();
    };
  });
  el.inspector.querySelectorAll('input[data-adjust]').forEach((input) => {
    const out = input.parentElement.querySelector('.val');
    input.addEventListener('input', () => {
      beginEdit();
      c.adjust[input.dataset.adjust] = parseFloat(input.value);
      out.textContent = parseFloat(input.value).toFixed(2);
      if (!state.playing) syncPlayers(state.playhead, false);
    });
    input.addEventListener('change', () => { endEdit(); renderTimeline(); });
    input.addEventListener('dblclick', () => {
      commit();
      c.adjust[input.dataset.adjust] = DEFAULT_ADJUST[input.dataset.adjust];
      renderAll();
      showFrame();
    });
  });
  el.inspector.querySelectorAll('[data-tf]').forEach((input) => {
    const key = input.dataset.tf;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) return;
      beginEdit();
      const t = { ...tf(c) };
      if (key === 'rotation') t.rotation = clamp(v, -360, 360);
      else if (key === 'scale') t.scale = clamp(v / 100, 0.05, 5);
      else t[key] = v / 100;
      c.transform = t;
      applyTransformLive(c);
    });
    input.addEventListener('change', () => { endEdit(); renderTimeline(); });
  });
  $('#i-pip').onclick = () => {
    commit();
    c.transform = { x: 0.27, y: 0.27, scale: 0.4, rotation: 0 };
    renderAll();
    showFrame();
  };
  $('#i-reset-tf').onclick = () => {
    commit();
    c.transform = { ...DEFAULT_TRANSFORM };
    renderAll();
    showFrame();
  };
  $('#i-reset-fx').onclick = () => {
    commit();
    c.effect = 'none';
    c.adjust = { ...DEFAULT_ADJUST };
    renderAll();
    showFrame();
  };

  if (next) {
    $('#i-tr-type').onchange = (e) => {
      commit();
      c.transition = { type: e.target.value, duration: c.transition.duration };
      renderAll();
      showFrame();
    };
    num('#i-tr-dur', (v) => { c.transition.duration = clamp(v, 0.1, 10); });
  }
}

// Slider + number box bound to one transform field.
function tfRow(key, label, min, max, step, unit) {
  const t = tf(selectedClip());
  const v = Math.round(key === 'rotation' ? t.rotation : t[key] * 100);
  return `<div class="row">
    <label>${label}</label>
    <input type="range" data-tf="${key}" min="${min}" max="${max}" step="${step}" value="${v}">
    <input type="number" class="tf-num" data-tf="${key}" step="${step}" value="${v}"><span class="unit">${unit}</span>
  </div>`;
}

function slider(key, label, min, max, step, value) {
  return `<div class="row" title="Double-click to reset">
    <label>${label}</label>
    <input type="range" data-adjust="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
    <span class="val">${value.toFixed(2)}</span>
  </div>`;
}

// ---------------------------------------------------------------- timeline interaction

function timeFromEvent(e) {
  const r = el.content.getBoundingClientRect();
  return Math.max(0, (e.clientX - r.left - GUTTER) / state.zoom);
}

// Track under the pointer; n = above all tracks, -1 = below all tracks.
function trackFromEvent(e) {
  const y = e.clientY - el.tracks.getBoundingClientRect().top;
  const n = trackCount();
  if (y < PAD) return n;
  const row = Math.floor((y - PAD) / ROW_H);
  return row >= n ? -1 : n - 1 - row;
}

// Drag preview: a ghost where the clip will land, plus a "new track" line
// when the drop will create a track.
function showGhost(plan, dur, label) {
  clearGhost();
  const n = trackCount();
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.textContent = label;
  ghost.style.left = `${xOf(plan.start)}px`;
  ghost.style.width = `${dur * state.zoom}px`;
  if (plan.insert) {
    let y;
    if (plan.insert === 'top') y = PAD;
    else if (plan.insert === 'bottom') y = PAD + n * ROW_H;
    else y = rowTop(plan.track);
    const line = document.createElement('div');
    line.className = 'insert-line';
    line.style.top = `${y}px`;
    line.innerHTML = '<span>New track</span>';
    el.tracks.appendChild(line);
    ghost.classList.add('new-track');
    ghost.style.top = `${y - 13}px`;
    ghost.style.height = '26px';
  } else {
    ghost.style.top = `${rowTop(plan.track) + 4}px`;
    ghost.style.height = `${ROW_H - 8}px`;
  }
  el.tracks.appendChild(ghost);
}

function clearGhost() {
  el.tracks.querySelectorAll('.ghost, .insert-line').forEach((g) => g.remove());
}

// Scrub by dragging on the ruler or on empty track space.
function startScrub(e) {
  pause();
  setPlayhead(timeFromEvent(e));
  const move = (ev) => setPlayhead(timeFromEvent(ev));
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

el.ruler.addEventListener('pointerdown', startScrub);

el.tracks.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const badge = e.target.closest('.tr-badge');
  if (badge) {
    select(badge.dataset.id);
    const c = selectedClip();
    if (c.transition.type === 'none') {
      commit();
      c.transition.type = 'fade';
      renderAll();
      showFrame();
    }
    $('#i-tr-type').focus();
    return;
  }
  const clipEl = e.target.closest('.clip');
  if (!clipEl) { startScrub(e); return; }
  const clip = clipById(clipEl.dataset.id);
  select(clip.id);
  pause();
  const handle = e.target.closest('.handle');
  if (handle) startTrim(e, clip, handle.dataset.edge);
  else startClipDrag(e, clip);
});

// Trimming moves only the dragged edge and stops at neighbouring clips.
function startTrim(e, clip, edge) {
  const m = mediaById(clip.mediaId);
  const x0 = e.clientX;
  const orig = { in: clip.in, out: clip.out, start: clip.start };
  const { prevEnd, nextStart } = neighbours(clip);
  let changed = false;
  const move = (ev) => {
    if (!changed && Math.abs(ev.clientX - x0) < 2) return;
    if (!changed) { commit(); changed = true; }
    const dt = (ev.clientX - x0) / state.zoom;
    if (edge === 'in') {
      const newStart = snapTime(orig.start + dt, clip.id);
      const delta = clamp(newStart - orig.start, Math.max(-orig.in, prevEnd - orig.start), orig.out - MIN_CLIP - orig.in);
      clip.in = orig.in + delta;
      clip.start = orig.start + delta;
    } else {
      const origEnd = orig.start + orig.out - orig.in;
      const newEnd = snapTime(origEnd + dt, clip.id);
      const maxOut = Math.min(m.duration, orig.out + (nextStart - origEnd));
      clip.out = clamp(orig.out + (newEnd - origEnd), orig.in + MIN_CLIP, maxOut);
    }
    renderTimeline();
    // Show the frame at the edge being trimmed.
    state.playhead = edge === 'in' ? clip.start : clipEnd(clip) - 0.001;
    updatePlayheadUI();
    showFrame();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (changed) renderAll();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Moving a clip: anywhere in time, onto any track. Dropping it onto another
// clip puts it on a new track above that clip.
function startClipDrag(e, clip) {
  const x0 = e.clientX;
  const y0 = e.clientY;
  const grab = timeFromEvent(e) - clip.start;
  const label = mediaById(clip.mediaId).name;
  const clipEl = el.tracks.querySelector(`.clip[data-id="${clip.id}"]`);
  let plan = null;

  const move = (ev) => {
    if (!plan && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    clipEl.classList.add('dragging');
    const start = snapStart(timeFromEvent(ev) - grab, clipDur(clip), clip.id);
    plan = planPlacement(trackFromEvent(ev), start, clipDur(clip), clip.id);
    showGhost(plan, clipDur(clip), label);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    clearGhost();
    clipEl.classList.remove('dragging');
    if (!plan) {
      setPlayhead(timeFromEvent(ev));
      return;
    }
    const moved = plan.insert || plan.track !== clip.track || Math.abs(plan.start - clip.start) > 1e-6;
    if (moved) {
      commit();
      applyPlacement(clip, plan);
    }
    renderAll();
    showFrame();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Media bin: drag items onto the timeline, or click + / double-click.
let draggedMediaId = null;

el.mediaList.addEventListener('click', (e) => {
  const add = e.target.closest('.add');
  if (add) addClip(add.closest('.media-item').dataset.id);
});
el.mediaList.addEventListener('dblclick', (e) => {
  const item = e.target.closest('.media-item');
  if (item) addClip(item.dataset.id);
});
el.mediaList.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.media-item');
  if (!item) return;
  draggedMediaId = item.dataset.id;
  e.dataTransfer.setData('text/media-id', item.dataset.id);
  e.dataTransfer.effectAllowed = 'copy';
});
el.mediaList.addEventListener('dragend', () => {
  draggedMediaId = null;
  clearGhost();
});

function mediaDropPlan(e) {
  const m = mediaById(draggedMediaId);
  const start = snapStart(timeFromEvent(e), m.duration, null);
  return { m, plan: planPlacement(trackFromEvent(e), start, m.duration, null) };
}

el.tracks.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (!draggedMediaId) return;
  const { m, plan } = mediaDropPlan(e);
  showGhost(plan, m.duration, m.name);
});
el.tracks.addEventListener('dragleave', (e) => {
  if (!el.tracks.contains(e.relatedTarget)) clearGhost();
});
el.tracks.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearGhost();
  if (draggedMediaId) {
    const { m, plan } = mediaDropPlan(e);
    draggedMediaId = null;
    addClip(m.id, plan);
  } else if (e.dataTransfer.files.length) {
    await importFiles(e.dataTransfer.files);
  }
});

// Dropping files from Explorer anywhere imports them into the media bin.
async function importFiles(fileList) {
  const paths = [...fileList].map((f) => api.pathForFile(f)).filter(Boolean);
  if (paths.length) await importMedia(paths);
}
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
});
el.mediaList.addEventListener('dragenter', (e) => {
  if (e.dataTransfer.types.includes('Files')) el.mediaList.classList.add('drop');
});
el.mediaList.addEventListener('dragleave', (e) => {
  if (!el.mediaList.contains(e.relatedTarget)) el.mediaList.classList.remove('drop');
});
el.mediaList.addEventListener('drop', () => el.mediaList.classList.remove('drop'));

// Zoom (slider, +/- or Ctrl+wheel), keeping the playhead in view.
function setZoom(z) {
  state.zoom = clamp(z, 10, 300);
  el.zoom.value = state.zoom;
  renderTimeline();
  el.scroll.scrollLeft = xOf(state.playhead) - el.scroll.clientWidth / 2;
}
el.zoom.addEventListener('input', () => setZoom(Number(el.zoom.value)));
el.scroll.addEventListener('wheel', (e) => {
  const s = el.scroll;
  if (e.ctrlKey) {
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  } else if (!e.shiftKey && s.scrollHeight <= s.clientHeight && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    // No vertical overflow: let the wheel scroll the timeline sideways.
    e.preventDefault();
    s.scrollLeft += e.deltaY;
  }
}, { passive: false });

// ---------------------------------------------------------------- export

const modal = {
  root: $('#modal'), title: $('#modal-title'), bar: $('#progress-bar'), text: $('#modal-text'),
  close: $('#modal-close'), reveal: $('#modal-reveal'),
};
let exporting = false;

api.onExportProgress((p) => {
  if (!exporting) return;
  modal.bar.style.width = `${(p * 100).toFixed(1)}%`;
  modal.text.textContent = `${Math.round(p * 100)}%`;
});

async function doExport() {
  if (!state.clips.length || exporting) return;
  pause();
  const [width, height] = el.size.value.split('x').map(Number);
  const project = {
    settings: { width, height, fps: Number(el.fps.value) },
    clips: state.clips.map((c) => {
      const m = mediaById(c.mediaId);
      return {
        id: c.id, path: m.path, hasAudio: m.hasAudio, mediaDuration: m.duration,
        mediaWidth: m.width, mediaHeight: m.height,
        track: c.track, start: c.start, in: c.in, out: c.out,
        effect: c.effect, adjust: c.adjust, transform: tf(c), transition: c.transition,
      };
    }),
  };
  exporting = true;
  modal.title.textContent = 'Exporting…';
  modal.bar.style.width = '0';
  modal.text.textContent = 'Choose where to save…';
  modal.close.textContent = 'Cancel';
  modal.reveal.classList.add('hidden');
  modal.root.classList.remove('hidden');

  const res = await api.exportVideo(project);
  exporting = false;
  if (res.canceled) {
    modal.root.classList.add('hidden');
    return;
  }
  modal.close.textContent = 'Close';
  if (res.ok) {
    modal.title.textContent = 'Export complete';
    modal.bar.style.width = '100%';
    modal.text.textContent = res.path;
    modal.reveal.classList.remove('hidden');
    modal.reveal.onclick = () => api.revealFile(res.path);
  } else {
    modal.title.textContent = 'Export failed';
    modal.text.textContent = res.error;
  }
}

modal.close.addEventListener('click', () => {
  if (exporting) api.cancelExport();
  else modal.root.classList.add('hidden');
});

// ---------------------------------------------------------------- toolbar & keyboard

$('#btn-import').onclick = () => importMedia();
$('#btn-undo').onclick = undo;
$('#btn-redo').onclick = redo;
$('#btn-split').onclick = splitAtPlayhead;
$('#btn-delete').onclick = deleteSelected;
$('#btn-export').onclick = doExport;
$('#btn-play').onclick = togglePlay;
$('#btn-start').onclick = () => { pause(); setPlayhead(0); el.scroll.scrollLeft = 0; };
$('#btn-end').onclick = () => { pause(); setPlayhead(totalDuration()); };
el.size.addEventListener('change', fitFrame);

document.addEventListener('keydown', (e) => {
  if (exporting || !modal.root.classList.contains('hidden')) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape' || e.key === 'Enter') e.target.blur();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const frame = 1 / Number(el.fps.value);
  if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (ctrl && key === 'i') { e.preventDefault(); importMedia(); }
  else if (ctrl && key === 'e') { e.preventDefault(); doExport(); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (key === 's' && !ctrl) splitAtPlayhead();
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  else if (e.key === 'ArrowLeft') { pause(); setPlayhead(state.playhead - (e.shiftKey ? 1 : frame)); updatePlayheadUI(true); }
  else if (e.key === 'ArrowRight') { pause(); setPlayhead(state.playhead + (e.shiftKey ? 1 : frame)); updatePlayheadUI(true); }
  else if (e.key === 'Home') $('#btn-start').click();
  else if (e.key === 'End') $('#btn-end').click();
  else if (e.key === '=' || e.key === '+') setZoom(state.zoom * 1.25);
  else if (e.key === '-') setZoom(state.zoom / 1.25);
});

// ---------------------------------------------------------------- init

new ResizeObserver(fitFrame).observe(el.stage);
new ResizeObserver(() => renderTimeline()).observe(el.scroll);
renderAll();
