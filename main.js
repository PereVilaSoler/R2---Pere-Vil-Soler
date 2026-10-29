// HealthySmile · Boca Monstruosa — procés principal d'Electron.
// Serveix /src per HTTP local (127.0.0.1): així getUserMedia, els mòduls ES i els fitxers .wasm
// funcionen sense els problemes de file://.
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEV = process.env.DEV === '1'; // DEV=1 -> finestra normal + DevTools
const ROOT = path.join(__dirname, 'src');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// Millor rendiment de WebGL/GPU per a MediaPipe
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

app.whenReady().then(async () => {
  // Només permetem l'accés a la càmera
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  const port = await startServer();
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: !DEV,
    kiosk: !DEV,
    autoHideMenuBar: true,
    backgroundColor: '#0b0614',
    webPreferences: { backgroundThrottling: false },
  });

  // Esc tanca l'app (en mode kiosk no hi ha cap altra manera de sortir)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') app.quit();
  });

  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
  win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on('window-all-closed', () => app.quit());
