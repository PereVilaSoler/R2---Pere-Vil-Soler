# HealthySmile · Boca Monstruosa

Filtre interactiu de Halloween per animar els més petits a obrir la boca i mirar-se les dents.
La càmera detecta l'obertura de la boca i, com més temps l'aguantes oberta, més partícules
(espurnes, fantasmes, ratpenats i carabasses) surten de la teva boca. Aguanta **8 segons** per
"netejar-te les dents".

**Stack:** p5.js · MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) · Electron (mode kiosk).

## Executar

Requisits: Node.js 18+ i una càmera web.

```bash
npm install     # instal·la dependències i prepara src/vendor + el model (postinstall)
npm start       # obre l'app a pantalla completa (kiosk). Esc per sortir
```

- `npm run dev` obre una finestra normal amb DevTools (a Windows: `set DEV=1 && npx electron .`).
- Si el setup falla per falta de xarxa, torna a executar `npm run setup`.
- Al navegador també funciona: serveix la carpeta `src/` amb qualsevol servidor local.

## Estructura

```
main.js            Electron: kiosk, servidor local, permís de càmera
scripts/setup.js   Copia llibreries i fonts a src/vendor i baixa el model
src/index.html     UI (DOM): loading, inici, HUD
src/style.css      Estils i fonts
src/sketch.js      Detecció (MediaPipe), partícules (p5.js) i so (Web Audio)
src/assets/        Logo SVG
```

## Llicència

MIT — vegeu [LICENSE].
