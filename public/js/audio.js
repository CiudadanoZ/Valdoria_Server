// Audio del juego, generado proceduralmente con Web Audio API (sin archivos
// externos: el juego sigue siendo autocontenido). Un drone ambiental de
// fantasía oscura en bucle + efectos sintéticos. Los navegadores exigen un
// gesto del usuario para arrancar el AudioContext: se hace en el primer clic.
const PREFS_KEY = 'valdoria_audio';

let ctx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let musicNodes = [];
let started = false;

const prefs = loadPrefs();

function loadPrefs() {
  try {
    return { music: 0.4, sfx: 0.6, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { music: 0.4, sfx: 0.6 };
  }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* nada */ }
}

export function getVolumes() {
  return { music: prefs.music, sfx: prefs.sfx };
}

// Se llama en el primer gesto del usuario (clic). Crea el contexto y la música.
export function initAudio() {
  if (started) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // navegador sin Web Audio: todo queda en no-op
  started = true;

  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = prefs.music;
  musicGain.connect(masterGain);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = prefs.sfx;
  sfxGain.connect(masterGain);

  startMusic();
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMusicVolume(v) {
  prefs.music = clamp01(v);
  if (musicGain) musicGain.gain.setTargetAtTime(prefs.music, ctx.currentTime, 0.05);
  savePrefs();
}

export function setSfxVolume(v) {
  prefs.sfx = clamp01(v);
  if (sfxGain) sfxGain.gain.setTargetAtTime(prefs.sfx, ctx.currentTime, 0.05);
  savePrefs();
}

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

// ---- Música ambiental: drone en La menor con pulso lento ----
function startMusic() {
  const root = 110; // La2
  // Acorde: fundamental, quinta, octava, tercera menor grave
  const voices = [root, root * 1.5, root * 2, root * 1.2];
  for (const freq of voices) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const g = ctx.createGain();
    g.gain.value = 0.0;

    // Vibrato de volumen lento y desfasado por voz para que "respire"
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.05 + Math.random() * 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    osc.connect(g);
    g.connect(musicGain);
    osc.start();
    lfo.start();
    g.gain.setTargetAtTime(0.1, ctx.currentTime, 4); // fundido de entrada suave
    musicNodes.push(osc, lfo);
  }

  // Campanadas dispersas de textura (cada ~12-22 s)
  scheduleChime();
}

function scheduleChime() {
  if (!ctx) return;
  const delay = 12000 + Math.random() * 10000;
  setTimeout(() => {
    if (!ctx) return;
    const notes = [220, 261.6, 293.7, 329.6, 392];
    tone(notes[Math.floor(Math.random() * notes.length)] * 2, 'sine', 2.2, 0.05, musicGain);
    scheduleChime();
  }, delay);
}

// ---- Utilidades de síntesis ----
function tone(freq, type, dur, peak, dest = sfxGain, slideTo = null) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start();
  osc.stop(ctx.currentTime + dur + 0.05);
}

function noise(dur, peak, filterFreq, dest = sfxGain) {
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start();
  src.stop(ctx.currentTime + dur + 0.02);
}

function arpeggio(freqs, step, type, dur, peak) {
  freqs.forEach((f, i) => setTimeout(() => tone(f, type, dur, peak), i * step));
}

// ---- Catálogo de efectos ----
export const sfx = {
  attack() { noise(0.12, 0.25, 900); tone(180, 'sawtooth', 0.1, 0.08, sfxGain, 90); },
  hit() { tone(160, 'square', 0.18, 0.16, sfxGain, 70); noise(0.1, 0.12, 400); },
  death() { tone(200, 'sawtooth', 1.1, 0.22, sfxGain, 50); },
  skill() { noise(0.25, 0.14, 1600); tone(440, 'triangle', 0.22, 0.1, sfxGain, 880); },
  levelup() { arpeggio([392, 523, 659, 784, 1047], 90, 'triangle', 0.5, 0.16); },
  quest() { arpeggio([523, 659, 784], 110, 'triangle', 0.6, 0.14); },
  loot() { tone(880, 'sine', 0.18, 0.1); setTimeout(() => tone(1175, 'sine', 0.2, 0.08), 60); },
  gold() { tone(1046, 'sine', 0.12, 0.09); setTimeout(() => tone(1568, 'sine', 0.14, 0.07), 55); },
  buy() { tone(784, 'triangle', 0.1, 0.1); setTimeout(() => tone(1046, 'triangle', 0.14, 0.09), 70); },
  craft() { noise(0.14, 0.2, 500); setTimeout(() => noise(0.12, 0.16, 700), 130); },
  cook() { noise(0.5, 0.1, 800); },
  fish() { tone(600, 'sine', 0.18, 0.12, sfxGain, 200); noise(0.18, 0.1, 1200); },
  potion() { tone(500, 'sine', 0.3, 0.1, sfxGain, 900); },
  heal() { arpeggio([523, 784, 1047], 70, 'sine', 0.4, 0.1); },
  click() { tone(1200, 'square', 0.04, 0.05); },
  portal() { tone(300, 'sine', 0.6, 0.12, sfxGain, 1200); },
  error() { tone(200, 'square', 0.15, 0.08, sfxGain, 150); },
};

// Reproduce un efecto por nombre (silencioso si el audio no arrancó)
export function play(name) {
  if (!ctx || !sfx[name]) return;
  try { sfx[name](); } catch { /* nada */ }
}
