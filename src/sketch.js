let FaceLandmarker, FilesetResolver;
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const GOAL = 8; // segons amb la boca oberta per
const STAGE_AT = [0, 2.5, 5]; // segons on comença cada fase
const STAGE_COLOR = [[255, 140, 30], [170, 90, 255], [110, 255, 90]]; // taronja, lila, slime
const STAGE_MSG = [
  'Molt bé! Mantén la boca oberta…',
  'Arriben els ratpenats! No la tanquis!',
  'Gairebé! Aguanta, ja ho tens!',
];
const LIPS = { upper: 13, lower: 14, left: 61, right: 291 }; // landmarks de la boca

const $ = (id) => document.getElementById(id);

let landmarker = null;
let audio = null;

// càrrega
async function init() {
  try {
    ({ FaceLandmarker, FilesetResolver } = await import(`${CDN}/vision_bundle.mjs`));
    console.log('1 llibreria ok');
    const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    console.log('2 wasm ok');
    await Promise.all([
      document.fonts.load('48px Creepster').catch(() => {}),
      document.fonts.load('700 18px Nunito').catch(() => {}),
    ]);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
    try {
      landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('GPU no disponible, provo CPU:', err && err.message);
      landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'));
    }
    console.log('3 model ok');
    showScreen('start');
    fillCameras();
  } catch (e) {
    const msg = (e && (e.message || e.type)) || String(e);
    console.error('ERROR init:', msg);
    $('loadingText').textContent = 'Error: ' + msg;
  }
}

// llista de càmeres disponibles
async function fillCameras() {
  try {
    const sel = $('camSelect');
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    sel.innerHTML = '';
    devs.forEach((d, i) => sel.add(new Option(d.label || `Càmera ${i + 1}`, d.deviceId)));
    const saved = localStorage.getItem('cam');
    if (saved && devs.some((d) => d.deviceId === saved)) sel.value = saved;
    $('camRow').classList.toggle('hidden', devs.length < 2);
  } catch (e) {
    console.warn('No puc llistar les càmeres', e);
  }
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

// inici
$('startBtn').addEventListener('click', async () => {
  const btn = $('startBtn');
  btn.disabled = true;
  $('startError').textContent = '';
  const video = $('cam');
  try {
    const id = $('camSelect').value;
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }) },
      audio: false,
    });
    await video.play();
    if (id) localStorage.setItem('cam', id);
  } catch (e) {
    $('startError').textContent = `No puc accedir a la càmera (${e.name}). Prova'n una altra del desplegable.`;
    fillCameras();
    btn.disabled = false;
    return;
  }
  audio = createAudio();
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $('stage').classList.remove('hidden');
  new p5(sketch, 'sketch');
});

// so
function createAudio() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  // so greu que creix mentre la boca és oberta
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 220;
  const drone = ctx.createGain();
  drone.gain.value = 0;
  osc.connect(lowpass).connect(drone).connect(master);
  osc.start();

  const tone = (freq, delay, dur, type = 'triangle', vol = 0.25) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  return {
    update(open, stage, seconds) {
      drone.gain.setTargetAtTime(open ? 0.06 + stage * 0.03 : 0, ctx.currentTime, 0.1);
      osc.frequency.setTargetAtTime(55 + seconds * 10, ctx.currentTime, 0.1);
    },
    stage() {
      tone(330, 0, 0.35, 'sine');
      tone(220, 0.12, 0.45, 'sine');
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.5, 'triangle', 0.3));
    },
  };
}

// sketch
function sketch(p) {
  const video = $('cam');
  const thr = $('thr');
  let particles = [];
  let jawIdx = -1;
  let lastVideoTime = -1;
  let face = false;
  let jaw = 0;
  let openness = 0;
  let openTime = 0;
  let stage = 0;
  let done = false;
  let emitAcc = 0;
  let statusText = '';
  let fpsTimer = 0;
  const mouth = { x: 0, y: 0, w: 0, h: 0 };
  const view = { s: 1, ox: 0, oy: 0, vw: 1, vh: 1 };

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight);
    p.pixelDensity(1);
    p.frameRate(60);
    thr.addEventListener('input', () => ($('thrOut').textContent = thr.value + '%'));
  };
  p.windowResized = () => p.resizeCanvas(window.innerWidth, window.innerHeight);

  // vídeo a pantalla completa i mirall
  function layoutVideo() {
    view.vw = video.videoWidth || 1280;
    view.vh = video.videoHeight || 720;
    view.s = Math.max(p.width / view.vw, p.height / view.vh);
    view.ox = (p.width - view.vw * view.s) / 2;
    view.oy = (p.height - view.vh * view.s) / 2;
  }
  const toScreen = (nx, ny) => ({
    x: p.width - (view.ox + nx * view.vw * view.s),
    y: view.oy + ny * view.vh * view.s,
  });

  function drawVideo() {
    layoutVideo();
    const ctx = p.drawingContext;
    ctx.save();
    ctx.translate(p.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, view.ox, view.oy, view.vw * view.s, view.vh * view.s);
    ctx.restore();
  }

  // detecció
  function detect() {
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;
    const r = landmarker.detectForVideo(video, performance.now());
    const lm = r.faceLandmarks && r.faceLandmarks[0];
    const cats = r.faceBlendshapes && r.faceBlendshapes[0] && r.faceBlendshapes[0].categories;
    if (!lm || !cats) {
      face = false;
      return;
    }
    face = true;
    if (jawIdx < 0) jawIdx = cats.findIndex((c) => c.categoryName === 'jawOpen');
    jaw = cats[jawIdx].score;

    const up = lm[LIPS.upper];
    const lo = lm[LIPS.lower];
    const a = toScreen(up.x, up.y);
    const b = toScreen(lo.x, lo.y);
    const l = toScreen(lm[LIPS.left].x, lm[LIPS.left].y);
    const rr = toScreen(lm[LIPS.right].x, lm[LIPS.right].y);
    mouth.x = p.lerp(mouth.x, (a.x + b.x) / 2, 0.6);
    mouth.y = p.lerp(mouth.y, (a.y + b.y) / 2, 0.6);
    mouth.w = p.dist(l.x, l.y, rr.x, rr.y);
    mouth.h = p.dist(a.x, a.y, b.x, b.y);
  }

  p.draw = () => {
    const dt = Math.min(p.deltaTime / 1000, 0.05);
    drawVideo();
    detect();

    const unit = p.height / 1080;
    openness += ((face ? jaw : 0) - openness) * 0.35;
    const open = face && !done && openness > Number(thr.value) / 100;

    // temps amb la boca oberta
    if (!done) openTime = open ? openTime + dt : Math.max(0, openTime - dt * 2);

    let newStage = 0;
    STAGE_AT.forEach((t, i) => {
      if (openTime >= t) newStage = i;
    });
    if (open && newStage > stage) audio.stage();
    stage = newStage;

    if (!done && openTime >= GOAL) win();

    audio.update(open, stage, openTime);
    updateHud(open);

    if (open) {
      drawGlow(unit);
      emitAcc += (40 + stage * 40) * dt;
      while (emitAcc >= 1) {
        spawn(unit);
        emitAcc -= 1;
      }
    }

    // partícules
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= q.decay * dt;
      if (q.life <= 0) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      q.flap += dt * 18;
      drawParticle(q);
    }
    p.drawingContext.globalAlpha = 1;

    fpsTimer += dt;
    if (fpsTimer > 0.5) {
      $('fps').textContent = Math.round(p.frameRate()) + ' fps';
      fpsTimer = 0;
    }
  };

  function updateHud(open) {
    $('fill').style.transform = `scaleX(${Math.min(openTime / GOAL, 1)})`;
    let text;
    if (done) text = 'Boca neta!';
    else if (!face) text = "No et veig! Acosta't a la càmera";
    else if (!open) text = 'Obre la boca ben gran… AAAAH!';
    else text = STAGE_MSG[stage];
    if (text !== statusText) {
      statusText = text;
      $('status').textContent = text;
    }
  }

  function win() {
    done = true;
    audio.win();
    $('win').classList.remove('hidden');
    const unit = p.height / 1080;
    for (let i = 0; i < 140; i++) spawn(unit, true);
    setTimeout(() => {
      done = false;
      openTime = 0;
      stage = 0;
      $('win').classList.add('hidden');
    }, 4000);
  }

  // dibuixos
  function spawn(unit, burst = false) {
    if (particles.length > 500) return;
    const cx = face ? mouth.x : p.width / 2;
    const cy = face ? mouth.y : p.height / 2;
    const r = Math.random();
    let type;
    if (burst) type = r < 0.4 ? 'pumpkin' : r < 0.7 ? 'bat' : 'ghost';
    else if (stage === 0) type = r < 0.8 ? 'spark' : 'ghost';
    else if (stage === 1) type = r < 0.5 ? 'spark' : r < 0.8 ? 'bat' : 'ghost';
    else type = r < 0.4 ? 'spark' : r < 0.6 ? 'bat' : r < 0.85 ? 'pumpkin' : 'ghost';

    const angle = burst ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = (250 + Math.random() * 450) * unit * (burst ? 1.4 : 1);
    const size = { spark: 14, bat: 46, ghost: 52, pumpkin: 50 }[type] * unit * (0.7 + Math.random() * 0.7);
    particles.push({
      type,
      x: cx + (Math.random() - 0.5) * (mouth.w || 60) * 0.4,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: type === 'pumpkin' ? 900 * unit : type === 'ghost' ? -60 * unit : 0,
      size,
      life: 1,
      decay: type === 'spark' ? 0.9 : 0.45,
      rot: 0,
      vr: type === 'pumpkin' ? (Math.random() - 0.5) * 6 : 0,
      flap: Math.random() * 6,
      color: STAGE_COLOR[burst ? Math.floor(Math.random() * 3) : stage],
    });
  }

  function drawGlow(unit) {
    const ctx = p.drawingContext;
    const [r, g, b] = STAGE_COLOR[stage];
    const rad = Math.max(mouth.w, 120 * unit) * (1.2 + Math.min(openTime / GOAL, 1));
    const grad = ctx.createRadialGradient(mouth.x, mouth.y, 0, mouth.x, mouth.y, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(mouth.x - rad, mouth.y - rad, rad * 2, rad * 2);
  }

  function drawParticle(q) {
    p.drawingContext.globalAlpha = Math.min(1, q.life * 1.6);
    p.push();
    p.translate(q.x, q.y);
    p.rotate(q.rot);
    if (q.type === 'spark') {
      p.noStroke();
      p.fill(q.color[0], q.color[1], q.color[2]);
      p.circle(0, 0, q.size);
    } else if (q.type === 'bat') drawBat(q);
    else if (q.type === 'ghost') drawGhost(q.size);
    else drawPumpkin(q.size);
    p.pop();
  }

  function drawBat(q) {
    const s = q.size;
    const wing = Math.sin(q.flap) * 0.5 + 0.7;
    p.stroke(170, 110, 255);
    p.strokeWeight(2);
    p.fill(22, 10, 34);
    for (const d of [-1, 1]) {
      p.push();
      p.scale(d, 1);
      p.beginShape();
      p.vertex(s * 0.1, -s * 0.1);
      p.vertex(s * 0.9, -s * 0.5 * wing);
      p.vertex(s * 0.72, 0);
      p.vertex(s * 0.55, s * 0.14);
      p.vertex(s * 0.36, s * 0.02);
      p.vertex(s * 0.16, s * 0.26);
      p.endShape(p.CLOSE);
      p.pop();
    }
    p.ellipse(0, 0, s * 0.5, s * 0.7);
    p.triangle(-s * 0.2, -s * 0.28, -s * 0.12, -s * 0.5, -s * 0.02, -s * 0.3);
    p.triangle(s * 0.2, -s * 0.28, s * 0.12, -s * 0.5, s * 0.02, -s * 0.3);
    p.noStroke();
    p.fill(255, 70, 70);
    p.circle(-s * 0.09, -s * 0.1, s * 0.1);
    p.circle(s * 0.09, -s * 0.1, s * 0.1);
  }

  function drawGhost(s) {
    p.noStroke();
    p.fill(255, 255, 255);
    p.arc(0, 0, s, s, p.PI, p.TWO_PI);
    p.rect(-s / 2, 0, s, s * 0.45);
    for (let i = 0; i < 3; i++) p.circle(-s / 3 + (i * s) / 3, s * 0.45, s / 3);
    p.fill(30, 20, 50);
    p.ellipse(-s * 0.17, -s * 0.08, s * 0.14, s * 0.2);
    p.ellipse(s * 0.17, -s * 0.08, s * 0.14, s * 0.2);
    p.ellipse(0, s * 0.18, s * 0.14, s * 0.18);
  }

  function drawPumpkin(s) {
    p.noStroke();
    p.fill(232, 102, 12);
    p.ellipse(-s * 0.25, 0, s * 0.6, s * 0.8);
    p.ellipse(s * 0.25, 0, s * 0.6, s * 0.8);
    p.fill(255, 138, 31);
    p.ellipse(0, 0, s * 0.56, s * 0.85);
    p.fill(76, 194, 58);
    p.rect(-s * 0.06, -s * 0.52, s * 0.12, s * 0.2, 3);
    p.fill(255, 243, 166);
    p.triangle(-s * 0.3, -s * 0.12, -s * 0.1, -s * 0.12, -s * 0.2, s * 0.06);
    p.triangle(s * 0.1, -s * 0.12, s * 0.3, -s * 0.12, s * 0.2, s * 0.06);
    p.triangle(-s * 0.3, s * 0.16, s * 0.3, s * 0.16, 0, s * 0.34);
  }
}

init();
