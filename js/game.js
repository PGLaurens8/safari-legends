import { G, resetG, HUNT_TIME } from './state.js';
import { buildWorld, getTerrainY, updateDayNight, updateWorld } from './world.js';

// ─── Optional module refs (filled by loadModules) ─────────────────────────────
let initPlayer        = null;
let updatePlayer      = null;
let spawnAnimals      = null;
let updateAnimals     = null;
let loadAnimalModels  = null;
let initInput         = null;
let syncUI         = null;
let drawMinimap    = null;
let drawMapOverlay = null;
let hudShowEnd     = null;
let initHUD        = null;
let initAudio      = null;
let toggleMute     = null;

async function loadModules() {
  try {
    const m = await import('./player.js');
    initPlayer   = m.initPlayer   || null;
    updatePlayer = m.updatePlayer || null;
  } catch (_) {}

  try {
    const m = await import('./animals.js');
    spawnAnimals     = m.spawnAnimals     || null;
    updateAnimals    = m.updateAnimals    || null;
    loadAnimalModels = m.loadAnimalModels || null;
  } catch (_) {}

  try {
    const m = await import('./input.js');
    initInput = m.initInput || null;
  } catch (_) {}

  try {
    const m = await import('./hud.js');
    initHUD        = m.initHUD        || null;
    syncUI         = m.syncUI         || null;
    drawMinimap    = m.drawMinimap    || null;
    drawMapOverlay = m.drawMapOverlay || null;
    hudShowEnd     = m.showEndScreen  || null;
  } catch (_) {}

  try {
    const m = await import('./sound.js');
    initAudio   = m.initAudio   || null;
    toggleMute  = m.toggleMute  || null;
  } catch (_) {}
}

// ─── Three.js singletons (persist across game restarts) ──────────────────────
let renderer = null;
let scene    = null;
let camera   = null;

function initRenderer() {
  if (renderer) return;

  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6aaa3a, 0.004);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.8, 0);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

// ─── Render / game loop ───────────────────────────────────────────────────────
let lastTime = 0;

function loop(now) {
  G.rafId = requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // World updates run always — visible on title, map, and FPS screens
  updateDayNight(dt);
  updateWorld(dt);

  if (G.running) {
    if (updatePlayer)  updatePlayer(dt, camera, scene);
    if (updateAnimals) updateAnimals(dt, camera);
    if (syncUI)        syncUI();
    if (drawMinimap)   drawMinimap(camera, scene);
  }

  // Always render so the world is visible behind title / map screens
  renderer.render(scene, camera);

  // Keep map overlay updated while in map mode
  if (G.mode === 'map' && drawMapOverlay) drawMapOverlay(scene, camera);
}

// ─── Hunt lifecycle ───────────────────────────────────────────────────────────
async function startHunt() {
  if (G.rafId) cancelAnimationFrame(G.rafId);
  clearInterval(G.timerInterval);

  resetG();

  const groundY = getTerrainY(0, 0);
  G.px = 0;
  G.py = groundY + 1.8;
  G.pz = 0;
  camera.position.set(G.px, G.py, G.pz);
  camera.rotation.set(0, 0, 0);

  if (initHUD)           initHUD();
  if (initPlayer)        initPlayer(camera, scene);
  if (loadAnimalModels)  await loadAnimalModels();
  if (spawnAnimals)      spawnAnimals(scene);
  if (initAudio)    initAudio();

  G.running = true;
  G.mode    = 'map';

  refreshTimerUI();
  showScreen('map');

  G.timerInterval = setInterval(() => {
    if (!G.running) { clearInterval(G.timerInterval); return; }
    G.timeLeft--;
    refreshTimerUI();
    if (G.timeLeft <= 0) endHunt();
  }, 1000);

  lastTime = performance.now();
  G.rafId = requestAnimationFrame(loop);
}

function endHunt() {
  G.running = false;
  clearInterval(G.timerInterval);
  if (document.pointerLockElement) document.exitPointerLock();

  if (hudShowEnd) {
    hudShowEnd(G.score, G.hits, G.misses, G.bestCombo);
    showScreen('end');
  } else {
    _localShowEndScreen();
  }
}

// ─── Mode toggle (exported so input.js can call it) ───────────────────────────
export function toggleMode() {
  if (!G.running) return;
  if (G.mode === 'fps') {
    G.mode = 'map';
    showScreen('map');
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    G.mode = 'fps';
    showScreen('fps');
  }
}

// ─── Screen management ────────────────────────────────────────────────────────
function showScreen(which) {
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('map-screen').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('mobile-controls').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');

  if (which === 'title') {
    document.getElementById('title-screen').classList.remove('hidden');
  } else if (which === 'map') {
    document.getElementById('map-screen').classList.remove('hidden');
  } else if (which === 'fps') {
    document.getElementById('hud').classList.remove('hidden');
    if (navigator.maxTouchPoints > 0) {
      document.getElementById('mobile-controls').classList.remove('hidden');
    }
  } else if (which === 'end') {
    document.getElementById('end-screen').classList.remove('hidden');
  }
}

// ─── Timer UI ─────────────────────────────────────────────────────────────────
function refreshTimerUI() {
  const m = Math.floor(G.timeLeft / 60);
  const s = G.timeLeft % 60;
  const el  = document.getElementById('timer-display');
  const bar = document.getElementById('timer-bar-fill');
  if (el) {
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.classList.toggle('urgent', G.timeLeft <= 15);
  }
  if (bar) {
    bar.style.width = `${(G.timeLeft / HUNT_TIME) * 100}%`;
    bar.classList.toggle('urgent', G.timeLeft <= 15);
  }
}

// Fallback end screen if hud.js failed to load
function _localShowEndScreen() {
  const shots = G.hits + G.misses;
  const acc   = shots > 0 ? Math.round((G.hits / shots) * 100) : 0;
  document.getElementById('end-hits').textContent     = G.hits;
  document.getElementById('end-misses').textContent   = G.misses;
  document.getElementById('end-accuracy').textContent = `${acc}%`;
  document.getElementById('end-combo').textContent    = `×${G.bestCombo}`;
  document.getElementById('end-score-value').textContent = G.score.toLocaleString();
  showScreen('end');
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  await loadModules();

  initRenderer();
  buildWorld(scene);

  if (initHUD)   initHUD();
  if (initInput) initInput(camera, toggleMode);

  document.getElementById('btn-begin').addEventListener('click', startHunt);
  document.getElementById('btn-enter-fps').addEventListener('click', () => {
    if (!G.running) return;
    G.mode = 'fps';
    showScreen('fps');
  });
  document.getElementById('btn-hunt-again').addEventListener('click', startHunt);
  document.getElementById('btn-map-toggle').addEventListener('click', toggleMode);
  document.getElementById('btn-mobile-map').addEventListener('click', toggleMode);
  document.getElementById('btn-mute').addEventListener('click', () => {
    if (toggleMute) {
      toggleMute();
    } else {
      G.muted = !G.muted;
      document.getElementById('btn-mute').textContent = G.muted ? '🔇' : '🔊';
    }
  });

  showScreen('title');

  lastTime = performance.now();
  G.rafId = requestAnimationFrame(loop);
}

main();
