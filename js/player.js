import { G, MAX_AMMO, RELOAD_TIME, WORLD, MOVE_SPD, TURN_SPD, BASE_FOV, MOUSE_SENS } from './state.js';
import { getTerrainY } from './world.js';
import { showAlert, spawnScorePopup, spawnHitFlash, showCombo, spawnMuzzleFlash } from './hud.js';
import { playShot, playDryClick, playReloadClack, playWoundedSound } from './sound.js';

// ─── Module-level refs (set by initPlayer) ────────────────────────────────────
let _camera = null;
let _rifle  = null; // camera child — built once, persists across restarts

// ─── Reusable vectors + singletons — allocated once, never reallocated ────────
const _fwd        = new THREE.Vector3();
const _worldRight = new THREE.Vector3();
const _kbdRight   = new THREE.Vector3();
const _UP         = new THREE.Vector3(0, 1, 0);
const _raycaster  = new THREE.Raycaster(); // reused every shot — no per-shot allocation

// ─── _buildRifle — procedural rifle mesh attached to camera ──────────────────
function _buildRifle(camera) {
  const rifle = new THREE.Group();

  const woodMat     = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });
  const receiverMat = new THREE.MeshLambertMaterial({ color: 0x282828 });
  const barrelMat   = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const scopeMat    = new THREE.MeshLambertMaterial({ color: 0x111111 });

  // Stock (brown, rear of rifle)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.065, 0.21), woodMat);
  stock.position.set(0, -0.004, 0.08);
  rifle.add(stock);

  // Receiver (dark grey, main body)
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.26), receiverMat);
  receiver.position.set(0, 0, -0.06);
  rifle.add(receiver);

  // Barrel (thin cylinder, CylinderGeometry along Y → rotated to lie along Z)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.50, 8), barrelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.008, -0.33);
  rifle.add(barrel);

  // Scope body (small black box on top of receiver)
  const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.13), scopeMat);
  scopeBody.position.set(0, 0.048, -0.06);
  rifle.add(scopeBody);

  // Render in front of scene geometry; never culled or occluded
  rifle.frustumCulled = false;
  rifle.renderOrder   = 999;
  rifle.traverse(m => {
    if (m.isMesh) {
      m.renderOrder          = 999;
      m.frustumCulled        = false;
      m.material.depthTest   = false;
      m.material.depthWrite  = false;
    }
  });

  rifle.position.set(0.28, -0.22, -0.6);
  camera.add(rifle);
  return rifle;
}

// ─── initPlayer ──────────────────────────────────────────────────────────────
export function initPlayer(camera) {
  _camera = camera;
  camera.rotation.order = 'YXZ';

  G.px = 0;
  G.py = getTerrainY(0, 0) + G.crouchHeight;
  G.pz = 0;
  camera.position.set(G.px, G.py, G.pz);
  camera.rotation.set(0, 0, 0);

  if (!_rifle) _rifle = _buildRifle(camera);
}

// ─── updatePlayer — called every frame from game.js ──────────────────────────
export function updatePlayer(dt, camera) {
  if (_rifle) _rifle.visible = G.running && G.mode === 'fps';
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

  // Crouch — hold C to crouch (lowers camera, halves speed, steadies scope sway)
  G.crouching = !!(k['c'] || k['C']);
  const targetCrouchH = G.crouching ? 1.0 : 1.8;
  G.crouchHeight += (targetCrouchH - G.crouchHeight) * Math.min(1, dt * 5); // ~200ms lerp
  const speedMult = G.crouching ? 0.5 : 1.0;

  // Apply movement, clamped to world bounds
  const half = WORLD / 2 - 1;
  G.px = Math.max(-half, Math.min(half, G.px + vx * MOVE_SPD * speedMult * dt));
  G.pz = Math.max(-half, Math.min(half, G.pz + vz * MOVE_SPD * speedMult * dt));

  // Terrain following — Y smoothed (height lerps with crouch)
  const targetY = getTerrainY(G.px, G.pz) + G.crouchHeight;
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

  // Stillness tracking — used to steady scope sway after 2s without moving
  const isMoving = k['w'] || k['W'] || k['ArrowUp']  ||
                   k['s'] || k['S'] || k['ArrowDown'] ||
                   k['a'] || k['A'] || k['ArrowLeft'] ||
                   k['d'] || k['D'] || k['ArrowRight'] ||
                   G.joystick.active;
  if (isMoving) G.stillTimer  = 0;
  else          G.stillTimer += dt;

  // Combo grace window — reset combo only after 1.5s without a kill
  if (G.comboTimer > 0) {
    G.comboTimer -= dt;
    if (G.comboTimer <= 0) { G.combo = 0; G.comboTimer = 0; }
  }

  // Scope sway — delta approach avoids drift accumulation
  const prevSwayTime = G.swayTime;
  G.swayTime += dt;
  if (G.isAiming) {
    const crouchDamp = G.crouching ? 0.4 : 1.0; // 60% reduction when crouched
    const amp = (G.stillTimer > 2 ? 0.001 : 0.003) * crouchDamp;
    const f   = 0.8 * Math.PI * 2; // 0.8 Hz
    camera.rotation.x += amp * (Math.sin(G.swayTime * f * 0.7) - Math.sin(prevSwayTime * f * 0.7));
    camera.rotation.y += amp * (Math.cos(G.swayTime * f)       - Math.cos(prevSwayTime * f));
  }

  // Wind scope drift — subtle yaw push at zoom > 2× (player must compensate)
  if (G.isAiming && G.zoom > 2) {
    const driftRate = (G.windSpeed / 200) * 0.001; // per frame, per spec
    camera.rotation.y += Math.sin(G.windAngle) * driftRate;
  }

  // Recoil recovery — crouching recovers faster (120ms vs 200ms)
  if (G.recoilOffset > 0) {
    const recoveryTime = G.crouching ? 0.12 : 0.2;
    const recovery = Math.min(G.recoilOffset, (0.04 / recoveryTime) * dt);
    G.recoilOffset       -= recovery;
    camera.rotation.x    -= recovery;
  }

  // Pitch clamp after all rotation adjustments
  camera.rotation.x = Math.max(-1.1, Math.min(1.1, camera.rotation.x));

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

  // Screen shake — additive offset on top of terrain-following position, springs to zero
  if (G.shakeDuration > 0) {
    const t = G.shakeDuration / 0.12; // 1 → 0 (use current t before subtracting)
    camera.position.x += G.shakeX * t;
    camera.position.y += G.shakeY * t;
    G.shakeDuration   -= dt;
    if (G.shakeDuration <= 0) { G.shakeX = 0; G.shakeY = 0; }
  }

  // Rifle kick recovery — spring back over 150ms
  if (G.rifleKickZ > 0) {
    G.rifleKickZ -= Math.min(G.rifleKickZ, (0.06 / 0.15) * dt);
  }

  // Rifle animation — idle bob, aim lerp, recoil kick
  if (_rifle) {
    const bobAmp = G.isAiming ? 0 : 0.005;
    const bobY   = Math.sin(G.swayTime * 3.0) * bobAmp;
    const tx = G.isAiming ? 0.0   : 0.28;
    const ty = (G.isAiming ? -0.14 : -0.22) + bobY;
    const tz = (G.isAiming ? -0.5  : -0.6)  + G.rifleKickZ;
    const lf = Math.min(1, dt * 10); // ~100ms lerp
    _rifle.position.x += (tx - _rifle.position.x) * lf;
    _rifle.position.y += (ty - _rifle.position.y) * lf;
    _rifle.position.z += (tz - _rifle.position.z) * lf;
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

  // Ray fired from pre-recoil camera direction (bullet travels where you aimed)
  _raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  let hit = null;
  let hitDist = Infinity;

  for (const animal of G.animals) {
    if (!animal.alive) continue;
    const box    = new THREE.Box3().setFromObject(animal.mesh);
    const target = new THREE.Vector3();
    if (_raycaster.ray.intersectBox(box, target)) {
      const d = camera.position.distanceTo(target);
      if (d < hitDist) { hitDist = d; hit = animal; }
    }
  }

  if (hit) {
    if (hit.wounded) {
      _doKill(hit); // second shot on wounded animal
    } else {
      _doWound(hit); // first shot — wound, not kill
    }
  } else {
    G.misses++;
    G.comboTimer = 1.5; // 1.5s grace — miss doesn't instantly break combo
  }

  if (G.ammo <= 0) startReload();

  // Haptic feedback on mobile
  navigator.vibrate?.([20, 10, 20]);

  // Feel effects — applied after hit detection so they don't skew the ray
  const recoilAmt = G.crouching ? 0.025 : 0.04; // crouching steadies the shot
  const kickAmt   = G.crouching ? 0.04  : 0.06;
  G.shakeX        = (Math.random() - 0.5) * 0.16;
  G.shakeY        = (Math.random() - 0.5) * 0.16;
  G.shakeDuration = 0.12;

  G.recoilOffset    += recoilAmt;
  camera.rotation.x += recoilAmt;
  camera.rotation.x  = Math.max(-1.1, Math.min(1.1, camera.rotation.x));
  G.rifleKickZ      += kickAmt;

  spawnMuzzleFlash();
  spawnHitFlash();
}

function _doWound(animal) {
  animal.wounded        = true;
  animal.woundedAt      = performance.now();
  // Force immediate panic flee with random angle offset
  animal.state          = 'flee';
  animal.fleeT          = 999;
  animal.fleeAngleOffset = (Math.random() - 0.5) * 1.4;
  playWoundedSound();
  // No score, no combo change — wound is a partial hit
}

function _doKill(animal) {
  animal.alive  = false;
  animal.deadAt = performance.now();

  const comboMult    = G.combo >= 3 ? G.combo : 1;
  const woundedMult  = animal.wounded ? 1.5 : 1;
  const earned       = Math.round(animal.points * woundedMult * comboMult);
  G.score += earned;
  G.hits++;
  G.combo++;
  if (G.combo > G.bestCombo) G.bestCombo = G.combo;

  animal.mesh.visible = false;

  showAlert(animal.name, earned, animal.wounded);
  spawnScorePopup(earned, animal.rarity === 'rare', comboMult > 1, animal.wounded);
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
