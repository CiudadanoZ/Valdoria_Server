// Banda sonora del tráiler, sintetizada con Web Audio (sin archivos, como el
// resto del sonido del juego). Re menor, épica de fantasía oscura: un dron
// grave, coros de sierras desafinadas, tambores taiko, un ostinato que empuja,
// metales en los clímax y subidas de ruido antes de cada golpe.
//
// tocarBandaSonora(ctx, destino, t0) programa TODO de una vez sobre el reloj
// del AudioContext, así que va clavada a la imagen aunque se pierda algún
// fotograma. Los tiempos coinciden con las escenas de trailer.js.

const N = {
  D1: 36.71, A1: 55.0, D2: 73.42, F2: 87.31, G2: 98.0, A2: 110.0, Bb2: 116.54, C3: 130.81,
  Cs3: 138.59, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08, C4: 261.63,
  D4: 293.66, E4: 329.63, F4: 349.23, A4: 440.0,
};
const ACORDES = {
  Dm: [N.D3, N.F3, N.A3, N.D4],
  Bb: [N.Bb2, N.D3, N.F3, N.Bb3],
  F: [N.F3, N.A3, N.C4, N.F4],
  C: [N.C3, N.E3, N.G3, N.C4],
  Gm: [N.G2, N.Bb2, N.D3, N.G3],
  A: [N.A2, N.Cs3, N.E3, N.A3],
};

export function tocarBandaSonora(ctx, destino, t0) {
  // ---- mezcla: compresor que lo cohesiona y una sala grande de reverberación
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0.85;
  comp.connect(master).connect(destino);

  const sala = ctx.createConvolver();
  sala.buffer = impulso(ctx, 3.2);
  const envioSala = ctx.createGain();
  envioSala.gain.value = 0.35;
  envioSala.connect(sala).connect(comp);

  const bus = ctx.createGain();       // lo seco
  bus.connect(comp);
  bus.connect(envioSala);

  const ruidoBuf = ruido(ctx, 2);

  // ---------------------------------------------------------- instrumentos
  function env(g, t, a, s, r, pico) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + a);
    g.gain.setValueAtTime(pico, t + a + s);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + s + r);
  }

  // Nota grave sostenida: dos sierras desafinadas por un paso bajo
  function dron(f, t, dur, vol = 0.18) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    for (const d of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g).connect(bus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(3, dur * 0.4));
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Coro: cada nota con dos sierras abiertas y un seno a la octava
  function coro(acorde, t, dur, vol = 0.05) {
    for (const f of acorde) {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.7;
      for (const [tipo, mult, d] of [['sawtooth', 1, -9], ['sawtooth', 1, 8], ['sine', 2, 0]]) {
        const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f * mult; o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
      }
      lp.connect(g).connect(bus);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.3));
      g.gain.setValueAtTime(vol, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    }
  }

  // Taiko: seno que cae de tono + un golpe de ruido
  function taiko(t, vol = 0.9, f0 = 110) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    const g = ctx.createGain(); env(g, t, 0.004, 0.02, 0.5, vol);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.6);
    const n = ctx.createBufferSource(); n.buffer = ruidoBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900;
    const gn = ctx.createGain(); env(gn, t, 0.002, 0.005, 0.08, vol * 0.5);
    n.connect(bp).connect(gn).connect(bus); n.start(t); n.stop(t + 0.15);
  }

  // Golpe de cine: caída de tono larguísima + ruido grave
  function golpe(t, vol = 1) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.6);
    const g = ctx.createGain(); env(g, t, 0.005, 0.1, 2.2, vol);
    o.connect(g).connect(bus); o.start(t); o.stop(t + 2.6);
    platillo(t, vol * 0.35, 2.8);
    const n = ctx.createBufferSource(); n.buffer = ruidoBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const gn = ctx.createGain(); env(gn, t, 0.003, 0.05, 0.9, vol * 0.8);
    n.connect(lp).connect(gn).connect(bus); n.start(t); n.stop(t + 1.2);
  }

  function platillo(t, vol = 0.3, dur = 2) {
    const n = ctx.createBufferSource(); n.buffer = ruidoBuf; n.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const g = ctx.createGain(); env(g, t, 0.003, 0.02, dur, vol);
    n.connect(hp).connect(g).connect(bus); n.start(t); n.stop(t + dur + 0.1);
  }

  // Ostinato pulsado (cuerdas en staccato)
  function pulso(f, t, vol = 0.07) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    const g = ctx.createGain(); env(g, t, 0.004, 0.03, 0.18, vol);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(bus);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  }

  // Metales: sierras con un filtro que se abre de golpe
  function metales(acorde, t, dur, vol = 0.07) {
    for (const f of acorde) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
      lp.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.3, dur));
      const g = ctx.createGain(); env(g, t, 0.03, dur * 0.6, dur * 0.4 + 0.2, vol);
      for (const d of [-5, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.4);
      }
      lp.connect(g).connect(bus);
    }
  }

  // Subida de ruido antes de un golpe
  function subida(t, dur, vol = 0.25) {
    const n = ctx.createBufferSource(); n.buffer = ruidoBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    n.connect(bp).connect(g).connect(bus); n.start(t); n.stop(t + dur + 0.1);
  }

  function viento(t, dur, vol = 0.06) {
    const n = ctx.createBufferSource(); n.buffer = ruidoBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; bp.frequency.value = 500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
    const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg).connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 2);
    g.gain.setValueAtTime(vol, t + dur - 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(bus); n.start(t); lfo.start(t); n.stop(t + dur); lfo.stop(t + dur);
  }

  // ---------------------------------------------------------- partitura
  const T = (s) => t0 + s;
  const BEAT = 60 / 96;

  // 0–6: el mar y la leyenda. Dron, viento y una subida hacia el título
  dron(N.D1, T(0), 7, 0.22); dron(N.D2, T(0.5), 6.5, 0.12);
  viento(T(0), 13, 0.07);
  coro([N.D3, N.A3], T(1), 5, 0.025);
  subida(T(3.8), 2.2, 0.22);

  // 6: la Ciudadela. Golpe y coro
  golpe(T(6));
  coro(ACORDES.Dm, T(6), 3.6, 0.05); coro(ACORDES.Bb, T(9.6), 3.6, 0.05);
  dron(N.D2, T(6), 7.4, 0.14);

  // 13–33: la aventura. Taikos, ostinato y coro, Dm-Bb-F-C cada dos compases
  const prog = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C'];
  for (let compas = 0; compas < 8; compas++) {
    const tc = 13 + compas * 4 * BEAT;
    if (tc > 33) break;
    const ac = ACORDES[prog[Math.floor(compas / 2) % prog.length]];
    if (compas % 2 === 0) { coro(ac, T(tc), 8 * BEAT, 0.04); dron(ac[0] / 2, T(tc), 8 * BEAT, 0.1); }
    taiko(T(tc), 0.95); taiko(T(tc + 1.5 * BEAT), 0.5); taiko(T(tc + 2 * BEAT), 0.75); taiko(T(tc + 3.5 * BEAT), 0.45, 140);
    for (let k = 0; k < 8; k++) pulso(ac[[0, 2, 1, 2, 0, 3, 1, 2][k]], T(tc + k * BEAT / 2), compas < 2 ? 0.045 : 0.07);
  }
  // relleno de tambores antes del combate
  for (let k = 0; k < 8; k++) taiko(T(33 - BEAT * 2 + k * BEAT / 4), 0.35 + k * 0.07, 150);

  // 33–45: el combate. Taiko en cada pulso, metales en los cambios
  golpe(T(33), 0.8);
  const progC = ['Dm', 'Bb', 'Gm', 'A'];
  for (let compas = 0; compas < 7; compas++) {
    const tc = 33 + compas * 4 * BEAT;
    if (tc > 44.8) break;
    const ac = ACORDES[progC[compas % 4]];
    for (let b = 0; b < 4; b++) taiko(T(tc + b * BEAT), b === 0 ? 1 : 0.6);
    taiko(T(tc + 3.5 * BEAT), 0.4, 160); taiko(T(tc + 3.75 * BEAT), 0.5, 160);
    metales(ac, T(tc), 2 * BEAT, 0.06);
    metales(ac, T(tc + 2 * BEAT), 1.2 * BEAT, 0.05);
    for (let k = 0; k < 16; k++) pulso(ac[k % 4] * (k % 8 < 4 ? 1 : 2), T(tc + k * BEAT / 4), 0.045);
    if (compas % 2 === 0) dron(ac[0] / 2, T(tc), 8 * BEAT, 0.12);
  }
  platillo(T(41), 0.25, 1.5);

  // 45–50: las criptas. Silencio tenso: dron y latidos
  dron(N.D1, T(45), 5.5, 0.22);
  coro([N.D3, N.F3], T(45), 5, 0.03);
  for (let k = 0; k < 5; k++) { taiko(T(45.4 + k * 1.0), 0.6, 70); taiko(T(45.62 + k * 1.0), 0.4, 65); }

  // 50–55: la subida final
  subida(T(50), 5, 0.3);
  coro(ACORDES.Bb, T(50), 2.5, 0.05); coro(ACORDES.C, T(52.5), 2.5, 0.06);
  let tt = 50;
  for (let paso = 0.5; tt < 55; paso = Math.max(0.09, paso * 0.86)) { taiko(T(tt), 0.45 + (tt - 50) * 0.1, 130); tt += paso; }

  // 55: el título. Golpe, metales y coro en Re menor hasta el final
  golpe(T(55), 1.1);
  metales(ACORDES.Dm, T(55), 6.5, 0.08);
  coro(ACORDES.Dm, T(55), 9, 0.06);
  dron(N.D1, T(55), 10, 0.22);
  taiko(T(55), 1); taiko(T(55 + BEAT), 0.7); taiko(T(55 + 2 * BEAT), 0.85);
  golpe(T(61.5), 0.6);

  // Fundido final
  master.gain.setValueAtTime(0.85, T(62));
  master.gain.linearRampToValueAtTime(0.0001, T(66));
  return master;
}

function ruido(ctx, segundos) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * segundos, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Respuesta al impulso de una sala grande: ruido estéreo que se apaga
function impulso(ctx, segundos) {
  const len = ctx.sampleRate * segundos;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  }
  return buf;
}
