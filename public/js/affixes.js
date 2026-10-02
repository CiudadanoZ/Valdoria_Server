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

  // ---- Ejes multiplicativos ----
  // Estos no suman: multiplican. Son los que hacen que un personaje bien
  // montado triplique a otro con el mismo equipo mal repartido, y los que
  // permiten seguir bajando pisos sin que el combate se vuelva eterno.
  crit: {
    id: 'crit', label: 'Precisión', suffix: 'del Certero', icon: '🎯',
    base: 0.03, per: 0.006, kind: 'frac', slots: null,
    fmt: (v) => `+${(v * 100).toFixed(1)}% de probabilidad de crítico`,
  },
  critDmg: {
    id: 'critDmg', label: 'Saña', suffix: 'de la Saña', icon: '💥',
    base: 0.10, per: 0.022, kind: 'frac', slots: null,
    fmt: (v) => `+${Math.round(v * 100)}% de daño crítico`,
  },
  atkSpeed: {
    id: 'atkSpeed', label: 'Presteza', suffix: 'de la Presteza', icon: '⚡',
    base: 0.03, per: 0.005, kind: 'frac', slots: ['arma', 'cabeza', 'accesorio', 'espalda'],
    fmt: (v) => `+${Math.round(v * 100)}% de velocidad de ataque`,
  },
  dmgMul: {
    id: 'dmgMul', label: 'Poderío', suffix: 'del Poderío', icon: '🔥',
    base: 0.04, per: 0.008, kind: 'frac', slots: null,
    fmt: (v) => `+${Math.round(v * 100)}% de daño`,
  },
  block: {
    id: 'block', label: 'Guardia', suffix: 'de la Guardia', icon: '⛊',
    base: 0.04, per: 0.008, kind: 'frac', slots: ['escudo', 'torso', 'accesorio'],
    fmt: (v) => `+${Math.round(v * 100)}% de bloqueo`,
  },
  dr: {
    id: 'dr', label: 'Temple', suffix: 'del Temple', icon: '🪨',
    base: 0.02, per: 0.005, kind: 'frac', slots: ['cabeza', 'torso', 'escudo', 'espalda'],
    fmt: (v) => `−${Math.round(v * 100)}% de daño recibido`,
  },
};

export const AFFIX_IDS = Object.keys(AFFIXES);

// ---- Poderes legendarios ----
// Los afijos de arriba hacen que un objeto sea MEJOR; estos hacen que juegues
// DISTINTO, que es lo que sostiene la caza a largo plazo: nadie repite mil
// veces una mazmorra por un 8% más de daño, pero sí por la posibilidad de que
// caiga algo que le cambie el personaje.
//
// Solo aparecen en reliquias (✦✦✦), uno por pieza, y como se pueden llevar
// varias piezas a la vez, se combinan entre sí. Los aplica el SERVIDOR: el
// cliente solo los muestra.
export const POWERS = {
  sed: {
    id: 'sed', name: 'Sed de Sangre', suffix: 'de la Sed', icon: '🩸',
    value: 0.08,
    desc: 'Robas vida igual al 8% del daño que infliges.',
  },
  eco: {
    id: 'eco', name: 'Eco Sangriento', suffix: 'del Eco', icon: '💀',
    value: 12,
    desc: 'Cada baja te devuelve 12 de vida.',
  },
  impetu: {
    id: 'impetu', name: 'Ímpetu Inagotable', suffix: 'del Ímpetu', icon: '🌀',
    value: 0.3,
    desc: 'Tus habilidades cuestan un 30% menos de recurso.',
  },
  espinas: {
    id: 'espinas', name: 'Coraza de Espinas', suffix: 'de las Espinas', icon: '🌵',
    value: 0.25,
    desc: 'Devuelves el 25% del daño que recibes.',
  },
  aliento: {
    id: 'aliento', name: 'Segundo Aliento', suffix: 'del Aliento', icon: '💗',
    value: 40, cooldown: 60,
    desc: 'Al bajar de un cuarto de vida te curas 40 (una vez por minuto).',
  },
  verdugo: {
    id: 'verdugo', name: 'Verdugo', suffix: 'del Verdugo', icon: '🪓',
    value: 0.6,
    desc: 'Tu primer golpe a un enemigo intacto hace un 60% más de daño.',
  },
};
export const POWER_IDS = Object.keys(POWERS);

// Probabilidad de que una reliquia traiga poder en vez de un tercer afijo.
const POWER_CHANCE = 0.45;

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

  // Una reliquia puede traer un poder legendario en lugar de su tercer afijo:
  // se cambia un número por una forma distinta de jugar.
  const power = grade === 3 && rnd() < POWER_CHANCE
    ? POWER_IDS[Math.floor(rnd() * POWER_IDS.length)]
    : null;
  const nAffixes = power ? grade - 1 : grade;

  const pool = affixesFor(item.slot);
  const affixes = [];
  for (let i = 0; i < nAffixes && pool.length; i++) {
    const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    affixes.push({ id, v: affixValue(AFFIXES[id], t, rnd) });
  }
  // El afijo más "definitorio" primero: es el que da nombre al objeto.
  affixes.sort((a, b) => AFFIX_IDS.indexOf(a.id) - AFFIX_IDS.indexOf(b.id));
  const roll = { tier: t, grade, affixes };
  if (power) roll.power = power;
  return roll;
}

// ---- La forja de Bramm ----
// Todo botín aleatorio necesita una vía de rezar menos. Estas dos operaciones
// dejan APUNTAR a un objeto en vez de esperar a que caiga del cielo.

// Retemplar: mismos afijos, valores nuevos. Es la apuesta pequeña — mejorar lo
// que ya tienes sin arriesgarte a perder los afijos que te gustan.
export function retemper(roll, rnd = Math.random) {
  if (!roll) return null;
  const out = {
    tier: roll.tier,
    grade: roll.grade,
    affixes: roll.affixes.map((a) => ({ id: a.id, v: affixValue(AFFIXES[a.id], roll.tier, rnd) })),
  };
  if (roll.power) out.power = roll.power;   // el poder no se toca
  return out;
}

// Reforjar: afijos nuevos de arriba abajo, manteniendo el grado. Es la apuesta
// grande — puedes salir con el poder legendario que buscabas... o perder el que
// llevabas. Por eso cuesta lo que cuesta.
export function reforge(itemId, roll, rnd = Math.random) {
  if (!roll) return null;
  const item = ITEMS[itemId];
  if (!item?.slot) return null;

  const power = roll.grade === 3 && rnd() < POWER_CHANCE
    ? POWER_IDS[Math.floor(rnd() * POWER_IDS.length)]
    : null;
  const nAffixes = roll.grade - (power ? 1 : 0);

  const pool = affixesFor(item.slot);
  const affixes = [];
  for (let i = 0; i < nAffixes && pool.length; i++) {
    const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    affixes.push({ id, v: affixValue(AFFIXES[id], roll.tier, rnd) });
  }
  affixes.sort((a, b) => AFFIX_IDS.indexOf(a.id) - AFFIX_IDS.indexOf(b.id));
  const out = { tier: roll.tier, grade: roll.grade, affixes };
  if (power) out.power = power;
  return out;
}

// Lo que cobra Bramm. Sube con el tier y con el grado: retemplar una reliquia
// de los pisos hondos no puede costar lo mismo que una pieza de la llanura.
export function forgeCost(roll, kind) {
  if (!roll) return null;
  const base = kind === 'reforge' ? { shards: 6, gold: 120 } : { shards: 2, gold: 40 };
  return {
    shards: base.shards + Math.floor(roll.tier / 4) + (roll.grade - 1),
    gold: Math.round(base.gold * (1 + roll.tier * 0.25 + (roll.grade - 1) * 0.5)),
  };
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
  const out = {
    dmg: 0, armor: 0, hp: 0, speed: 0, healMul: 0, regen: 0, gold: 0,
    crit: 0, critDmg: 0, atkSpeed: 0, dmgMul: 0, block: 0, dr: 0,
  };
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
  // El poder manda sobre los afijos al bautizar la pieza: es lo que la define.
  const power = roll.power && POWERS[roll.power];
  if (power) return `${item.name} ${power.suffix}`;
  const first = roll.affixes[0];
  return `${item.name}${first ? ` ${AFFIXES[first.id].suffix}` : ''}`;
}

// Líneas sueltas para la descripción emergente: "+4 de daño", "+12 de vida"...
export function affixLines(entry) {
  return (rollOf(entry)?.affixes || []).map((a) => {
    const def = AFFIXES[a.id];
    return `${def.icon} ${def.fmt(a.v)}`;
  });
}

// El poder legendario de una pieza, si lo tiene.
export function powerOf(entry) {
  const id = rollOf(entry)?.power;
  return id ? POWERS[id] || null : null;
}

// Poderes activos del equipo completo. Se pueden llevar varios (uno por pieza)
// y ahí está la gracia: combinarlos es lo que crea builds.
export function activePowers(entries) {
  const out = new Map();
  for (const e of entries) {
    const p = powerOf(e);
    if (p && !out.has(p.id)) out.set(p.id, p);
  }
  return out;
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
