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
  // Wind: looping noise through low bandpass — distant, barely audible
  const dur = 4;
  const len = Math.ceil(_ctx.sampleRate * dur);
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const ch  = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

  const src  = _ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;

  const filter = _ctx.createBiquadFilter();
  filter.type            = 'bandpass';
  filter.frequency.value = 180;
  filter.Q.value         = 0.4;

  const windGain = _ctx.createGain();
  windGain.gain.value = 0.006;

  src.connect(filter);
  filter.connect(windGain);
  windGain.connect(_masterGain);
  src.start();

  // Bird chirps: random sine sweep every 8–15 seconds
  function scheduleBirdChirp() {
    setTimeout(() => {
      if (!G.running) return; // stop scheduling when game ends
      _playBirdChirp();
      scheduleBirdChirp();
    }, 8000 + Math.random() * 7000);
  }
  scheduleBirdChirp();
}

function _playBirdChirp() {
  if (!_ctx) return;
  const now     = _ctx.currentTime;
  const startHz = 1200 + Math.random() * 1200; // 1200–2400 Hz
  const endHz   = 1200 + Math.random() * 1200;

  const osc = _ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startHz, now);
  osc.frequency.linearRampToValueAtTime(endHz, now + 0.08);

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + 0.08);

  osc.connect(gain);
  gain.connect(_masterGain);
  osc.start(now);
  osc.stop(now + 0.09);
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

// ─── playShot — rifle crack with bass thump ───────────────────────────────────
export function playShot() {
  if (!_ready()) return;

  const now = _ctx.currentTime;

  // High-frequency crack (noise layer)
  const src = _ctx.createBufferSource();
  src.buffer             = _noiseBuffer(0.15);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;

  const filter = _ctx.createBiquadFilter();
  filter.type            = 'lowpass';
  filter.frequency.value = 600 + Math.random() * 400;

  const noiseGain = _ctx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.8, now + 0.005);
  noiseGain.gain.linearRampToValueAtTime(0, now + 0.08);

  src.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(_masterGain);
  src.start(now);
  src.stop(now + 0.15);

  // Bass thump (body impact)
  const bass = _ctx.createOscillator();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(85, now);
  bass.frequency.exponentialRampToValueAtTime(40, now + 0.08);

  const bassGain = _ctx.createGain();
  bassGain.gain.setValueAtTime(0, now);
  bassGain.gain.linearRampToValueAtTime(0.5, now + 0.003);
  bassGain.gain.linearRampToValueAtTime(0, now + 0.08);

  bass.connect(bassGain);
  bassGain.connect(_masterGain);
  bass.start(now);
  bass.stop(now + 0.09);

  // Short noise tail burst (reverb simulation)
  const tail = _ctx.createBufferSource();
  tail.buffer             = _noiseBuffer(0.06);
  tail.playbackRate.value = 0.4;

  const tailFilter = _ctx.createBiquadFilter();
  tailFilter.type            = 'bandpass';
  tailFilter.frequency.value = 400;
  tailFilter.Q.value         = 1.5;

  const tailGain = _ctx.createGain();
  tailGain.gain.setValueAtTime(0, now + 0.04);
  tailGain.gain.linearRampToValueAtTime(0.25, now + 0.045);
  tailGain.gain.linearRampToValueAtTime(0, now + 0.10);

  tail.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(_masterGain);
  tail.start(now + 0.04);
  tail.stop(now + 0.11);
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

// ─── playAlertChirp — animal flee warning (800→400Hz sweep, falls off with distance)
export function playAlertChirp(distance = 0) {
  if (!_ready()) return;

  const vol = Math.max(0.02, 0.15 * (1 - distance / 80)); // quieter when far
  const now = _ctx.currentTime;
  const osc = _ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);

  const gain = _ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
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
