// Runs FFmpeg (WebAssembly build, single-threaded so no special server headers
// are needed) off the main thread. One job at a time:
//   { id, type: 'probe' | 'exec', files: [{ name, data: Blob }], args, fonts? }
// Input files are mounted read-only from their Blobs (WORKERFS), so even large
// videos are never copied into WebAssembly memory. Replies:
//   { id, log } while running, then { id, done: true, ret, stdout, output? }
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/';
importScripts(`${CORE}ffmpeg-core.js`);

let core = null;
// The core finds its .wasm through this hash (it ignores locateFile).
const urls = btoa(JSON.stringify({ wasmURL: `${CORE}ffmpeg-core.wasm` }));
const ready = createFFmpegCore({ mainScriptUrlOrBlob: `${CORE}ffmpeg-core.js#${urls}` }).then((c) => {
  core = c;
  core.FS.mkdir('/Fonts');
  postMessage({ ready: true });
});

let current = null; // { id, stdout: [] }
const log = ({ type, message }) => {
  if (!current) return;
  if (type === 'stdout') current.stdout.push(message);
  postMessage({ id: current.id, log: message, type });
};

onmessage = async ({ data: job }) => {
  await ready;
  const { FS } = core;
  for (const f of job.fonts || []) FS.writeFile(`/Fonts/${f.name}`, new Uint8Array(f.data));
  current = { id: job.id, stdout: [] };
  core.setLogger(log);
  FS.mkdir('/in');
  FS.mount(core.FS.filesystems.WORKERFS, { blobs: job.files.map((f) => ({ name: f.name, data: f.data })) }, '/in');
  let ret = -1;
  let output = null;
  try {
    core.setTimeout(-1);
    ret = job.type === 'probe' ? core.ffprobe(...job.args) : core.exec(...job.args);
    if (job.output && ret === 0) output = FS.readFile(job.output);
  } catch (e) {
    postMessage({ id: job.id, log: String(e && e.message || e), type: 'stderr' });
  } finally {
    core.reset();
    FS.unmount('/in');
    FS.rmdir('/in');
    if (job.output) try { FS.unlink(job.output); } catch (e) { /* never written */ }
  }
  const msg = { id: job.id, done: true, ret, stdout: current.stdout.join('\n'), output };
  current = null;
  postMessage(msg, output ? [output.buffer] : []);
};
