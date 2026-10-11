// `npm run web`: makes the effects if needed, then serves the repo at
// http://localhost:8080/web/ (the web version reads ../src and ../export.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildEffects } = require('./build-effects');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp4': 'video/mp4', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png',
};

function serve(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') {
    res.writeHead(302, { Location: '/web/' });
    return res.end();
  }
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`)) {
    res.writeHead(403);
    return res.end();
  }
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    // Videos need byte ranges so the preview can seek.
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

buildEffects().catch((e) => console.error(`Effects not built: ${e.message}`)).then(() => {
  http.createServer(serve).listen(PORT, () => console.log(`Opus web: http://localhost:${PORT}/web/`));
});
