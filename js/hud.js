import { G, MAX_AMMO, TIERS, WORLD, HUNT_TIME } from './state.js';
import { waterHoles } from './world.js';

// Module-level cache
let _treePosCache   = null; // populated on first draw call
let _lastWindUpdate = 0;    // performance.now() timestamp

const $ = id => document.getElementById(id);

// ─── initHUD — call at start of each hunt to reset all HUD state ─────────────
export function initHUD() {
  const ammoBars = $('ammo-bars');
  if (ammoBars) {
    ammoBars.innerHTML = '';
    for (let i = 0; i < MAX_AMMO; i++) {
      const bar = document.createElement('div');
      bar.className = 'ammo-bar';
      ammoBars.appendChild(bar);
    }
  }

  // Clear stale transient state from a previous hunt
  const alertBar = $('alert-bar');
  if (alertBar) {
    clearTimeout(alertBar._t);
    alertBar.classList.add('hidden');
    alertBar.style.animation = '';
  }
  $('combo-display')?.classList.add('hidden');
  $('reload-bar-wrap')?.classList.add('hidden');
  document.querySelectorAll('.score-popup').forEach(el => el.remove());

  updateWindUI();
}

// ─── syncUI — called every frame while running ────────────────────────────────
export function syncUI() {
  updateScoreUI();
  updateAmmoUI();
  _syncAimMode();
  _syncCombo();

  const now = performance.now();
  if (now - _lastWindUpdate > 10000) {
    _lastWindUpdate = now;
    updateWindUI();
  }
}

function _syncAimMode() {
  const scope    = $('scope-overlay');
  const xhair    = $('crosshair');
  const zoomLbl  = $('zoom-label');
  const zoomBtns = $('zoom-buttons');
  const aimBtn   = $('btn-mobile-aim');

  if (G.isAiming && G.mode === 'fps') {
    scope?.classList.remove('hidden');
    xhair?.classList.add('hidden');
    zoomBtns?.classList.remove('hidden');
    if (zoomLbl) zoomLbl.textContent = `${G.zoom.toFixed(1)}×`;
    aimBtn?.classList.add('aim-active');
  } else {
    scope?.classList.add('hidden');
    xhair?.classList.remove('hidden');
    zoomBtns?.classList.add('hidden');
    aimBtn?.classList.remove('aim-active');
  }
}

function _syncCombo() {
  const el    = $('combo-display');
  const valEl = $('combo-value');
  if (!el) return;
  if (G.combo >= 3) {
    el.classList.remove('hidden');
    if (valEl) valEl.textContent = `×${G.combo}`;
  } else {
    el.classList.add('hidden');
  }
}

// ─── updateScoreUI ────────────────────────────────────────────────────────────
export function updateScoreUI() {
  const scoreEl = $('score-value');
  const hitsEl  = $('hits-value');
  if (scoreEl) scoreEl.textContent = G.score.toLocaleString();
  if (hitsEl)  hitsEl.textContent  = G.hits;
}

// ─── updateAmmoUI ─────────────────────────────────────────────────────────────
export function updateAmmoUI() {
  const bars = document.querySelectorAll('#ammo-bars .ammo-bar');
  bars.forEach((bar, i) => {
    bar.classList.toggle('spent', i >= G.ammo);
  });
}

// ─── updateTimerUI ────────────────────────────────────────────────────────────
export function updateTimerUI() {
  const m   = Math.floor(G.timeLeft / 60);
  const s   = G.timeLeft % 60;
  const el  = $('timer-display');
  const bar = $('timer-bar-fill');
  if (el) {
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.classList.toggle('urgent', G.timeLeft <= 15);
  }
  if (bar) {
    bar.style.width = `${(G.timeLeft / HUNT_TIME) * 100}%`;
    bar.classList.toggle('urgent', G.timeLeft <= 15);
  }
}

// ─── updateWindUI ─────────────────────────────────────────────────────────────
export function updateWindUI() {
  G.windAngle = Math.random() * Math.PI * 2;
  G.windSpeed = Math.floor(Math.random() * 18) + 2;

  const arrow = $('wind-arrow');
  const speed = $('wind-speed');
  if (arrow) arrow.style.transform = `rotate(${G.windAngle * (180 / Math.PI)}deg)`;
  if (speed) speed.textContent = `${G.windSpeed} km/h`;
}

// ─── showAlert ───────────────────────────────────────────────────────────────
export function showAlert(name, pts) {
  const bar    = $('alert-bar');
  const nameEl = $('alert-animal');
  const ptEl   = $('alert-points');
  if (!bar) return;

  nameEl.textContent = name.toUpperCase();
  ptEl.textContent   = `+${pts}`;

  bar.style.animation = 'none';
  void bar.offsetWidth; // force reflow to restart keyframe
  bar.style.animation = 'fadeInOut 2.5s ease forwards';
  bar.classList.remove('hidden');

  clearTimeout(bar._t);
  bar._t = setTimeout(() => bar.classList.add('hidden'), 2600);
}

// ─── showCombo ───────────────────────────────────────────────────────────────
export function showCombo(n) {
  const el    = $('combo-display');
  const valEl = $('combo-value');
  if (!el) return;
  if (n >= 3) {
    el.classList.remove('hidden');
    if (valEl) valEl.textContent = `×${n}`;
  } else {
    el.classList.add('hidden');
  }
}

// ─── spawnScorePopup ─────────────────────────────────────────────────────────
export function spawnScorePopup(pts, isRare, isCombo) {
  const el = document.createElement('div');
  el.className   = 'score-popup';
  el.textContent = `+${pts}`;
  if (isRare || isCombo) el.style.color = '#e8541a';
  el.style.left = `${46 + (Math.random() * 8 - 4)}%`;
  el.style.top  = `${42 + (Math.random() * 8 - 4)}%`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// ─── spawnHitFlash ───────────────────────────────────────────────────────────
export function spawnHitFlash() {
  const el = $('hit-flash');
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth; // reflow to restart CSS animation
  el.classList.add('flash');
}

// ─── drawMinimap ─────────────────────────────────────────────────────────────
// 120-unit-radius local view on the 140×140 minimap canvas.
export function drawMinimap(camera, scene) {
  const canvas = $('minimap-canvas');
  if (!canvas || G.mode !== 'fps') return;

  const ctx   = canvas.getContext('2d');
  const W     = canvas.width;  // 140
  const H     = canvas.height; // 140
  const RANGE = 120;
  const scale = W / (RANGE * 2);

  ctx.fillStyle = '#1a2e10';
  ctx.fillRect(0, 0, W, H);

  // World → minimap: player at centre
  const mmx = wx => W / 2 + (wx - G.px) * scale;
  const mmy = wz => H / 2 + (wz - G.pz) * scale;

  _cacheTreePositions(scene);

  // Trees
  ctx.fillStyle = '#2a5a18';
  if (_treePosCache) {
    for (const t of _treePosCache) {
      const tx = mmx(t.x), ty = mmy(t.z);
      if (tx < -2 || tx > W + 2 || ty < -2 || ty > H + 2) continue;
      ctx.beginPath();
      ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Water holes
  ctx.fillStyle = 'rgba(26,96,112,0.7)';
  for (const wh of waterHoles) {
    const wx = mmx(wh.x), wy = mmy(wh.z);
    const r  = wh.r * scale;
    ctx.beginPath();
    ctx.arc(wx, wy, Math.max(r, 3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Animals
  for (const a of G.animals) {
    if (!a.alive) continue;
    const ax = mmx(a.x), ay = mmy(a.z);
    if (ax < -4 || ax > W + 4 || ay < -4 || ay > H + 4) continue;
    ctx.fillStyle = a.rarity === 'rare' ? '#ff40ff' : '#e8541a';
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Camera direction
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const angle    = Math.atan2(dir.z, dir.x);
  const arrowLen = 10;
  const halfFov  = (camera.fov * Math.PI / 180) * 0.5;

  // FOV cone
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2);
  ctx.arc(W / 2, H / 2, 28, angle - halfFov, angle + halfFov);
  ctx.closePath();
  ctx.fill();

  // Direction arrow
  ctx.strokeStyle = '#e8541a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, H / 2);
  ctx.lineTo(W / 2 + Math.cos(angle) * arrowLen, H / 2 + Math.sin(angle) * arrowLen);
  ctx.stroke();

  // Player dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(200,146,42,0.4)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

// ─── drawMapOverlay ───────────────────────────────────────────────────────────
// Full-world map on the large #map-canvas; call every frame in map mode.
export function drawMapOverlay(scene, camera) {
  const canvas = $('map-canvas');
  if (!canvas) return;

  const size  = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.70, 500);
  const iSize = Math.round(size);
  if (canvas.width !== iSize) {
    canvas.width  = iSize;
    canvas.height = iSize;
  }

  const ctx   = canvas.getContext('2d');
  const W     = iSize;
  const scale = W / WORLD;

  const mx = wx => (wx + WORLD / 2) * scale;
  const my = wz => (wz + WORLD / 2) * scale;

  // Background + border
  ctx.fillStyle = '#1a3010';
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = 'rgba(200,146,42,0.25)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(1, 1, W - 2, W - 2);

  // Water holes
  for (const wh of waterHoles) {
    ctx.fillStyle   = 'rgba(26,96,112,0.75)';
    ctx.strokeStyle = 'rgba(30,140,160,0.9)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(mx(wh.x), my(wh.z), wh.r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Trees (cached)
  _cacheTreePositions(scene);
  ctx.fillStyle = '#2a5a18';
  if (_treePosCache) {
    for (const t of _treePosCache) {
      ctx.beginPath();
      ctx.arc(mx(t.x), my(t.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Animals + nearby name labels
  const labelDist2 = 60 * 60;
  ctx.textAlign = 'center';
  ctx.font      = '9px Oswald, sans-serif';

  for (const a of G.animals) {
    if (!a.alive) continue;
    const ax     = mx(a.x), ay = my(a.z);
    const isRare = a.rarity === 'rare';

    ctx.fillStyle = isRare ? '#ff40ff' : '#e8541a';
    ctx.beginPath();
    ctx.arc(ax, ay, isRare ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();

    const dx = a.x - G.px, dz = a.z - G.pz;
    if (dx * dx + dz * dz < labelDist2) {
      ctx.fillStyle = isRare ? '#ff80ff' : '#f5edd6';
      ctx.fillText(a.name, ax, ay - 7);
    }
  }

  // Player
  const px = mx(G.px);
  const py = my(G.pz);

  if (camera) {
    const dir  = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const angle   = Math.atan2(dir.z, dir.x);
    const alen    = Math.max(14, scale * 16);
    const halfFov = (camera.fov * Math.PI / 180) * 0.5;

    // FOV cone
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, alen * 2.8, angle - halfFov, angle + halfFov);
    ctx.closePath();
    ctx.fill();

    // Arrow shaft + arrowhead
    const ex = px + Math.cos(angle) * alen;
    const ey = py + Math.sin(angle) * alen;
    ctx.strokeStyle = '#e8541a';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const ah = 0.45, al = alen * 0.35;
    ctx.fillStyle = '#e8541a';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - ah) * al, ey - Math.sin(angle - ah) * al);
    ctx.lineTo(ex - Math.cos(angle + ah) * al, ey - Math.sin(angle + ah) * al);
    ctx.closePath();
    ctx.fill();
  }

  // Player dot
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#c8922a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ─── showEndScreen ────────────────────────────────────────────────────────────
export function showEndScreen(score, hits, misses, bestCombo) {
  const shots = hits + misses;
  const acc   = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  $('end-hits').textContent     = hits;
  $('end-misses').textContent   = misses;
  $('end-accuracy').textContent = `${acc}%`;
  $('end-combo').textContent    = `×${bestCombo}`;

  const tier  = TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
  const badge = $('end-tier-badge');
  badge.textContent       = tier.name;
  badge.style.color       = tier.colour;
  badge.style.borderColor = tier.colour;

  // Score count-up animation
  const scoreEl = $('end-score-value');
  const step    = Math.max(1, Math.ceil(score / 90));
  let displayed = 0;
  scoreEl.textContent = '0';

  const iv = setInterval(() => {
    displayed = Math.min(displayed + step, score);
    scoreEl.textContent = displayed.toLocaleString();
    if (displayed >= score) clearInterval(iv);
  }, 16);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _cacheTreePositions(scene) {
  if (_treePosCache || !scene) return;
  _treePosCache = [];
  scene.children.forEach(c => {
    if (c.name === 'tree') _treePosCache.push({ x: c.position.x, z: c.position.z });
  });
}
