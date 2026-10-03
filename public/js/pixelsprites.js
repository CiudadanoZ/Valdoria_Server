// Personajes en pixel art, pintados píxel a píxel por código.
//
// Sustituyen a los muñecos de cilindros y esferas. Cada héroe se compone a
// partir de su raza y su clase (piel, pelo, armadura, arma) y se pinta en una
// hoja de fotogramas: tres orientaciones (de frente, de espaldas y de perfil;
// el otro perfil es el espejo) × reposo, paso y ataque.
//
// Dos técnicas que separan el pixel art profesional del de aficionado:
//   - Rampas con desplazamiento de tono: las sombras no son "el mismo color
//     más oscuro" sino que viran hacia el violeta, y las luces hacia el
//     amarillo. Así el volumen se lee con muy pocos píxeles.
//   - Contorno selectivo: el borde de cada pieza es una versión oscura de SU
//     color, no un negro uniforme. El negro puro aplasta; esto da relieve.
//
// El cuerpo 3D de antes sigue existiendo pero invisible: es la zona de clic y
// el que lleva posición, rotación y animación. El sprite solo es la piel, así
// que ninguna mecánica cambia.
import * as THREE from 'three';
import { RACES, CLASSES } from './races.js';

export const FRAME_W = 24;
export const FRAME_H = 32;

// Columnas de la hoja: 2 de reposo, 4 de paso, 2 de ataque.
export const ANIMS = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  attack: [6, 7],
};
const COLS = 8;
// Filas: de frente (hacia la cámara), de espaldas, de perfil derecho.
export const DIRS = { S: 0, N: 1, E: 2 };
const ROWS = 3;

// ---------------------------------------------------------------- color

function hexToHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToCss(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)},${f(8)},${f(4)})`;
}

// Rampa de 5 tonos con desplazamiento de tono hacia frío en las sombras y
// hacia cálido en las luces.
export function ramp(hex) {
  const [h, s, l] = hexToHsl(hex);
  const haciaFrio = (dh) => h + dh * (h > 0.08 && h < 0.75 ? 1 : -1) * -1;
  return {
    o: hslToCss(h + 0.04, Math.min(1, s * 0.9 + 0.1), l * 0.28),   // contorno
    d: hslToCss(haciaFrio(0.03) + 0.025, s * 0.95, l * 0.62),       // sombra
    b: hslToCss(h, s, l),                                           // base
    l: hslToCss(h - 0.015, s * 0.95, Math.min(0.92, l * 1.22 + 0.04)), // luz
    h: hslToCss(h - 0.03, s * 0.8, Math.min(0.96, l * 1.45 + 0.1)),    // brillo
  };
}

// ---------------------------------------------------------------- lienzo

export class Grid {
  constructor(w = FRAME_W, h = FRAME_H) {
    this.w = w; this.h = h;
    this.c = new Array(w * h).fill(null);
  }
  set(x, y, col) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !col) return;
    this.c[y * this.w + x] = col;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.c[y * this.w + x];
  }
  rect(x, y, w, h, col) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col); }
  // Rectángulo con volumen: luz a la izquierda, sombra a la derecha y abajo.
  block(x, y, w, h, r, { top = true } = {}) {
    this.rect(x, y, w, h, r.b);
    for (let j = 0; j < h; j++) { this.set(x, y + j, r.l); this.set(x + w - 1, y + j, r.d); }
    if (top) for (let i = 0; i < w - 1; i++) this.set(x + i, y, r.l);
    for (let i = 1; i < w; i++) this.set(x + i, y + h - 1, r.d);
  }
  // Óvalo con volumen: la luz viene de arriba a la izquierda, como en todo el
  // juego. Con cuatro tonos basta para que un cuerpo parezca redondo.
  blob(cx, cy, rx, ry, r) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const luz = -nx * 0.55 - ny * 0.83;
        this.set(x, y, luz > 0.72 ? r.h : luz > 0.32 ? r.l : luz < -0.42 ? r.d : r.b);
      }
    }
  }
  // Contorno selectivo: cada hueco vacío junto a un píxel lleno toma una
  // versión oscura del color de su vecino.
  outline(outlineOf) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n = this.get(x, y - 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y + 1);
        if (n) add.push([x, y, outlineOf(n)]);
      }
    }
    for (const [x, y, c] of add) this.set(x, y, c);
  }
  drawTo(ctx, ox, oy) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const col = this.c[y * this.w + x];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

// El contorno de cada color se calcula una vez: oscuro y algo más frío.
const outlineCache = new Map();
export function darkOf(css) {
  if (outlineCache.has(css)) return outlineCache.get(css);
  const m = css.match(/\d+/g).map(Number);
  const hex = (m[0] << 16) | (m[1] << 8) | m[2];
  const out = ramp(hex).o;
  outlineCache.set(css, out);
  return out;
}

// ---------------------------------------------------------------- héroe

// Apariencia por clase: lo que se ve de lejos es la silueta, así que cada
// clase tiene una forma reconocible (yelmo y escudo, capucha y arco, túnica
// larga y báculo).
const CLASS_LOOK = {
  guerrero: { main: 0x9a2a22, metal: 0x9aa4b4, leather: 0x5a3a24, head: 'yelmo', weapon: 'espada', offhand: 'escudo', armor: 'placas', cloak: false },
  explorador: { main: 0x3f6b34, metal: 0x8a8070, leather: 0x6a4428, head: 'capucha', weapon: 'arco', offhand: null, armor: 'cuero', cloak: true },
  sacerdote: { main: 0xe2d6b8, metal: 0xd9a441, leather: 0x7a5a3a, head: 'diadema', weapon: 'baculo', offhand: null, armor: 'tunica', cloak: false },
};

const HAIR = { humano: 0x5a3a22, elfo: 0xe8d088, enano: 0xa8502a, orco: 0x1e1a18 };

// Construye la apariencia completa a partir de una especificación. La usan
// los héroes (raza × clase) y los NPCs (cada uno la suya).
function buildLook(spec) {
  const race = RACES[spec.race] || RACES.humano;
  const armor = spec.armor || 'cuero';
  return {
    race: spec.race,
    skin: ramp(spec.skin ?? race.skin),
    hair: ramp(spec.hair ?? HAIR[spec.race] ?? HAIR.humano),
    beardColor: spec.beardColor ? ramp(spec.beardColor) : null,
    main: ramp(spec.main),
    cape: spec.cape ? ramp(spec.cape) : null,
    metal: ramp(spec.metal ?? 0x9aa4b4),
    leather: ramp(spec.leather ?? 0x5a3a24),
    boots: ramp(0x3a2a20),
    wood: ramp(0x7a5230),
    glow: ramp(spec.glow ?? 0x9fe8ff),
    gold: ramp(0xd9a441),
    head: spec.head,
    weapon: spec.weapon || null,
    offhand: spec.offhand || null,
    armor,
    robe: armor === 'tunica',
    cloak: !!spec.cloak,
    ears: !!race.ears,
    beard: spec.beard ?? (race.beard ? 'corta' : false),
    tusks: !!race.tusks,
    // El enano es más bajo y ancho; el orco, más corpulento.
    short: spec.race === 'enano' ? 3 : 0,
    bulk: spec.bulk ?? (spec.race === 'orco' || spec.race === 'enano' ? 1 : 0),
  };
}

export function heroLook(raceId, classId) {
  const look = CLASS_LOOK[classId] || CLASS_LOOK.guerrero;
  return buildLook({ ...look, race: raceId });
}

// ---- NPCs ----
// Cada uno con una silueta que se reconoce de lejos: es lo que hace que la
// Ciudadela se sienta habitada por gente concreta y no por maniquíes.
const NPC_LOOKS = {
  aldric:   { race: 'humano', main: 0x4a3a7a, armor: 'tunica', head: 'pelo', hair: 0xe8e4dc, beard: 'larga', weapon: 'baculo', glow: 0xc9a4f0 },
  bramm:    { race: 'humano', main: 0x5c3a26, armor: 'delantal', head: 'calvo', hair: 0x3a2416, beard: 'corta', weapon: 'martillo', bulk: 1, leather: 0x4a2e1c },
  lyra:     { race: 'humano', main: 0x8a6a2a, armor: 'cuero', head: 'pelo_largo', hair: 0xb04a2a, leather: 0x6a4428 },
  toran:    { race: 'humano', main: 0x3a4a5c, armor: 'placas', head: 'yelmo', weapon: 'lanza', offhand: 'escudo' },
  mira:     { race: 'elfo', main: 0xd8d0e8, armor: 'tunica', head: 'diadema', hair: 0xe8d8a8, weapon: 'baculo' },
  baldur:   { race: 'humano', main: 0x4a5a3a, armor: 'tunica', head: 'capucha', hair: 0xd8d4cc, beard: 'larga', beardColor: 0xd8d4cc, weapon: 'baculo', glow: 0xb8f070 },
  nyra:     { race: 'elfo', main: 0x7a5a3a, armor: 'cuero', head: 'capucha', weapon: 'arco', cloak: true },
  ysra:     { race: 'humano', main: 0x4a5a6a, armor: 'tunica', head: 'capucha', weapon: 'baculo', glow: 0x9fe8c8 },
  skadi:    { race: 'humano', main: 0xb8c8d4, armor: 'cuero', head: 'capucha', weapon: 'arco', cloak: true, leather: 0x8a7a6a },
  establo:  { race: 'humano', main: 0x6a5238, armor: 'cuero', head: 'sombrero', hair: 0x5a3a22, leather: 0x5a3a24 },
  subastas: { race: 'humano', main: 0x4a4a6a, armor: 'tunica', head: 'pelo', hair: 0x9a9aa0, beard: 'corta', beardColor: 0x9a9aa0 },
};

export function npcLook(id) {
  return buildLook(NPC_LOOKS[id] || { race: 'humano', main: 0x6a6a7a, armor: 'cuero', head: 'pelo' });
}

// Pinta un fotograma. dir: 'S' | 'N' | 'E'. anim: 'idle' | 'walk' | 'attack'.
// f: índice del fotograma dentro de su animación.
function paintHero(L, dir, anim, f) {
  const g = new Grid();
  const top = L.short;            // el enano empieza más abajo
  // Bamboleo: al pisar, el cuerpo baja un píxel; al respirar, también.
  const bob = (anim === 'walk' && (f === 1 || f === 3)) || (anim === 'idle' && f === 1) ? 1 : 0;
  // Piernas: en el paso una se adelanta (de perfil) o se levanta (de frente).
  const legLift = anim === 'walk' ? [0, 1, 0, -1][f] : 0;   // 1: izquierda arriba, -1: derecha arriba
  const atk = anim === 'attack' ? f : -1;
  const B = L.bulk;

  if (dir === 'E') return paintHeroSide(g, L, top, bob, anim, f, atk);

  const front = dir === 'S';
  const y0 = top + bob;           // desplazamiento vertical de cuerpo y cabeza

  // --- piernas y botas
  if (!L.robe) {
    for (const [lx, lift] of [[8 - B, legLift === 1 ? 1 : 0], [13, legLift === -1 ? 1 : 0]]) {
      const lw = 3 + B;
      g.block(lx, 21 + top, lw, 5 - lift, L.leather, { top: false });
      g.block(lx, 26 + top - lift, lw, 4 - Math.max(0, top - 0), L.boots, { top: false });
    }
  } else {
    // Túnica hasta el suelo: solo asoman las puntas de las botas.
    g.rect(8, 28, 3, 2, L.boots.b);
    g.rect(13, 28, 3, 2, L.boots.b);
  }

  // --- torso
  const tx = 7 - B, tw = 10 + B * 2;
  if (L.robe) {
    // Túnica acampanada
    for (let j = 0; j < 17 - top; j++) {
      const ens = Math.floor(j / 6);
      g.rect(tx - ens + 1, 12 + y0 + j, tw + ens * 2 - 2, 1, L.main.b);
      g.set(tx - ens + 1, 12 + y0 + j, L.main.l);
      g.set(tx + tw + ens - 2, 12 + y0 + j, L.main.d);
    }
    // Ribete dorado central y en el bajo
    for (let j = 13; j < 28; j++) g.set(11, j + y0 - (j > 26 ? 0 : 0), L.gold.b);
    for (let j = 13; j < 28; j++) g.set(12, j + y0, L.gold.d);
    g.rect(tx - 1, 28 + Math.min(0, -top), tw + 2, 1, L.gold.d);
  } else {
    g.block(tx, 12 + y0, tw, 9, L.main);
    if (L.armor === 'placas') {
      // Peto metálico bajo el tabardo, y tabardo con la cruz de Valdoria.
      g.rect(tx, 12 + y0, tw, 2, L.metal.b);
      g.rect(tx, 12 + y0, 1, 2, L.metal.l);
      g.rect(10, 14 + y0, 4, 11 - top, L.main.b);
      g.rect(10, 14 + y0, 1, 11 - top, L.main.l);
      g.rect(13, 14 + y0, 1, 11 - top, L.main.d);
      g.rect(11, 16 + y0, 2, 4, L.gold.b);
      g.rect(10, 17 + y0, 4, 1, L.gold.b);
    } else if (L.armor === 'delantal') {
      // Delantal de cuero de la forja, del pecho a las rodillas
      g.block(tx + 2, 13 + y0, tw - 4, 11 - top, L.leather);
      g.set(tx + 2, 12 + y0, L.leather.d); g.set(tx + tw - 3, 12 + y0, L.leather.d);
    } else {
      // Jubón de cuero con correa cruzada
      for (let j = 0; j < 8; j++) g.set(tx + 1 + j, 12 + y0 + j, L.leather.b);
    }
    // Cinturón
    g.rect(tx, 20 + y0, tw, 1, L.leather.d);
    g.set(11, 20 + y0, L.gold.l);
    g.set(12, 20 + y0, L.gold.b);
  }

  // --- capa (de espaldas se ve entera)
  if (!front && L.cloak) {
    g.block(tx, 12 + y0, tw, 15 - top, L.cape || L.main);
  }

  // --- brazos y manos (se balancean al andar)
  const swing = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
  const armL = { x: tx - 2, y: 13 + y0 - swing };
  const armR = { x: tx + tw, y: 13 + y0 + swing };
  for (const a of [armL, armR]) {
    g.block(a.x, a.y, 2, 6, L.armor === 'placas' ? L.metal : L.main);
    g.rect(a.x, a.y + 6, 2, 2, L.skin.b);
    g.set(a.x + 1, a.y + 7, L.skin.d);
  }
  // Hombreras de la armadura de placas
  if (L.armor === 'placas') {
    g.block(tx - 3, 11 + y0, 4, 3, L.metal);
    g.block(tx + tw - 1, 11 + y0, 4, 3, L.metal);
  }

  // --- cabeza
  const hx = 8, hy = 3 + y0;
  g.rect(11, 11 + y0, 2, 1, L.skin.d);                // cuello
  g.block(hx, hy, 8, 8, L.skin);
  if (front) {
    // Ojos y algo de expresión
    g.set(hx + 2, hy + 4, '#1a1014');
    g.set(hx + 5, hy + 4, '#1a1014');
    g.set(hx + 2, hy + 3, L.skin.d);
    g.set(hx + 5, hy + 3, L.skin.d);
    g.set(hx + 3, hy + 6, L.skin.d);
    g.set(hx + 4, hy + 6, L.skin.d);
  }
  if (L.ears) {
    g.set(hx - 1, hy + 3, L.skin.b); g.set(hx - 2, hy + 2, L.skin.l);
    g.set(hx + 8, hy + 3, L.skin.d); g.set(hx + 9, hy + 2, L.skin.b);
  }
  if (L.tusks && front) {
    g.set(hx + 2, hy + 7, '#efe6d2');
    g.set(hx + 5, hy + 7, '#efe6d2');
  }
  if (L.beard && front) {
    const barba = L.beardColor || L.hair;
    g.rect(hx, hy + 5, 8, 3, barba.b);
    g.rect(hx + 1, hy + 8, 6, 2, barba.b);
    g.rect(hx + 2, hy + 10, 4, 1, barba.d);
    g.set(hx + 3, hy + 6, barba.d); g.set(hx + 4, hy + 6, barba.d);
    if (L.beard === 'larga') {
      // Barba de anciano que baja por el pecho
      g.rect(hx + 2, hy + 10, 4, 4, barba.b);
      g.rect(hx + 3, hy + 14, 2, 2, barba.l);
      g.set(hx + 2, hy + 11, barba.l);
    }
  }

  // Tocado de clase
  if (L.head === 'yelmo') {
    g.rect(hx - 1, hy - 1, 10, 4, L.metal.b);
    g.rect(hx - 1, hy - 1, 10, 1, L.metal.l);
    g.rect(hx - 1, hy + 3, 1, 4, L.metal.b);
    g.rect(hx + 8, hy + 3, 1, 4, L.metal.d);
    if (front) {
      g.rect(hx + 3, hy + 2, 2, 4, L.metal.d);   // nasal
    } else {
      g.rect(hx - 1, hy + 2, 10, 5, L.metal.b);
      g.rect(hx + 6, hy + 2, 3, 5, L.metal.d);
    }
    // Penacho rojo
    g.rect(hx + 3, hy - 3, 2, 2, L.main.l);
    g.set(hx + 4, hy - 4, L.main.b);
  } else if (L.head === 'capucha') {
    g.rect(hx - 1, hy - 1, 10, 3, L.main.b);
    g.rect(hx - 1, hy - 1, 10, 1, L.main.l);
    g.rect(hx - 1, hy + 2, 2, 7, L.main.b);
    g.rect(hx + 7, hy + 2, 2, 7, L.main.d);
    g.set(hx + 4, hy - 2, L.main.b);
    if (!front) g.rect(hx - 1, hy + 1, 10, 8, L.main.b);
    if (front) {
      // La cara queda en sombra bajo la capucha
      g.rect(hx + 1, hy + 2, 6, 1, L.skin.d);
    }
  } else if (L.head === 'diadema') {
    g.rect(hx, hy, 8, 2, L.hair.b);
    g.rect(hx, hy, 8, 1, L.hair.l);
    if (!front) g.rect(hx, hy, 8, 6, L.hair.b);
    g.rect(hx, hy + 1, 8, 1, L.gold.b);
    g.set(hx + 3, hy + 1, L.glow.l);
    g.set(hx + 4, hy + 1, L.glow.b);
  }
  else if (L.head === 'pelo' || L.head === 'pelo_largo') {
    g.rect(hx, hy - 1, 8, 3, L.hair.b);
    g.rect(hx, hy - 1, 8, 1, L.hair.l);
    g.set(hx, hy + 2, L.hair.b); g.set(hx + 7, hy + 2, L.hair.d);
    if (!front) g.rect(hx, hy, 8, 7, L.hair.b);
    if (L.head === 'pelo_largo') {
      // Melena que cae por los hombros
      g.rect(hx - 1, hy + 1, 2, 9, L.hair.b);
      g.rect(hx + 7, hy + 1, 2, 9, L.hair.d);
      if (!front) g.rect(hx, hy + 6, 8, 5, L.hair.b);
    }
  } else if (L.head === 'calvo') {
    g.set(hx + 2, hy, L.skin.h); g.set(hx + 3, hy, L.skin.h);   // brillo de la calva
    g.rect(hx, hy + 2, 1, 3, L.hair.d); g.rect(hx + 7, hy + 2, 1, 3, L.hair.d);
  } else if (L.head === 'sombrero') {
    g.rect(hx - 2, hy + 1, 12, 1, L.leather.d);            // ala
    g.rect(hx, hy - 2, 8, 3, L.leather.b);                 // copa
    g.rect(hx, hy - 2, 8, 1, L.leather.l);
    g.rect(hx, hy, 8, 1, L.gold.d);                        // cinta
  }

  // --- arma y mano secundaria. De frente, la mano derecha del héroe queda a
  // la IZQUIERDA de la pantalla; de espaldas, al revés.
  const manoArma = front ? armL : armR;
  const manoOtra = front ? armR : armL;
  paintWeapon(g, L, manoArma, front ? -1 : 1, atk);
  if (L.offhand === 'escudo') {
    const sx = manoOtra.x + (front ? 1 : -4);
    const sy = manoOtra.y + 1;
    g.block(sx, sy, 5, 7, L.leather);
    g.rect(sx, sy, 5, 1, L.metal.l);
    g.rect(sx, sy + 6, 5, 1, L.metal.d);
    if (front) {
      g.rect(sx + 2, sy + 2, 1, 3, L.gold.b);
      g.rect(sx + 1, sy + 3, 3, 1, L.gold.b);
    }
  }
  if (L.weapon === 'arco' && !front) {
    // Carcaj a la espalda
    g.block(14, 10 + y0, 3, 8, L.leather);
    g.set(14, 9 + y0, '#d8d0c0'); g.set(16, 9 + y0, '#d8d0c0');
  }

  g.outline(darkOf);
  return g;
}

function paintWeapon(g, L, mano, lado, atk) {
  const hx = mano.x + (lado < 0 ? -1 : 2);
  const hy = mano.y + 6;
  if (L.weapon === 'espada') {
    if (atk === 0) {
      // Espada alzada por encima del hombro
      for (let j = 0; j < 10; j++) g.set(hx + lado * Math.floor(j / 3), hy - 7 - j, j < 9 ? L.metal.h : L.metal.l);
      g.rect(hx - 1, hy - 7, 3, 1, L.gold.b);
    } else if (atk === 1) {
      // Tajo en diagonal hacia abajo
      for (let j = 0; j < 9; j++) g.set(hx - lado * j, hy + 1 + Math.floor(j / 2), L.metal.h);
      g.set(hx, hy, L.gold.b);
    } else {
      for (let j = 1; j < 12; j++) { g.set(hx, hy - j, L.metal.l); g.set(hx + lado, hy - j, L.metal.d); }
      g.set(hx, hy - 12, L.metal.h);
      g.rect(hx - 1, hy, 3, 1, L.gold.b);       // guarda
      g.set(hx, hy + 1, L.leather.d);            // empuñadura
      g.set(hx, hy + 2, L.gold.l);               // pomo
    }
  } else if (L.weapon === 'arco') {
    const bx = hx + lado;
    const ext = atk === 0 ? 1 : 0;              // al tensar, el arco se adelanta
    for (let j = -7; j <= 4; j++) {
      const curva = Math.round(Math.abs(j + 1.5) / 3.5);
      g.set(bx + lado * (curva - ext), hy + j - 2, L.wood.b);
    }
    for (let j = -6; j <= 3; j++) g.set(bx + lado * (2 - ext), hy + j - 2, '#e8e0d0');
  } else if (L.weapon === 'martillo') {
    for (let j = 1; j < 9; j++) g.set(hx, hy - j, L.wood.b);
    const my = hy - (atk === 0 ? 12 : 10);
    g.block(hx - 2, my, 5, 3, L.metal);                    // cabeza del martillo
  } else if (L.weapon === 'lanza') {
    for (let j = -12; j < 9; j++) g.set(hx, hy + j, j % 5 === 0 ? L.wood.d : L.wood.b);
    g.set(hx, hy - 13, L.metal.l); g.set(hx, hy - 14, L.metal.h);
    g.set(hx - 1, hy - 12, L.metal.d); g.set(hx + 1, hy - 12, L.metal.d);
  } else if (L.weapon === 'baculo') {
    for (let j = -14; j < 9; j++) g.set(hx, hy + j, j % 4 === 0 ? L.wood.d : L.wood.b);
    // Orbe brillante en la punta
    const oy = hy - 17 + (atk === 0 ? -1 : 0);
    g.rect(hx - 1, oy, 3, 3, L.glow.b);
    g.set(hx - 1, oy, L.glow.h);
    g.set(hx, oy - 1, L.glow.l);
    if (atk >= 0) { g.set(hx - 2, oy + 1, L.glow.h); g.set(hx + 2, oy + 1, L.glow.h); g.set(hx, oy - 2, L.glow.h); }
  }
}

// Perfil derecho. El izquierdo es su espejo.
function paintHeroSide(g, L, top, bob, anim, f, atk) {
  const y0 = top + bob;
  const B = L.bulk;
  // Piernas en tijera al andar
  const paso = anim === 'walk' ? [0, 2, 0, -2][f] : 0;
  if (!L.robe) {
    g.block(10 + paso, 21 + top, 3 + B, 5, L.leather, { top: false });
    g.block(10 + paso, 26 + top, 4 + B, 4 - top, L.boots, { top: false });
    g.block(11 - paso, 21 + top, 3 + B, 5, L.leather, { top: false });
    g.block(11 - paso, 26 + top, 4 + B, 4 - top, L.boots, { top: false });
  } else {
    g.rect(10 + Math.max(0, paso), 28, 4, 2, L.boots.b);
  }
  // Capa por detrás
  if (L.cloak || L.robe) g.block(7, 12 + y0, 3, L.robe ? 16 - top : 13 - top, L.cape || L.main);
  // Torso
  if (L.robe) {
    for (let j = 0; j < 17 - top; j++) {
      const ens = Math.floor(j / 7);
      g.rect(9 - ens, 12 + y0 + j, 7 + ens * 2, 1, L.main.b);
      g.set(9 - ens, 12 + y0 + j, L.main.l);
      g.set(15 + ens, 12 + y0 + j, L.main.d);
    }
    for (let j = 13; j < 28; j++) g.set(14, j + y0, L.gold.b);
  } else {
    g.block(9 - B, 12 + y0, 7 + B, 9, L.main);
    if (L.armor === 'placas') {
      g.rect(9 - B, 12 + y0, 7 + B, 2, L.metal.b);
      g.block(9, 11 + y0, 5, 3, L.metal);   // hombrera
    }
    g.rect(9 - B, 20 + y0, 7 + B, 1, L.leather.d);
  }
  // Cabeza de perfil
  const hx = 9, hy = 3 + y0;
  g.rect(11, 11 + y0, 3, 1, L.skin.d);
  g.block(hx, hy, 7, 8, L.skin);
  g.set(hx + 7, hy + 5, L.skin.b);          // nariz
  g.set(hx + 5, hy + 4, '#1a1014');         // ojo
  if (L.ears) { g.set(hx + 1, hy + 3, L.skin.b); g.set(hx, hy + 2, L.skin.l); }
  if (L.tusks) g.set(hx + 6, hy + 7, '#efe6d2');
  if (L.beard) {
    const barba = L.beardColor || L.hair;
    g.rect(hx + 3, hy + 5, 5, 4, barba.b); g.rect(hx + 4, hy + 9, 3, 1, barba.d);
  }
  if (L.head === 'yelmo') {
    g.rect(hx - 1, hy - 1, 9, 4, L.metal.b);
    g.rect(hx - 1, hy - 1, 9, 1, L.metal.l);
    g.rect(hx - 1, hy + 3, 3, 4, L.metal.d);
    g.rect(hx + 3, hy - 3, 2, 2, L.main.l);
  } else if (L.head === 'capucha') {
    g.rect(hx - 1, hy - 1, 8, 3, L.main.b);
    g.rect(hx - 1, hy - 1, 8, 1, L.main.l);
    g.rect(hx - 1, hy + 2, 4, 7, L.main.b);
    g.set(hx - 2, hy + 1, L.main.d);
  } else if (L.head === 'diadema') {
    g.rect(hx, hy, 7, 2, L.hair.b);
    g.rect(hx, hy + 2, 3, 5, L.hair.b);
    g.rect(hx, hy + 1, 7, 1, L.gold.b);
  } else if (L.head === 'pelo' || L.head === 'pelo_largo') {
    g.rect(hx, hy - 1, 7, 3, L.hair.b);
    g.rect(hx, hy - 1, 7, 1, L.hair.l);
    g.rect(hx, hy + 2, 3, L.head === 'pelo_largo' ? 10 : 4, L.hair.b);
  } else if (L.head === 'calvo') {
    g.set(hx + 3, hy, L.skin.h);
    g.rect(hx, hy + 2, 2, 3, L.hair.d);
  } else if (L.head === 'sombrero') {
    g.rect(hx - 2, hy + 1, 11, 1, L.leather.d);
    g.rect(hx, hy - 2, 7, 3, L.leather.b);
    g.rect(hx, hy, 7, 1, L.gold.d);
  }
  if (L.beard === 'larga') {
    const barba = L.beardColor || L.hair;
    g.rect(hx + 4, hy + 9, 3, 4, barba.b);
  }
  // Brazo delantero con el arma
  const swing = anim === 'walk' ? [0, -1, 0, 1][f] : 0;
  const arm = { x: 12 + swing, y: 13 + y0 };
  g.block(arm.x, arm.y, 2, 6, L.armor === 'placas' ? L.metal : L.main);
  g.rect(arm.x, arm.y + 6, 2, 2, L.skin.b);
  paintWeapon(g, L, arm, 1, atk);
  if (L.weapon === 'arco') g.block(6, 10 + y0, 3, 8, L.leather);   // carcaj
  if (L.offhand === 'escudo') { g.block(7, 14 + y0, 2, 7, L.leather); g.set(7, 14 + y0, L.metal.l); }
  g.outline(darkOf);
  return g;
}

// ---------------------------------------------------------------- hojas

const sheetCache = new Map();

// Hoja de fotogramas de un héroe (raza × clase). Se pinta una vez y se reutiliza.
export function heroSheet(raceId, classId) {
  return sheetFor(`heroe:${raceId}:${classId}`, () => heroLook(raceId, classId));
}

export function npcSheet(id) {
  return sheetFor(`npc:${id}`, () => npcLook(id));
}

function sheetFor(key, lookFn) {
  return buildSheet(key, FRAME_W, FRAME_H, (dir, anim, f) => paintHero(lookFn.cached ??= lookFn(), dir, anim, f));
}

// Monta una hoja completa llamando a `paint(dir, anim, f)` para cada
// fotograma. La usan héroes, NPCs y criaturas; cada uno con su tamaño.
export function buildSheet(key, fw, fh, paint) {
  if (sheetCache.has(key)) return sheetCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = fw * COLS;
  canvas.height = fh * ROWS;
  canvas.frameW = fw;
  canvas.frameH = fh;
  const ctx = canvas.getContext('2d');
  for (const [dir, row] of Object.entries(DIRS)) {
    for (const [anim, cols] of Object.entries(ANIMS)) {
      cols.forEach((col, f) => paint(dir, anim, f).drawTo(ctx, col * fw, row * fh));
    }
  }
  sheetCache.set(key, canvas);
  return canvas;
}

// ---------------------------------------------------------------- en el mundo

// Sprite animado que hace de "piel" de una entidad 3D. Lee la rotación del
// cuerpo para elegir orientación y si se mueve para elegir animación.
// Una textura base por hoja. Cada entidad necesita su propia textura (cada una
// muestra un fotograma distinto: offset y repeat son por textura), pero los
// clones comparten la imagen, y Three la sube a la tarjeta gráfica UNA vez.
// Sin esto, cada lobo y cada árbol subían su propia copia de la misma hoja.
const texturasBase = new WeakMap();
export function texturaDe(canvas) {
  let base = texturasBase.get(canvas);
  if (!base) {
    base = new THREE.CanvasTexture(canvas);
    base.magFilter = THREE.NearestFilter;
    base.minFilter = THREE.NearestFilter;
    base.generateMipmaps = false;
    base.colorSpace = THREE.SRGBColorSpace;
    texturasBase.set(canvas, base);
  }
  return base;
}

export class SpriteSkin {
  constructor(sheetCanvas, { height = 2.6 } = {}) {
    const tex = texturaDe(sheetCanvas).clone();
    tex.repeat.set(1 / COLS, 1 / ROWS);
    this.tex = tex;
    this.material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false });
    profundidadDePies(this.material);
    this.sprite = new THREE.Sprite(this.material);
    // Anclado por los pies: así pisa el suelo donde pisaba el muñeco 3D.
    this.sprite.center.set(0.5, 0.02);
    const fw = sheetCanvas.frameW || FRAME_W, fh = sheetCanvas.frameH || FRAME_H;
    this.sprite.scale.set(height * fw / fh, height, 1);
    this.t = 0;
    this.anim = 'idle';
    this.dir = 'S';
    this.flip = false;
    this.attackT = 0;
    this.setFrame(0);
  }

  setFrame(col) {
    const row = DIRS[this.dir];
    // La hoja tiene el origen de UV abajo a la izquierda: fila 0 = arriba.
    // El perfil izquierdo es el derecho al revés, y se voltea en la TEXTURA:
    // un sprite de Three toma su tamaño como la longitud de la escala, así que
    // una escala negativa no lo voltearía.
    this.tex.repeat.x = (this.flip ? -1 : 1) / COLS;
    this.tex.offset.set((col + (this.flip ? 1 : 0)) / COLS, 1 - (row + 1) / ROWS);
  }

  playAttack() { this.attackT = 0.32; }

  // rotY: rotación del cuerpo en el mundo. cameraYaw: hacia dónde mira la
  // cámara (aquí siempre al norte, 0). moving: si se está desplazando.
  update(dt, rotY, moving, cameraYaw = 0) {
    this.t += dt;
    // Orientación relativa a la cámara, en cuatro cuadrantes.
    let a = rotY - cameraYaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) <= Math.PI / 4) { this.dir = 'S'; this.flip = false; }
    else if (Math.abs(a) >= Math.PI * 3 / 4) { this.dir = 'N'; this.flip = false; }
    else { this.dir = 'E'; this.flip = a < 0; }

    let anim = moving ? 'walk' : 'idle';
    if (this.attackT > 0) { this.attackT -= dt; anim = 'attack'; }
    if (anim !== this.anim) { this.anim = anim; this.t = 0; }

    const cols = ANIMS[anim];
    const fps = anim === 'walk' ? 8 : anim === 'attack' ? 7 : 1.6;
    const i = anim === 'attack'
      ? Math.min(cols.length - 1, Math.floor((0.32 - this.attackT) * fps))
      : Math.floor(this.t * fps) % cols.length;
    this.setFrame(cols[i]);
  }

  // Destello al recibir un golpe (el muñeco 3D lo hacía con el emisivo).
  setTint(r, g, b) { this.material.color.setRGB(r, g, b); }
}

// ---- Profundidad por los pies ----
// La cámara mira hacia abajo a 60°, y un sprite que la encara no está de pie:
// está recostado hacia atrás, con la cabeza casi tres unidades al norte de los
// pies. Con la profundidad normal, cualquier muro que el héroe tuviera DETRÁS
// le cortaría la cabeza. El remedio clásico de los juegos 2.5D: el sprite
// entero usa la profundidad de sus pies. Lo que está delante de los pies lo
// tapa; lo de detrás, no. Exactamente como se espera en un juego cenital.
export function profundidadDePies(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vProfPie;\nvoid main() {')
      .replace('mvPosition.xy += rotatedPosition;', [
        'vec4 pie = modelViewMatrix[ 3 ];',
        // Un pelo hacia la cámara: que el suelo bajo los pies no lo tape.
        'pie.z += 0.6;',
        'vec4 pieClip = projectionMatrix * pie;',
        'vProfPie = pieClip.z / pieClip.w;',
        'mvPosition.xy += rotatedPosition;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vProfPie;\nvoid main() {')
      .replace(/}\s*$/, 'gl_FragDepth = vProfPie * 0.5 + 0.5;\n}');
  };
  material.customProgramCacheKey = () => 'sprite-profundidad-pies';
}

// Dirección "arriba" en pantalla, expresada en el mundo. Depende de la cámara
// de main.js (CAM_OFFSET = 0, 26, 15): su vertical de pantalla es
// perpendicular a ese vector. Si cambia la cámara, hay que cambiar esto.
export const CAMERA_UP = new THREE.Vector3(0, 15, -26).normalize();
const EJE_Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

// Coloca una etiqueta justo por encima del sprite en PANTALLA. Como el sprite
// se recuesta hacia la cámara, "encima" no es hacia arriba en el mundo sino a
// lo largo de CAMERA_UP. La etiqueta cuelga de un grupo que gira con el héroe,
// así que se compensa su giro.
export function placeLabelAbove(label, rotY, height) {
  tmp.copy(CAMERA_UP).multiplyScalar(height).applyAxisAngle(EJE_Y, -rotY);
  label.position.copy(tmp);
}

// Sombra en el suelo: sin el muñeco 3D no hay sombra proyectada, y sin sombra
// el sprite parece flotar. Un óvalo oscuro de pocos píxeles basta.
export function blobShadow(radius = 0.7) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(1, 0.6, 1);
  return m;
}

// ---------------------------------------------------------------- modo de arte

// Con el estilo píxel encendido se ven los sprites; apagado, los muñecos 3D de
// siempre. Así el interruptor de Ajustes sigue devolviendo el aspecto clásico.
export const artState = { sprites: true };

// Viste una entidad 3D con su piel de sprite. `root` es el grupo raíz (el que
// se mueve y gira); `body` el subgrupo de mallas que hasta ahora se veía.
// Altura en el mundo de un fotograma de héroe. Calibrada para que, con el
// píxel de 3 y la cámara del juego, cada píxel del dibujo caiga en UN píxel de
// pantalla: más pequeño, el sprite se encoge y pierde líneas; más grande, se
// emborrona en bloques de 2.
export const HERO_HEIGHT = 3.4;

export function dressWithSprite(root, body, sheet, { height = HERO_HEIGHT, shadow = 0.6 } = {}) {
  const skin = new SpriteSkin(sheet, { height });
  skin.sprite.name = 'skin';
  const sombra = blobShadow(shadow);
  root.add(skin.sprite);
  root.add(sombra);
  root.userData.skin = skin;
  root.userData.body = body;
  root.userData.shadow = sombra;
  applyArt(root);
  return skin;
}

export function applyArt(root) {
  const { skin, body, shadow } = root.userData;
  if (!skin) return;
  skin.sprite.visible = artState.sprites;
  if (shadow) shadow.visible = artState.sprites;
  // El cuerpo 3D se oculta pero sigue ahí: el raycaster de Three ignora la
  // visibilidad, así que continúa sirviendo de zona de clic.
  if (Array.isArray(body)) for (const b of body) b.visible = !artState.sprites;
  else if (body) body.visible = !artState.sprites;
}
