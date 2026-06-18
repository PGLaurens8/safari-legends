// ─── Constants (never mutated) ────────────────────────────────────────────────
export const WORLD       = 400;
export const MOVE_SPD    = 24;
export const TURN_SPD    = 1.8;
export const MOUSE_SENS  = 0.002;
export const HUNT_TIME   = 120;
export const MAX_AMMO    = 5;
export const RELOAD_TIME = 2200;
export const BASE_FOV    = 72;
export const SCOPED_FOV  = 20;
export const ANIMAL_COUNT = 26;

// ─── Tier thresholds ─────────────────────────────────────────────────────────
export const TIERS = [
  { min: 5000, name: 'MYTHIC',    colour: '#a020f0' },
  { min: 3000, name: 'LEGENDARY', colour: '#e8541a' },
  { min: 1800, name: 'DIAMOND',   colour: '#60d0ff' },
  { min: 900,  name: 'GOLD',      colour: '#c8922a' },
  { min: 400,  name: 'SILVER',    colour: '#b0b8c0' },
  { min: 0,    name: 'BRONZE',    colour: '#a05020' },
];

// ─── Global mutable state ────────────────────────────────────────────────────
export let G = {};

export function resetG() {
  G.score      = 0;
  G.hits       = 0;
  G.misses     = 0;
  G.combo      = 0;
  G.bestCombo  = 0;

  G.ammo       = MAX_AMMO;
  G.isReloading = false;
  G.reloadStart = 0;

  G.running    = false;
  G.mode       = 'title';   // 'title' | 'map' | 'fps'

  G.isAiming   = false;
  G.zoom       = 1.0;

  G.timeLeft   = HUNT_TIME;
  G.timerInterval = null;

  // Player world position (set by player.js on init)
  G.px = 0;
  G.py = 0;
  G.pz = 0;

  // Animals array — populated by animals.js
  G.animals = [];

  // Wind (cosmetic)
  G.windAngle = Math.random() * Math.PI * 2;
  G.windSpeed = Math.floor(Math.random() * 18) + 2;

  // Audio muted flag
  G.muted = false;

  // Keys/touch inputs — managed by input.js
  G.keys = {};
  G.joystick = { active: false, dx: 0, dy: 0 };
  G.lookDelta = { dx: 0, dy: 0 };
  G.mobileFire    = false;
  G.mobileAim     = false;
  G.mobileReload  = false;
  G.mobileZoomDir = 0;    // -1 | 0 | +1, set by zoom buttons while held

  // RAF handle
  G.rafId = null;

  // Feel upgrades — screen shake
  G.shakeX        = 0;
  G.shakeY        = 0;
  G.shakeDuration = 0;

  // Feel upgrades — scope sway + recoil
  G.swayTime     = 0;
  G.stillTimer   = 0;
  G.recoilOffset = 0;

  // Crouch + rifle
  G.crouching    = false;
  G.crouchHeight = 1.8;
  G.rifleKickZ   = 0;

  // Combo grace window — combo resets only after 1.5s without a kill
  G.comboTimer = 0;
}

// Initialise on load so G is never undefined
resetG();
