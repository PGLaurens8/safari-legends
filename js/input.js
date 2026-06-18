import { G, MOUSE_SENS } from './state.js';
import { tryShoot, startReload } from './player.js';

let inputReady  = false;
let _camera     = null;
let _toggleMode = null;

const JOYSTICK_RADIUS = 52; // max knob travel in px

// ─── initInput — registers ALL listeners exactly once ────────────────────────
export function initInput(camera, toggleMode) {
  if (inputReady) return;
  inputReady  = true;
  _camera     = camera;
  _toggleMode = toggleMode;

  // Keyboard
  document.addEventListener('keydown', _onKeyDown);
  document.addEventListener('keyup',   _onKeyUp);

  // Pointer lock
  document.addEventListener('pointerlockchange', _onPointerLockChange);

  // Mouse move (rotation when locked)
  document.addEventListener('mousemove', _onMouseMove);

  // Mouse buttons + scroll on the canvas
  const canvas = document.getElementById('game-canvas');
  canvas.addEventListener('mousedown',   _onMouseDown);
  canvas.addEventListener('mouseup',     _onMouseUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault()); // suppress right-click menu
  canvas.addEventListener('wheel',       _onWheel, { passive: false });

  // Mobile
  if (navigator.maxTouchPoints > 0) initMobile();
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function _onKeyDown(e) {
  G.keys[e.key] = true;

  switch (e.key) {
    case ' ':
    case 'f':
    case 'F':
      // Space or F toggles aim mode
      if (G.running && G.mode === 'fps') {
        G.isAiming = !G.isAiming;
        if (!G.isAiming) { G.zoom = 1; }
      }
      e.preventDefault();
      break;

    case 'Tab':
      if (_toggleMode) _toggleMode();
      e.preventDefault();
      break;

    case 'r':
    case 'R':
      startReload();
      break;

    case 'Escape':
      // Release pointer lock (browser also does this, but be explicit)
      if (document.pointerLockElement) document.exitPointerLock();
      break;
  }
}

function _onKeyUp(e) {
  delete G.keys[e.key];
}

// ─── Pointer lock ─────────────────────────────────────────────────────────────
function _onPointerLockChange() {
  const locked = !!document.pointerLockElement;
  const hint   = document.getElementById('pointer-hint');
  if (hint) hint.style.display = locked ? 'none' : '';
}

// ─── Mouse movement — only active when pointer is locked ─────────────────────
function _onMouseMove(e) {
  if (!document.pointerLockElement) return;
  if (!G.running || G.mode !== 'fps') return;

  _camera.rotation.y -= e.movementX * MOUSE_SENS;
  _camera.rotation.x -= e.movementY * MOUSE_SENS;
  _camera.rotation.x  = Math.max(-1.1, Math.min(1.1, _camera.rotation.x));
}

// ─── Mouse buttons ────────────────────────────────────────────────────────────
function _onMouseDown(e) {
  if (e.button === 2) {
    // Right-click: enter aim mode
    if (G.running && G.mode === 'fps') G.isAiming = true;

  } else if (e.button === 0) {
    // Left-click: lock cursor if not locked, else shoot
    if (!document.pointerLockElement) {
      document.getElementById('game-canvas').requestPointerLock();
    } else if (G.running && G.mode === 'fps') {
      tryShoot(_camera);
    }
  }
}

function _onMouseUp(e) {
  if (e.button === 2) {
    // Release right-click: exit aim, reset zoom
    G.isAiming = false;
    G.zoom = 1;
  }
}

// ─── Scroll wheel — zoom when aiming ─────────────────────────────────────────
function _onWheel(e) {
  e.preventDefault();
  if (!G.isAiming || G.mode !== 'fps') return;

  // deltaY > 0 = scroll down = zoom out; < 0 = scroll up = zoom in
  const delta = e.deltaY > 0 ? -0.5 : 0.5;
  G.zoom = Math.max(1, Math.min(8, G.zoom + delta));
}

// ─── Mobile controls ─────────────────────────────────────────────────────────
export function initMobile() {
  // Hide pointer-lock hint (no pointer lock on touch devices)
  document.getElementById('pointer-hint')?.classList.add('hidden');

  _initJoystick();
  _initLookZone();
  _initActionButtons();
  _initZoomButtons();
}

// ── Joystick (bottom-left, 132px zone, 52px max knob travel) ─────────────────
function _initJoystick() {
  const zone  = document.getElementById('joystick-zone');
  const knob  = document.getElementById('joystick-knob');
  if (!zone || !knob) return;

  let activeTouchId = null;
  let originX = 0, originY = 0;

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (activeTouchId !== null) return; // only one joystick touch
    const t = e.changedTouches[0];
    activeTouchId = t.identifier;
    const r = zone.getBoundingClientRect();
    originX = r.left + r.width  / 2;
    originY = r.top  + r.height / 2;
    _moveKnob(knob, t.clientX, t.clientY, originX, originY);
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === activeTouchId) {
        _moveKnob(knob, t.clientX, t.clientY, originX, originY);
      }
    }
  }, { passive: false });

  const endJoystick = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === activeTouchId) {
        activeTouchId = null;
        knob.style.transform   = 'translate(-50%, -50%)';
        G.joystick.active = false;
        G.joystick.dx     = 0;
        G.joystick.dy     = 0;
      }
    }
  };
  zone.addEventListener('touchend',    endJoystick, { passive: false });
  zone.addEventListener('touchcancel', endJoystick, { passive: false });
}

function _moveKnob(knob, cx, cy, ox, oy) {
  let dx = cx - ox;
  let dy = cy - oy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > JOYSTICK_RADIUS) {
    dx = (dx / dist) * JOYSTICK_RADIUS;
    dy = (dy / dist) * JOYSTICK_RADIUS;
  }
  knob.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  G.joystick.active = true;
  G.joystick.dx     = dx / JOYSTICK_RADIUS; // [-1, 1]
  G.joystick.dy     = dy / JOYSTICK_RADIUS; // [-1, 1] positive = down
}

// ── Look zone (right 55% of screen, touchmove drives yaw + pitch) ────────────
function _initLookZone() {
  const zone = document.getElementById('look-zone');
  if (!zone) return;

  // Map of touch id → last {x, y}
  const prevPos = new Map();

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      prevPos.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const prev = prevPos.get(t.identifier);
      if (!prev) continue;
      // Accumulate deltas; player.js drains them each frame
      G.lookDelta.dx += t.clientX - prev.x;
      G.lookDelta.dy += t.clientY - prev.y;
      prevPos.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }, { passive: false });

  const endLook = e => {
    e.preventDefault();
    for (const t of e.changedTouches) prevPos.delete(t.identifier);
  };
  zone.addEventListener('touchend',    endLook, { passive: false });
  zone.addEventListener('touchcancel', endLook, { passive: false });
}

// ── Action buttons ────────────────────────────────────────────────────────────
function _initActionButtons() {
  _onTouch('btn-mobile-fire', () => {
    if (G.running && G.mode === 'fps') tryShoot(_camera);
  });

  _onTouch('btn-mobile-aim', () => {
    if (!G.running || G.mode !== 'fps') return;
    G.isAiming = !G.isAiming;
    if (!G.isAiming) G.zoom = 1;
    document.getElementById('btn-mobile-aim')
      ?.classList.toggle('aim-active', G.isAiming);
  });

  _onTouch('btn-mobile-reload', () => startReload());

  _onTouch('btn-mobile-map', () => {
    if (_toggleMode) _toggleMode();
  });
}

// ── Zoom buttons — continuous ±3/s while finger held ─────────────────────────
function _initZoomButtons() {
  _holdTouch('btn-zoom-in',  +1);
  _holdTouch('btn-zoom-out', -1);
}

function _holdTouch(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart',  e => { e.preventDefault(); G.mobileZoomDir = dir; }, { passive: false });
  el.addEventListener('touchend',    e => { e.preventDefault(); G.mobileZoomDir = 0;   }, { passive: false });
  el.addEventListener('touchcancel', e => { e.preventDefault(); G.mobileZoomDir = 0;   }, { passive: false });
}

// Helper: fire fn on touchstart (faster than click on mobile)
function _onTouch(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    fn();
  }, { passive: false });
}
