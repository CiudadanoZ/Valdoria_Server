// Atrezo menudo del continente, en pixel art: lo que hace que un bioma no sea
// "suelo con cuatro árboles". Hierba alta, flores, arbustos, helechos, setas,
// tocones, troncos caídos, lápidas, huesos, menhires, muretes en ruinas,
// montículos de nieve, nenúfares, conchas, barcas varadas, vallas, carros,
// barriles, pajares, espantapájaros, postes indicadores, pozos y estandartes.
//
// Misma técnica que el resto (rampas con desplazamiento de tono, contorno
// selectivo) y misma densidad de píxel: se diseñan en coordenadas base y se
// pintan a 1,5x. Cada tipo tiene variantes deterministas.
import { Grid, ramp, darkOf } from './pixelsprites.js';

const ESC = 1.5;

function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Tallo o brizna que se curva: de (x0, y0) hacia arriba `alto` píxeles,
// inclinándose `inclina` al final. Colorea de oscuro (base) a claro (punta).
function brizna(g, x0, y0, alto, inclina, r) {
  for (let j = 0; j < alto; j++) {
    const t = j / Math.max(1, alto - 1);
    const x = x0 + inclina * t * t;
    g.set(x, y0 - j, t < 0.25 ? r.d : t < 0.7 ? r.b : t < 0.92 ? r.l : r.h);
  }
}

const PALETA_HIERBA = [0x4f7a38, 0x3a5e2c, 0x8a8644, 0x4a5a30, 0x6a7a6a, 0x5e8a3e];
const COLOR_FLOR = [0xd8403a, 0xf0d040, 0x6a8ae8, 0xf0eef0, 0xb070d0, 0xf08ac0];

const PINTORES = {
  // ---------------------------------------------------------------- flora
  hierba(v) {
    const g = new Grid(14, 12, ESC);
    const r = rnd(v * 31 + 5);
    const c = ramp(PALETA_HIERBA[v % PALETA_HIERBA.length]);
    const n = 7 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = 2 + i * (10 / n) + r();
      brizna(g, x, 11, 5 + Math.floor(r() * 7), (x < 7 ? -1 : 1) * (1 + r() * 2), c);
    }
    g.outline(darkOf);
    return g;
  },
  flores(v) {
    const g = new Grid(12, 10, ESC);
    const r = rnd(v * 57 + 3);
    const tallo = ramp(0x4a7034);
    const flor = ramp(COLOR_FLOR[v % COLOR_FLOR.length]);
    // Hojas en la base
    for (let i = 0; i < 4; i++) brizna(g, 2 + i * 2.5, 9, 2 + Math.floor(r() * 2), i < 2 ? -1 : 1, tallo);
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = 2 + r() * 8, alto = 4 + Math.floor(r() * 4);
      brizna(g, x, 9, alto, 0, tallo);
      const fy = 9 - alto;
      g.set(x - 1, fy, flor.b); g.set(x + 1, fy, flor.d); g.set(x, fy - 1, flor.l); g.set(x, fy + 1, flor.d);
      g.set(x, fy, v % 6 === 3 ? '#f0d040' : flor.h);
    }
    g.outline(darkOf);
    return g;
  },
  arbusto(v) {
    const g = new Grid(22, 16, ESC);
    const r = rnd(v * 73 + 11);
    const base = [0x456a32, 0x2e4a24, 0x456a32, 0x6a6a3a, 0x3a5a3a][v % 5];
    const hoja = ramp(base), honda = ramp(base === 0x6a6a3a ? 0x4a4a2a : 0x26401c);
    const nubes = [[11, 10, 9, 5], [6, 9, 5, 4], [16, 9, 5, 4], [11, 6, 6, 4]];
    for (const [cx, cy, rx, ry] of nubes) g.blob(cx + (r() - 0.5), cy + 1.5, rx, ry, honda);
    for (const [cx, cy, rx, ry] of nubes) g.blob(cx - 0.6, cy, rx * 0.8, ry * 0.75, hoja);
    for (let i = 0; i < 8; i++) g.set(4 + r() * 14, 4 + r() * 6, hoja.h);
    if (v % 5 === 2) for (let i = 0; i < 6; i++) { const x = 5 + r() * 12, y = 6 + r() * 6; g.set(x, y, '#c02a3a'); g.set(x + 0.5, y - 0.5, '#ff7a7a'); }
    if (v % 5 === 4) { const n = ramp(0xeaf2f8); g.blob(11, 3.5, 6, 1.6, n); g.blob(6, 6, 3, 1.2, n); g.blob(16, 6, 3, 1.2, n); }
    g.outline(darkOf);
    return g;
  },
  helecho(v) {
    const g = new Grid(20, 12, ESC);
    const r = rnd(v * 41 + 7);
    const c = ramp(v % 2 ? 0x3e6a34 : 0x4e7a3a);
    for (const [dx, alto] of [[-7, 6], [-4, 9], [0, 10], [4, 9], [7, 6]]) {
      const pasos = 9;
      for (let j = 0; j <= pasos; j++) {
        const t = j / pasos;
        const x = 10 + dx * t, y = 11 - alto * Math.sin(t * Math.PI * 0.75);
        g.set(x, y, t > 0.7 ? c.l : c.b);
        if (j % 2 === 0 && j > 1) { g.set(x, y - 1, c.l); g.set(x + (dx < 0 ? -1 : 1) * 0.5, y + 1, c.d); }
      }
    }
    for (let i = 0; i < 3; i++) g.set(6 + r() * 8, 3 + r() * 3, c.h);
    g.outline(darkOf);
    return g;
  },
  setas(v) {
    const g = new Grid(12, 9, ESC);
    const r = rnd(v * 19 + 13);
    const pie = ramp(0xe0d4b8);
    const sombrero = ramp([0x8a5a3a, 0xc02a2a, 0x3ac8c0][v % 3]);
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const x = 2 + i * 3.5 + r(), alto = 3 + Math.floor(r() * 3), w = 1.6 + r() * 1.4;
      g.rect(x, 8 - alto, 1, alto, pie.b); g.set(x, 8 - alto + 1, pie.l);
      g.blob(x + 0.4, 8 - alto, w + 0.4, w * 0.65, sombrero);
      if (v % 3 === 1) { g.set(x - 0.6, 8 - alto - 0.6, '#ffffff'); g.set(x + 1.2, 8 - alto, '#ffffff'); }
      if (v % 3 === 2) g.set(x, 8 - alto - 1, '#d8fff8');
    }
    g.outline(darkOf);
    return g;
  },
  junquera(v) {
    // Cañas y espadañas de la ciénaga: más altas y con su mazorca
    const g = new Grid(14, 22, ESC);
    const r = rnd(v * 23 + 1);
    const c = ramp(0x5a6a30), maz = ramp(0x6a3e22);
    for (let i = 0; i < 6; i++) {
      const x = 2 + i * 2 + r(), alto = 10 + Math.floor(r() * 10);
      brizna(g, x, 21, alto, (r() - 0.5) * 3, c);
      if (i % 2 === 0) g.rect(x + (r() - 0.5), 21 - alto - 2, 1.4, 3, maz.b);
    }
    g.outline(darkOf);
    return g;
  },
  nenufar(v) {
    const g = new Grid(14, 6, ESC);
    const c = ramp(0x3e7a3a);
    g.blob(7, 3, 6, 2.2, c);
    g.rect(7, 1, 1, 2, c.d);                                // la muesca
    if (v % 2) { const f = ramp(0xf0a0c8); g.blob(9, 2, 1.6, 1.2, f); g.set(9, 1.5, '#fff0f8'); }
    g.outline(darkOf);
    return g;
  },

  // ---------------------------------------------------------------- madera
  tocon(v) {
    const g = new Grid(16, 12, ESC);
    const corteza = ramp(0x5a3e2a), corte = ramp(0xb08a5a);
    for (let y = 4; y < 11; y++) {
      const abre = y > 8 ? (y - 8) : 0;
      g.rect(4 - abre, y, 8 + abre * 2, 1, corteza.b);
      g.set(4 - abre, y, corteza.l); g.set(11 + abre, y, corteza.d);
    }
    g.blob(8, 4, 4, 1.6, corte);
    g.set(8, 4, corte.d); g.set(6, 4, corte.d); g.set(10, 4, corte.d);   // anillos
    if (v % 2) { const m = ramp(0x4a7a34); g.blob(5, 9, 2, 1.2, m); g.blob(11, 6, 1.4, 1.6, m); }
    g.outline(darkOf);
    return g;
  },
  tronco(v) {
    const g = new Grid(32, 11, ESC);
    const corteza = ramp(v % 2 ? 0x4a3a2a : 0x5a4030), corte = ramp(0xa8845a);
    for (let x = 2; x < 27; x++) {
      g.set(x, 3, corteza.l); g.rect(x, 4, 1, 4, corteza.b); g.set(x, 8, corteza.d);
      if (x % 5 === 0) g.set(x, 5, corteza.d);
    }
    g.blob(27.5, 5.5, 2.6, 3, corte);                          // corte con anillos
    g.set(27.5, 5.5, corte.d); g.set(27, 4.5, corte.l);
    for (let i = 0; i < 4; i++) g.set(10 + i, 2 - Math.floor(i / 2), corteza.b);   // rama
    if (v % 2 === 0) { const m = ramp(0x4a7a34); g.blob(8, 3, 3, 1, m); g.blob(18, 3.2, 2, 0.8, m); }
    g.outline(darkOf);
    return g;
  },
  pinoOscuro(v) {
    const g = new Grid(32, 60, ESC);
    const r = rnd(v * 61 + 9);
    const pino = ramp(v % 2 ? 0x1e3a2a : 0x26442e), tronco = ramp(0x3e2e22);
    g.block(14, 50, 4, 9, tronco);
    const pisos = [[30, 52, 15], [19, 41, 12], [9, 30, 9], [1, 18, 6]];
    for (const [top, base, hw] of pisos) {
      for (let y = top; y <= base; y++) {
        const w = Math.round(1 + (hw - 1) * (y - top) / (base - top));
        g.rect(16 - w, y, w * 2, 1, pino.b);
        g.rect(16 - w, y, Math.max(1, Math.round(w * 0.6)), 1, pino.l);
        g.set(15 + w, y, pino.d); g.set(14 + w, y, pino.d);
      }
      for (let x = 16 - hw; x < 16 + hw; x += 2 + Math.floor(r() * 2)) g.set(x, base + 1, pino.d);   // flecos
    }
    g.set(16, 0, pino.h);
    g.outline(darkOf);
    return g;
  },

  // ---------------------------------------------------------------- piedra
  piedras(v) {
    const g = new Grid(14, 7, ESC);
    const r = rnd(v * 29 + 3);
    const p = ramp([0x7a746e, 0x6a6672, 0x8a8478][v % 3]);
    for (let i = 0; i < 4; i++) g.blob(2 + i * 3.3 + r(), 4.5 + r(), 1.3 + r() * 1.2, 1 + r() * 0.8, p);
    g.outline(darkOf);
    return g;
  },
  rocaNieve(v) {
    const g = new Grid(26, 18, ESC);
    const r = rnd(v * 17 + 2);
    const p = ramp(0x6a6878), n = ramp(0xeaf2f8);
    g.blob(13, 12, 11, 5.5, p);
    g.blob(8 + r() * 2, 10, 6, 5, p);
    g.blob(17, 9, 6, 5.5, p);
    g.blob(12, 6, 7, 2, n); g.blob(17.5, 5, 4, 1.6, n); g.blob(7.5, 6.5, 3, 1.4, n);
    g.outline(darkOf);
    return g;
  },
  monticulo(v) {
    const g = new Grid(24, 9, ESC);
    const n = ramp(0xe4eef6);
    g.blob(12, 6, 11, 3, n);
    if (v % 2) g.blob(7, 5, 4, 2.5, n);
    g.outline(darkOf);
    return g;
  },
  menhir(v) {
    const g = new Grid(14, 34, ESC);
    const r = rnd(v * 43 + 5);
    const p = ramp(0x6e6a72), liquen = ramp(0x8a9a5a);
    for (let y = 2; y < 33; y++) {
      const t = (y - 2) / 30;
      const hw = Math.round(3 + t * 2.5 + Math.sin(y * 0.7 + v) * 0.5);
      g.rect(7 - hw, y, hw * 2, 1, p.b);
      g.set(7 - hw, y, p.l); g.set(6 + hw, y, p.d);
    }
    g.blob(7, 2.5, 3, 1.6, p);
    for (let i = 0; i < 5; i++) g.set(4 + r() * 6, 8 + r() * 22, liquen.b);
    if (v % 2) for (let a = 0; a < 6; a += 0.5) g.set(7 + Math.cos(a * 2) * a * 0.5, 15 + Math.sin(a * 2) * a * 0.5, p.d);   // espiral
    g.outline(darkOf);
    return g;
  },
  murete(v) {
    const g = new Grid(30, 16, ESC);
    const r = rnd(v * 37 + 9);
    const p = ramp(0x7a7468), m = ramp(0x4a6a34);
    // Hiladas de sillares con la cresta rota
    const cresta = [];
    for (let x = 0; x < 30; x++) cresta.push(3 + Math.floor((Math.sin(x * 0.6 + v) + 1) * 2.5 + r() * 2));
    for (let x = 1; x < 29; x++) {
      for (let y = cresta[x]; y < 15; y++) {
        const fila = Math.floor((y - 1) / 3);
        const junta = (y % 3 === 0) || ((x + fila * 3) % 6 === 0);
        g.set(x, y, junta ? p.d : y === cresta[x] ? p.l : p.b);
      }
    }
    for (let i = 0; i < 6; i++) g.set(2 + r() * 26, 8 + r() * 6, m.b);
    g.outline(darkOf);
    return g;
  },
  columna(v) {
    const g = new Grid(14, 32, ESC);
    const p = ramp(0x8a8578);
    const alto = 18 + (v % 3) * 4;
    const top = 31 - alto;
    g.block(2, 28, 10, 3, p);
    for (let y = top; y < 28; y++) {
      g.rect(3, y, 8, 1, p.b);
      g.set(3, y, p.l); g.set(10, y, p.d);
      g.set(5, y, p.d); g.set(8, y, p.d);                     // estrías
    }
    for (let x = 3; x < 11; x++) g.set(x, top - ((x * 7 + v) % 3), p.l);   // rotura
    g.outline(darkOf);
    return g;
  },
  lapida(v) {
    const g = new Grid(12, 16, ESC);
    const p = ramp(0x7a7880), tierra = ramp(0x4a3a2a);
    g.blob(6, 14, 5.5, 1.6, tierra);
    if (v % 3 === 1) {
      // Cruz de piedra
      g.rect(5, 3, 2, 11, p.b); g.rect(2, 6, 8, 2, p.b);
      g.set(5, 3, p.l); g.rect(2, 6, 8, 1, p.l); g.rect(6, 4, 1, 10, p.d);
    } else {
      const inclina = v % 3 === 2 ? 1 : 0;
      for (let y = 4; y < 14; y++) {
        const dx = inclina ? Math.floor((14 - y) / 4) : 0;
        g.rect(3 + dx, y, 6, 1, p.b); g.set(3 + dx, y, p.l); g.set(8 + dx, y, p.d);
      }
      g.blob(6 + (inclina ? 2 : 0), 4, 3, 1.6, p);
      g.rect(5 + (inclina ? 2 : 0), 6, 2, 1, p.d); g.rect(5.5 + (inclina ? 2 : 0), 5, 1, 4, p.d);   // cruz grabada
    }
    g.set(3, 12, ramp(0x4a6a34).b);
    g.outline(darkOf);
    return g;
  },
  huesos(v) {
    const g = new Grid(16, 8, ESC);
    const h = ramp(0xe0d8c4);
    // Calavera
    g.blob(4, 4, 2.6, 2.2, h, true);
    g.set(3, 4, '#2a2024'); g.set(5, 4, '#2a2024'); g.set(4, 5.5, h.d);
    // Huesos largos y costillas
    for (let i = 0; i < 7; i++) g.set(8 + i, 6 - (v % 2 ? 0 : Math.floor(i / 3)), h.b);
    g.set(8, 5, h.l); g.set(14, 5, h.l);
    if (v % 2) for (let i = 0; i < 3; i++) { g.set(9 + i * 2, 3, h.b); g.set(9 + i * 2, 4, h.d); }
    g.outline(darkOf);
    return g;
  },

  // ---------------------------------------------------------------- costa
  concha(v) {
    const g = new Grid(8, 6, ESC);
    const c = ramp([0xe8c8b0, 0xd8a890, 0xf0e8e0][v % 3]);
    g.blob(4, 3, 3, 2, c);
    for (let i = -2; i <= 2; i++) g.set(4 + i, 3 + Math.abs(i) * 0.3, c.d);
    g.outline(darkOf);
    return g;
  },
  maderaDeriva(v) {
    const g = new Grid(26, 8, ESC);
    const m = ramp(0xb0a490);
    for (let x = 2; x < 23; x++) {
      const y = 4 + Math.round(Math.sin(x * 0.4 + v) * 0.8);
      g.set(x, y - 1, m.l); g.set(x, y, m.b); g.set(x, y + 1, m.d);
    }
    for (let i = 0; i < 4; i++) g.set(16 + i, 2 - Math.floor(i / 2), m.b);
    g.outline(darkOf);
    return g;
  },
  barca() {
    const g = new Grid(40, 18, ESC);
    const m = ramp(0x6a4a30), oscura = ramp(0x3a2a20);
    // Casco volcado de costado, con tablas y una vía de agua
    for (let x = 3; x < 37; x++) {
      const t = (x - 3) / 34;
      const alto = Math.round(4 + Math.sin(t * Math.PI) * 7);
      for (let y = 15 - alto; y < 16; y++) g.set(x, y, (y - (15 - alto)) % 3 === 0 ? m.d : y === 15 - alto ? m.l : m.b);
    }
    g.rect(14, 9, 5, 3, oscura.b);                                    // el boquete
    for (let i = 0; i < 6; i++) g.set(30 + i, 6 - i * 0.5, oscura.b); // remo roto
    g.outline(darkOf);
    return g;
  },

  // ---------------------------------------------------------------- obra humana
  valla(v) {
    const g = new Grid(26, 14, ESC);
    const m = ramp(0x7a5a3a);
    const postes = [2, 12, 22];
    for (const [i, x] of postes.entries()) {
      const rota = v % 2 && i === 2;
      g.rect(x, rota ? 7 : 2, 2, rota ? 6 : 11, m.b); g.set(x, rota ? 7 : 2, m.l); g.rect(x + 1, 3, 1, 10, m.d);
    }
    for (const y of [5, 9]) {
      const hasta = v % 2 && y === 5 ? 15 : 24;
      g.rect(2, y, hasta - 2, 1, m.l); g.rect(2, y + 1, hasta - 2, 1, m.d);
    }
    g.outline(darkOf);
    return g;
  },
  carro() {
    const g = new Grid(36, 22, ESC);
    const m = ramp(0x6a4a2e), hierro = ramp(0x3a3640);
    // Caja del carro inclinada (perdió una rueda)
    for (let x = 4; x < 30; x++) {
      const y = 8 + Math.round((x - 4) * 0.18);
      g.rect(x, y, 1, 6, m.b); g.set(x, y, m.l); g.set(x, y + 5, m.d);
      if (x % 6 === 0) g.rect(x, y, 1, 6, m.d);
    }
    // Rueda en pie
    for (let a = 0; a < Math.PI * 2; a += 0.2) g.set(9 + Math.cos(a) * 5, 15 + Math.sin(a) * 5, hierro.b);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) for (let k = 1; k < 5; k++) g.set(9 + Math.cos(a) * k, 15 + Math.sin(a) * k, m.d);
    // Rueda caída
    g.blob(29, 20, 5, 1.3, m);
    for (let i = 0; i < 8; i++) g.set(31 + i, 13 + i * 0.3, m.b);   // varal
    g.outline(darkOf);
    return g;
  },
  barril(v) {
    const g = new Grid(10, 13, ESC);
    const m = ramp(v % 2 ? 0x7a5432 : 0x6a4a2e), aro = ramp(0x4a4650);
    for (let y = 1; y < 12; y++) {
      const hw = 3.5 + Math.sin((y / 11) * Math.PI) * 0.8;
      g.rect(5 - hw, y, hw * 2, 1, (y === 3 || y === 9) ? aro.b : m.b);
      g.set(5 - hw, y, m.l); g.set(4 + hw, y, m.d);
    }
    g.blob(5, 1.5, 3.3, 1, m);
    g.outline(darkOf);
    return g;
  },
  caja(v) {
    const g = new Grid(12, 11, ESC);
    const m = ramp(0x8a6a42);
    g.block(1, 2, 10, 8, m);
    for (let i = 0; i < 8; i++) g.set(2 + i, 9 - i, m.d);       // tirante
    g.rect(1, 2, 10, 1, m.h);
    if (v % 2) { g.block(3, 0, 6, 3, m); }
    g.outline(darkOf);
    return g;
  },
  pajar() {
    const g = new Grid(24, 18, ESC);
    const p = ramp(0xc8a850);
    g.blob(12, 11, 11, 6.5, p);
    g.blob(12, 6, 7, 4.5, p);
    for (let i = 0; i < 14; i++) { const x = 3 + (i * 7) % 18, y = 6 + (i * 5) % 10; g.set(x, y, p.d); g.set(x + 1, y - 1, p.h); }
    g.outline(darkOf);
    return g;
  },
  espantapajaros() {
    const g = new Grid(18, 34, ESC);
    const palo = ramp(0x5a3e2a), saco = ramp(0xc8b080), ropa = ramp(0x6a5a8a), paja = ramp(0xd8b850);
    g.rect(8, 10, 2, 23, palo.b);
    g.rect(1, 13, 16, 2, palo.b);
    g.block(5, 13, 8, 10, ropa);
    for (let i = 0; i < 4; i++) g.set(5 + i * 2, 23, ropa.d);   // jirones
    for (const x of [0, 17]) for (let i = 0; i < 3; i++) g.set(x + (x ? -i : i) * 0.5, 15 + i, paja.b);
    g.blob(9, 8, 3.5, 3.5, saco, true);
    g.set(8, 8, '#2a2024'); g.set(10, 8, '#2a2024'); g.rect(8, 10, 3, 1, saco.d);
    g.rect(4, 4, 10, 1, palo.d); g.blob(9, 3, 3, 2, palo);      // sombrero
    g.outline(darkOf);
    return g;
  },
  poste() {
    const g = new Grid(18, 30, ESC);
    const m = ramp(0x7a5a3a);
    g.rect(8, 4, 2, 25, m.b); g.set(8, 4, m.l); g.rect(9, 5, 1, 24, m.d);
    // Dos tablillas con punta de flecha, a lados opuestos
    g.rect(2, 6, 12, 3, m.l); g.set(14, 7, m.l); g.rect(2, 8, 12, 1, m.d);
    g.rect(5, 12, 12, 3, m.b); g.set(4, 13, m.b); g.rect(5, 14, 12, 1, m.d);
    for (const [x, y] of [[4, 7], [7, 7], [10, 7], [8, 13], [11, 13], [14, 13]]) g.set(x, y, m.o);
    g.outline(darkOf);
    return g;
  },
  pozo() {
    const g = new Grid(22, 26, ESC);
    const p = ramp(0x7a7468), m = ramp(0x6a4a2e), teja = ramp(0x5e3a2e);
    // Brocal de piedra
    g.blob(11, 20, 9, 5, p);
    g.blob(11, 18.5, 6.5, 2.2, ramp(0x1a1a24));
    for (let x = 3; x < 20; x += 3) g.set(x, 22, p.d);
    // Postes, tejadillo, torno y cubo
    g.rect(3, 6, 2, 12, m.b); g.rect(17, 6, 2, 12, m.b);
    for (let y = 1; y < 6; y++) g.rect(11 - (y + 4), y, (y + 4) * 2, 1, y === 1 ? teja.l : teja.b);
    g.rect(5, 9, 12, 1, m.d);
    g.rect(10, 10, 1, 4, ramp(0xa09070).b); g.block(9, 14, 3, 3, m);
    g.outline(darkOf);
    return g;
  },
  estandarte(v) {
    const g = new Grid(14, 36, ESC);
    const palo = ramp(0x4a3628), tela = ramp([0x8a2020, 0x2a4a7a, 0x3a3a3a][v % 3]);
    g.rect(3, 2, 2, 33, palo.b); g.set(3, 2, palo.l);
    g.rect(2, 4, 10, 1, palo.d);
    for (let y = 5; y < 20; y++) {
      const ancho = 9 - (y > 15 ? (y - 15) * ((y % 2) + 1) : 0);
      g.rect(4, y, Math.max(1, ancho), 1, tela.b);
      g.set(4, y, tela.l); g.set(3 + Math.max(1, ancho), y, tela.d);
    }
    g.rect(6, 9, 4, 4, tela.h);                                 // emblema
    g.outline(darkOf);
    return g;
  },
  totem() {
    const g = new Grid(14, 36, ESC);
    const m = ramp(0x6a5038), h = ramp(0xe0d8c4), pintura = ramp(0x2a8ab0);
    g.block(4, 8, 6, 27, m);
    for (const y of [12, 20, 28]) { g.rect(4, y, 6, 1, m.d); g.set(5, y - 2, pintura.b); g.set(8, y - 2, pintura.b); g.rect(6, y - 1, 2, 1, m.o); }
    // Cráneo con cuernos en lo alto
    g.blob(7, 5, 3, 2.6, h, true);
    g.set(6, 5, '#2a2024'); g.set(8, 5, '#2a2024');
    for (let i = 0; i < 4; i++) { g.set(3 - i * 0.5, 4 - i, h.b); g.set(11 + i * 0.5, 4 - i, h.b); }
    g.outline(darkOf);
    return g;
  },
  hogueraApagada() {
    const g = new Grid(20, 10, ESC);
    const piedra = ramp(0x5a5660), ceniza = ramp(0x4a4448), madera = ramp(0x2a2220);
    g.blob(10, 6, 5, 1.8, ceniza);
    for (let i = 0; i < 8; i++) { g.set(6 + i, 5 + Math.floor(i / 4), madera.b); g.set(13 - i, 5 + Math.floor(i / 4), madera.l); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.blob(10 + Math.cos(a) * 7, 6 + Math.sin(a) * 2.6, 1.6, 1.2, piedra); }
    g.outline(darkOf);
    return g;
  },
  estatua() {
    // Estatua de la fuente de la plaza: la Guardiana de Valdoria alzando el
    // orbe de luz sobre un pedestal. Sustituye al pilar con la bola.
    const g = new Grid(28, 52, ESC);
    const p = ramp(0x9a9488), luz = ramp(0x9ae0ff), sombra = ramp(0x6e6a64);
    g.block(6, 40, 16, 11, p);                                  // pedestal
    g.rect(5, 40, 18, 2, p.l);
    for (let x = 8; x < 21; x += 3) g.set(x, 46, p.d);
    // Alas plegadas a la espalda, por detrás de todo
    for (const l of [-1, 1]) {
      for (let j = 0; j < 16; j++) {
        const ancho = Math.round(4 - Math.abs(j - 5) * 0.35);
        const x0 = l < 0 ? 14 - 4 - ancho - Math.max(0, 5 - j) * 0.4 : 14 + 4 + Math.max(0, 5 - j) * 0.4;
        g.rect(x0, 16 + j, Math.max(1, ancho), 1, j % 3 === 0 ? sombra.d : sombra.b);
      }
    }
    // Túnica acampanada con pliegues
    for (let y = 18; y < 40; y++) {
      const hw = 4 + Math.round((y - 18) * 0.2);
      g.rect(14 - hw, y, hw * 2, 1, p.b);
      g.set(14 - hw, y, p.l); g.set(13 + hw, y, p.d); g.set(12 + hw, y, p.d);
      if (y > 24) { g.set(12, y, p.d); g.set(16, y, p.d); }
    }
    g.rect(10, 24, 8, 1, p.l);                                  // cinturón
    g.blob(14, 14.5, 3.2, 3.4, p, true);                        // cabeza
    g.rect(11, 12, 6, 1, p.h);                                  // diadema
    // Brazos alzados (dos píxeles de grueso) sosteniendo el orbe
    for (let i = 0; i < 10; i++) {
      g.rect(9.5 + i * 0.25, 21 - i, 2, 1, p.l);
      g.rect(16.5 - i * 0.25, 21 - i, 2, 1, p.d);
    }
    g.blob(14, 7, 4.2, 4.2, luz, true);
    g.set(13, 5.5, '#ffffff'); g.set(12.5, 6, '#ffffff');
    g.outline(darkOf);
    return g;
  },
};

// Cuántas variantes tiene cada tipo (las que de verdad se distinguen)
export const VARIANTES = {
  hierba: 6, flores: 6, arbusto: 5, helecho: 2, setas: 3, junquera: 3, nenufar: 2,
  tocon: 2, tronco: 2, pinoOscuro: 3,
  piedras: 3, rocaNieve: 3, monticulo: 2, menhir: 2, murete: 3, columna: 3, lapida: 3, huesos: 2,
  concha: 3, maderaDeriva: 2, barca: 1,
  valla: 2, carro: 1, barril: 2, caja: 2, pajar: 1, espantapajaros: 1, poste: 1, pozo: 1,
  estandarte: 3, totem: 1, hogueraApagada: 1, estatua: 1,
};

const cache = new Map();

/** Lienzo de un elemento del atrezo menudo. */
export function decorSheet(tipo, variante = 0) {
  const key = `${tipo}:${variante}`;
  if (cache.has(key)) return cache.get(key);
  const g = PINTORES[tipo](variante);
  const canvas = document.createElement('canvas');
  canvas.width = g.w; canvas.height = g.h;
  g.drawTo(canvas.getContext('2d'), 0, 0);
  cache.set(key, canvas);
  return canvas;
}

export function tieneDecor(tipo) { return tipo in PINTORES; }
