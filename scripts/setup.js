// Copia les llibreries de node_modules a src/vendor i descarrega el model de MediaPipe.
// S'executa sol després de `npm install` (postinstall) i també amb `npm run setup`.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = (...a) => path.join(root, 'node_modules', ...a);
const out = (...a) => path.join(root, 'src', ...a);

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('  ok  ' + path.relative(root, to));
}

function fontFile(pkg, weight) {
  const dir = nm('@fontsource', pkg, 'files');
  const name = fs.readdirSync(dir).find((n) => n.endsWith(`-latin-${weight}-normal.woff2`));
  if (!name) throw new Error(`No trobo la font ${pkg} ${weight}`);
  return path.join(dir, name);
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function main() {
  console.log('Preparant HealthySmile…');

  copy(nm('p5', 'lib', 'p5.min.js'), out('vendor', 'p5.min.js'));

  const mp = nm('@mediapipe', 'tasks-vision');
  copy(path.join(mp, 'vision_bundle.mjs'), out('vendor', 'vision_bundle.mjs'));
  for (const f of fs.readdirSync(path.join(mp, 'wasm'))) {
    copy(path.join(mp, 'wasm', f), out('vendor', 'wasm', f));
  }

  copy(fontFile('creepster', 400), out('vendor', 'fonts', 'creepster.woff2'));
  copy(fontFile('nunito', 400), out('vendor', 'fonts', 'nunito-400.woff2'));
  copy(fontFile('nunito', 700), out('vendor', 'fonts', 'nunito-700.woff2'));

  const model = out('models', 'face_landmarker.task');
  if (fs.existsSync(model)) {
    console.log('  ok  src/models/face_landmarker.task (ja existeix)');
  } else {
    console.log('  descarregant el model de MediaPipe (~4 MB)…');
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Error descarregant el model: HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(model), { recursive: true });
    fs.writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log('  ok  src/models/face_landmarker.task');
  }
  console.log('Llest! Executa: npm start');
}

main().catch((e) => {
  console.error('\nError en el setup:', e.message);
  process.exit(1);
});
