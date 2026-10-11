// Browser stand-in for preload.js: the same window.api the Electron renderer
// uses, built on browser APIs and FFmpeg compiled to WebAssembly
// (ffmpeg-worker.js). The renderer files in src/ run unchanged on top of it.
(() => {
  const FONT_FILES = { // the Windows font file names export.js asks for → open look-alikes in web/fonts
    'arial.ttf': 'Arimo-Regular.ttf', 'arialbd.ttf': 'Arimo-Bold.ttf',
    'verdana.ttf': 'NotoSans-Regular.ttf', 'verdanab.ttf': 'NotoSans-Bold.ttf',
    'times.ttf': 'Tinos-Regular.ttf', 'timesbd.ttf': 'Tinos-Bold.ttf',
    'cour.ttf': 'Cousine-Regular.ttf', 'courbd.ttf': 'Cousine-Bold.ttf',
    'impact.ttf': 'Anton-Regular.ttf',
    'comic.ttf': 'ComicNeue-Regular.ttf', 'comicbd.ttf': 'ComicNeue-Bold.ttf',
  };
  const base = new URL('.', document.currentScript.src);
  const files = new Map(); // virtual path → Blob (or a URL still to fetch, for built-in effects)
  let fileCount = 0;

  // ------------------------------------------------------------ FFmpeg worker

  let worker = null;
  let fontsSent = false;
  let jobId = 0;
  const jobs = new Map();
  let progressCb = () => {};

  function startWorker() {
    worker = new Worker(new URL('ffmpeg-worker.js', base));
    fontsSent = false;
    worker.onmessage = ({ data }) => {
      const job = jobs.get(data.id);
      if (!job) return;
      if (data.done) {
        jobs.delete(data.id);
        job.resolve(data);
      } else if (job.onLog) {
        job.onLog(data.log, data.type);
      }
    };
    worker.onerror = (e) => {
      for (const job of jobs.values()) job.reject(new Error(e.message || 'FFmpeg failed to load'));
      jobs.clear();
      worker = null;
    };
  }

  async function run(type, args, paths, extra = {}) {
    if (!worker) startWorker();
    const list = [];
    for (const p of new Set(paths)) {
      let data = files.get(p);
      if (typeof data === 'string') {
        data = await (await fetch(data)).blob();
        files.set(p, data);
      }
      list.push({ name: p.slice('/in/'.length), data });
    }
    const id = ++jobId;
    const fonts = extra.fonts && !fontsSent ? await loadFonts() : [];
    if (fonts.length) fontsSent = true;
    return new Promise((resolve, reject) => {
      jobs.set(id, { resolve, reject, onLog: extra.onLog });
      worker.postMessage({ id, type, args, files: list, fonts, output: extra.output });
    });
  }

  const loadFonts = () => Promise.all(Object.entries(FONT_FILES).map(async ([name, file]) =>
    ({ name, data: await (await fetch(new URL(`fonts/${file}`, base))).arrayBuffer() })));

  // ------------------------------------------------------------ import

  // Same rules as main.js probe(): displayed size with non-square pixels and
  // phone rotation applied.
  async function probe(path) {
    const res = await run('probe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], [path]);
    let info;
    try { info = JSON.parse(res.stdout); } catch (e) { throw new Error('Not a readable media file'); }
    const v = (info.streams || []).find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    if (!v) throw new Error('No video stream');
    const duration = parseFloat(info.format && info.format.duration) || parseFloat(v.duration) || 0;
    if (!duration) throw new Error('Unknown duration');
    let width = v.width;
    let height = v.height;
    const sar = /^(\d+):(\d+)$/.exec(v.sample_aspect_ratio || '');
    if (sar && +sar[1] && +sar[2]) width = Math.round(width * (+sar[1] / +sar[2]));
    const sideRot = (v.side_data_list || []).find((d) => d.rotation != null);
    const rot = Math.abs(Number((v.tags && v.tags.rotate) || (sideRot && sideRot.rotation) || 0)) % 180;
    if (rot === 90) [width, height] = [height, width];
    return { duration, width, height, hasAudio: info.streams.some((s) => s.codec_type === 'audio') };
  }

  // A 320px-wide JPEG of one frame, grabbed by the browser itself. Failing to
  // load also means Chrome can't play the file, so the preview would be blank.
  function thumbnail(url, at) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.onerror = () => reject(new Error('Chrome can\'t play this format (try MP4 or WebM)'));
      v.onloadedmetadata = () => { v.currentTime = Math.min(at, Math.max(0, v.duration - 0.05)); };
      v.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = Math.max(2, Math.round(320 * v.videoHeight / v.videoWidth)) || 180;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
        v.removeAttribute('src');
        v.load();
      };
      v.src = url;
    });
  }

  function register(file) {
    const path = `/in/${++fileCount}_${file.name.replace(/[^\w.-]+/g, '_')}`;
    files.set(path, file);
    return path;
  }

  async function loadMedia(paths) {
    const items = [];
    const errors = [];
    for (const p of paths) {
      const file = files.get(p);
      try {
        const info = await probe(p);
        const url = URL.createObjectURL(file);
        items.push({ path: p, name: file.name, url, thumb: await thumbnail(url, Math.min(1, info.duration / 2)), ...info });
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }
    return { items, errors };
  }

  function importMedia() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,.mkv,.mov,.m4v,.ts,.mts';
      input.onchange = () => resolve(input.files.length ? loadMedia([...input.files].map(register)) : null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  // Built-in effects are rendered ahead of time by web/build-effects.js.
  async function listEffects() {
    try {
      const res = await fetch(new URL('effects/effects.json', base));
      if (!res.ok) throw new Error('effects are missing (run "npm run web")');
      const items = [];
      for (const fx of await res.json()) {
        const url = new URL(`effects/${fx.file}`, base).href;
        const path = `/in/fx_${fx.file}`;
        files.set(path, url);
        items.push({
          path, name: fx.label, url, thumb: await thumbnail(url, fx.thumbAt),
          duration: fx.duration, width: fx.width, height: fx.height, hasAudio: fx.hasAudio,
          builtin: fx.key, blend: 'screen',
        });
      }
      return { items };
    } catch (e) {
      return { items: [], error: e.message };
    }
  }

  // ------------------------------------------------------------ export

  // export.js is CommonJS for Node; run the very same file here with just
  // enough of fs/path/process for it. Its fonts resolve to /Fonts in the worker.
  let builder = null;
  async function buildExportArgs(...a) {
    if (!builder) {
      const src = await (await fetch(new URL('../export.js', base))).text();
      const shims = {
        fs: { existsSync: (p) => p.split('/').pop() in FONT_FILES },
        path: { join: (...parts) => parts.join('/').replace(/\/+/g, '/') },
        './src/effects': window.Effects,
      };
      const module = { exports: {} };
      new Function('require', 'module', 'exports', 'process', src)(
        (name) => shims[name], module, module.exports, { env: { windir: '/' } });
      builder = module.exports.buildExportArgs;
    }
    return builder(...a);
  }

  async function chooseTarget() {
    if (!window.showSaveFilePicker) return { name: 'my-video.mp4' };
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'my-video.mp4',
        types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
      });
      return { name: handle.name, handle };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      return { name: 'my-video.mp4' }; // e.g. no user gesture left: fall back to a download
    }
  }

  let exporting = null; // { cancel }
  let lastUrl = null;

  async function exportVideo(project) {
    if (exporting) return { ok: false, error: 'An export is already running.' };
    const target = await chooseTarget();
    if (!target) return { canceled: true };
    const OUT = '/out.mp4';
    const { args, duration } = await buildExportArgs(project.clips, project.settings, OUT, project.texts);
    let tail = [];
    const onLog = (line, type) => {
      const [key, value] = line.trim().split('=');
      if (type === 'stdout' && (key === 'out_time_us' || key === 'out_time_ms')) {
        const t = Number(value) / 1e6;
        if (Number.isFinite(t)) progressCb(Math.min(1, t / duration));
      } else if (type === 'stderr') {
        tail = tail.concat(line).slice(-8);
      }
    };
    const canceled = new Promise((resolve) => { exporting = { cancel: () => resolve({ canceled: true }) }; });
    progressCb(0);
    try {
      const res = await Promise.race([
        run('exec', args, project.clips.map((c) => c.path), { fonts: true, output: OUT, onLog }),
        canceled,
      ]);
      if (res.canceled) return res;
      if (res.ret !== 0 || !res.output) return { ok: false, error: tail.join('\n') || 'FFmpeg failed' };
      const blob = new Blob([res.output], { type: 'video/mp4' });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      if (target.handle) {
        const w = await target.handle.createWritable();
        await w.write(blob);
        await w.close();
      } else {
        download(lastUrl, target.name);
      }
      return { ok: true, path: target.handle ? `Saved as ${target.name}` : `Downloaded ${target.name}` };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      exporting = null;
    }
  }

  function download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // The only way to stop FFmpeg mid-run is to throw the worker away.
  function cancelExport() {
    if (!exporting) return;
    worker.terminate();
    worker = null;
    for (const job of jobs.values()) job.resolve({ ret: -1 });
    jobs.clear();
    exporting.cancel();
  }

  window.api = {
    importMedia,
    loadMedia,
    listEffects,
    pathForFile: register,
    exportVideo,
    cancelExport,
    onExportProgress: (cb) => { progressCb = cb; },
    revealFile: () => { if (lastUrl) window.open(lastUrl, '_blank'); }, // no folder to show: play it instead
  };

  // Start downloading FFmpeg now so the first import doesn't wait as long.
  startWorker();
})();
