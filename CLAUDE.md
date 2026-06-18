# Safari Legends — Claude Code Project Context

## What this project is
A first-person 3D safari hunting game built with Three.js, running entirely in the browser.
No backend required for MVP. No build tools — pure HTML + vanilla JS + Three.js from CDN.
The player walks a 400×400 unit African savanna, spots animals, aims through a rifle scope,
and shoots. Animals have AI (wander/flee). Score is tracked per session.

## Tech stack
- **Renderer:** Three.js r128 (loaded from cdnjs CDN, no npm)
- **Language:** Vanilla JavaScript ES6+ (no TypeScript, no bundler)
- **Entry point:** `index.html` — single file that imports `js/game.js` as a module
- **Structure:** See FILE STRUCTURE below
- **No build step** — open index.html in a browser directly, or use Live Server

## File structure
```
safari-legends/
├── index.html          ← shell: canvas, HUD HTML, loads Three.js + game.js
├── CLAUDE.md           ← you are here
├── README.md           ← setup instructions
├── css/
│   └── style.css       ← all styles: title, HUD, scope, mobile controls, end screen
├── js/
│   ├── game.js         ← entry point: imports all modules, runs game loop
│   ├── world.js        ← terrain, trees, rocks, water, sky — scene construction
│   ├── animals.js      ← animal definitions, mesh builder, spawn, AI update
│   ├── player.js       ← movement, camera, pointer lock, shooting raycaster
│   ├── hud.js          ← all DOM UI updates: score, ammo, timer, scope, minimap
│   ├── input.js        ← keyboard, mouse, touch — single listener registration
│   └── state.js        ← global G object, resetG(), constants
└── assets/
    └── (empty for now — future: GLTF models, textures, sounds)
```

## Critical coding rules — read before every edit

### Movement (most common bug source)
NEVER use `Math.sin(G.pa)` / `Math.cos(G.pa)` to compute move direction.
ALWAYS use `camera.getWorldDirection(dir)` and project onto XZ plane:
```js
const dir = new THREE.Vector3();
camera.getWorldDirection(dir);
dir.y = 0;
dir.normalize();
// Forward = dir, Right = dir.cross(UP)
```
This guarantees movement always matches where the camera is pointing.

### Camera rotation order
ALWAYS set `camera.rotation.order = 'YXZ'` before applying yaw/pitch.
Yaw = rotation.y (left/right), Pitch = rotation.x (up/down).
Pitch clamp: `Math.max(-1.1, Math.min(1.1, pitch))` — prevents flipping upside down.

### Input listeners
NEVER call `addEventListener` inside a function that runs more than once.
All listeners registered ONCE in `input.js` → `initInput()`.
Use a `let inputReady = false` guard.

### Pointer lock
On first canvas click: request pointer lock.
While locked: mouse movement drives camera rotation via `movementX/Y`.
While NOT locked: show hint text "Click to lock mouse".
NEVER request pointer lock in the game loop — only on user gesture.

### State management
Single global `G` object defined in `state.js`.
`resetG()` rebuilds it fresh on each new game — never mutate constants.
Three.js scene objects (renderer, scene, cameras) are module-level vars in their
respective files, not on G — they persist across game restarts.

### Animal mesh
Use `THREE.SphereGeometry` for bodies (not BoxGeometry — too blocky).
Use `THREE.CylinderGeometry` for legs (tapered: top radius < bottom radius).
Each animal group structure (children array order must stay consistent):
  [0] body, [1-4] legs, [5] head, [6] neck (giraffe only), [7+] extras

### Shooting
Use `THREE.Raycaster` set from camera centre `new THREE.Vector2(0,0)`.
Check `ray.intersectBox(box, target)` against each alive animal's bounding box.
Bounding box: `new THREE.Box3().setFromObject(animal.mesh)`.

### Performance rules
- Max 30 animals in scene at once
- Dispose of removed meshes: `mesh.geometry.dispose(); mesh.material.dispose()`
- Shadow map size: 2048×2048 max
- Pixel ratio: `Math.min(devicePixelRatio, 2)`
- Fog: `THREE.FogExp2` density 0.004 — keeps far animals hidden until close

## Game constants (defined in state.js — do not change without updating here)
```
WORLD = 400          // map size in world units (200 each side of origin)
MOVE_SPD = 24        // units per second walking speed  
TURN_SPD = 1.8       // radians per second keyboard turn speed
MOUSE_SENS = 0.002   // multiplier for mouse movementX/Y → rotation
HUNT_TIME = 120      // seconds per hunt
MAX_AMMO = 5         // shots before reload
RELOAD_TIME = 2200   // milliseconds
BASE_FOV = 72        // normal field of view degrees
SCOPED_FOV = 20      // field of view when fully zoomed (8x)
ANIMAL_COUNT = 26    // initial spawn count
```

## What is already designed (do not redesign)
- Title screen with sunset silhouette SVG (acacia trees, giraffe, elephant)
- Safari colour palette: deep green #050a03, gold #c8922a, orange #e8541a, cream #f5edd6
- Oswald font for all display text
- Scope overlay: dark vignette ring with crosshair, mil dots, glare
- Ammo display: vertical gold bars that grey out when spent
- Score tier system: Bronze → Silver → Gold → Diamond → Legendary → Mythic

## What to build in Phase 1 (MVP)
See GAME_SPEC.md for full details. Short version:
1. Working first-person movement on 3D terrain
2. 8 animal species roaming with wander/flee AI
3. Rifle scope with zoom (scroll wheel / touch buttons)  
4. Hit detection via raycaster
5. Score, combo multiplier, ammo/reload
6. 120-second hunt timer
7. Map view (Tab) showing player + animals
8. Mobile touch controls (joystick + look zone + buttons)
9. End screen with stats and tier badge

## Known issues from previous HTML prototype (fix in Codespaces version)
- Movement direction: fixed by using camera.getWorldDirection (see above)
- Scope darkness: was caused by a full-screen dark div — remove it, use only box-shadow on scope ring
- Listener duplication: fixed by inputReady guard
- Map mode: needs a proper overlay canvas, not relying on Three.js orthographic camera
