# Safari Legends — Game Specification v1.0

## Overview
A first-person 3D browser-based safari hunting game.  
Single-player, session-based (120 seconds per hunt).  
No server, no login, no multiplayer in Phase 1.  
Runs from a single folder opened in any modern browser.

---

## Player Flow

```
Title Screen
    ↓ "BEGIN HUNT"
Map View (overhead 2D canvas)
    ↓ "ENTER FIRST PERSON" button
First-Person Mode (Three.js 3D)
    ↓ Hunt for 120 seconds
End Screen (score, stats, tier badge)
    ↓ "HUNT AGAIN"
Map View (new animals spawned)
```

---

## World

### Terrain
- Flat plane geometry 400×400 units, subdivided 80×80 for height variation
- Height function (must match between terrain mesh AND getTerrainY helper):
  ```
  y = sin(x*0.04)*cos(z*0.03)*5
    + sin(x*0.11+1)*cos(z*0.09)*2.5
    + sin(x*0.22)*cos(z*0.19)*1.2
  ```
  Flatten within radius 30 of origin (player spawn) so it's walkable on start.
- Vertex colours: dark earth at low points, lighter grass at high points
- Receives shadows

### Objects placed in world
| Object | Count | Details |
|---|---|---|
| Acacia trees | 85 | Cylinder trunk + flat sphere canopy (y scale 0.32) + 3 side pads |
| Rocks | 38 | DodecahedronGeometry, random rotation, cast shadow |
| Grass clumps | 200 | Thin PlaneGeometry, DoubleSide material, random Y rotation |
| Water holes | 2 | CircleGeometry r=12, blue-teal, slight transparency |

All objects placed randomly, skip if within radius 20 of origin.

### Lighting
- DirectionalLight (sun): colour #fff0cc, intensity 2.4, position (100,160,80), cast shadows, shadow map 2048×2048
- AmbientLight: colour #405a28, intensity 1.3
- Fill light: DirectionalLight colour #6090ff intensity 0.35, position (-60,40,-90), no shadows
- Fog: FogExp2 colour 0x6aaa3a, density 0.004

### Sky
- Large SphereGeometry r=790, BackSide material, vertex colours
  - Low vertices: warm green-orange (horizon haze)
  - High vertices: deeper blue-green (zenith)
- Sun sphere: SphereGeometry r=16, MeshBasicMaterial yellow, position (310,270,-200)

---

## Animals

### Species definitions
| Name | Colour | Points | Scale | Speed | Rarity |
|---|---|---|---|---|---|
| Lion | #c8921a | 120 | 1.0 | 7 | Common |
| Elephant | #808080 | 100 | 1.9 | 5 | Common |
| Rhino | #787060 | 130 | 1.3 | 6 | Common |
| Buffalo | #3a2a18 | 90 | 1.2 | 8 | Common |
| Leopard | #b8841a | 150 | 0.9 | 10 | Common |
| Giraffe | #d4a030 | 80 | 2.2 | 6 | Common |
| Zebra | #d0d0d0 | 70 | 1.0 | 9 | Common |
| Warthog | #7a5a3a | 60 | 0.8 | 9 | Common |
| Ghost Rhino | #a0c8ff | 400 | 1.4 | 7 | Rare (8%) |
| Shadow Lion | #7a20a0 | 500 | 1.1 | 9 | Rare (8%) |
| Titan Elephant | #ffd060 | 450 | 2.4 | 4 | Rare (8%) |

Speed is units/second at full flee speed. Wander speed = speed × 0.28.

### Animal mesh construction (per animal)
Build with THREE.Group. Children must be in this exact order for animation:
```
[0]  body      SphereGeometry scaled to (bodyWidth/2, bodyHeight/2, bodyDepth/2)
[1]  leg_FL    CylinderGeometry tapered, front-left
[2]  leg_FR    CylinderGeometry tapered, front-right
[3]  leg_BL    CylinderGeometry tapered, back-left
[4]  leg_BR    CylinderGeometry tapered, back-right
[5]  head      SphereGeometry scaled
[6+] extras    species-specific: trunk, horns, mane, tusks, neck (giraffe)
[last] tail    CylinderGeometry tapered
```

Body dimensions: width = 1.3 × scale × bodyRatio, height = 0.8 × scale, depth = 0.75 × scale
Leg height = 0.75 × scale, leg radius top = 0.084 × scale, bottom = 0.12 × scale

Species extras:
- **Elephant**: trunk (CylinderGeometry rotated), 2 tusk cylinders (ivory colour)
- **Rhino / Ghost Rhino**: single front horn (ConeGeometry, dark material)
- **Lion / Shadow Lion**: mane sphere (SphereGeometry 0.68 × hs radius, mid-tone material)
- **Buffalo**: 2 curved horns using TorusGeometry
- **Giraffe**: neck cylinder (height 2.6 × scale), extended head position
- **Zebra**: 5 stripe box overlays (dark colour) on body
- **Rare animals**: additional outer glow mesh (BackSide, 20% opacity, same colour)

### Animal AI (state machine)
States: `wander` → `flee` → `wander`

**Wander:**
- Every 2–6 seconds: pick a new random angle
- Move at speed × 0.28
- If player comes within 20 units: switch to flee, flee for 5–8 seconds

**Flee:**
- Move at speed × 1.8
- Direction = away from player ± 0.5 radians random offset
- After flee timer: return to wander

**Boundary:** if animal would leave WORLD/2 - 5, reverse angle

**Animation (every frame):**
- `bobT += dt × (fleeing ? 4.0 : 1.5)`
- Body y offset: `body.position.y = baseY + sin(bobT) × (fleeing ? 0.06 : 0.02) × scale`
- Legs: alternate pairs swing `sin(bobT) × (fleeing ? 0.45 : 0.15)` radians
- Tail: `tail.rotation.z = PI/3 + sin(bobT × 2) × 0.3`
- Mesh Y rotation: `-angle + PI/2` so animal faces its direction of travel

### Respawn
When animal is killed: after 9 seconds, spawn a new random common animal at a random position.
Max animals in scene: 30. If at max, skip respawn.
On kill: `mesh.geometry.dispose()` each child geometry, `mesh.material.dispose()` each material.

---

## Player / Camera

### Starting position
- Origin (0, 0, 0) plus terrain height + 1.8 units eye height
- Starting angle: pa = 0 (facing -Z / north)
- Starting pitch: 0

### Movement (CRITICAL — use camera direction not manual trig)
```js
// In player.js updatePlayer(dt):
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

camera.getWorldDirection(forward);
forward.y = 0;
forward.normalize();
right.crossVectors(forward, UP).negate();

let vx = 0, vz = 0;
if (keys.w || keys.ArrowUp)    { vx += forward.x; vz += forward.z; }
if (keys.s || keys.ArrowDown)  { vx -= forward.x; vz -= forward.z; }
if (keys.a || keys.ArrowLeft)  { vx += right.x;   vz += right.z;   }  // strafe
if (keys.d || keys.ArrowRight) { vx -= right.x;   vz -= right.z;   }  // strafe

// Normalise diagonal movement
const len = Math.sqrt(vx*vx + vz*vz);
if (len > 0) { vx /= len; vz /= len; }

// Turn with Q/E
if (keys.q || keys.Q) camera.rotation.y += TURN_SPD * dt;
if (keys.e || keys.E) camera.rotation.y -= TURN_SPD * dt;
```

**Note:** A/D strafes (sidestep), Q/E turns. This feels more natural for hunting games.

### Mouse look (pointer lock only)
```js
// In input.js onMouseMove:
if (locked) {
  camera.rotation.y -= event.movementX * MOUSE_SENS;
  camera.rotation.x -= event.movementY * MOUSE_SENS;
  camera.rotation.x = Math.max(-1.1, Math.min(1.1, camera.rotation.x));
}
// camera.rotation.order = 'YXZ' — set once on camera init
```

### Scope / zoom
- Right-click hold = enter aim mode
- Scroll wheel up = zoom in (increase zoom factor, lower FOV)
- Scroll wheel down = zoom out
- FOV = BASE_FOV / zoom (clamp zoom 1.0 – 8.0)
- Space or F key = toggle aim mode
- Releasing right-click = exit aim mode, reset zoom to 1

### Terrain following
Every frame: `player.py = getTerrainY(player.px, player.pz) + 1.8`
Camera follows player Y smoothly: `camera.position.y += (player.py - camera.position.y) * 0.3`

---

## HUD Elements

All HUD is DOM overlaid on canvas (CSS position:absolute).

| Element | Position | Behaviour |
|---|---|---|
| Score | Top-left | Updates on every hit |
| Hits | Top-right | Updates on every hit |
| Mode badge | Top-centre | "MAP VIEW" or "FIRST PERSON" |
| Timer | Below mode badge | MM:SS format, red when ≤15s |
| Timer bar | Bottom edge | Shrinks left to right, red at ≤15s |
| Ammo | Bottom-right | Gold vertical bars, grey when spent |
| Reload bar | Centre-bottom | Horizontal progress, shown only when reloading |
| Crosshair | Screen centre | Shown in FPS mode, hidden when scoped |
| Scope overlay | Full screen | Shown when aiming: dark vignette ring + crosshair lines + mil dots |
| Zoom label | Inside scope | e.g. "3.5x" |
| Wind indicator | Bottom-right corner | Direction arrow + speed, changes every 10s (cosmetic only) |
| Alert bar | Top-centre | Fades in/out: animal name + points on kill |
| Combo display | Right-centre | Shown when combo ≥ 3, e.g. "×5" |
| Minimap | Top-right (FPS only) | 140×140 2D canvas, trees + animals + player |

### Scope overlay CSS (important — no full-screen dark div)
```css
.scope-ring {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: min(52vw, 52vh);
  height: min(52vw, 52vh);
  border-radius: 50%;
  /* This box-shadow darkens OUTSIDE the circle only — correct approach */
  box-shadow: 0 0 0 9999px rgba(3,6,1,0.90);
}
/* DO NOT add any element with background covering full screen */
```

---

## Map View

Triggered by Tab key (toggle) or "MAP ⇄ FPS" mobile button.

A 2D canvas drawn every frame over the Three.js canvas:
- Background: dark green `#1a3010`
- Water holes: blue-teal circles
- Trees: small dark green dots
- Animals: orange dots (rare = magenta), larger than tree dots
- Player: white dot with orange direction arrow (line showing facing)
- Player FOV cone: semi-transparent white arc

Show a large "▶ ENTER FIRST PERSON" button below the map canvas.

Map size: min(80vw, 80vh) up to 500×500px, centred on screen.

---

## Shooting & Scoring

### Hit detection
```js
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

let hit = null, hitDist = Infinity;
for (const animal of animals) {
  if (!animal.alive) continue;
  const box = new THREE.Box3().setFromObject(animal.mesh);
  const target = new THREE.Vector3();
  if (raycaster.ray.intersectBox(box, target)) {
    const d = camera.position.distanceTo(target);
    if (d < hitDist) { hitDist = d; hit = animal; }
  }
}
```

Only fires when: mode === 'fps' AND isAiming === true AND !isReloading AND ammo > 0.

### Scoring
```
earned = animal.points × comboMultiplier
comboMultiplier = combo >= 3 ? combo : 1
combo increments on each hit (max 10), resets to 1 on miss
```

### Tier thresholds
| Score | Tier |
|---|---|
| 5000+ | MYTHIC |
| 3000+ | LEGENDARY |
| 1800+ | DIAMOND |
| 900+ | GOLD |
| 400+ | SILVER |
| 0+ | BRONZE |

---

## Mobile Controls

Shown automatically when `navigator.maxTouchPoints > 0`.

| Control | Position | Function |
|---|---|---|
| Left joystick | Bottom-left | Move (XZ plane, 132px radius zone) |
| Right drag zone | Right 55% of screen | Look (yaw + pitch) |
| FIRE button | Bottom-right (76px circle) | tryShoot() |
| AIM button | Above FIRE | Toggle aim, gold when active |
| RELOAD button | Left of AIM | startReload() |
| MAP button | Top-centre | toggleMode() |
| + / − zoom buttons | Above AIM, visible when aiming | Increment zoom ±3/sec while held |

Joystick implementation: fixed origin at zone centre, knob follows touch up to JR=52px radius.
Look zone: each touchmove delta X → yaw, delta Y → pitch (same sensitivity as mouse × 3).

---

## Sounds (Phase 1 — Web Audio API, no files needed)

Generate all sounds procedurally using Web Audio API oscillators. No audio files required.

| Sound | When | Implementation |
|---|---|---|
| Gunshot | On fire (hit or miss) | Short noise burst: white noise → gain envelope 0→1→0 over 80ms |
| Dry click | Fire with no ammo | Short sine click 400Hz, 30ms |
| Reload clack | Reload complete | Two noise bursts 80ms apart |
| Animal alert | Animal enters flee state near player | Brief high sine sweep 800→400Hz, 200ms |
| Ambient birds | Continuous background | Very soft filtered noise, volume 0.04 |

All sounds: create AudioContext once on first user gesture. Mute button in HUD (top-left corner, small speaker icon).

---

## Session Flow Detail

### Start
1. resetG() — wipe all state
2. buildWorld() — idempotent, only runs first time
3. spawnAnimals() — remove old meshes, place 26 new ones
4. mode = 'map'
5. Start timer interval

### During hunt
- Timer counts down every second
- Animals wander/flee
- Player moves, aims, shoots
- Score accumulates

### End (timeLeft reaches 0)
1. G.running = false
2. Cancel animation frame
3. Release pointer lock
4. Show end screen with:
   - Final score (animated count-up from 0)
   - Hits, misses, accuracy %, best combo
   - Tier badge in tier colour
   - "HUNT AGAIN" button

---

## Phase 2 Improvements (do NOT build in Phase 1)
- GLTF animal models (replace procedural geometry)
- Spatial audio (animal calls at their 3D position)
- Day/night cycle (sun arc, colour shift, darker at night)
- Weather (rain particle system, reduced visibility)
- Wounded animal mechanic (hit but not dead → animal runs, leaves blood trail)
- Supabase leaderboard (session high scores, no login required)
- Unlockable rifles (different zoom, fire rate, damage radius)

---

## File-by-file implementation checklist

Claude Code should implement in this order:

### Step 1: Scaffold
- [ ] Create all files and folders
- [ ] index.html with canvas, HUD divs, Three.js script tag, game.js module
- [ ] state.js with G object, resetG(), all constants
- [ ] css/style.css with title, HUD, scope, mobile, end screen styles

### Step 2: World
- [ ] world.js: buildWorld() — terrain, trees, rocks, grass, water, sky, lighting
- [ ] world.js: getTerrainY(x, z) exported and used everywhere player/animal Y is set

### Step 3: Player
- [ ] player.js: initPlayer(), updatePlayer(dt)
- [ ] player.js: using camera.getWorldDirection() for movement (NOT manual sin/cos of G.pa)
- [ ] input.js: initInput() — keyboard, mouse, wheel, pointer lock — ONCE only

### Step 4: Animals
- [ ] animals.js: makeAnimal(def) — full mesh per species
- [ ] animals.js: spawnAnimals(), placeAnimal(def)
- [ ] animals.js: updateAnimals(dt) — state machine + animation

### Step 5: Shooting
- [ ] player.js: tryShoot() using Raycaster
- [ ] player.js: startReload() with animated bar
- [ ] hud.js: updateAmmoUI(), updateScoreUI(), syncUI()

### Step 6: HUD & Map
- [ ] hud.js: all DOM update functions
- [ ] hud.js: drawMinimap() — 2D canvas, 140×140
- [ ] hud.js: drawMapOverlay() — large 2D canvas map view

### Step 7: Sound
- [ ] sound.js: initAudio(), playShot(), playDryClick(), playReloadClack(), playBirdAmbient()

### Step 8: Mobile
- [ ] input.js: initMobile() — joystick, look zone, buttons (if isMobile())

### Step 9: Polish
- [ ] End screen score count-up animation
- [ ] Hit flash + score popup DOM elements
- [ ] Combo display
- [ ] Wind UI (cosmetic)
- [ ] Test all controls: keyboard, mouse, mobile touch

---

## Palette reference
```
Background deep:  #050a03
Terrain dark:     #1a2e10
Terrain mid:      #3d5c20
Terrain light:    #5a8a3a
Gold accent:      #c8922a
Orange hot:       #e8541a
Cream text:       #f5edd6
Sky horizon:      #6aaa3a
Water:            #1a6070
```

## Font
Oswald (Google Fonts) for all display text, labels, HUD values.
Inter or system-ui for small body text.
