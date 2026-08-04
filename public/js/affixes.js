// Afijos: lo que hace que dos objetos con el mismo nombre no sean el mismo objeto.
//
// Hasta ahora un Filo Glacial era SIEMPRE 28 de daño, así que matar al Jarl una
// segunda vez no te daba nada. Con afijos, cada pieza de equipo sale del suelo
// con su propia tirada: un grado (✦ a ✦✦✦) y hasta tres propiedades con valores
// aleatorios que escalan con lo duro que era lo que la soltó.
//
// Módulo de datos puro: lo importan cliente y servidor, así que no toca el DOM
// ni la red. El servidor tira; el cliente solo pinta lo que el servidor dice.
import { ITEMS } from './items.js';

// ---- Grados ----
// El grado 0 es el objeto de toda la vida, tal cual está en items.js: sin
// tirada. Se mantiene a propósito para no inflar el juego de golpe — lo normal
// sigue siendo normal, y encontrar un ✦✦✦ sigue siendo un acontecimiento.
export const GRADES = [
  { g: 0, name: 'Común',      stars: '',     color: '#b9b4a8' },
  { g: 1, name: 'Superior',   stars: '✦',    color: '#5fa8d3' },
  { g: 2, name: 'Excepcional', stars: '✦✦',  color: '#a06fd6' },
  { g: 3, name: 'Reliquia',   stars: '✦✦✦',  color: '#d9a441' },
];

export const gradeInfo = (g) => GRADES[g] || GRADES[0];

// ---- Catálogo de afijos ----
// base/per: el valor máximo del afijo es base + per * tier. La tirada final es
// un 60-100% de ese máximo, así que dos objetos del mismo grado tampoco son
// iguales entre sí.
// suffix: el nombre que le presta al objeto. Solo sufijos, nunca adjetivos
// delante: "Espada de la Furia" y "Escudo de la Furia" valen los dos, mientras
// que un prefijo obligaría a concordar género con cada base del catálogo.
// slots: dónde puede caer (null = en cualquier pieza).
export const AFFIXES = {
  dmg: {
    id: 'dmg', label: 'Daño', suffix: 'de la Furia', icon: '⚔️',
    base: 1, per: 0.6, kind: 'int', slots: ['arma'],
    fmt: (v) => `+${v} de daño`,
  },
  armor: {
    id: 'armor', label: 'Armadura', suffix: 'del Baluarte', icon: '🛡️',
    base: 1, per: 0.3, kind: 'int', slots: ['cabeza', 'torso', 'escudo', 'espalda', 'accesorio'],
    fmt: (v) => `+${v} de armadura`,
  },
  hp: {
    id: 'hp', label: 'Vida', suffix: 'del Titán', icon: '❤️',
    base: 4, per: 2.5, kind: 'int', slots: null,
    fmt: (v) => `+${v} de vida máxima`,
  },
  speed: {
    id: 'speed', label: 'Velocidad', suffix: 'del Viento', icon: '💨',
    base: 0.02, per: 0.004, kind: 'frac', slots: null,
    fmt: (v) => `+${Math.round(v * 100)}% de velocidad`,
  },
  healMul: {
    id: 'healMul', label: 'Curación', suffix: 'del Sanador', icon: '✚',
    base: 0.03, per: 0.007, kind: 'frac', slots: null,
    fmt: (v) => `+${Math.round(v * 100)}% de curación`,
  },
  regen: {
    id: 'regen', label: 'Regeneración', suffix: 'de la Vigilia', icon: '🌿',
    base: 0.3, per: 0.12, kind: 'dec', slots: null,
    fmt: (v) => `+${v} de vida por segundo`,
  },
  gold: {
    id: 'gold', label: 'Codicia', suffix: 'del Avaro', icon: '🪙',
    base: 0.05, per: 0.015, kind: 'frac', slots: null,
    fmt: (v) => `+${Math.round(v * 100)}% de oro`,
  },
};

export const AFFIX_IDS = Object.keys(AFFIXES);

// Tier máximo razonable. Las criaturas del mundo llegan a 10; Las Profundidades
// suben de ahí, y por eso el tope se deja alto y el escalado es lineal y suave.
export const MAX_TIER = 25;

export const clampTier = (t) => Math.max(1, Math.min(MAX_TIER, Math.round(t || 1)));

// Tier de una criatura a partir de la experiencia que da: es la medida de
// dureza que ya existía en el juego, así que no hay que etiquetar 20 bichos a
// mano ni arriesgarse a que se desincronice.
export function tierFromXp(xp) {
  return clampTier(1 + Math.sqrt(Math.max(0, xp || 0)) / 3);
}

// ---- Tiradas ----
function affixValue(def, tier, rnd) {
  const max = def.base + def.per * tier;
  const raw = max * (0.6 + 0.4 * rnd());
  if (def.kind === 'int') return Math.max(1, Math.round(raw));
  if (def.kind === 'dec') return Math.max(0.1, Math.round(raw * 10) / 10);
  return Math.max(0.005, Math.round(raw * 1000) / 1000);
}

// Probabilidad de cada grado según el tier. Un lobo casi nunca suelta una
// reliquia; el Jarl la suelta de vez en cuando.
export function gradeChances(tier) {
  const t = clampTier(tier);
  const p3 = Math.min(0.16, 0.005 + t * 0.006);
  const p2 = Math.min(0.30, 0.05 + t * 0.018);
  const p1 = Math.min(0.44, 0.22 + t * 0.020);
  return [1 - p1 - p2 - p3, p1, p2, p3];
}

function pickGrade(tier, rnd) {
  const [, p1, p2, p3] = gradeChances(tier);
  const r = rnd();
  if (r < p3) return 3;
  if (r < p3 + p2) return 2;
  if (r < p3 + p2 + p1) return 1;
  return 0;
}

// Afijos que puede llevar una pieza según su casilla.
export function affixesFor(slot) {
  return AFFIX_IDS.filter((id) => {
    const s = AFFIXES[id].slots;
    return !s || s.includes(slot);
  });
}

// Tira una pieza de equipo. Devuelve null cuando sale común (lo más frecuente),
// y en ese caso el objeto se guarda como siempre, sin tirada.
export function rollGear(itemId, tier = 1, rnd = Math.random) {
  const item = ITEMS[itemId];
  if (!item?.slot) return null;          // consumibles y materiales no se tiran
  const t = clampTier(tier);
  const grade = pickGrade(t, rnd);
  if (grade === 0) return null;

  const pool = affixesFor(item.slot);
  const affixes = [];
  for (let i = 0; i < grade && pool.length; i++) {
    const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    affixes.push({ id, v: affixValue(AFFIXES[id], t, rnd) });
  }
  // El afijo más "definitorio" primero: es el que da nombre al objeto.
  affixes.sort((a, b) => AFFIX_IDS.indexOf(a.id) - AFFIX_IDS.indexOf(b.id));
  return { tier: t, grade, affixes };
}

// ---- Leer instancias ----
// Una entrada puede ser un id suelto ('espada_acero', como se guardaba antes),
// o una instancia { itemId, roll }. Todo lo que consulte equipo o bolsa pasa
// por aquí para que las dos formas convivan sin ramas por todo el código.
export function idOf(entry) {
  if (!entry) return null;
  return typeof entry === 'string' ? entry : entry.itemId || null;
}

export function rollOf(entry) {
  return (entry && typeof entry === 'object' && entry.roll) || null;
}

export function itemOf(entry) {
  const id = idOf(entry);
  return id ? ITEMS[id] || null : null;
}

// Estadísticas totales de una pieza: lo que trae de fábrica más sus afijos.
export function statsOf(entry) {
  const out = { dmg: 0, armor: 0, hp: 0, speed: 0, healMul: 0, regen: 0, gold: 0 };
  const item = itemOf(entry);
  if (!item) return out;
  out.dmg = item.dmg || 0;
  out.armor = item.armor || 0;
  for (const a of rollOf(entry)?.affixes || []) {
    if (out[a.id] !== undefined) out[a.id] += a.v;
  }
  return out;
}

// Suma una estadística sobre un conjunto de piezas (el equipo completo).
export function sumStats(entries, field) {
  let total = 0;
  for (const e of entries) total += statsOf(e)[field] || 0;
  return total;
}

// ---- Presentación ----
export function displayName(entry) {
  const item = itemOf(entry);
  if (!item) return '¿?';
  const roll = rollOf(entry);
  if (!roll) return item.name;
  const first = roll.affixes[0];
  const suffix = first ? ` ${AFFIXES[first.id].suffix}` : '';
  return `${item.name}${suffix}`;
}

// Líneas sueltas para la descripción emergente: "+4 de daño", "+12 de vida"...
export function affixLines(entry) {
  return (rollOf(entry)?.affixes || []).map((a) => {
    const def = AFFIXES[a.id];
    return `${def.icon} ${def.fmt(a.v)}`;
  });
}

// Valor de venta: los afijos suben lo que paga Lyra, para que una buena tirada
// tenga precio aunque no sea para tu clase.
export function sellValueOf(entry) {
  const item = itemOf(entry);
  if (!item) return 0;
  const roll = rollOf(entry);
  const base = item.sell || 0;
  if (!roll) return base;
  return Math.round(base * (1 + 0.35 * roll.grade) + roll.tier * 3 * roll.grade);
}
