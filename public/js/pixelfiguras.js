// Figuras humanas en pixel art: héroes y NPCs.
//
// Segunda versión. La primera medía 24x32 con una cabeza de 8x8 que ocupaba
// casi un tercio del cuerpo: proporciones cabezonas, sin sitio para un solo
// detalle, y el resultado se veía simple. Esta mide 36x48 y se dibuja con
// proporciones heroicas: cabeza de 10 sobre 46, hombros anchos, torso que se
// estrecha hacia la cintura, piernas largas. Con eso caben los detalles que
// dan elegancia: peto con brillo y arista, hombreras redondas, tabardo con
// ribete, capas que caen por detrás, túnicas acampanadas con fajín, cejas,
// nariz, botas con vuelta, pomo con gema.
//
// Cada figura se compone de piezas independientes: armadura, capa, tocado,
// barba, arma y escudo. Héroes (raza × clase) y NPCs son recetas sobre ellas.
import { RACES } from './races.js';
import { Grid, ramp, darkOf, buildSheet } from './pixelsprites.js';

export const FIG_W = 36;
export const FIG_H = 48;

const NEGRO = '#140c12';
const BLANCO_OJO = '#e8e0d8';

// ---------------------------------------------------------------- apariencias

const HAIR = { humano: 0x5a3a22, elfo: 0xe8d088, enano: 0xa8502a, orco: 0x1e1a18 };

const CLASS_LOOK = {
  guerrero:   { main: 0x9a2a22, metal: 0xa4aebe, leather: 0x5a3a24, head: 'yelmo', weapon: 'espada', offhand: 'escudo', armor: 'placas', cloak: true, cape: 0x6a1a18 },
  explorador: { main: 0x3f6b34, metal: 0x8a8070, leather: 0x6a4428, head: 'capucha', weapon: 'arco', armor: 'cuero', cloak: true, cape: 0x2e5226 },
  sacerdote:  { main: 0xe8dcc0, metal: 0xd9a441, leather: 0x7a5a3a, head: 'diadema', weapon: 'baculo', armor: 'tunica', trim: 0xd9a441 },
};

const NPC_LOOKS = {
  aldric:   { race: 'humano', main: 0x4a3a7a, armor: 'tunica', head: 'pelo', hair: 0xe8e4dc, beard: 'larga', weapon: 'baculo', glow: 0xc9a4f0, trim: 0xd9a441 },
  bramm:    { race: 'humano', main: 0x8a5a3a, armor: 'delantal', head: 'calvo', hair: 0x3a2416, beard: 'corta', weapon: 'martillo', bulk: 1, leather: 0x4a2e1c },
  lyra:     { race: 'humano', main: 0x9a6a2a, armor: 'cuero', head: 'pelo_largo', hair: 0xb04a2a, leather: 0x6a4428, cloak: true, cape: 0x6a2a3a },
  toran:    { race: 'humano', main: 0x2e4a6e, armor: 'placas', head: 'yelmo', weapon: 'lanza', offhand: 'escudo', cloak: true, cape: 0x1e3050 },
  mira:     { race: 'elfo', main: 0xece4f4, armor: 'tunica', head: 'diadema', hair: 0xe8d8a8, weapon: 'baculo', trim: 0x8a7ad0 },
  baldur:   { race: 'humano', main: 0x4a5a3a, armor: 'tunica', head: 'capucha', hair: 0xd8d4cc, beard: 'larga', beardColor: 0xd8d4cc, weapon: 'baculo', glow: 0xb8f070, trim: 0x8a7a4a },
  nyra:     { race: 'elfo', main: 0x7a5a3a, armor: 'cuero', head: 'capucha', weapon: 'arco', cloak: true, cape: 0x4a3a28 },
  ysra:     { race: 'humano', main: 0x3e5266, armor: 'tunica', head: 'capucha', weapon: 'baculo', glow: 0x9fe8c8, trim: 0x9fb8c8 },
  skadi:    { race: 'humano', main: 0xc8d6e0, armor: 'cuero', head: 'capucha', weapon: 'arco', cloak: true, cape: 0xe8f0f6, leather: 0x8a7a6a },
  establo:  { race: 'humano', main: 0x7a5a38, armor: 'cuero', head: 'sombrero', hair: 0x5a3a22, leather: 0x5a3a24 },
  subastas: { race: 'humano', main: 0x3a3a62, armor: 'tunica', head: 'pelo', hair: 0x9a9aa0, beard: 'corta', beardColor: 0x9a9aa0, trim: 0xd9a441 },
};

function buildLook(spec) {
  const race = RACES[spec.race] || RACES.humano;
  const armor = spec.armor || 'cuero';
  return {
    race: spec.race,
    skin: ramp(spec.skin ?? race.skin),
    hair: ramp(spec.hair ?? HAIR[spec.race] ?? HAIR.humano),
    beardColor: spec.beardColor ? ramp(spec.beardColor) : null,
    main: ramp(spec.main),
    cape: ramp(spec.cape ?? spec.main),
    trim: ramp(spec.trim ?? 0xd9a441),
    metal: ramp(spec.metal ?? 0xa4aebe),
    leather: ramp(spec.leather ?? 0x5a3a24),
    boots: ramp(0x3e2c22),
    wood: ramp(0x7a5230),
    glow: ramp(spec.glow ?? 0x9fe8ff),
    gold: ramp(0xd9a441),
    head: spec.head,
    weapon: spec.weapon || null,
    offhand: spec.offhand || null,
    armor,
    cloak: !!spec.cloak,
    ears: !!race.ears,
    beard: spec.beard ?? (race.beard ? 'corta' : false),
    tusks: !!race.tusks,
    short: spec.race === 'enano' ? 5 : 0,       // el enano es bastante más bajo
    bulk: spec.bulk ?? (spec.race === 'orco' || spec.race === 'enano' ? 1 : 0),
  };
}

export function heroLook(raceId, classId) {
  return buildLook({ ...(CLASS_LOOK[classId] || CLASS_LOOK.guerrero), race: raceId });
}

export function npcLook(id) {
  return buildLook(NPC_LOOKS[id] || { race: 'humano', main: 0x6a6a7a, armor: 'cuero', head: 'pelo' });
}

// ---------------------------------------------------------------- primitivas

// Miembro vertical con volumen: luz a la izquierda, sombra a la derecha.
function miembro(g, x, y0, y1, w, r) {
  for (let y = y0; y <= y1; y++) {
    g.rect(x, y, w, 1, r.b);
    g.set(x, y, r.l);
    if (w > 2) g.set(x + w - 1, y, r.d);
  }
}

// Fila simétrica centrada en la figura (columnas 18-hw .. 17+hw).
function fila(g, y, hw, col, cx = 18) {
  g.rect(cx - hw, y, hw * 2, 1, col);
}

// Torso estrechándose hacia la cintura. `anchos` es la mitad del ancho por fila.
function torso(g, y0, anchos, r, { cx = 18, brillo = true } = {}) {
  anchos.forEach((hw, i) => {
    const y = y0 + i;
    fila(g, y, hw, r.b, cx);
    g.set(cx - hw, y, r.l);
    g.set(cx + hw - 1, y, r.d);
    g.set(cx + hw - 2, y, r.d);
  });
  if (brillo) for (let i = 1; i < 4; i++) g.set(cx - anchos[i] + 2, y0 + i, r.h);
}

// ---------------------------------------------------------------- la figura

const PASO = [0, 2, 0, -2];        // pierna que se levanta en cada fotograma
const BRAZO = [0, 1, 0, -1];

function pintarFigura(L, dir, anim, f) {
  const g = new Grid(FIG_W, FIG_H);
  if (dir === 'E') return pintarPerfil(g, L, anim, f);

  const frente = dir === 'S';
  const T = L.short;                                   // el enano empieza más abajo
  const respira = anim === 'idle' && f === 1 ? 1 : 0;
  const bote = anim === 'walk' && (f === 1 || f === 3) ? 1 : 0;
  const y0 = T + respira + bote;                       // desplazamiento de tronco y cabeza
  const paso = anim === 'walk' ? PASO[f] : 0;
  const atk = anim === 'attack' ? f : -1;
  const B = L.bulk;
  const tunica = L.armor === 'tunica';

  // ---- capa: de frente asoma por detrás del cuerpo; de espaldas se pinta
  // más abajo, ENCIMA de la espalda (antes el cuerpo la tapaba entera)
  if (L.cloak && frente) pintarCapa(g, L, true, y0, B, anim, f);

  // ---- piernas y botas
  const piernas = [[13 - B, paso > 0 ? 2 : 0], [19, paso < 0 ? 2 : 0]];
  if (!tunica) {
    for (const [x, sube] of piernas) {
      const w = 4 + B;
      const pierna = L.armor === 'placas' ? L.metal : L.leather;
      miembro(g, x, 31 + T, 39 + T - sube, w, pierna);
      if (L.armor === 'placas') g.set(x + 1, 35 + T - sube, pierna.h);      // rodillera
      // Bota con vuelta y suela
      miembro(g, x - (x < 18 ? 1 : 0), 40 + T - sube, 44 - sube, w + 1, L.boots);
      g.rect(x - (x < 18 ? 1 : 0), 40 + T - sube, w + 1, 1, L.boots.l);
      g.rect(x - (x < 18 ? 1 : 0), 45 - sube, w + 1, 1, NEGRO);
    }
  } else {
    // Bajo de la túnica: solo asoman las puntas de las botas
    g.rect(13, 44, 4, 2, L.boots.b); g.rect(19, 44, 4, 2, L.boots.b);
    g.rect(13, 45, 4, 1, NEGRO); g.rect(19, 45, 4, 1, NEGRO);
  }

  // ---- tronco según la armadura
  const anchos = [7, 7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 5, 6].map((w) => w + B);
  if (tunica) {
    // Túnica acampanada desde el pecho hasta los pies, con fajín y ribete
    torso(g, 17 + y0, anchos.slice(0, 11), L.main);
    for (let y = 28 + y0; y <= 44; y++) {
      const hw = Math.min(10, 5 + Math.round((y - 28) * 0.32)) + B;
      fila(g, y, hw, L.main.b);
      g.set(18 - hw, y, L.main.l);
      g.set(17 + hw, y, L.main.d); g.set(16 + hw, y, L.main.d);
      if (y > 31) { g.set(14, y, L.main.d); g.set(21, y, L.main.d); }               // caída de los pliegues
    }
    fila(g, 44, 10 + B, L.trim.d);                                        // ribete del bajo
    for (let y = 18 + y0; y < 44; y++) { g.set(17, y, L.trim.b); g.set(18, y, L.trim.d); }   // ribete central
    fila(g, 27 + y0, 5 + B, L.trim.b); fila(g, 28 + y0, 5 + B, L.trim.d);              // fajín
    // Escote en pico
    g.set(17, 17 + y0, L.skin.d); g.set(18, 17 + y0, L.skin.d); g.set(17, 18 + y0, L.skin.d);
  } else if (L.armor === 'placas') {
    torso(g, 17 + y0, anchos, L.metal);
    // Arista central del peto y su brillo
    for (let y = 18 + y0; y < 27 + y0; y++) g.set(17, y, L.metal.h);
    // Tabardo con ribete dorado y la cruz de Valdoria
    for (let y = 22 + y0; y <= 38 + T; y++) {
      g.rect(15, y, 6, 1, L.main.b);
      g.set(15, y, L.trim.b); g.set(20, y, L.trim.d);
    }
    g.rect(15, 38 + T, 6, 1, L.trim.b);
    if (frente) { g.rect(17, 25 + y0, 2, 6, L.gold.l); g.rect(16, 27 + y0, 4, 2, L.gold.l); }
    // Cinturón con hebilla
    fila(g, 29 + y0, 6 + B, L.leather.d);
    g.rect(17, 29 + y0, 2, 1, L.gold.h);
  } else if (L.armor === 'delantal') {
    torso(g, 17 + y0, anchos, L.main);
    // Delantal de cuero de pecho a rodillas, con su bolsillo
    for (let y = 21 + y0; y <= 38 + T; y++) {
      const hw = y < 29 + y0 ? 4 : 5;
      fila(g, y, hw + B, L.leather.b);
      g.set(18 - hw - B, y, L.leather.l); g.set(17 + hw + B, y, L.leather.d);
    }
    g.rect(16, 31 + y0, 4, 3, L.leather.d);
    g.set(15, 20 + y0, L.leather.d); g.set(20, 20 + y0, L.leather.d);       // tirantes
  } else {
    // Cuero: jubón con costuras, correa cruzada y cinturón con bolsa
    torso(g, 17 + y0, anchos, L.main);
    for (let i = 0; i < 11; i++) g.set(12 + i, 18 + y0 + i, L.leather.b);
    for (let i = 0; i < 11; i++) if (i % 2 === 0) g.set(13 + i, 18 + y0 + i, L.leather.l);
    fila(g, 29 + y0, 6 + B, L.leather.d);
    g.rect(17, 29 + y0, 2, 1, L.gold.b);
    g.rect(20 + B, 30 + y0, 3, 3, L.leather.b); g.set(20 + B, 30 + y0, L.leather.l);   // bolsa
    // Calzas bajo el jubón
    fila(g, 30 + y0, 5 + B, L.leather.d);
  }

  // ---- brazos (se balancean al andar; el del arma se alza al atacar)
  const balanceo = anim === 'walk' ? BRAZO[f] : 0;
  const brazoIzq = { x: 9 - B, y: 18 + y0 - balanceo };    // izquierda de la pantalla
  const brazoDer = { x: 25 + B, y: 18 + y0 + balanceo };
  const manoArma = frente ? brazoIzq : brazoDer;
  if (atk === 0) manoArma.y -= 6;
  for (const a of [brazoIzq, brazoDer]) {
    const manga = L.armor === 'placas' ? L.metal : L.main;
    if (tunica) {
      // Manga acampanada del brazo
      miembro(g, a.x, a.y, a.y + 6, 3, manga);
      g.rect(a.x - 1, a.y + 7, 5, 3, manga.b);
      g.set(a.x - 1, a.y + 7, manga.l); g.set(a.x + 3, a.y + 9, manga.d);
      g.rect(a.x, a.y + 10, 3, 2, L.skin.b);
    } else {
      miembro(g, a.x, a.y, a.y + 6, 3, manga);
      // Antebrazo: guantelete, brazal de cuero o manga remangada
      const ante = L.armor === 'placas' ? L.metal : L.armor === 'delantal' ? L.skin : L.leather;
      miembro(g, a.x, a.y + 7, a.y + 11, 3, ante);
      if (L.armor === 'placas') g.rect(a.x, a.y + 7, 3, 1, L.metal.h);
      g.rect(a.x, a.y + 12, 3, 2, L.skin.b);
      g.set(a.x + 2, a.y + 13, L.skin.d);
    }
  }
  if (L.cloak && !frente) pintarCapa(g, L, false, y0, B, anim, f);
  // Hombreras redondas de la armadura de placas
  if (L.armor === 'placas') {
    g.blob(10 - B, 18 + y0, 3, 2.4, L.metal);
    g.blob(26 + B, 18 + y0, 3, 2.4, L.metal);
  }

  // ---- cuello y cabeza
  g.rect(16, 15 + y0, 4, 2, L.skin.d);
  const cx = 17.5, cy = 10.5 + y0;
  g.blob(cx, cy, 4.6, 5.2, L.skin, true);
  if (L.tusks) { g.blob(cx, cy + 3, 4.4, 2.2, L.skin, true); }                 // mandíbula ancha
  if (L.ears) {
    // Orejas de elfo, largas y puntiagudas
    for (const [x, l] of [[12, -1], [23, 1]]) {
      g.set(x, Math.round(cy), L.skin.b); g.set(x + l, Math.round(cy) - 1, L.skin.b);
      g.set(x + 2 * l, Math.round(cy) - 2, L.skin.l);
    }
  }
  // Primero el peinado; después la cara ENCIMA. Al revés, el pelo tapaba los
  // ojos. El yelmo y la capucha dibujan su propia cara (visera, sombra).
  pintarTocado(g, L, frente, cx, cy);
  if (frente && L.head !== 'yelmo' && L.head !== 'capucha') pintarCara(g, L, cy);
  pintarBarba(g, L, frente, cy);

  // ---- arma y escudo
  pintarArma(g, L, manoArma, frente ? -1 : 1, atk);
  if (L.offhand === 'escudo') {
    const otra = frente ? brazoDer : brazoIzq;
    pintarEscudo(g, L, otra.x + (frente ? -1 : -4), otra.y + 4, frente);
  }
  if (L.weapon === 'arco' && !frente) {
    // Carcaj a la espalda con plumas
    for (let y = 16 + y0; y < 28 + y0; y++) g.rect(21, y, 3, 1, L.leather.b);
    g.set(21, 15 + y0, '#e8e0d0'); g.set(23, 14 + y0, '#d84040'); g.set(22, 15 + y0, '#e8e0d0');
  }

  g.outline(darkOf);
  return g;
}

// Capa. De frente solo asoma por los lados, entre brazo y cuerpo. De espaldas
// cubre la espalda de hombro a pantorrilla: broche en los hombros, pliegues
// verticales que se abren hacia abajo y un bajo que ondea al andar.
function pintarCapa(g, L, frente, y0, B, anim, f) {
  const capa = L.cape;
  const ondea = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
  const bajo = frente ? 43 : 41;
  for (let y = 17 + y0; y <= bajo; y++) {
    const t = (y - 17) / 26;
    const hw = Math.round(7 + t * 3) + B;
    if (frente) {
      g.set(18 - hw - 1, y, capa.d); g.set(18 - hw, y, capa.b);
      g.set(17 + hw, y, capa.b); g.set(18 + hw, y, capa.d);
      continue;
    }
    const dx = t > 0.6 ? ondea : 0;
    fila(g, y, hw, capa.b, 18 + dx);
    g.set(18 - hw + dx, y, capa.l); g.set(19 - hw + dx, y, capa.l);
    g.set(17 + hw + dx, y, capa.d); g.set(16 + hw + dx, y, capa.d);
    // Pliegues: tres surcos que se separan al bajar, con su luz al lado
    for (const k of [-1, 0, 1]) {
      const x = 18 + dx + Math.round(k * (2 + t * 4));
      if (y > 20 + y0) { g.set(x, y, capa.d); g.set(x - 1, y, capa.l); }
    }
  }
  // Bajo irregular y forro asomando
  for (let x = 18 - 10 - B; x < 18 + 10 + B; x++) g.set(x + ondea, bajo + 1, x % 3 === 0 ? capa.d : capa.o);
  // Cuello de la capa y broches dorados en los hombros
  fila(g, 17 + y0, 7 + B, capa.l);
  g.set(12 - B, 17 + y0, L.gold.h); g.set(23 + B, 17 + y0, L.gold.h);
}

// Cejas, ojos con su blanco, nariz y boca.
function pintarCara(g, L, cy) {
  const ojoY = Math.round(cy);
  g.set(15, ojoY - 2, L.hair.d); g.set(16, ojoY - 2, L.hair.d);
  g.set(19, ojoY - 2, L.hair.d); g.set(20, ojoY - 2, L.hair.d);
  g.set(15, ojoY, BLANCO_OJO); g.set(16, ojoY, NEGRO);
  g.set(19, ojoY, NEGRO); g.set(20, ojoY, BLANCO_OJO);
  g.set(18, ojoY + 1, L.skin.d); g.set(18, ojoY + 2, L.skin.d);
  g.set(17, ojoY + 4, L.skin.d); g.set(18, ojoY + 4, L.skin.d);
  if (L.tusks) { g.set(15, ojoY + 4, BLANCO_OJO); g.set(20, ojoY + 4, BLANCO_OJO); }
}

function pintarBarba(g, L, frente, cy) {
  if (!L.beard || !frente) return;
  const b = L.beardColor || L.hair;
  const y = Math.round(cy) + 2;
  for (let i = 0; i < 4; i++) fila(g, y + i, 4 - Math.floor(i / 2), i === 0 ? b.l : b.b);
  g.set(17, y + 2, L.skin.d); g.set(18, y + 2, L.skin.d);       // boca entre la barba
  if (L.beard === 'larga') {
    for (let i = 4; i < 11; i++) fila(g, y + i, Math.max(1, 3 - Math.floor((i - 4) / 3)), i % 3 === 0 ? b.l : b.b);
  }
}

function pintarTocado(g, L, frente, cx, cy) {
  const top = Math.round(cy - 5.2);
  const h = L.hair;
  switch (L.head) {
    case 'yelmo': {
      const m = L.metal;
      g.blob(cx, cy - 1.5, 5.4, 4.6, m);
      if (frente) {
        g.rect(13, Math.round(cy), 10, 1, NEGRO);                       // rendija de la visera
        g.set(15, Math.round(cy), '#ffd860'); g.set(20, Math.round(cy), '#ffd860');
        g.rect(17, Math.round(cy) - 2, 2, 5, m.l);                      // nasal
        g.rect(13, Math.round(cy) + 1, 1, 3, m.b); g.rect(22, Math.round(cy) + 1, 1, 3, m.d);   // carrilleras
      } else {
        g.blob(cx, cy, 5, 5, m);
      }
      // Penacho que cae hacia atrás
      for (let i = 0; i < 6; i++) g.rect(17 + Math.floor(i / 3), top - 2 + i, 2, 1, i < 2 ? L.main.l : L.main.b);
      g.set(17, top - 3, L.main.h);
      break;
    }
    case 'capucha': {
      const c = L.cloak ? L.cape : L.main;
      g.blob(cx, cy - 1, 5.8, 5.6, c);
      if (frente) {
        g.blob(cx, cy + 1, 3.6, 3.6, L.skin, true);                       // cara en la abertura
        g.rect(14, Math.round(cy) - 2, 8, 1, c.d);                        // sombra del borde
        g.set(15, Math.round(cy), NEGRO); g.set(20, Math.round(cy), NEGRO);
        g.set(16, Math.round(cy), BLANCO_OJO); g.set(19, Math.round(cy), BLANCO_OJO);
        g.set(18, Math.round(cy) + 2, L.skin.d);
      }
      // Caída de la capucha sobre los hombros
      g.rect(12, Math.round(cy) + 4, 12, 2, c.b);
      g.set(12, Math.round(cy) + 4, c.l); g.set(23, Math.round(cy) + 5, c.d);
      g.set(Math.round(cx), top - 1, c.l);                                // pico
      break;
    }
    case 'diadema':
    case 'pelo_largo': {
      g.blob(cx, cy - 3, 5.2, 3, h);
      for (let y = Math.round(cy) - 1; y < Math.round(cy) + 9; y++) {
        g.rect(12, y, 2, 1, h.b); g.rect(22, y, 2, 1, h.d);
      }
      if (!frente) for (let y = Math.round(cy); y < Math.round(cy) + 10; y++) fila(g, y, 5, h.b);
      // Mechones y brillo
      g.set(15, top + 1, h.h); g.set(16, top + 1, h.h); g.set(14, top + 2, h.l);
      if (frente) for (let x = 14; x < 22; x += 2) g.set(x, top + 4, h.d);
      if (L.head === 'diadema') {
        g.rect(13, top + 3, 10, 1, L.gold.b);
        g.set(17, top + 3, L.glow.h); g.set(18, top + 3, L.glow.b);
      }
      break;
    }
    case 'pelo': {
      g.blob(cx, cy - 3, 5, 2.8, h);
      g.rect(13, Math.round(cy) - 2, 1, 3, h.b); g.rect(22, Math.round(cy) - 2, 1, 3, h.d);
      if (!frente) g.blob(cx, cy, 4.8, 4.8, h);
      g.set(15, top + 1, h.h); g.set(16, top + 1, h.h);
      if (frente) for (let x = 14; x < 22; x += 2) g.set(x, top + 3, h.d);
      break;
    }
    case 'calvo': {
      g.set(16, top + 1, L.skin.h); g.set(17, top + 1, L.skin.h); g.set(16, top + 2, L.skin.h);
      g.rect(13, Math.round(cy) - 1, 1, 4, h.d); g.rect(22, Math.round(cy) - 1, 1, 4, h.d);
      break;
    }
    case 'sombrero': {
      const s = L.leather;
      g.rect(10, top + 3, 16, 2, s.d);                                  // ala
      g.rect(10, top + 3, 16, 1, s.b);
      g.blob(cx, top + 1, 4.5, 2.6, s);                                 // copa
      g.rect(13, top + 2, 10, 1, L.gold.d);                             // cinta
      break;
    }
    default: break;
  }
}

function pintarArma(g, L, mano, lado, atk) {
  const hx = mano.x + (lado < 0 ? 0 : 2);
  const hy = mano.y + 12;
  switch (L.weapon) {
    case 'espada': {
      const filo = L.metal;
      if (atk === 1) {
        // Tajo en diagonal, con estela
        for (let j = 0; j < 14; j++) { g.set(hx - lado * j, hy + 1 + Math.floor(j / 2), filo.h); g.set(hx - lado * j, hy + 2 + Math.floor(j / 2), filo.d); }
      } else {
        for (let j = 2; j < 18; j++) {
          g.set(hx - 1, hy - j, filo.l); g.set(hx, hy - j, filo.h); g.set(hx + 1, hy - j, filo.d);
        }
        g.set(hx, hy - 18, filo.h);
        g.rect(hx - 3, hy - 1, 7, 1, L.gold.b);                         // guarda
        g.set(hx - 3, hy - 1, L.gold.l); g.set(hx + 3, hy - 1, L.gold.d);
        g.rect(hx, hy, 1, 2, L.leather.d);                              // empuñadura
        g.set(hx, hy + 2, '#d84040');                                   // pomo con gema
      }
      break;
    }
    case 'arco': {
      const bx = hx + lado * 2;
      const tensa = atk === 0 ? 1 : 0;
      for (let j = -11; j <= 6; j++) {
        const curva = Math.round(Math.abs(j + 2.5) / 4.5);
        g.set(bx + lado * (curva - tensa), hy + j - 4, j % 6 === 0 ? L.wood.l : L.wood.b);
      }
      for (let j = -10; j <= 5; j++) g.set(bx + lado * (3 - tensa), hy + j - 4, '#e8e0d0');
      break;
    }
    case 'baculo': {
      for (let j = -22; j < 12; j++) g.set(hx, hy + j, j % 5 === 0 ? L.wood.d : L.wood.b);
      for (let j = -22; j < 12; j += 3) g.set(hx - 1, hy + j, L.wood.l);
      const oy = hy - 25 + (atk === 0 ? -1 : 0);
      g.blob(hx, oy, 2.2, 2.2, L.glow);                                 // orbe
      g.set(hx - 1, oy - 1, '#ffffff');
      g.set(hx - 2, oy + 2, L.wood.b); g.set(hx + 2, oy + 2, L.wood.b); // garras que lo sujetan
      if (atk >= 0) for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [-3, -3], [3, -3]]) g.set(hx + dx, oy + dy, L.glow.h);
      break;
    }
    case 'martillo': {
      for (let j = 0; j < 12; j++) g.set(hx, hy - j, L.wood.b);
      const my = hy - (atk === 0 ? 16 : 14);
      g.rect(hx - 3, my, 7, 4, L.metal.b);
      g.rect(hx - 3, my, 7, 1, L.metal.l);
      g.rect(hx - 3, my + 3, 7, 1, L.metal.d);
      break;
    }
    case 'lanza': {
      for (let j = -18; j < 12; j++) g.set(hx, hy + j, j % 6 === 0 ? L.wood.d : L.wood.b);
      g.set(hx, hy - 23, L.metal.h);
      g.rect(hx - 1, hy - 22, 3, 3, L.metal.b); g.set(hx - 1, hy - 22, L.metal.l);
      g.rect(hx - 1, hy - 19, 3, 1, L.main.b);                          // banderola
      break;
    }
    default: break;
  }
}

function pintarEscudo(g, L, x, y, frente) {
  // Escudo de cometa: ancho arriba, en punta abajo, con borde y emblema
  const cuerpo = L.main, borde = L.metal;
  for (let j = 0; j < 12; j++) {
    const hw = j < 7 ? 4 : Math.max(1, 4 - (j - 6));
    g.rect(x + 4 - hw, y + j, hw * 2, 1, j === 0 ? borde.l : cuerpo.b);
    g.set(x + 4 - hw, y + j, borde.b); g.set(x + 3 + hw, y + j, borde.d);
  }
  if (frente) {
    g.rect(x + 3, y + 2, 2, 7, L.gold.b);
    g.rect(x + 1, y + 4, 6, 2, L.gold.b);
    g.set(x + 3, y + 2, L.gold.h);
  }
}

// ---- perfil derecho (el izquierdo es su espejo)
function pintarPerfil(g, L, anim, f) {
  const T = L.short;
  const respira = anim === 'idle' && f === 1 ? 1 : 0;
  const bote = anim === 'walk' && (f === 1 || f === 3) ? 1 : 0;
  const y0 = T + respira + bote;
  const tijera = anim === 'walk' ? [0, 3, 0, -3][f] : 0;
  const atk = anim === 'attack' ? f : -1;
  const B = L.bulk;
  const tunica = L.armor === 'tunica';

  if (L.cloak) {
    for (let y = 17 + y0; y <= 43; y++) {
      const ond = Math.round(Math.sin(y * 0.4 + f) * 0.6);
      g.rect(11 - Math.floor((y - 17) / 9) + ond, y, 4, 1, L.cape.b);
      g.set(11 - Math.floor((y - 17) / 9) + ond, y, L.cape.l);
    }
  }
  // Piernas en tijera
  if (!tunica) {
    const pierna = L.armor === 'placas' ? L.metal : L.leather;
    for (const [d, oscura] of [[-tijera, true], [tijera, false]]) {
      const r = oscura ? { ...pierna, b: pierna.d, l: pierna.d } : pierna;
      for (let y = 31 + T; y <= 39 + T; y++) {
        const x = 16 + Math.round(d * (y - 31 - T) / 9);
        g.rect(x, y, 4 + B, 1, r.b); g.set(x, y, r.l);
      }
      const px = 16 + d;
      g.rect(px, 40 + T, 6, 5 - T, L.boots.b); g.rect(px, 40 + T, 6, 1, L.boots.l);
      g.rect(px, 45, 6, 1, NEGRO);
    }
  } else {
    for (let y = 28 + y0; y <= 44; y++) {
      const ancho = 8 + Math.round((y - 28) * 0.3) + B;
      g.rect(14, y, ancho, 1, L.main.b); g.set(14, y, L.main.l); g.set(13 + ancho, y, L.main.d);
    }
    g.rect(14, 44, 12 + B, 1, L.trim.d);
    g.rect(17 + Math.max(0, tijera), 44, 5, 2, L.boots.b);
  }
  // Tronco de perfil, con el pecho hacia delante
  const anchos = [4, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 5];
  anchos.forEach((hw, i) => {
    const y = 17 + y0 + i;
    const r = L.armor === 'placas' ? L.metal : L.main;
    g.rect(15, y, hw * 2 + B, 1, r.b); g.set(15, y, r.l); g.set(14 + hw * 2 + B, y, r.d);
  });
  if (L.armor === 'placas') { for (let y = 22 + y0; y <= 38 + T; y++) g.rect(21 + B, y, 2, 1, L.main.b); g.blob(18, 18 + y0, 3, 2.4, L.metal); }
  if (L.armor === 'delantal') for (let y = 21 + y0; y <= 38 + T; y++) g.rect(21 + B, y, 2, 1, L.leather.b);
  if (tunica) { g.rect(15, 27 + y0, 10 + B, 1, L.trim.b); for (let y = 18 + y0; y < 44; y++) g.set(22 + B, y, L.trim.d); }
  g.rect(15, 29 + y0, 10 + B, 1, L.leather.d);
  // Cabeza de perfil: nariz, ojo, oreja
  g.rect(17, 15 + y0, 4, 2, L.skin.d);
  const cx = 18.5, cy = 10.5 + y0;
  g.blob(cx, cy, 4.4, 5.2, L.skin, true);
  g.set(23, Math.round(cy) + 1, L.skin.b); g.set(23, Math.round(cy) + 2, L.skin.d);          // nariz
  g.set(21, Math.round(cy), NEGRO); g.set(20, Math.round(cy) - 2, L.hair.d);                 // ojo y ceja
  g.set(21, Math.round(cy) + 4, L.skin.d);                                                   // boca
  if (L.ears) { g.set(16, Math.round(cy), L.skin.b); g.set(15, Math.round(cy) - 1, L.skin.b); g.set(14, Math.round(cy) - 2, L.skin.l); }
  if (L.tusks) g.set(22, Math.round(cy) + 4, BLANCO_OJO);
  if (L.beard) {
    const b = L.beardColor || L.hair;
    g.rect(18, Math.round(cy) + 2, 5, 4, b.b);
    if (L.beard === 'larga') g.rect(19, Math.round(cy) + 6, 3, 6, b.b);
  }
  // Tocado de perfil
  const top = Math.round(cy - 5.2);
  const h = L.hair;
  if (L.head === 'yelmo') {
    g.blob(cx - 0.5, cy - 1, 5.2, 4.8, L.metal);
    g.rect(20, Math.round(cy), 4, 1, NEGRO); g.set(21, Math.round(cy), '#ffd860');
    for (let i = 0; i < 7; i++) g.rect(15 - Math.floor(i / 2), top - 1 + i, 2, 1, i < 2 ? L.main.l : L.main.b);
  } else if (L.head === 'capucha') {
    const c = L.cloak ? L.cape : L.main;
    g.blob(cx - 1, cy - 1, 5.4, 5.6, c);
    g.blob(cx + 1.5, cy + 1, 2.6, 3.4, L.skin);
    g.set(22, Math.round(cy), NEGRO);
    g.set(13, top + 1, c.l);
  } else if (L.head === 'pelo' || L.head === 'pelo_largo' || L.head === 'diadema') {
    g.blob(cx - 1, cy - 2.5, 4.6, 3.4, h);
    g.rect(14, Math.round(cy) - 2, 3, L.head === 'pelo' ? 4 : 11, h.b);
    g.set(16, top + 1, h.h);
    if (L.head === 'diadema') { g.rect(15, top + 3, 9, 1, L.gold.b); g.set(22, top + 3, L.glow.h); }
  } else if (L.head === 'calvo') {
    g.set(18, top + 1, L.skin.h); g.rect(15, Math.round(cy) - 1, 2, 4, h.d);
  } else if (L.head === 'sombrero') {
    g.rect(12, top + 3, 14, 1, L.leather.d);
    g.blob(cx - 0.5, top + 1, 4.2, 2.4, L.leather);
    g.rect(15, top + 2, 8, 1, L.gold.d);
  }
  // Brazo delantero con el arma
  const balanceo = anim === 'walk' ? [0, -2, 0, 2][f] : 0;
  const brazo = { x: 18 + balanceo, y: 18 + y0 + (atk === 0 ? -6 : 0) };
  const manga = L.armor === 'placas' ? L.metal : L.main;
  miembro(g, brazo.x, brazo.y, brazo.y + 6, 3, manga);
  miembro(g, brazo.x, brazo.y + 7, brazo.y + 11, 3, L.armor === 'placas' ? L.metal : L.armor === 'delantal' ? L.skin : (tunica ? L.main : L.leather));
  g.rect(brazo.x, brazo.y + 12, 3, 2, L.skin.b);
  pintarArma(g, L, brazo, 1, atk);
  if (L.offhand === 'escudo') { for (let y = 21 + y0; y < 33 + y0; y++) g.rect(12, y, 2, 1, L.main.b); g.rect(12, 21 + y0, 2, 1, L.metal.l); }
  if (L.weapon === 'arco') { for (let y = 16 + y0; y < 28 + y0; y++) g.rect(12, y, 3, 1, L.leather.b); g.set(12, 15 + y0, '#e8e0d0'); }
  g.outline(darkOf);
  return g;
}

// ---------------------------------------------------------------- hojas

export function heroSheet(raceId, classId) {
  const L = heroLook(raceId, classId);
  return buildSheet(`figura:heroe:${raceId}:${classId}`, FIG_W, FIG_H, (dir, anim, f) => pintarFigura(L, dir, anim, f));
}

export function npcSheet(id) {
  const L = npcLook(id);
  return buildSheet(`figura:npc:${id}`, FIG_W, FIG_H, (dir, anim, f) => pintarFigura(L, dir, anim, f));
}
