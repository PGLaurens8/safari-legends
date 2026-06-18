import { G } from './state.js';

// ─── Module-level AudioContext (created once on first user gesture) ───────────
let _ctx        = null;
let _masterGain = null;

// ─── initAudio — create AudioContext and start ambient loop ───────────────────
export function initAudio() {
  if (_ctx) return; // guard against double-init

  _ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Master gain node controls overall volume — used by toggleMute
  _masterGain = _ctx.createGain();
  _masterGain.gain.value = G.muted ? 0 : 1;
  _masterGain.connect(_ctx.destination);

  if (_ctx.state === 'suspended') _ctx.resume();

  _startAmbient();
}

function _startAmbient() {
  // 2s looping white noise → bandpass filter → very quiet gain
  const dur = 2;
  const len = Math.ceil(_ctx.sampleRate * dur);
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const ch  = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

  const src    = _ctx.createBufferSource();
  src.buffer   = buf;
  src.loop     = true;

  const filter = _ctx.createBiquadFilter();
  filter.type            = 'bandpass';
  filter.frequency.value = 2500; // bird-like upper texture
  filter.Q.value         = 3;

  const gain = _ctx.createGain();
  gain.gain.value = 0.04;

  src.connect(filter);
  filter.connect(gain);
  gain.connect(_masterGain);
  src.start();
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function _noiseBuffer(seconds) {
  const len  = Math.ceil(_ctx.sampleRate * seconds);
  const buf  = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function _ready() {
  if (!_ctx) return false;
  if (_ctx.state === 'suspended') _ctx.resume();
  return true;
}

// ─── playShot — muffled rifle crack ──────────────────────────────────────────
export function playShot() {
  if (!_ready()) return;

  const now = _ctx.currentTime;
  const src = _ctx.createBufferSource();
  src.buffer             = _noiseBuffer(0.12);
  src.playbackRate.value = 0.8 + Math.random() * 0.4; // slight pitch variance

  const filter = _ctx.createBiquadFilter();
  filter.type            = 'lowpass';
  filter.frequency.value = 600 + Math.random() * 400; // 600–1000 Hz

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.8, now + 0.005); // sharp attack
  gain.gain.linearRampToValueAtTime(0, now + 0.08);    // decay over 80ms

  src.connect(filter);
  filter.connect(gain);
  gain.connect(_masterGain);
  src.start(now);
  src.stop(now + 0.13);
}

// ─── playDryClick — empty chamber ─────────────────────────────────────────────
export function playDryClick() {
  if (!_ready()) return;

  const now = _ctx.currentTime;
  const osc = _ctx.createOscillator();
  osc.type            = 'sine';
  osc.frequency.value = 400;

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.003);
  gain.gain.linearRampToValueAtTime(0, now + 0.03);

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(now);
  osc.stop(now + 0.04);
}

// ─── playReloadClack — bolt-action cycle (two bursts 90ms apart) ──────────────
export function playReloadClack() {
  if (!_ready()) return;
  _noiseBurst(0,    0.50, 900, 0.50); // bolt opens
  _noiseBurst(0.09, 0.50, 650, 0.45); // bolt closes
}

function _noiseBurst(delaySec, playbackRate, filterHz, peakGain) {
  const now = _ctx.currentTime + delaySec;
  const src = _ctx.createBufferSource();
  src.buffer             = _noiseBuffer(0.09);
  src.playbackRate.value = playbackRate;

  const filter = _ctx.createBiquadFilter();
  filter.type            = 'bandpass';
  filter.frequency.value = filterHz;
  filter.Q.value         = 2;

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.005);
  gain.gain.linearRampToValueAtTime(0, now + 0.07);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(_masterGain);
  src.start(now);
  src.stop(now + 0.10);
}

// ─── playAlertChirp — animal flee warning (800→400Hz sweep) ──────────────────
export function playAlertChirp() {
  if (!_ready()) return;

  const now = _ctx.currentTime;
  const osc = _ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.22);

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(now);
  osc.stop(now + 0.26);
}

// ─── playWoundedSound — low distressed tone, 200Hz → 80Hz over 300ms ─────────
export function playWoundedSound() {
  if (!_ready()) return;

  const now = _ctx.currentTime;
  const osc = _ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.linearRampToValueAtTime(0, now + 0.35);

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(now);
  osc.stop(now + 0.38);
}

// ─── toggleMute ───────────────────────────────────────────────────────────────
export function toggleMute() {
  G.muted = !G.muted;
  if (_masterGain) _masterGain.gain.value = G.muted ? 0 : 1;
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = G.muted ? '🔇' : '🔊';
}
