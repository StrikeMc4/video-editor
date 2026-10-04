// Built-in overlay effects (explosion, fireworks, …). Each one is rendered
// once by a tiny additive particle renderer, given a synthesized sound, and
// cached as an MP4 on a black background. Clips made from them use the
// "screen" blend mode, so the black disappears over the video underneath,
// the same way stock explosion footage is used.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VERSION = 2; // bump to regenerate cached files after changing an effect
const RW = 640;    // render size; FFmpeg scales it up (the effects are soft anyway)
const RH = 360;
const OUT = '1280:720';
const FPS = 30;

function rng(seed) { // mulberry32: same effect every time it is generated
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Light accumulates additively, then 1 - e^-x maps it to 0..255, so dense
// cores burn out to white/yellow while the edges keep their colour.
function canvas() {
  const acc = new Float32Array(RW * RH * 3);
  const blob = (x, y, r, [cr, cg, cb], a) => {
    if (a <= 0.002 || r <= 0) return;
    const x0 = Math.max(0, Math.floor(x - r));
    const x1 = Math.min(RW - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r));
    const y1 = Math.min(RH - 1, Math.ceil(y + r));
    const inv = 1 / (r * r);
    for (let py = y0; py <= y1; py++) {
      const dy2 = (py - y) * (py - y);
      let i = (py * RW + x0) * 3;
      for (let px = x0; px <= x1; px++, i += 3) {
        const d = 1 - ((px - x) * (px - x) + dy2) * inv;
        if (d <= 0) continue;
        const k = a * d * d;
        acc[i] += cr * k;
        acc[i + 1] += cg * k;
        acc[i + 2] += cb * k;
      }
    }
  };
  const line = (xa, ya, xb, yb, r, col, a) => {
    const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / Math.max(0.7, r * 0.6)));
    for (let k = 0; k <= n; k++) blob(xa + ((xb - xa) * k) / n, ya + ((yb - ya) * k) / n, r, col, a);
  };
  const toBytes = () => {
    const out = Buffer.allocUnsafe(RW * RH * 3);
    for (let i = 0; i < acc.length; i++) out[i] = 255 * (1 - Math.exp(-acc[i]));
    acc.fill(0);
    return out;
  };
  return { blob, line, toBytes };
}

// Colour of cooling fire: white-hot → yellow → orange → deep red.
function fireColor(heat) {
  const h = Math.max(0, Math.min(1, heat));
  return [1, 0.15 + 0.75 * h, 0.03 + 0.5 * h * h];
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ effects
// Each effect: label, duration, setup(rand) -> draw(cv, t), and an FFmpeg
// audio graph that must end in [aout].

const EFFECTS = {
  explosion: {
    label: 'Explosion',
    thumbAt: 0.4,
    duration: 2.5,
    setup(rand) {
      const cx = RW / 2;
      const cy = RH * 0.58;
      // A few lobes give the fireball an irregular, billowing outline.
      const lobes = Array.from({ length: 7 }, () => ({ ang: rand() * Math.PI * 2, k: 0.6 + rand() * 0.9 }));
      const fire = Array.from({ length: 320 }, () => {
        const lobe = lobes[Math.floor(rand() * lobes.length)];
        const ang = rand() < 0.6 ? lobe.ang + (rand() - 0.5) * 0.9 : rand() * Math.PI * 2;
        const sp = (40 + rand() * 230) * (rand() < 0.6 ? lobe.k : 1);
        return {
          vx: Math.cos(ang) * sp * 1.25, vy: Math.sin(ang) * sp * 0.85 - 45,
          r0: 5 + rand() * 13, life: 0.9 + rand() * 1.4, delay: rand() * 0.14,
          heat: 0.5 + rand() * 0.7, a: 0.16 + rand() * 0.22, swirl: (rand() - 0.5) * 3,
        };
      });
      const sparks = Array.from({ length: 140 }, () => {
        const ang = rand() * Math.PI * 2;
        const sp = 250 + rand() * 450;
        return { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, life: 0.5 + rand() * 1.1, r: 1 + rand() * 1.4 };
      });
      const embers = Array.from({ length: 40 }, () => ({
        x: cx + (rand() - 0.5) * 220, y: cy + (rand() - 0.3) * 80, vy: -20 - rand() * 40,
        wob: rand() * 6, start: 0.6 + rand() * 0.8, life: 0.8 + rand() * 0.8,
      }));
      return (cv, t) => {
        // initial flash
        cv.blob(cx, cy, 260, [1, 0.85, 0.55], 2.2 * Math.exp(-t * 14));
        // shockwave ring
        if (t < 0.45) {
          const R = 40 + t * 700;
          for (let k = 0; k < 90; k++) {
            const a = (k / 90) * Math.PI * 2;
            cv.blob(cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.55, 10, [1, 0.7, 0.4], 0.12 * (1 - t / 0.45));
          }
        }
        // fireball: puffs fly out, slow down, rise, grow and cool
        for (const p of fire) {
          const lt = t - p.delay;
          if (lt < 0 || lt > p.life) continue;
          const drag = (1 - Math.exp(-3.2 * lt)) / 3.2;
          const x = cx + p.vx * drag + Math.sin(lt * p.swirl * 3) * 8;
          const y = cy + p.vy * drag - 34 * lt * lt;
          const u = lt / p.life;
          const r = p.r0 * (1 + 3 * Math.sqrt(u));
          cv.blob(x, y, r, fireColor(p.heat * Math.exp(-2.6 * lt)), p.a * Math.min(1, lt * 30) * (1 - smooth(0.55, 1, u)) * (1.4 - u));
        }
        // sparks and debris with gravity, drawn as short streaks
        for (const s of sparks) {
          if (t > s.life) continue;
          const pos = (tt) => {
            const d = (1 - Math.exp(-1.6 * tt)) / 1.6;
            return [cx + s.vx * d, cy + s.vy * d + 160 * tt * tt];
          };
          const [x1, y1] = pos(t);
          const [x0, y0] = pos(Math.max(0, t - 0.035));
          cv.line(x0, y0, x1, y1, s.r, [1, 0.75, 0.35], 0.9 * (1 - t / s.life));
        }
        // embers drifting up afterwards
        for (const e of embers) {
          const lt = t - e.start;
          if (lt < 0 || lt > e.life) continue;
          cv.blob(e.x + Math.sin(lt * 4 + e.wob) * 6, e.y + e.vy * lt, 2.2, [1, 0.35, 0.08], 0.8 * Math.sin((Math.PI * lt) / e.life));
        }
      };
    },
    audio: (d) => [
      `aevalsrc=exprs='(2*random(0)-1)*exp(-1.6*t)*min(1\\,t*400)':s=48000:d=${d},lowpass=f=420,lowpass=f=420,volume=7[n]`,
      `aevalsrc=exprs='sin(2*PI*46*t+9*(1-exp(-5*t)))*exp(-3*t)*min(1\\,t*300)':s=48000:d=${d}[b]`,
      `aevalsrc=exprs='(2*random(0)-1)*exp(-11*t)':s=48000:d=${d},highpass=f=1200[c]`,
      '[n][b][c]amix=inputs=3:normalize=0:weights=1 0.9 0.4[aout]',
    ],
  },

  fireworks: {
    label: 'Fireworks',
    thumbAt: 1.6,
    duration: 3,
    setup(rand) {
      const palette = [[1, 0.3, 0.35], [0.35, 0.7, 1], [1, 0.8, 0.3], [0.5, 1, 0.45], [0.95, 0.45, 1]];
      const bursts = [
        { x: RW * 0.5, y: RH * 0.3, t0: 0.75, col: palette[0], col2: palette[2], sp: 330 },
        { x: RW * 0.28, y: RH * 0.42, t0: 1.25, col: palette[1], col2: palette[4], sp: 240 },
        { x: RW * 0.73, y: RH * 0.38, t0: 1.45, col: palette[3], col2: palette[2], sp: 250 },
      ].map((b) => ({
        ...b,
        parts: Array.from({ length: 170 }, (_, k) => {
          const ang = rand() * Math.PI * 2;
          const z = rand() * 2 - 1; // points on a sphere, seen from the front
          const k2 = Math.sqrt(1 - z * z) * (0.9 + rand() * 0.15);
          return { vx: Math.cos(ang) * k2, vy: Math.sin(ang) * k2, sp: b.sp, col: k % 3 ? b.col : b.col2, tw: rand() * 40, life: 1.1 + rand() * 0.5 };
        }),
      }));
      return (cv, t) => {
        for (const b of bursts) {
          // rocket climbing from the bottom
          const rise = b.t0 - 0.6;
          if (t >= rise && t < b.t0) {
            const u = (t - rise) / 0.6;
            const y = RH + 10 - (RH + 10 - b.y) * (1 - (1 - u) * (1 - u));
            for (let k = 0; k < 6; k++) cv.blob(b.x + Math.sin(k + t * 20), y + k * 5, 2.2 - k * 0.25, [1, 0.8, 0.5], 0.7 - k * 0.1);
          }
          const lt = t - b.t0;
          if (lt < 0) continue;
          cv.blob(b.x, b.y, 70, b.col, 1.2 * Math.exp(-lt * 12));
          for (const p of b.parts) {
            if (lt > p.life) continue;
            const at = (tt) => {
              const d = (1 - Math.exp(-2.6 * tt)) / 2.6;
              return [b.x + p.vx * p.sp * d, b.y + p.vy * p.sp * d + 55 * tt * tt];
            };
            const fade = 1 - smooth(0.5, 1, lt / p.life);
            const flicker = lt > 0.6 ? 0.55 + 0.45 * Math.sin(p.tw + lt * 50) : 1;
            for (let k = 0; k < 4; k++) {
              const [x, y] = at(Math.max(0, lt - k * 0.04));
              cv.blob(x, y, 2.6 - k * 0.35, p.col, (1.1 - k * 0.22) * fade * flicker);
            }
          }
        }
      };
    },
    audio: (d) => [
      // launch whistles, then a bang and crackle for each burst (0.75, 1.25, 1.45 s)
      `aevalsrc=exprs='0.25*sin(2*PI*(900*t+700*t*t))*between(t\\,0.15\\,0.75)*sin(PI*(t-0.15)/0.6)':s=48000:d=${d}[w]`,
      `aevalsrc=exprs='(2*random(0)-1)*(gte(t\\,0.75)*exp(-9*(t-0.75))+0.8*gte(t\\,1.25)*exp(-9*(t-1.25))+0.8*gte(t\\,1.45)*exp(-9*(t-1.45)))':s=48000:d=${d},lowpass=f=900,volume=3[p]`,
      `aevalsrc=exprs='(2*random(0)-1)*gt(random(1)\\,0.9985)*between(t\\,1.2\\,2.8)*8':s=48000:d=${d},highpass=f=900[c]`,
      '[w][p][c]amix=inputs=3:normalize=0[aout]',
    ],
  },

  lightning: {
    label: 'Lightning',
    thumbAt: 0.2,
    duration: 2,
    setup(rand) {
      // jagged bolt by midpoint displacement, plus a few forks
      const bolt = (x0, y0, x1, y1, rough, depth) => {
        if (depth === 0) return [[x0, y0], [x1, y1]];
        const mx = (x0 + x1) / 2 + (rand() - 0.5) * rough;
        const my = (y0 + y1) / 2 + (rand() - 0.5) * rough * 0.3;
        return [...bolt(x0, y0, mx, my, rough / 2, depth - 1).slice(0, -1), ...bolt(mx, my, x1, y1, rough / 2, depth - 1)];
      };
      const main = bolt(RW * 0.52, -10, RW * 0.45, RH + 10, 170, 7);
      const forks = [0.3, 0.45, 0.62].map((f) => {
        const [x, y] = main[Math.floor(main.length * f)];
        const dir = rand() < 0.5 ? -1 : 1;
        return bolt(x, y, x + dir * (60 + rand() * 90), y + 70 + rand() * 80, 60, 5);
      });
      // on/off flicker of a real strike
      const env = (t) => (t < 0.07 ? 1 : t < 0.13 ? 0.15 : t < 0.3 ? 1 : 0) + (t >= 0.3 ? Math.exp(-(t - 0.3) * 7) : 0);
      const draw = (cv, pts, w, a) => {
        for (let k = 1; k < pts.length; k++) {
          const [xa, ya] = pts[k - 1];
          const [xb, yb] = pts[k];
          cv.line(xa, ya, xb, yb, 9 * w, [0.45, 0.55, 1], 0.06 * a);
          cv.line(xa, ya, xb, yb, 1.6 * w, [0.95, 0.97, 1], 0.9 * a);
        }
      };
      return (cv, t) => {
        const a = env(t);
        if (a < 0.003) return;
        cv.blob(RW / 2, RH * 0.4, 520, [0.55, 0.6, 1], 0.35 * a); // sky lights up
        draw(cv, main, 1, a);
        forks.forEach((f) => draw(cv, f, 0.6, a * 0.7));
      };
    },
    audio: (d) => [
      `aevalsrc=exprs='(2*random(0)-1)*exp(-18*t)':s=48000:d=${d},highpass=f=600,volume=1.2[c]`,
      `aevalsrc=exprs='(2*random(0)-1)*min(1\\,t*6)*exp(-1.7*t)*(1+0.5*sin(2*PI*3*t))':s=48000:d=${d},lowpass=f=260,lowpass=f=260,volume=9[r]`,
      '[c][r]amix=inputs=2:normalize=0[aout]',
    ],
  },

  sparkle: {
    label: 'Magic sparkle',
    thumbAt: 0.9,
    duration: 2,
    setup(rand) {
      const stars = Array.from({ length: 70 }, () => ({
        a0: rand() * Math.PI * 2, r0: 10 + rand() * 30, spin: 1.5 + rand() * 1.5, grow: 60 + rand() * 90,
        start: rand() * 0.9, life: 0.6 + rand() * 0.7, size: 1.5 + rand() * 2, tw: rand() * 30,
        col: rand() < 0.6 ? [1, 0.82, 0.4] : [0.55, 0.9, 1],
      }));
      return (cv, t) => {
        cv.blob(RW / 2, RH / 2, 90, [1, 0.85, 0.55], 0.35 * Math.sin(Math.PI * Math.min(1, t / 1.6)));
        for (const s of stars) {
          const lt = t - s.start;
          if (lt < 0 || lt > s.life) continue;
          const ang = s.a0 + s.spin * lt;
          const rad = s.r0 + s.grow * lt;
          const x = RW / 2 + Math.cos(ang) * rad;
          const y = RH / 2 + Math.sin(ang) * rad * 0.8 - 20 * lt;
          const a = 1.5 * Math.sin((Math.PI * lt) / s.life) * (0.65 + 0.35 * Math.sin(s.tw + lt * 25));
          const len = s.size * 5 * a;
          cv.blob(x, y, s.size * 1.6, s.col, a);
          cv.line(x - len, y, x + len, y, 0.8, s.col, 0.5 * a); // star flare
          cv.line(x, y - len, x, y + len, 0.8, s.col, 0.5 * a);
        }
      };
    },
    audio: (d) => {
      const notes = [[0, 1568], [0.12, 2093], [0.24, 2637], [0.36, 3136], [0.6, 2637], [0.75, 3520]];
      const sum = notes.map(([at, f]) => `gte(t\\,${at})*sin(2*PI*${f}*(t-${at}))*exp(-5*(t-${at}))`).join('+');
      return [`aevalsrc=exprs='0.75*(${sum})':s=48000:d=${d},aecho=0.8:0.6:120:0.35[aout]`];
    },
  },
};

// Renders one effect into `file`. Frames are produced one at a time and
// written with back-pressure so the main process stays responsive.
function render(ffmpegPath, key, file) {
  const fx = EFFECTS[key];
  return new Promise((resolve, reject) => {
    const tmp = `${file}.part.mp4`;
    const proc = spawn(ffmpegPath, [
      '-y', '-hide_banner', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${RW}x${RH}`, '-r', String(FPS), '-i', 'pipe:0',
      '-filter_complex', [`[0:v]scale=${OUT}:flags=bicubic,format=yuv420p[vout]`, ...fx.audio(fx.duration)].join(';')
        + ';[aout]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.9[a]',
      '-map', '[vout]', '-map', '[a]', '-t', String(fx.duration),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', tmp,
    ], { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${fx.label}: ${err.trim().split('\n').pop()}`));
      fs.renameSync(tmp, file);
      resolve();
    });
    proc.stdin.on('error', () => {}); // reported through 'close'

    const cv = canvas();
    const draw = fx.setup(rng(key.length * 7919 + 17));
    const frames = Math.round(fx.duration * FPS);
    let f = 0;
    const next = () => {
      while (f < frames) {
        draw(cv, f / FPS);
        f++;
        if (!proc.stdin.write(cv.toBytes())) return proc.stdin.once('drain', next);
        if (f % 5 === 0) return setImmediate(next);
      }
      proc.stdin.end();
    };
    next();
  });
}

let pending = null;

// Makes sure every built-in effect exists in `dir`; returns [{key, label, thumbAt, path}].
function ensureEffects(ffmpegPath, dir) {
  if (!pending) {
    pending = (async () => {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of fs.readdirSync(dir)) { // files from older versions
        if (!f.endsWith(`-v${VERSION}.mp4`)) fs.rmSync(path.join(dir, f), { force: true });
      }
      const list = [];
      for (const key of Object.keys(EFFECTS)) {
        const file = path.join(dir, `${key}-v${VERSION}.mp4`);
        if (!fs.existsSync(file)) await render(ffmpegPath, key, file);
        list.push({ key, label: EFFECTS[key].label, thumbAt: EFFECTS[key].thumbAt, path: file });
      }
      return list;
    })();
    pending.catch(() => { pending = null; }); // allow a retry
  }
  return pending;
}

module.exports = { EFFECTS, ensureEffects };
