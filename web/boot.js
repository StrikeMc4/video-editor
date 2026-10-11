// Loads the desktop app's page (src/index.html) into this one, then its
// scripts with web-api.js standing in for the Electron preload. Nothing in
// src/ is copied, so the web version always matches the desktop app.
(async () => {
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.body.appendChild(s);
  });
  try {
    const html = await (await fetch('../src/index.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script').forEach((s) => s.remove());
    document.body.innerHTML = doc.body.innerHTML;
    // Saving happens in the browser, so there is no folder to show.
    document.getElementById('modal-reveal').textContent = 'Play video';
    await load('../src/effects.js');
    await load('web-api.js');
    await load('../src/renderer.js');
  } catch (e) {
    document.body.innerHTML = `<div id="web-loading">Opus couldn't start: ${e.message}</div>`;
  }
})();
