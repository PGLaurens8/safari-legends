import { WORLD } from './state.js';

let _built = false;

// ─── Day/night state ──────────────────────────────────────────────────────────
let _sun     = null; // DirectionalLight ref
let _ambient = null; // AmbientLight ref
let _scene   = null; // scene ref for background + fog updates
let _dayTime = 0.0;  // 0=dawn, 0.5=noon, 1.0=dusk; wraps at 1

// Reusable Color instances — updated in place each frame to avoid GC churn
const _skyColDawn = new THREE.Color('#e8541a');
const _skyColNoon = new THREE.Color('#88bb52');
const _skyColDusk = new THREE.Color('#c8601a');
const _bgColor    = new THREE.Color('#e8541a');

// ─── Grass sway state ─────────────────────────────────────────────────────────
let _worldTime = 0;
export const grassMeshes = [];

// ─── Terrain height — authoritative for mesh, player, and animals ─────────────
// Includes origin-area flattening (radius 30) so all systems stay in sync.
export function getTerrainY(x, z) {
  const rawY =
    Math.sin(x * 0.04) * Math.cos(z * 0.03) * 5 +
    Math.sin(x * 0.11 + 1) * Math.cos(z * 0.09) * 2.5 +
    Math.sin(x * 0.22) * Math.cos(z * 0.19) * 1.2;

  const r = Math.sqrt(x * x + z * z);
  if (r >= 30) return rawY;
  const t = r / 30;
  return rawY * (t * t * (3 - 2 * t)); // smoothstep blend to 0 at origin
}

// ─── buildWorld — idempotent (safe to call multiple times) ────────────────────
export function buildWorld(scene) {
  if (_built) return;
  _built = true;

  _scene = scene;
  scene.background = _bgColor; // day/night updates _bgColor in place

  buildTerrain(scene);
  buildLights(scene);
  buildSky(scene);
  buildTrees(scene);
  buildRocks(scene);
  buildGrass(scene);
  buildWaterHoles(scene);
}

// ── Terrain ───────────────────────────────────────────────────────────────────
function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 80, 80);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const darkLow   = new THREE.Color('#1a2e10');
  const midGrass  = new THREE.Color('#3d5c20');
  const highGrass = new THREE.Color('#5a8a3a');
  const colArr    = [];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainY(x, z);
    pos.setY(i, y);

    const t = THREE.MathUtils.clamp((y + 5) / 10, 0, 1);
    const col = new THREE.Color();
    if (t < 0.45) col.lerpColors(darkLow, midGrass, t / 0.45);
    else          col.lerpColors(midGrass, highGrass, (t - 0.45) / 0.55);
    colArr.push(col.r, col.g, col.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  geo.computeVertexNormals();

  const mat  = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
}

// ── Lights ────────────────────────────────────────────────────────────────────
function buildLights(scene) {
  _sun = new THREE.DirectionalLight(0xfff0cc, 2.4);
  _sun.position.set(100, 160, 80);
  _sun.castShadow = true;
  _sun.shadow.mapSize.set(2048, 2048);
  _sun.shadow.camera.near   = 0.5;
  _sun.shadow.camera.far    = 800;
  _sun.shadow.camera.left   = -220;
  _sun.shadow.camera.right  =  220;
  _sun.shadow.camera.top    =  220;
  _sun.shadow.camera.bottom = -220;
  _sun.shadow.bias = -0.001;
  scene.add(_sun);

  _ambient = new THREE.AmbientLight(0x405a28, 1.3);
  scene.add(_ambient);

  const fill = new THREE.DirectionalLight(0x6090ff, 0.35);
  fill.position.set(-60, 40, -90);
  scene.add(fill);
}

// ── Sky ───────────────────────────────────────────────────────────────────────
function buildSky(scene) {
  const geo  = new THREE.SphereGeometry(790, 32, 16);
  const pos  = geo.attributes.position;
  const cols = [];
  const horizon = new THREE.Color('#6aaa3a');
  const zenith  = new THREE.Color('#1a3a20');

  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + 790) / 1580, 0, 1);
    const c = new THREE.Color().lerpColors(horizon, zenith, t);
    cols.push(c.r, c.g, c.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  sky.name = 'sky';
  scene.add(sky);

  // Sun disc
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(16, 16, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe060 })
  );
  sunMesh.position.set(310, 270, -200);
  sunMesh.name = 'sunSphere';
  scene.add(sunMesh);
}

// ── Acacia trees (85) ─────────────────────────────────────────────────────────
function buildTrees(scene) {
  const trunkMat  = new THREE.MeshLambertMaterial({ color: 0x5a3a18 });
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2a5a18 });
  const half = WORLD / 2 - 5;
  let placed = 0, attempts = 0;

  while (placed < 85 && attempts < 2000) {
    attempts++;
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (Math.sqrt(x * x + z * z) < 20) continue;

    const g = makeAcacia(trunkMat, canopyMat);
    g.position.set(x, getTerrainY(x, z), z);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    placed++;
  }
}

function makeAcacia(trunkMat, canopyMat) {
  const group  = new THREE.Group();
  group.name   = 'tree';
  const trunkH = 3 + Math.random() * 2;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, trunkH, 7), trunkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const r    = 2.8 + Math.random() * 1.2;
  const main = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), canopyMat);
  main.scale.y    = 0.32;
  main.position.y = trunkH + r * 0.32;
  main.castShadow = true;
  group.add(main);

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.random() * 0.4;
    const pr    = r * (0.5 + Math.random() * 0.35);
    const padR  = r * (0.45 + Math.random() * 0.25);
    const pad   = new THREE.Mesh(new THREE.SphereGeometry(padR, 8, 5), canopyMat);
    pad.scale.y    = 0.30;
    pad.position.set(Math.cos(angle) * pr, trunkH + r * 0.25 + Math.random() * 0.3, Math.sin(angle) * pr);
    pad.castShadow = true;
    group.add(pad);
  }

  return group;
}

// ── Rocks (38) ────────────────────────────────────────────────────────────────
function buildRocks(scene) {
  const half = WORLD / 2 - 5;
  let placed = 0, attempts = 0;

  while (placed < 38 && attempts < 1000) {
    attempts++;
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (Math.sqrt(x * x + z * z) < 20) continue;

    const s   = 0.5 + Math.random() * 1.8;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const v   = 0x40 + Math.floor(Math.random() * 0x28);
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(v / 255, v / 255, (v - 8) / 255) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, getTerrainY(x, z) + s * 0.4, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.scale.set(1 + Math.random() * 0.4, 0.7 + Math.random() * 0.5, 1 + Math.random() * 0.4);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'rock';
    scene.add(mesh);
    placed++;
  }
}

// ── Grass clumps (200) ────────────────────────────────────────────────────────
function buildGrass(scene) {
  const half        = WORLD / 2 - 2;
  const grassColors = [0x3a6020, 0x4a7828, 0x2a4e18, 0x558030];

  for (let i = 0; i < 200; i++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (Math.sqrt(x * x + z * z) < 20) continue;

    const h   = 0.4 + Math.random() * 0.5;
    const geo = new THREE.PlaneGeometry(0.18 + Math.random() * 0.22, h);
    const mat = new THREE.MeshBasicMaterial({
      color: grassColors[Math.floor(Math.random() * grassColors.length)],
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, getTerrainY(x, z) + h / 2, z);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.name = 'grass';
    scene.add(mesh);
    grassMeshes.push(mesh);
  }
}

// ─── updateDayNight — advance day/night cycle, update lights + sky ────────────
export function updateDayNight(dt) {
  if (!_sun || !_ambient || !_scene) return;

  _dayTime = (_dayTime + dt / 300) % 1.0; // full cycle in 300s (5 minutes)

  // Sun position (arc across sky)
  _sun.position.x = Math.sin(_dayTime * Math.PI) * 200;
  _sun.position.y = Math.cos(_dayTime * Math.PI * 0.5 + 0.3) * 160 + 40;
  // z stays at initial value (80) — sun moves in X/Y plane overhead

  // Ambient intensity: peaks at noon (1.3), dips at dawn/dusk (0.6)
  _ambient.intensity = 0.6 + 0.7 * Math.sin(_dayTime * Math.PI);

  // Sky colour: dawn → noon → dusk
  if (_dayTime < 0.5) {
    _bgColor.lerpColors(_skyColDawn, _skyColNoon, _dayTime * 2);
  } else {
    _bgColor.lerpColors(_skyColNoon, _skyColDusk, (_dayTime - 0.5) * 2);
  }

  // Fog colour tracks sky so horizon blends naturally
  _scene.fog.color.copy(_bgColor).multiplyScalar(0.7);
}

// ─── updateWorld — animate grass sway each frame ──────────────────────────────
export function updateWorld(dt) {
  _worldTime += dt;
  for (const g of grassMeshes) {
    g.rotation.z = Math.sin(_worldTime * 1.2 + g.position.x * 0.1) * 0.15;
  }
}

// ── Water holes (2) ───────────────────────────────────────────────────────────
export const waterHoles = [];

function buildWaterHoles(scene) {
  const spots = [{ x: -70, z: 55 }, { x: 85, z: -60 }];

  for (const p of spots) {
    const geo = new THREE.CircleGeometry(12, 32);
    geo.rotateX(-Math.PI / 2);
    const mat  = new THREE.MeshBasicMaterial({ color: 0x1a6070, transparent: true, opacity: 0.82 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, getTerrainY(p.x, p.z) + 0.05, p.z);
    mesh.name = 'water';
    scene.add(mesh);
    waterHoles.push({ x: p.x, z: p.z, r: 12 });
  }
}
