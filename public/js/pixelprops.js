// Elementos del escenario en pixel art: árboles y el resto del atrezo.
//
// Eran un cilindro con una esfera encima, y con el filtro de píxel seguían
// pareciendo exactamente eso. Ahora son sprites dibujados, con la misma
// técnica que los personajes (rampas con desplazamiento de tono, contorno
// selectivo) y la misma profundidad por los pies: un héroe que pasa por
// detrás de un tronco queda tapado por la copa; por delante, no.
import * as THREE from 'three';
import { Grid, ramp, darkOf, profundidadDePies, texturaDe } from './pixelsprites.js';

// Mismo tamaño de píxel que todo lo demás: 48 px = 3,4 unidades. Los árboles
// se diseñaron a 48x64 y se pintan a 1,5x (72x96) para casar.
const UNIDADES_POR_PX = 3.4 / 48;
const ESC = 1.5;

const cache = new Map();

// Variantes deterministas: cada árbol del bosque elige una de varias copas,
// así el bosque no parece un sello repetido.
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Copa redonda de hoja ancha. `oscuro`: los del bosque espeso, más sombríos.
function paintRoble(variante, oscuro) {
  const W = 48, H = 64;
  const g = new Grid(W, H, ESC);
  const r = rnd(variante * 977 + (oscuro ? 31 : 7));
  const hoja = ramp(oscuro ? 0x2e4a24 : 0x41662e);
  const hojaHonda = ramp(oscuro ? 0x203a1c : 0x2e5024);
  const corteza = ramp(0x5a3e2a);

  // Tronco con raíces que se abren al llegar al suelo
  const tx = 21, tw = 6;
  for (let y = 38; y < H - 1; y++) {
    const abre = y > H - 6 ? (y - (H - 6)) : 0;
    g.rect(tx - abre, y, tw + abre * 2, 1, corteza.b);
    g.set(tx - abre, y, corteza.l);
    g.set(tx + tw - 1 + abre, y, corteza.d);
    if ((y * 7) % 5 === 0) g.set(tx + 2, y, corteza.d);   // vetas
  }
  // Una rama asomando
  for (let i = 0; i < 5; i++) g.set(tx + tw + i, 40 - i, corteza.b);

  // Copa: un racimo de óvalos. Primero la masa en sombra, luego la iluminada
  // desplazada hacia arriba a la izquierda: así la copa tiene volumen.
  const nubes = [[24, 24, 17, 14], [13, 30, 9, 7], [35, 30, 9, 7], [24, 11, 11, 8], [16, 17, 9, 8], [32, 17, 9, 8]];
  for (const [cx, cy, rx, ry] of nubes) {
    g.blob(cx + (r() - 0.5) * 2, cy + 2, rx, ry, hojaHonda);
  }
  for (const [cx, cy, rx, ry] of nubes) {
    g.blob(cx - 1 + (r() - 0.5) * 2, cy, rx * 0.82, ry * 0.78, hoja);
  }
  // Racimos de hojas sueltos para romper el contorno liso
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const x = 24 + Math.cos(a) * (14 + r() * 4);
    const y = 22 + Math.sin(a) * (12 + r() * 3);
    g.blob(x, y, 2.2, 1.8, r() < 0.5 ? hoja : hojaHonda);
  }
  // Brillos sueltos en la parte alta
  for (let i = 0; i < 10; i++) g.set(12 + r() * 20, 8 + r() * 14, hoja.h);
  g.outline(darkOf);
  return g;
}

// Hoja de un árbol: un único fotograma (no se anima).
export function treeSheet(variante = 0, oscuro = false) {
  const key = `roble:${variante}:${oscuro}`;
  if (cache.has(key)) return cache.get(key);
  const g = paintRoble(variante, oscuro);
  const canvas = document.createElement('canvas');
  canvas.width = g.w; canvas.height = g.h;
  g.drawTo(canvas.getContext('2d'), 0, 0);
  cache.set(key, canvas);
  return canvas;
}

// Sprite estático anclado por la base, con profundidad por los pies. Los
// árboles de una misma variante comparten textura Y material: no se animan ni
// se tiñen, así que no hay nada que tenga que ser propio de cada uno.
const materiales = new WeakMap();
export function makePropSprite(canvas, escala = 1) {
  let material = materiales.get(canvas);
  if (!material) {
    material = new THREE.SpriteMaterial({ map: texturaDe(canvas), alphaTest: 0.5 });
    profundidadDePies(material);
    materiales.set(canvas, material);
  }
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.02);
  sprite.scale.set(canvas.width * UNIDADES_POR_PX * escala, canvas.height * UNIDADES_POR_PX * escala, 1);
  return sprite;
}

// ============================================================ atrezo
// El resto del escenario que todavía eran polígonos: farolas, rocas, el
// yunque, hogueras, matas, hierbas, piedras rúnicas, el tablón, pinos nevados,
// árboles muertos, juncos, cristales de hielo y fuegos fatuos. Misma escala
// que todo (se pintan a 1,5x) y se cachean por variante.

const PINTORES = {
  farola() {
    const g = new Grid(16, 44, ESC);
    const hierro = ramp(0x3a3644), piedra = ramp(0x6e6874), luz = ramp(0xffc04a);
    g.block(4, 39, 8, 4, piedra);
    for (let y = 13; y < 39; y++) { g.set(7, y, hierro.l); g.set(8, y, hierro.d); }
    g.rect(6, 20, 4, 1, hierro.b); g.rect(6, 36, 4, 2, hierro.b);
    // Farol: remate, tejadillo, cristal encendido y su base
    g.set(7, 1, hierro.l); g.set(8, 1, hierro.d);
    g.rect(6, 2, 4, 1, hierro.b); g.rect(4, 3, 8, 1, hierro.d);
    g.rect(5, 4, 6, 7, luz.b); g.rect(6, 5, 4, 5, luz.l); g.rect(7, 6, 2, 3, luz.h);
    g.rect(4, 4, 1, 7, hierro.l); g.rect(11, 4, 1, 7, hierro.d);
    g.rect(7, 4, 1, 7, hierro.b);
    g.rect(4, 11, 8, 1, hierro.b); g.rect(6, 12, 4, 1, hierro.d);
    g.outline(darkOf);
    return g;
  },
  roca(v) {
    const g = new Grid(28, 20, ESC);
    const r = rnd(v * 131 + 3);
    const p = ramp([0x6e6874, 0x76706a, 0x625e6c, 0x7a7466][v % 4]);
    g.blob(14, 13, 12, 6, p);
    g.blob(9 + r() * 3, 11, 6, 5, p);
    g.blob(18 + r() * 2, 10, 7, 6, p);
    for (let i = 0; i < 6; i++) g.set(9 + i + Math.floor(r() * 3), 13 + (i % 2), p.d);   // grieta
    if (v % 2 === 0) { const m = ramp(0x4a6a32); g.blob(12, 6.5, 5, 1.4, m); g.blob(18, 5.5, 3, 1.2, m); }
    g.outline(darkOf);
    return g;
  },
  yunque() {
    const g = new Grid(24, 18, ESC);
    const metal = ramp(0x5a5a6a), madera = ramp(0x6a4a2e);
    g.block(8, 10, 8, 7, madera);
    g.rect(8, 10, 8, 1, madera.h);
    g.rect(9, 8, 6, 2, metal.d);
    g.rect(5, 4, 15, 4, metal.b); g.rect(5, 4, 15, 1, metal.h); g.rect(5, 7, 15, 1, metal.d);
    g.rect(2, 5, 3, 2, metal.b); g.set(1, 6, metal.l);                        // cuerno
    g.outline(darkOf);
    return g;
  },
  hoguera() {
    const g = new Grid(24, 14, ESC);
    const piedra = ramp(0x6a6470), madera = ramp(0x5a3a22), brasa = ramp(0xff7a2a);
    // Anillo de piedras: primero las de atrás
    const piedras = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      piedras.push([12 + Math.cos(a) * 9, 8.5 + Math.sin(a) * 3.5]);
    }
    piedras.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of piedras.filter(([, y]) => y <= 8.5)) g.blob(x, y, 1.8, 1.4, piedra);
    // Troncos cruzados sobre las brasas
    g.blob(12, 9, 5, 1.6, brasa);
    for (let i = 0; i < 12; i++) { g.set(6 + i, 6 + Math.floor(i / 4), madera.b); g.set(17 - i, 6 + Math.floor(i / 4), madera.l); }
    for (const [x, y] of piedras.filter(([, y]) => y > 8.5)) g.blob(x, y, 1.8, 1.4, piedra);
    g.outline(darkOf);
    return g;
  },
  mata(v) {
    const g = new Grid(10, 8, ESC);
    const r = rnd(v * 71 + 9);
    const verde = ramp([0x4a6b35, 0x3e5e2c, 0x56784a][v % 3]);
    for (let i = 0; i < 6; i++) {
      const x = 1 + i * 1.5, alto = 3 + Math.floor(r() * 5);
      for (let j = 0; j < alto; j++) {
        const dobla = j > alto - 2 ? (i < 3 ? -1 : 1) : 0;
        g.set(x + dobla, 7 - j, j === alto - 1 ? verde.h : j > 2 ? verde.l : verde.b);
      }
    }
    g.outline(darkOf);
    return g;
  },
  hierba() {
    const g = new Grid(14, 14, ESC);
    const hoja = ramp(0x5ae07a), luz = ramp(0xb8ffc8);
    for (const dx of [-4, -1.5, 1.5, 4]) {
      for (let j = 0; j < 9; j++) g.set(7 + dx * (j / 9), 13 - j, j > 6 ? luz.b : hoja.b);
    }
    g.blob(7, 4, 1.8, 1.8, luz);
    g.set(6, 3, '#ffffff');
    g.outline(darkOf);
    return g;
  },
  piedraRunica() {
    const g = new Grid(18, 44, ESC);
    const piedra = ramp(0x55505e), runa = ramp(0x6ad8ff), cristal = ramp(0x9ad8ff);
    g.block(2, 39, 14, 4, piedra);
    for (let y = 14; y < 39; y++) {
      const hw = 4 + Math.floor((y - 14) / 12);
      g.rect(9 - hw, y, hw * 2, 1, piedra.b);
      g.set(9 - hw, y, piedra.l); g.set(8 + hw, y, piedra.d);
    }
    g.rect(6, 12, 6, 2, piedra.l);
    // Runa tallada que brilla
    for (let y = 18; y < 33; y++) g.set(8, y, y % 4 === 0 ? runa.h : runa.b);
    g.rect(6, 22, 5, 1, runa.b); g.rect(6, 28, 5, 1, runa.b);
    g.set(6, 21, runa.l); g.set(10, 27, runa.l);
    // Cristal flotante
    for (let j = 0; j < 8; j++) {
      const hw = j < 4 ? j : 7 - j;
      g.rect(9 - hw, 2 + j, hw * 2 + 1, 1, j < 3 ? cristal.h : cristal.b);
    }
    g.set(8, 3, '#ffffff');
    g.outline(darkOf);
    return g;
  },
  tablon() {
    const g = new Grid(32, 30, ESC);
    const madera = ramp(0x6b5233), oscura = ramp(0x4a3628), papel = ramp(0xd8c9a3);
    for (const x of [4, 26]) g.block(x, 6, 2, 23, oscura);
    g.block(2, 8, 28, 13, madera);
    for (const y of [12, 16]) g.rect(3, y, 26, 1, madera.d);                 // tablas
    g.block(0, 4, 32, 3, oscura);                                              // tejadillo
    for (const [x, y, w, h] of [[5, 9, 7, 9], [14, 10, 6, 8], [22, 9, 6, 7]]) {
      g.block(x, y, w, h, papel);
      for (let l = y + 2; l < y + h - 1; l += 2) g.rect(x + 1, l, w - 2, 1, papel.d);
      g.set(x + Math.floor(w / 2), y, '#a03030');                              // chincheta
    }
    g.outline(darkOf);
    return g;
  },
  tienda() {
    const g = new Grid(44, 34, ESC);
    const lona = ramp(0x8a7a5a), oscura = ramp(0x5a4a34), palo = ramp(0x4a3628);
    // Tejado a dos aguas visto de frente: un triángulo con su entrada
    for (let y = 4; y < 33; y++) {
      const hw = Math.round((y - 4) * 0.76) + 1;
      g.rect(22 - hw, y, hw * 2, 1, lona.b);
      g.set(22 - hw, y, lona.l); g.set(21 + hw, y, lona.d);
      if (y % 6 === 0) g.rect(22 - hw + 1, y, hw * 2 - 2, 1, lona.d);      // costuras
    }
    for (let y = 16; y < 33; y++) {
      const hw = Math.round((y - 16) * 0.42) + 1;
      g.rect(22 - hw, y, hw * 2, 1, oscura.d);                               // entrada
    }
    g.rect(21, 0, 2, 6, palo.b);
    g.outline(darkOf);
    return g;
  },
  pinoNevado(v) {
    const g = new Grid(36, 56, ESC);
    const r = rnd(v * 53 + 5);
    const pino = ramp(0x2a4a3a), nieve = ramp(0xeaf2f8), tronco = ramp(0x4a3a2e);
    g.block(16, 46, 4, 9, tronco);
    // Tres pisos de ramas, de abajo arriba: cada uno tapa la copa del de
    // debajo, así que la nieve va en el faldón de cada piso (lo que se ve
    // desde arriba), cargada hacia la luz y con algún terrón suelto.
    for (const [top, base, hw] of [[24, 47, 16], [13, 34, 12], [3, 22, 8]]) {
      const ancho = (y) => Math.round(1 + (hw - 1) * (y - top) / (base - top));
      for (let y = top; y <= base; y++) {
        const w = ancho(y);
        g.rect(18 - w, y, w * 2, 1, pino.b);
        g.set(18 - w, y, pino.l); g.set(17 + w, y, pino.d);
      }
      for (let y = base - 4; y <= base; y++) {
        const w = ancho(y);
        const hasta = Math.round(w * (0.5 + r() * 0.5));
        g.rect(18 - w, y, w + hasta, 1, y === base - 4 ? nieve.h : nieve.b);
        g.set(17 + w, y, nieve.d);
      }
      for (let x = 18 - ancho(base); x < 18 + ancho(base); x += 3) g.set(x + 1, base + 1, nieve.d);   // carámbanos
      for (let i = 0; i < 3; i++) {
        const y = top + 2 + Math.floor(r() * (base - top - 7));
        g.rect(18 - ancho(y) + 1 + r() * ancho(y), y, 2, 1, nieve.l);
      }
    }
    g.set(18, 2, nieve.h);
    g.outline(darkOf);
    return g;
  },
  arbolMuerto(v) {
    const g = new Grid(36, 52, ESC);
    const r = rnd(v * 97 + 11);
    const c = ramp(0x4a4038);
    // Tronco retorcido
    let x = 17;
    const eje = [];
    for (let y = 51; y > 14; y--) {
      x += (r() - 0.5) * 0.8;
      eje[y] = x;
      const w = y > 44 ? 5 : y > 30 ? 4 : 3;
      g.rect(x - w / 2, y, w, 1, c.b); g.set(x - w / 2, y, c.l);
    }
    // Ramas desnudas
    for (let b = 0; b < 5; b++) {
      let by = 17 + b * 5, bx = eje[by];
      const lado = b % 2 ? 1 : -1;
      const largo = 9 + r() * 5;
      for (let i = 0; i < largo; i++) {
        bx += lado * (0.8 + r() * 0.4); by -= 0.5 + r() * 0.6;
        g.set(bx, by, i < 3 ? c.b : c.d);
      }
    }
    g.outline(darkOf);
    return g;
  },
  junco(v) {
    const g = new Grid(12, 20, ESC);
    const r = rnd(v * 37 + 2);
    const tallo = ramp(0x4a5a2a), espiga = ramp(0x6a4a2a);
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 2.5, alto = 10 + Math.floor(r() * 7);
      for (let j = 0; j < alto; j++) g.set(x + (j > alto * 0.7 ? (i % 2 ? 1 : -1) : 0), 19 - j, tallo.b);
      if (i % 2 === 0) g.rect(x - 2, 19 - alto, 2, 3, espiga.b);
    }
    g.outline(darkOf);
    return g;
  },
  cristalHielo(v) {
    const g = new Grid(16, 40, ESC);
    const r = rnd(v * 19 + 7);
    const hielo = ramp(0xa8d8f4);
    // Una aguja principal y dos menores a los lados, cada una con su cara
    // iluminada, su arista central y su cara en sombra: talladas, no conos.
    const aguja = (cx, alto, ancho) => {
      for (let j = 0; j < alto; j++) {
        const hw = Math.max(1, Math.round(ancho * (j / alto)));
        const y = 39 - alto + j;
        g.rect(cx - hw, y, hw, 1, hielo.l);
        g.rect(cx, y, hw, 1, hielo.b);
        g.set(cx - hw, y, hielo.h);
        g.set(cx + hw - 1, y, hielo.d);
        if (j > 2) g.set(cx, y, hielo.h);
      }
    };
    aguja(4, 12 + Math.floor(r() * 6), 3);
    aguja(12, 9 + Math.floor(r() * 6), 3);
    aguja(8, 26 + Math.floor(r() * 12), 5);
    g.outline(darkOf);
    return g;
  },
  // Antorcha de pie de las criptas: un brasero de hierro sobre un poste. La
  // llama va aparte (makeFlameSprite) con el color de cada cripta.
  antorcha() {
    const g = new Grid(12, 34, ESC);
    const hierro = ramp(0x3a3640);
    g.rect(1, 0, 10, 1, hierro.l);
    for (let y = 1; y < 5; y++) { const hw = 5 - y; g.rect(6 - hw - 1, y, hw * 2 + 2, 1, hierro.b); g.set(6 - hw - 1, y, hierro.l); }
    for (let y = 5; y < 31; y++) { g.set(5, y, hierro.l); g.set(6, y, hierro.d); }
    g.rect(4, 14, 4, 1, hierro.b);
    for (let i = 0; i < 4; i++) { g.set(5 - i, 30 + i, hierro.b); g.set(6 + i, 30 + i, hierro.d); }   // trípode
    g.outline(darkOf);
    return g;
  },
  fuegoFatuo() {
    const g = new Grid(8, 8, ESC);
    const luz = ramp(0x9affce);
    g.blob(4, 4, 3, 3, luz);
    g.set(3, 3, '#ffffff');
    return g;
  },
};

// Hoja de un objeto del atrezo. `variante` elige entre diseños parecidos.
export function propSheet(tipo, variante = 0) {
  const key = `prop:${tipo}:${variante}`;
  if (cache.has(key)) return cache.get(key);
  const g = PINTORES[tipo](variante);
  const canvas = document.createElement('canvas');
  canvas.width = g.w; canvas.height = g.h;
  g.drawTo(canvas.getContext('2d'), 0, 0);
  cache.set(key, canvas);
  return canvas;
}

// ---- Llama: tres fotogramas que se alternan (hogueras y braseros) ----
function pintarLlama(f, color) {
  const g = new Grid(10, 16, ESC);
  const fuego = ramp(color), centro = ramp(color === 0xff8a2a ? 0xffd860 : color);
  const ond = [0, 1, -1][f];
  for (let j = 0; j < 14; j++) {
    const hw = Math.max(0, Math.round(4 * Math.sin(((j + 1) / 15) * Math.PI) * (1 - j / 20)));
    const x = 5 + Math.round(Math.sin(j * 0.5 + f) * 0.8 * (j / 14)) + (j > 9 ? ond : 0);
    g.rect(x - hw, 15 - j, hw * 2 + 1, 1, fuego.b);
    if (hw > 1) g.rect(x - hw + 2, 15 - j, Math.max(1, hw * 2 - 3), 1, j < 8 ? (color === 0xff8a2a ? centro.b : centro.h) : fuego.l);
  }
  g.set(5 + ond, 1, fuego.l);
  return g;
}

export function flameSheet(color = 0xff8a2a) {
  const key = `llama:${color}`;
  if (cache.has(key)) return cache.get(key);
  const frames = [0, 1, 2].map((f) => pintarLlama(f, color));
  const canvas = document.createElement('canvas');
  canvas.width = frames[0].w * 3; canvas.height = frames[0].h;
  canvas.frameW = frames[0].w; canvas.frameH = frames[0].h;
  frames.forEach((g, i) => g.drawTo(canvas.getContext('2d'), i * g.w, 0));
  cache.set(key, canvas);
  return canvas;
}

// Sprite de llama con su propia textura: cada fuego parpadea a su ritmo.
export function makeFlameSprite(escala = 1, color) {
  const canvas = flameSheet(color);
  const tex = texturaDe(canvas).clone();
  tex.repeat.set(1 / 3, 1);
  const material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
  profundidadDePies(material);
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.02);
  sprite.scale.set(canvas.frameW * UNIDADES_POR_PX * escala, canvas.frameH * UNIDADES_POR_PX * escala, 1);
  sprite.userData.fase = Math.random() * 3;
  return sprite;
}

export function animateFlame(sprite, time) {
  const f = Math.floor(time * 9 + sprite.userData.fase) % 3;
  sprite.material.map.offset.x = f / 3;
}
