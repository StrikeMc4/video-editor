// Renders the built-in effects into web/effects/ with the desktop app's own
// builtin-effects.js, plus effects.json (what main.js's effects:list returns,
// minus thumbnails, which the browser makes). Run by `npm run web` and by the
// GitHub Pages workflow; skipped when the files are already there.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { ensureEffects } = require('../builtin-effects');

const DIR = path.join(__dirname, 'effects');

async function buildEffects() {
  const list = await ensureEffects(ffmpegPath, DIR);
  const manifest = list.map((fx) => {
    const info = JSON.parse(execFileSync(ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', fx.path]));
    const v = info.streams.find((s) => s.codec_type === 'video');
    return {
      key: fx.key, label: fx.label, thumbAt: fx.thumbAt, file: path.basename(fx.path),
      duration: parseFloat(info.format.duration), width: v.width, height: v.height,
      hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
    };
  });
  fs.writeFileSync(path.join(DIR, 'effects.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { buildEffects };

if (require.main === module) {
  buildEffects().then((m) => console.log(`${m.length} effects in ${DIR}`), (e) => {
    console.error(e.message);
    process.exit(1);
  });
}
