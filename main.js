const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn, execFile } = require('child_process');
// In a packaged app the binaries live in app.asar.unpacked.
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const ffprobePath = require('ffprobe-static').path.replace('app.asar', 'app.asar.unpacked');
const { buildExportArgs } = require('./export');
const { ensureEffects } = require('./builtin-effects');

const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts', 'mts'];

let win = null;
let exportProc = null;
const thumbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-editor-'));

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#141519',
    autoHideMenuBar: true,
    title: 'Vid Editor',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function probe(file) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
      { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error('Not a readable media file'));
        const info = JSON.parse(stdout);
        const v = info.streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
        if (!v) return reject(new Error('No video stream'));
        const duration = parseFloat(info.format.duration) || parseFloat(v.duration) || 0;
        if (!duration) return reject(new Error('Unknown duration'));
        // Displayed size: apply non-square pixels and phone rotation metadata.
        let width = v.width;
        let height = v.height;
        const sar = /^(\d+):(\d+)$/.exec(v.sample_aspect_ratio || '');
        if (sar && +sar[1] && +sar[2]) width = Math.round(width * (+sar[1] / +sar[2]));
        const sideRot = (v.side_data_list || []).find((d) => d.rotation != null);
        const rot = Math.abs(Number((v.tags && v.tags.rotate) || (sideRot && sideRot.rotation) || 0)) % 180;
        if (rot === 90) [width, height] = [height, width];
        resolve({
          duration,
          width,
          height,
          hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
        });
      });
  });
}

function thumbnail(file, duration, at = Math.min(1, duration / 2)) {
  const out = path.join(thumbDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  at = at.toFixed(2);
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-v', 'error', '-ss', at, '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', '-y', out],
      (err) => resolve(err ? null : pathToFileURL(out).href));
  });
}

async function loadMedia(paths) {
  const items = [];
  const errors = [];
  for (const p of paths) {
    try {
      const info = await probe(p);
      items.push({
        path: p,
        name: path.basename(p),
        url: pathToFileURL(p).href,
        thumb: await thumbnail(p, info.duration),
        ...info,
      });
    } catch (e) {
      errors.push(`${path.basename(p)}: ${e.message}`);
    }
  }
  return { items, errors };
}

ipcMain.handle('media:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import videos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: VIDEO_EXTS }, { name: 'All files', extensions: ['*'] }],
  });
  if (canceled) return null;
  return loadMedia(filePaths);
});

ipcMain.handle('media:load', (_e, paths) => loadMedia(paths));

// Built-in effects are generated on first use and cached in the user data folder.
ipcMain.handle('effects:list', async () => {
  try {
    const list = await ensureEffects(ffmpegPath, path.join(app.getPath('userData'), 'builtin-effects'));
    const items = [];
    for (const fx of list) {
      const info = await probe(fx.path);
      items.push({
        path: fx.path,
        name: fx.label,
        url: pathToFileURL(fx.path).href,
        thumb: await thumbnail(fx.path, info.duration, fx.thumbAt),
        ...info,
        builtin: fx.key,
        blend: 'screen',
      });
    }
    return { items };
  } catch (e) {
    return { items: [], error: e.message };
  }
});

ipcMain.handle('export:start', async (_e, project) => {
  if (exportProc) return { ok: false, error: 'An export is already running.' };
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export video',
    defaultPath: path.join(app.getPath('videos'), 'my-video.mp4'),
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const { args, duration } = buildExportArgs(project.clips, project.settings, filePath);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; exportProc = null; resolve(r); } };
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    exportProc = proc;
    let stderrTail = '';
    let buf = '';

    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const [key, value] = line.trim().split('=');
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const t = Number(value) / 1e6;
          if (Number.isFinite(t) && win) win.webContents.send('export:progress', Math.min(1, t / duration));
        }
      }
    });
    proc.stderr.on('data', (chunk) => { stderrTail = (stderrTail + chunk).slice(-4000); });
    proc.on('error', (err) => finish({ ok: false, error: err.message }));
    proc.on('close', (code) => {
      if (proc.cancelled) {
        fs.rm(filePath, { force: true }, () => {});
        finish({ canceled: true });
      } else if (code === 0) {
        finish({ ok: true, path: filePath });
      } else {
        finish({ ok: false, error: stderrTail.trim().split('\n').slice(-8).join('\n') });
      }
    });
  });
});

ipcMain.handle('export:cancel', () => {
  if (exportProc) {
    exportProc.cancelled = true;
    exportProc.kill();
  }
});

ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  if (exportProc) exportProc.kill();
  fs.rmSync(thumbDir, { recursive: true, force: true });
});
