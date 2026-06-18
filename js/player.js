import { G, MAX_AMMO, RELOAD_TIME, WORLD, MOVE_SPD, TURN_SPD, BASE_FOV, MOUSE_SENS } from './state.js';
import { getTerrainY } from './world.js';
import { showAlert, spawnScorePopup, spawnHitFlash, showCombo } from './hud.js';
import { playShot, playDryClick, playReloadClack } from './sound.js';

// ─── Module-level camera ref (set by initPlayer) ──────────────────────────────
let _camera = null;

// ─── Reusable vectors — allocated once, never reallocated ────────────────────
const _fwd        = new THREE.Vector3();
const _worldRight = new THREE.Vector3();
const _kbdRight   = new THREE.Vector3();
const _UP         = new THREE.Vector3(0, 1, 0);

// ─── initPlayer ──────────────────────────────────────────────────────────────
export function initPlayer(camera) {
  _camera = camera;
  camera.rotation.order = 'YXZ';

  G.px = 0;
  G.py = getTerrainY(0, 0) + 1.8;
  G.pz = 0;
  camera.position.set(G.px, G.py, G.pz);
  camera.rotation.set(0, 0, 0);
}

// ─── updatePlayer — called every frame from game.js ──────────────────────────
export function updatePlayer(dt, camera) {
  if (!G.running || G.mode !== 'fps') return;

  // Direction vectors from camera (NEVER use stored angle + sin/cos)
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  _fwd.normalize();
  _worldRight.crossVectors(_fwd, _UP);
  _kbdRight.copy(_worldRight).negate();

  // Keyboard movement
  let vx = 0, vz = 0;
  const k = G.keys;

  if (k['w'] || k['W'] || k['ArrowUp'])    { vx += _fwd.x;      vz += _fwd.z; }
  if (k['s'] || k['S'] || k['ArrowDown'])  { vx -= _fwd.x;      vz -= _fwd.z; }
  if (k['a'] || k['A'] || k['ArrowLeft'])  { vx += _kbdRight.x; vz += _kbdRight.z; }
  if (k['d'] || k['D'] || k['ArrowRight']) { vx -= _kbdRight.x; vz -= _kbdRight.z; }

  // Mobile joystick
  if (G.joystick.active) {
    vx += _fwd.x * (-G.joystick.dy) + _worldRight.x * G.joystick.dx;
    vz += _fwd.z * (-G.joystick.dy) + _worldRight.z * G.joystick.dx;
  }

  // Normalise diagonal
  const len = Math.sqrt(vx * vx + vz * vz);
  if (len > 0) { vx /= len; vz /= len; }

  // Q/E keyboard turn
  if (k['q'] || k['Q']) camera.rotation.y += TURN_SPD * dt;
  if (k['e'] || k['E']) camera.rotation.y -= TURN_SPD * dt;

  // Apply movement, clamped to world bounds
  const half = WORLD / 2 - 1;
  G.px = Math.max(-half, Math.min(half, G.px + vx * MOVE_SPD * dt));
  G.pz = Math.max(-half, Math.min(half, G.pz + vz * MOVE_SPD * dt));

  // Terrain following — Y smoothed
  const targetY = getTerrainY(G.px, G.pz) + 1.8;
  G.py = targetY;
  camera.position.x  = G.px;
  camera.position.z  = G.pz;
  camera.position.y += (targetY - camera.position.y) * 0.3;

  // Mobile look delta
  if (G.lookDelta.dx !== 0 || G.lookDelta.dy !== 0) {
    camera.rotation.y -= G.lookDelta.dx * MOUSE_SENS * 3;
    camera.rotation.x -= G.lookDelta.dy * MOUSE_SENS * 3;
    camera.rotation.x  = Math.max(-1.1, Math.min(1.1, camera.rotation.x));
    G.lookDelta.dx = 0;
    G.lookDelta.dy = 0;
  }

  // Mobile zoom buttons
  if (G.isAiming && G.mobileZoomDir !== 0) {
    G.zoom = Math.max(1, Math.min(8, G.zoom + G.mobileZoomDir * 3 * dt));
  }

  // FOV smooth transition
  const targetFov = G.isAiming ? BASE_FOV / G.zoom : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * 0.2;
  camera.updateProjectionMatrix();

  // Reload progress bar
  if (G.isReloading) {
    const progress = (performance.now() - G.reloadStart) / RELOAD_TIME;
    const fill = document.getElementById('reload-bar-fill');
    if (fill) fill.style.width = `${Math.min(progress * 100, 100)}%`;

    if (progress >= 1) {
      G.isReloading = false;
      G.ammo = MAX_AMMO;
      document.getElementById('reload-bar-wrap')?.classList.add('hidden');
      playReloadClack(); // bolt cycles when magazine is seated
    }
  }
}

// ─── tryShoot — called by input.js on fire gesture ───────────────────────────
export function tryShoot(camera) {
  if (G.mode !== 'fps')  return;
  if (!G.isAiming)       return;
  if (G.isReloading)     return;

  if (G.ammo <= 0) {
    playDryClick(); // empty chamber
    return;
  }

  G.ammo--;
  playShot(); // fired

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);

  let hit = null;
  let hitDist = Infinity;

  for (const animal of G.animals) {
    if (!animal.alive) continue;
    const box    = new THREE.Box3().setFromObject(animal.mesh);
    const target = new THREE.Vector3();
    if (ray.ray.intersectBox(box, target)) {
      const d = camera.position.distanceTo(target);
      if (d < hitDist) { hitDist = d; hit = animal; }
    }
  }

  if (hit) {
    _doHit(hit);
  } else {
    G.misses++;
    G.combo = 0;
  }

  if (G.ammo <= 0) startReload();

  spawnHitFlash();
}

function _doHit(animal) {
  animal.alive  = false;
  animal.deadAt = performance.now();

  const mult   = G.combo >= 3 ? G.combo : 1;
  const earned = animal.points * mult;
  G.score += earned;
  G.hits++;
  G.combo++;
  if (G.combo > G.bestCombo) G.bestCombo = G.combo;

  animal.mesh.visible = false;

  showAlert(animal.name, earned);
  spawnScorePopup(earned, animal.rarity === 'rare', mult > 1);
  showCombo(G.combo);
}

// ─── startReload — exported so input.js R-key handler can call it ─────────────
export function startReload() {
  if (G.isReloading || G.ammo >= MAX_AMMO) return;
  G.isReloading = true;
  G.reloadStart = performance.now();

  const wrap = document.getElementById('reload-bar-wrap');
  const fill = document.getElementById('reload-bar-fill');
  wrap?.classList.remove('hidden');
  if (fill) fill.style.width = '0%';
}
