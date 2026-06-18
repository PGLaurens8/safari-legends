import { G, WORLD, ANIMAL_COUNT } from './state.js';
import { getTerrainY } from './world.js';
import { playAlertChirp } from './sound.js';

// ─── Species definitions ──────────────────────────────────────────────────────
// bodyRatio: body width = 1.3 × scale × bodyRatio
const ADEFS = [
  // ── Common ──────────────────────────────────────────────────────────────────
  { name: 'Lion',     colour: 0xc8921a, points: 120, scale: 1.0, speed: 7,  bodyRatio: 1.8, rarity: 'common' },
  { name: 'Elephant', colour: 0x808080, points: 100, scale: 1.9, speed: 5,  bodyRatio: 2.1, rarity: 'common' },
  { name: 'Rhino',    colour: 0x787060, points: 130, scale: 1.3, speed: 6,  bodyRatio: 1.9, rarity: 'common' },
  { name: 'Buffalo',  colour: 0x3a2a18, points: 90,  scale: 1.2, speed: 8,  bodyRatio: 1.9, rarity: 'common' },
  { name: 'Leopard',  colour: 0xb8841a, points: 150, scale: 0.9, speed: 10, bodyRatio: 1.8, rarity: 'common' },
  { name: 'Giraffe',  colour: 0xd4a030, points: 80,  scale: 2.2, speed: 6,  bodyRatio: 1.5, rarity: 'common' },
  { name: 'Zebra',    colour: 0xd0d0d0, points: 70,  scale: 1.0, speed: 9,  bodyRatio: 1.8, rarity: 'common' },
  { name: 'Warthog',  colour: 0x7a5a3a, points: 60,  scale: 0.8, speed: 9,  bodyRatio: 1.7, rarity: 'common' },
  // ── Rare (8%) ────────────────────────────────────────────────────────────────
  { name: 'Ghost Rhino',    colour: 0xa0c8ff, points: 400, scale: 1.4, speed: 7, bodyRatio: 1.9, rarity: 'rare' },
  { name: 'Shadow Lion',    colour: 0x7a20a0, points: 500, scale: 1.1, speed: 9, bodyRatio: 1.8, rarity: 'rare' },
  { name: 'Titan Elephant', colour: 0xffd060, points: 450, scale: 2.4, speed: 4, bodyRatio: 2.1, rarity: 'rare' },
];

const COMMON_DEFS = ADEFS.filter(d => d.rarity === 'common');
const RARE_DEFS   = ADEFS.filter(d => d.rarity === 'rare');

// ─── Model data: file + target world-unit height per species ─────────────────
// normaliseScale = targetHeight / rawHeight is computed automatically at load.
// def.scale is NOT used for GLTF models — only for procedural fallback meshes.
// Ghost Rhino shares the hippo file but gets its own larger targetHeight.
const MODEL_FILES = new Map([
  ['Elephant',       { file: 'asian_elephant.glb',               targetHeight: 3.2 }],
  ['Titan Elephant', { file: 'low_poly_elephant.glb',            targetHeight: 4.5 }],
  ['Giraffe',        { file: 'download_low_poly_giraffe.glb',    targetHeight: 5.5 }],
  ['Buffalo',        { file: 'low_poly_bison.glb',               targetHeight: 2.4 }],
  ['Rhino',          { file: 'low_poly_angry_looking_hippo.glb', targetHeight: 1.8 }],
  ['Ghost Rhino',    { file: 'low_poly_angry_looking_hippo.glb', targetHeight: 2.2 }],
  ['Leopard',        { file: 'low_poly_gazelle.glb',             targetHeight: 1.5 }],
  ['Zebra',          { file: 'sable_antelope_low_poly.glb',      targetHeight: 2.0 }],
  ['Lion',           { file: 'ibex.glb',                         targetHeight: 1.6 }],
  ['Warthog',        { file: 'low_poly_camel.glb',               targetHeight: 1.8 }],
  ['Shadow Lion',    { file: '8th_dec_reindeer.glb',             targetHeight: 1.9 }],
]);

// Retained so respawn can add to scene
let _scene = null;

// ─── GLTF model store ─────────────────────────────────────────────────────────
// Populated by loadAnimalModels(). Key = species name (matches def.name).
// Value = { scene: THREE.Object3D, animations: THREE.AnimationClip[] }
const _gltfModels = new Map();

// Active AnimationMixers — ticked every frame in updateAnimals
const _mixers = [];

// ─── logModelInfo — called after each successful GLTF load ───────────────────
function logModelInfo(name, gltf, box) {
  let meshCount = 0;
  gltf.scene.traverse(c => { if (c.isMesh) meshCount++; });
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log(
    `[Model] ${name}: meshes=${meshCount}, anims=${gltf.animations.length}, ` +
    `bbox=${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}, ` +
    `bottomY=${box.min.y.toFixed(3)}`
  );
}

// ─── loadAnimalModels — try to load GLB files; silently fall back on 404 ──────
export async function loadAnimalModels() {
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return;

  const loader = new THREE.GLTFLoader();

  // Group species by filename so shared models (Rhino/Ghost Rhino) load once
  const fileToNames = new Map();
  for (const def of ADEFS) {
    const entry = MODEL_FILES.get(def.name);
    if (!entry) continue;
    if (!fileToNames.has(entry.file)) fileToNames.set(entry.file, []);
    fileToNames.get(entry.file).push(def.name);
  }

  const loads = [...fileToNames.entries()].map(([filename, names]) =>
    new Promise(resolve => {
      loader.load(
        `assets/models/${filename}`,
        gltf => {
          // Raw bbox of unmodified template (no scale, no position shift applied)
          const rawBox    = new THREE.Box3().setFromObject(gltf.scene);
          const rawSize   = new THREE.Vector3();
          rawBox.getSize(rawSize);
          const rawHeight = rawSize.y;
          const rawMaxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
          // Some models are exported flat (X/Z >> Y). Normalising by Y alone would
          // produce a massive footprint. When the largest dimension is >3× the height,
          // normalise by the largest dimension instead so the model fits sensibly.
          const normDim   = rawMaxDim / rawHeight > 3.0 ? rawMaxDim : rawHeight;

          // Per-species normalisation — Ghost Rhino gets a different targetHeight
          // than Rhino even though both load from the same file.
          // scaledBottomOffset = rawBox.min.y × normaliseScale
          //   (world-space bottom of the mesh when positioned at origin with scale applied)
          for (const name of names) {
            const entry              = MODEL_FILES.get(name);
            const targetHeight       = entry ? entry.targetHeight : 1.5;
            const normaliseScale     = targetHeight / normDim;
            const scaledBottomOffset = rawBox.min.y * normaliseScale;

            console.log('[Normalised]', name,
              'rawH:', rawHeight.toFixed(2),
              'targetH:', targetHeight,
              'scale:', normaliseScale.toFixed(4));

            logModelInfo(name, gltf, rawBox);

            _gltfModels.set(name, {
              scene:               gltf.scene,
              animations:          gltf.animations || [],
              normaliseScale,      // mesh.scale.setScalar(normaliseScale) at spawn time
              scaledBottomOffset,  // mesh.position.y = terrainY - scaledBottomOffset
            });
          }
          resolve();
        },
        undefined,      // progress (unused)
        () => resolve() // any error (404, parse fail) → silent fallback
      );
    })
  );

  await Promise.all(loads);
}

// ─── spawnAnimals ─────────────────────────────────────────────────────────────
export function spawnAnimals(scene) {
  _scene = scene;

  // Dispose and remove any existing animal meshes + stop their mixers
  for (const a of G.animals) {
    if (a.mixer) a.mixer.stopAllAction();
    if (a.mesh && a.mesh.parent) {
      _disposeMesh(a.mesh);
      a.mesh.parent.remove(a.mesh);
    }
  }
  G.animals.length = 0;
  _mixers.length   = 0;

  for (let i = 0; i < ANIMAL_COUNT; i++) {
    const isRare = Math.random() < 0.08;
    const pool   = isRare ? RARE_DEFS : COMMON_DEFS;
    const def    = pool[Math.floor(Math.random() * pool.length)];
    placeAnimal(scene, def);
  }
}

// ─── placeAnimal — spawns one animal and pushes onto G.animals ────────────────
export function placeAnimal(scene, def) {
  const half = WORLD / 2 - 12;
  let x, z, attempts = 0, tooClose;
  do {
    x = (Math.random() * 2 - 1) * half;
    z = (Math.random() * 2 - 1) * half;
    attempts++;
    const dpx = x - G.px, dpz = z - G.pz;
    const nearPlayer = (dpx * dpx + dpz * dpz) < 45 * 45;
    const nearAnimal = G.animals.some(a => {
      const dx = a.x - x, dz = a.z - z;
      return dx * dx + dz * dz < 64; // 8-unit radius between animals
    });
    tooClose = nearPlayer || nearAnimal;
  } while (tooClose && attempts < 60);

  if (attempts >= 60 && tooClose) return;

  const y = getTerrainY(x, z);

  // Use GLTF model if loaded for this species, else procedural fallback
  let mesh;
  let mixer = null;
  let meshBottomOffset = 0;
  const gltfData = _gltfModels.get(def.name);

  if (gltfData) {
    mesh = gltfData.scene.clone();
    // normaliseScale was computed at load time: targetHeight / rawHeight
    // def.scale is intentionally NOT used for GLTF models.
    mesh.scale.setScalar(gltfData.normaliseScale);
    mesh.name = def.name;

    // Place feet on terrain: scaledBottomOffset = rawBox.min.y × normaliseScale
    // mesh.position.y = terrainY - scaledBottomOffset puts the model bottom at terrainY
    meshBottomOffset = gltfData.scaledBottomOffset;
    mesh.position.set(x, y - meshBottomOffset, z);

    if (gltfData.animations.length > 0) {
      mixer = new THREE.AnimationMixer(mesh);
      mixer.clipAction(gltfData.animations[0]).play();
      _mixers.push(mixer);
    }
  } else {
    mesh = makeAnimal(def);
    mesh.position.set(x, y, z);
  }

  scene.add(mesh);

  // Precompute base body Y for procedural animation (body = child[0])
  const lh        = 0.75 * def.scale;
  const bh        = 0.8  * def.scale;
  const baseBodyY = lh + bh / 2;

  G.animals.push({
    name:   def.name,
    points: def.points,
    scale:  def.scale,
    speed:  def.speed,
    rarity: def.rarity,
    x, y, z,
    angle:           Math.random() * Math.PI * 2,
    state:           'wander',
    wanderT:         2 + Math.random() * 4,
    fleeT:           0,
    fleeAngleOffset: 0,
    bobT:        Math.random() * Math.PI * 2,
    baseBodyY,
    mixer,             // null for procedural animals
    useGltf:           !!gltfData,
    meshBottomOffset,  // 0 for procedural; bottomOffset×scale for GLTF
    fleeSounded:  false,
    wounded:      false,
    woundedAt:    0,
    woundTinted:  false,
    alive:  true,
    deadAt: 0,
    mesh,
  });
}

// ─── makeAnimal — strict child order per CLAUDE.md ───────────────────────────
// [0] body  [1] leg_FL  [2] leg_FR  [3] leg_BL  [4] leg_BR
// [5] head  [6+] extras (species-specific)  [last] tail
function makeAnimal(def) {
  const s   = def.scale;
  const group = new THREE.Group();
  group.name  = def.name;

  const mat = new THREE.MeshLambertMaterial({ color: def.colour });

  // Dimensions
  const bw   = 1.3 * s * def.bodyRatio; // body width  (x)
  const bh   = 0.8 * s;                 // body height (y)
  const bd   = 0.75 * s;                // body depth  (z)
  const lh   = 0.75 * s;                // leg height
  const lrT  = 0.084 * s;               // leg top radius
  const lrB  = 0.12 * s;                // leg bottom radius
  const legY = lh / 2;                  // leg centre Y
  const bodyY   = lh + bh / 2;         // body centre Y
  const bodyTop = bodyY + bh / 2;       // body top Y (where neck/extras attach)

  // ── [0] Body ────────────────────────────────────────────────────────────────
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7), mat);
  body.scale.set(bw, bh, bd);
  body.position.y = bodyY;
  body.castShadow = true;
  group.add(body); // index 0

  // ── [1–4] Legs ──────────────────────────────────────────────────────────────
  const lxOff = bw * 0.22;
  const lzOff = bd * 0.30;
  const mkLeg = (lx, lz) => {
    // Separate geometry per leg so disposal is independent
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(lrT, lrB, lh, 6), mat);
    leg.position.set(lx, legY, lz);
    leg.castShadow = true;
    group.add(leg);
  };
  mkLeg( lxOff, -lzOff); // [1] FL
  mkLeg( lxOff,  lzOff); // [2] FR
  mkLeg(-lxOff, -lzOff); // [3] BL
  mkLeg(-lxOff,  lzOff); // [4] BR

  // ── [5] Head ────────────────────────────────────────────────────────────────
  const hs  = (def.name === 'Giraffe') ? 0.25 * s : 0.30 * s;
  const head = new THREE.Mesh(new THREE.SphereGeometry(hs, 8, 6), mat);
  if (def.name === 'Giraffe') {
    // Head sits atop the neck (added in extras at [6])
    head.position.set(bw * 0.08, bodyTop + 2.6 * s + hs, 0);
  } else {
    head.position.set(bw * 0.5 + hs * 0.5, bodyY + bh * 0.1, 0);
  }
  head.castShadow = true;
  group.add(head); // index 5

  // ── [6+] Species extras ──────────────────────────────────────────────────────
  _addExtras(group, def, s, mat, head, bodyY, bodyTop, bw, bh, bd, hs);

  // ── [last] Tail ──────────────────────────────────────────────────────────────
  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03 * s, 0.06 * s, 0.4 * s, 5), mat
  );
  tail.position.set(-bw * 0.52, bodyY + 0.05 * s, 0);
  tail.rotation.z = Math.PI / 3;
  group.add(tail); // last index

  return group;
}

// ─── Species extras (added after head, before tail) ───────────────────────────
function _addExtras(group, def, s, mat, head, bodyY, bodyTop, bw, bh, bd, hs) {
  const n = def.name;

  if (n === 'Elephant' || n === 'Titan Elephant') _xElephant(group, s, mat, head, hs);
  else if (n === 'Rhino' || n === 'Ghost Rhino')  _xRhino(group, s, head, hs);
  else if (n === 'Lion'  || n === 'Shadow Lion')   _xLion(group, mat, head, hs);
  else if (n === 'Buffalo')                         _xBuffalo(group, s, head, hs);
  else if (n === 'Giraffe')                         _xGiraffe(group, s, mat, bodyTop, bw, bh);
  else if (n === 'Zebra')                           _xZebra(group, s, bodyY, bw, bh, bd);

  // Rare outer glow shell
  if (def.rarity === 'rare') _xGlow(group, def.colour, bodyY, bw, bh, bd);
}

function _xElephant(group, s, mat, head, hs) {
  const hp = head.position;
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.6 * s, 6), mat
  );
  trunk.position.set(hp.x + hs * 0.55, hp.y - hs * 0.55, 0);
  trunk.rotation.z = Math.PI / 3.5;
  group.add(trunk);
  // Tusks
  const ivoryMat = new THREE.MeshLambertMaterial({ color: 0xfff8e8 });
  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025 * s, 0.04 * s, 0.45 * s, 5), ivoryMat
    );
    tusk.position.set(hp.x + hs * 0.65, hp.y - hs * 0.25, side * hs * 0.52);
    tusk.rotation.z = Math.PI / 2.4;
    tusk.rotation.y = side * 0.22;
    group.add(tusk);
  }
}

function _xRhino(group, s, head, hs) {
  const hp     = head.position;
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x2a2218 });
  const horn    = new THREE.Mesh(
    new THREE.ConeGeometry(0.065 * s, 0.38 * s, 7), hornMat
  );
  horn.position.set(hp.x + hs * 0.82, hp.y + 0.04 * s, 0);
  horn.rotation.z = -Math.PI / 2;
  group.add(horn);
}

function _xLion(group, mat, head, hs) {
  const maneCol = new THREE.Color(mat.color).multiplyScalar(0.6);
  const maneMat = new THREE.MeshLambertMaterial({ color: maneCol });
  const mane    = new THREE.Mesh(new THREE.SphereGeometry(hs * 0.68, 8, 6), maneMat);
  mane.position.copy(head.position);
  group.add(mane);
}

function _xBuffalo(group, s, head, hs) {
  const hp      = head.position;
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x1a1008 });
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.TorusGeometry(hs * 0.55, 0.05 * s, 6, 12, Math.PI * 0.75), hornMat
    );
    horn.position.set(hp.x - hs * 0.15, hp.y + hs * 0.28, side * hs * 0.68);
    horn.rotation.y = side * 0.35;
    horn.rotation.z = side * 0.28;
    group.add(horn);
  }
}

function _xGiraffe(group, s, mat, bodyTop, bw, bh) {
  // [6] neck — only extra for giraffe before tail
  const neckH = 2.6 * s;
  const neck  = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * s, 0.18 * s, neckH, 7), mat
  );
  neck.position.set(bw * 0.08, bodyTop + neckH / 2, 0);
  neck.castShadow = true;
  group.add(neck); // index 6 for giraffe
}

function _xZebra(group, s, bodyY, bw, bh, bd) {
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x101010 });
  for (let i = 0; i < 5; i++) {
    const xOff  = (i / 4 - 0.5) * bw * 0.70;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(bw * 0.11, bh * 1.06, bd * 1.06), darkMat
    );
    stripe.position.set(xOff, bodyY, 0);
    group.add(stripe);
  }
}

function _xGlow(group, colour, bodyY, bw, bh, bd) {
  const glowMat = new THREE.MeshBasicMaterial({
    color:       colour,
    side:        THREE.BackSide,
    transparent: true,
    opacity:     0.20,
    depthWrite:  false,
  });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7), glowMat);
  glow.scale.set(bw * 1.18, bh * 1.18, bd * 1.18);
  glow.position.y = bodyY;
  group.add(glow);
}

// ─── updateAnimals — called every frame from game.js ─────────────────────────
export function updateAnimals(dt, camera) {
  if (!G.running) return;

  const now = performance.now();
  const px  = G.px;
  const pz  = G.pz;

  // ── Respawn: collect dead animals whose 9s timer has expired ─────────────
  const toRemove = [];
  for (const a of G.animals) {
    if (!a.alive && a.deadAt > 0 && (now - a.deadAt) >= 9000) {
      toRemove.push(a);
    }
  }

  // Track live count — for-loop avoids Array allocation each frame
  let liveCount = 0;
  for (let i = 0; i < G.animals.length; i++) { if (G.animals[i].alive) liveCount++; }

  for (const a of toRemove) {
    if (a.mixer) {
      a.mixer.stopAllAction();
      const mi = _mixers.indexOf(a.mixer);
      if (mi !== -1) _mixers.splice(mi, 1);
    }
    if (a.mesh && a.mesh.parent) {
      _disposeMesh(a.mesh);
      a.mesh.parent.remove(a.mesh);
    }
    const idx = G.animals.indexOf(a);
    if (idx !== -1) G.animals.splice(idx, 1);

    if (liveCount < 30 && _scene) {
      const def = COMMON_DEFS[Math.floor(Math.random() * COMMON_DEFS.length)];
      placeAnimal(_scene, def);
      liveCount++;
    }
  }

  // ── Update each living animal ─────────────────────────────────────────────
  for (const a of G.animals) {
    if (!a.alive) continue;

    const fleeing = a.state === 'flee' || a.wounded;

    // ── Wound tint — applied once when first wounded ───────────────────────
    if (a.wounded && !a.woundTinted) {
      _applyWoundTint(a.mesh);
      a.woundTinted = true;
    }

    // ── AI state machine ──────────────────────────────────────────────────
    if (a.wounded) {
      // Panic flee: always track player, no wander recovery
      const dx = a.x - px, dz = a.z - pz;
      a.angle = Math.atan2(dz, dx) + a.fleeAngleOffset;
    } else if (a.state === 'wander') {
      a.wanderT -= dt;
      if (a.wanderT <= 0) {
        a.angle   = Math.random() * Math.PI * 2;
        a.wanderT = 2 + Math.random() * 4;
      }
      // Wind-aware detection: player scent travels downwind
      // Animals downwind smell player from 40 units; upwind only 12 units
      const dx = a.x - px, dz = a.z - pz;
      const distSq = dx * dx + dz * dz;
      const dist   = Math.sqrt(distSq);
      const windDx = Math.cos(G.windAngle), windDz = Math.sin(G.windAngle);
      const dot    = dist > 0 ? (dx / dist) * windDx + (dz / dist) * windDz : 0;
      const detectRange = 12 + (dot + 1) * 0.5 * 28; // 12 (upwind) → 40 (downwind)
      if (distSq < detectRange * detectRange) {
        a.state           = 'flee';
        a.fleeT           = 5 + Math.random() * 3;
        a.fleeAngleOffset = (Math.random() - 0.5) * 1.4; // ±0.7 rad scatter
        if (!a.fleeSounded) {
          playAlertChirp(dist);
          a.fleeSounded = true;
        }
        // Herd cascade: nearby animals panic-flee together
        for (const other of G.animals) {
          if (other === a || !other.alive || other.state === 'flee' || other.wounded) continue;
          const odx = other.x - a.x, odz = other.z - a.z;
          if (odx * odx + odz * odz < 900) { // 30 units
            other.state           = 'flee';
            other.fleeT           = 5 + Math.random() * 3;
            other.fleeAngleOffset = (Math.random() - 0.5) * 1.4;
          }
        }
      }
    } else { // flee
      a.fleeT -= dt;
      // Track player: recompute flee direction each frame
      const dx = a.x - px, dz = a.z - pz;
      a.angle = Math.atan2(dz, dx) + a.fleeAngleOffset;
      if (a.fleeT <= 0) {
        a.state       = 'wander';
        a.wanderT     = 2 + Math.random() * 4;
        a.fleeSounded = false; // ready to chirp on next flee
      }
    }

    // ── Move ──────────────────────────────────────────────────────────────
    const spd = a.speed * (a.wounded ? 2.2 : (fleeing ? 1.8 : 0.28));
    const nx  = a.x + Math.cos(a.angle) * spd * dt;
    const nz  = a.z + Math.sin(a.angle) * spd * dt;

    // Boundary: reverse toward centre if leaving world
    const bound = WORLD / 2 - 5;
    if (Math.abs(nx) > bound || Math.abs(nz) > bound) {
      a.angle = Math.atan2(-a.z, -a.x) + (Math.random() - 0.5) * 0.6;
      a.x     = Math.max(-bound, Math.min(bound, a.x));
      a.z     = Math.max(-bound, Math.min(bound, a.z));
    } else {
      a.x = nx;
      a.z = nz;
    }

    // Follow terrain
    a.y = getTerrainY(a.x, a.z);

    // ── Animation ─────────────────────────────────────────────────────────
    a.bobT += dt * (fleeing ? 4.0 : 1.5);

    let meshY = a.y;
    if (a.mixer) {
      // GLTF with animations — tick mixer, speed up when fleeing
      a.mixer.timeScale = fleeing ? 1.8 : 1.0;
      a.mixer.update(dt);
    } else if (a.useGltf) {
      // GLTF without animations — bob the root mesh vertically
      meshY = a.y + Math.sin(a.bobT) * (fleeing ? 0.08 : 0.03) * a.scale;
    } else {
      // Procedural animation (makeAnimal mesh child order must stay consistent)
      const ch    = a.mesh.children;
      const body  = ch[0];
      const legFL = ch[1];
      const legFR = ch[2];
      const legBL = ch[3];
      const legBR = ch[4];
      const tail  = ch[ch.length - 1];

      body.position.y = a.baseBodyY + Math.sin(a.bobT) * (fleeing ? 0.06 : 0.02) * a.scale;

      const swing = Math.sin(a.bobT) * (fleeing ? 0.45 : 0.15);
      legFL.rotation.x =  swing;
      legBR.rotation.x =  swing;
      legFR.rotation.x = -swing;
      legBL.rotation.x = -swing;

      tail.rotation.z = Math.PI / 3 + Math.sin(a.bobT * 2) * 0.3;
    }

    // ── Position + orient mesh ─────────────────────────────────────────────
    // meshBottomOffset is 0 for procedural meshes, so this formula is universal.
    a.mesh.position.set(a.x, meshY - a.meshBottomOffset, a.z);
    a.mesh.rotation.y = -a.angle + Math.PI / 2;
    // Wounded limp: irregular lateral roll simulating leg injury
    a.mesh.rotation.z = a.wounded ? Math.sin(a.bobT * 3) * 0.15 : 0;
  }
}

// ─── Wound tint — lerp all material colors 40% toward red ────────────────────
function _applyWoundTint(mesh) {
  const red = new THREE.Color(1, 0, 0);
  mesh.traverse(child => {
    if (child.isMesh && child.material && child.material.color) {
      child.material.color.lerp(red, 0.4);
    }
  });
}

// ─── Mesh disposal ────────────────────────────────────────────────────────────
function _disposeMesh(mesh) {
  mesh.traverse(child => {
    if (child.isMesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  });
}
