// Las Profundidades: la escalera sin fondo bajo la Ciudadela.
//
// Es la pareja del botín aleatorio. Los afijos hacen que merezca la pena volver
// a matar; esto da un sitio al que volver que nunca se agota, porque cada
// descenso es más duro y suelta mejores tiradas que el anterior.
//
// Cada héroe baja a SU propia instancia (un reino aparte que nace al entrar y
// muere al salir), así que nadie te vacía la sala ni te espera en la puerta.
// Lo que sí es común es la SEMILLA de la semana: todos los que bajen al piso 7
// esta semana se encuentran exactamente la misma sala. Se compite por quién
// llega más hondo sin necesidad de coincidir con nadie, que es justo lo que
// hace falta cuando no hay mucha gente conectada a la vez.
import { MOB_TYPES } from './mobs-data.js';
import { thisWeekNumber } from '../public/js/bounties.js';

// Interior propio, lejos del mundo (|x| <= 200) y de las criptas (500-900).
export const DEPTHS_ORIGIN = [2000, 0];
export const DEPTHS_RADIUS = 34;
export const DEPTHS_ENTRY = [2000, 26];    // donde apareces al bajar
export const STAIRS_SPOT = [2000, -30];    // la escalera al piso siguiente
// Trampilla en la Ciudadela: en el empedrado al suroeste de la fuente, en un
// claro de la plaza donde no tapa a ningún mercader.
export const HATCH_SPOT = [-6, -6];
export const HATCH_RANGE = 6;

export const MAX_DEPTH = 999;

// Generador determinista: la misma semilla da la misma sala en cualquier
// servidor y en cualquier momento.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// La semilla del piso: mezcla la semana y la profundidad. Cambia sola cada
// lunes, así que la carrera vuelve a empezar sin tocar nada.
export function depthSeed(depth, week = thisWeekNumber()) {
  return (week * 100003 + depth * 977 + 7) >>> 0;
}

// Cuánto se endurece todo al bajar. Lineal a propósito: se nota enseguida pero
// deja bajar bastante antes de que sea imposible.
export function scaleFor(depth) {
  const d = Math.max(1, depth);
  return {
    hp: 1 + 0.38 * (d - 1),
    dmg: 1 + 0.20 * (d - 1),
    xp: 1 + 0.30 * (d - 1),
    gold: 1 + 0.30 * (d - 1),
    // Lo que sube la calidad del botín: cada dos pisos, un tier más.
    tier: Math.floor(d / 2),
  };
}

// Qué habita cada tramo. Se reaprovechan las criaturas que ya existen: lo que
// cambia es cuántas hay y lo duras que vienen.
const BANDS = [
  { until: 2,        mobs: ['rata', 'esqueleto'] },
  { until: 5,        mobs: ['esqueleto', 'ahogado', 'guardian_oseo'] },
  { until: 9,        mobs: ['guardian_oseo', 'aparecido_helado', 'centinela_oseo'] },
  { until: Infinity, mobs: ['centinela_oseo', 'troll_hielo', 'aparecido_helado'] },
];
// Los guardianes del umbral, por orden de aparición.
const GUARDIANS = ['senor_cripta', 'rey_fango', 'jarl_cumbres'];

export function bandFor(depth) {
  return BANDS.find((b) => depth <= b.until).mobs;
}

export function guardianFor(depth) {
  return GUARDIANS[Math.floor((depth - 1) / 3) % GUARDIANS.length];
}

// Cuántos secuaces hay en el piso: crece despacio y se estanca, para que lo que
// mate no sea el número sino la dureza.
export function minionCount(depth) {
  return Math.min(14, 4 + Math.floor(depth / 2));
}

// Monta las criaturas de un piso. nextId() lo pone el servidor para que los
// identificadores no choquen con los del mundo.
export function buildDepthMobs(depth, nextId, week = thisWeekNumber()) {
  const rnd = rng(depthSeed(depth, week));
  const scale = scaleFor(depth);
  const [ox, oz] = DEPTHS_ORIGIN;
  const pool = bandFor(depth);
  const mobs = [];

  const place = (type, x, z, isGuardian = false) => {
    const base = MOB_TYPES[type];
    // Copia endurecida del bicho: no se toca el original, que lo comparte el
    // mundo entero.
    const def = {
      ...base,
      hp: Math.round(base.hp * scale.hp),
      dmgMin: Math.round(base.dmgMin * scale.dmg),
      dmgMax: Math.round(base.dmgMax * scale.dmg),
      xp: Math.round(base.xp * scale.xp),
      gold: [Math.round(base.gold[0] * scale.gold), Math.round(base.gold[1] * scale.gold)],
      respawn: 10 ** 9,   // en la mazmorra no reaparece nada: se limpia y se baja
    };
    mobs.push({
      id: nextId(), type, def,
      x, z, rot: rnd() * Math.PI * 2,
      homeX: x, homeZ: z,
      hp: def.hp,
      state: 'idle',
      targetId: null,
      wanderX: x, wanderZ: z, wanderUntil: 0,
      lastAttack: 0,
      deadUntil: 0,
      damagers: new Set(),
      depthBonus: scale.tier,   // lo lee el botín para tirar mejores afijos
      isGuardian,
    });
  };

  // Secuaces repartidos por la sala, sin pegarse a la entrada.
  for (let i = 0; i < minionCount(depth); i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 8 + rnd() * (DEPTHS_RADIUS - 12);
    place(pool[Math.floor(rnd() * pool.length)], ox + Math.cos(ang) * rad, oz + Math.sin(ang) * rad);
  }
  // El guardián del umbral, al fondo: hasta que no cae, no se abre la escalera.
  place(guardianFor(depth), STAIRS_SPOT[0], STAIRS_SPOT[1] + 6, true);
  return mobs;
}

// Identificador del reino instanciado de un héroe.
export function depthRealmId(charId) {
  return `prof:${charId}`;
}

export function isDepthRealm(realmId) {
  return typeof realmId === 'string' && realmId.startsWith('prof:');
}

// ---- Marca personal ----
// st.depths = { week, best, record } — el mejor piso de esta semana y el de
// siempre. Se reinicia solo cada lunes junto con la semilla.
export function ensureDepths(st) {
  const week = thisWeekNumber();
  if (!st.depths || st.depths.week !== week) {
    st.depths = { week, best: 0, record: st.depths?.record || 0 };
  }
  return st.depths;
}

export function recordDepth(st, depth) {
  const d = ensureDepths(st);
  const mejorado = depth > d.best;
  d.best = Math.max(d.best, depth);
  d.record = Math.max(d.record || 0, depth);
  return mejorado;
}
