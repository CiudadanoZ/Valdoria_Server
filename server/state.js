// Operaciones autoritativas sobre el estado del personaje (bolsa, equipo, oro,
// experiencia, talentos). El servidor es el único que muta estos datos; el
// cliente recibe sincronizaciones y solo los muestra.
import { ITEMS } from '../public/js/items.js';
import { TALENT_TREES, MAX_LEVEL, HP_PER_LEVEL, xpForLevel } from '../public/js/talents-data.js';
import { RACES, CLASSES } from '../public/js/races.js';
import { MIRA_BLESSING_PRICES } from '../public/js/recipes.js';
import { dailyBounties, weeklyBounties, todayNumber, thisWeekNumber } from '../public/js/bounties.js';
import { resourceOf } from '../public/js/skills-data.js';
import { maxMeleeHit } from '../public/js/combat-data.js';
import { idOf, rollOf, statsOf, sumStats, AFFIXES, clampTier } from '../public/js/affixes.js';

const BAG_SLOTS = 24;
const EQUIP_KEYS = ['arma', 'cabeza', 'torso', 'escudo', 'espalda', 'accesorio'];

// Una pieza de equipo viaja siempre como { itemId, roll }. Se sanea al cargar
// porque el estado llega de la base de datos y no hay que fiarse de él: una
// tirada corrupta o inventada por un cliente listo se descarta en silencio.
function sanitizeRoll(roll) {
  if (!roll || typeof roll !== 'object' || !Array.isArray(roll.affixes)) return null;
  const grade = Math.max(1, Math.min(3, Math.round(Number(roll.grade) || 1)));
  const affixes = roll.affixes
    .filter((a) => a && AFFIXES[a.id] && Number.isFinite(Number(a.v)))
    .slice(0, grade)
    .map((a) => ({ id: a.id, v: Number(a.v) }));
  if (!affixes.length) return null;
  return { tier: clampTier(roll.tier), grade: affixes.length, affixes };
}

// Acepta las dos formas que puede tener un objeto guardado: el id suelto de
// antes de los afijos y la instancia de ahora.
function sanitizeEntry(entry) {
  const itemId = idOf(entry);
  if (!itemId || !ITEMS[itemId]) return null;
  const roll = sanitizeRoll(rollOf(entry));
  return roll ? { itemId, roll } : { itemId };
}

function sanitizeSlot(slot) {
  if (!slot) return null;
  const entry = sanitizeEntry(slot);
  if (!entry) return null;
  const count = Math.max(1, Math.round(Number(slot.count) || 1));
  return entry.roll ? { ...entry, count: 1 } : { ...entry, count };
}

// Las piezas equipadas, como lista, para sumar estadísticas de un vistazo.
function equippedEntries(st) {
  return EQUIP_KEYS.map((k) => st.inventory.equipment[k]).filter(Boolean);
}

// Bonificación total que aportan los afijos del equipo.
export function affixBonus(st, field) {
  return sumStats(equippedEntries(st), field);
}

// Normaliza el estado antiguo de un personaje al formato autoritativo.
export function ensureState(character) {
  const st = character.state = character.state || {};
  st.inventory = st.inventory || { gold: 0, slots: [], equipment: {} };
  st.inventory.gold = Math.max(0, Number(st.inventory.gold) || 0);
  if (!Array.isArray(st.inventory.slots)) st.inventory.slots = [];
  st.inventory.slots = st.inventory.slots.slice(0, BAG_SLOTS).map(sanitizeSlot);
  while (st.inventory.slots.length < BAG_SLOTS) st.inventory.slots.push(null);
  st.inventory.equipment = st.inventory.equipment || {};
  // Los personajes de antes de los afijos guardaban el equipo como un id suelto
  // ('espada_acero'); sanitizeEntry lo convierte en instancia sin tirada, así
  // que siguen llevando puesto lo mismo y no pierden nada.
  for (const k of EQUIP_KEYS) {
    st.inventory.equipment[k] = sanitizeEntry(st.inventory.equipment[k]);
  }
  st.progression = st.progression || { level: 1, xp: 0, points: 0, talents: {} };
  st.kills = st.kills || {};
  st.pvpKills = st.pvpKills || 0;
  st.claimedQuests = st.claimedQuests || [];
  // Viaje rápido: piedras rúnicas descubiertas (la Ciudadela siempre)
  if (!Array.isArray(st.waystones)) st.waystones = [];
  if (!st.waystones.includes('ciudadela')) st.waystones.push('ciudadela');
  // Monturas en propiedad y montura activa
  if (!Array.isArray(st.mounts)) st.mounts = [];
  if (st.mount === undefined) st.mount = null;
  // Ganancias pendientes de la casa de subastas
  st.auctionGold = st.auctionGold || 0;
  // Gremio al que pertenece (nombre) o null
  if (st.guild === undefined) st.guild = null;
  // «Alma Debilitada» tras morir: instante de expiración (ms época). Persistido
  // para que reconectar no borre el castigo.
  if (typeof st.weakUntil !== 'number') st.weakUntil = 0;
  // Bendiciones de Mira: id -> instante de expiración (ms época). Del servidor.
  if (!st.blessings || typeof st.blessings !== 'object') st.blessings = {};
  // Encargos diarios: se regeneran cada día.
  refreshBounties(st);
  return st;
}

// ---- Encargos del Tablón (diarios y semanales) ----
// st.bounties = { day,  list: [{ …datos, count, claimed, accepted }] }
// st.weeklies = { week, list: [ídem] }
// Un encargo solo avanza si el héroe lo ha ACEPTADO en el tablón: así el
// jugador elige a qué se compromete y el rastreador solo muestra lo suyo.
export function refreshBounties(st) {
  const day = todayNumber();
  if (!st.bounties || st.bounties.day !== day) {
    st.bounties = {
      day,
      list: dailyBounties(day).map((b) => ({ ...b, count: 0, claimed: false, accepted: false })),
    };
  }
  const week = thisWeekNumber();
  if (!st.weeklies || st.weeklies.week !== week) {
    st.weeklies = {
      week,
      list: weeklyBounties(week).map((b) => ({ ...b, count: 0, claimed: false, accepted: false })),
    };
  }
  // Estados antiguos (de antes de que hubiera que aceptar): se dan por aceptados
  // SOLO si ya llevaban progreso, para no invalidar lo que el jugador tuviera a
  // medias. Los que estaban a cero se quedan sin aceptar, como los nuevos.
  for (const b of [...st.bounties.list, ...st.weeklies.list]) {
    if (b.accepted === undefined) b.accepted = b.count > 0;
  }
  return st.bounties;
}

// Todos los encargos vigentes (diarios + semanales), para buscarlos por id.
function allBounties(st) {
  return [...st.bounties.list, ...st.weeklies.list];
}

// Al matar una criatura: avanza los encargos ACEPTADOS de ese tipo.
export function onBountyKill(st, mobType) {
  refreshBounties(st);
  let changed = false;
  for (const b of allBounties(st)) {
    if (b.accepted && b.mob === mobType && !b.claimed && b.count < b.need) {
      b.count++;
      changed = true;
    }
  }
  return changed;
}

// Acepta un encargo del tablón. Devuelve el encargo o null si no procede.
export function acceptBounty(st, bountyId) {
  refreshBounties(st);
  const b = allBounties(st).find((x) => x.id === bountyId);
  if (!b || b.accepted || b.claimed) return null;
  b.accepted = true;
  return b;
}

// Cobra un encargo completado. Devuelve la recompensa o null si no procede.
export function claimBounty(st, bountyId) {
  refreshBounties(st);
  const b = allBounties(st).find((x) => x.id === bountyId);
  if (!b || !b.accepted || b.claimed || b.count < b.need) return null;
  b.claimed = true;
  return { gold: b.gold, xp: b.xp };
}

// ---- Estadísticas del personaje (autoritativas) ----
function raceOf(character) { return RACES[character.race] || RACES.humano; }
function classOf(character) { return CLASSES[character.class] || CLASSES.guerrero; }

function talentSum(character, field) {
  const tree = TALENT_TREES[character.class] || TALENT_TREES.guerrero;
  const talents = character.state.progression.talents || {};
  return tree.reduce((sum, n) => sum + (n[field] || 0) * (talents[n.id] || 0), 0);
}

export function blessingActive(st, id) {
  return (st.blessings[id] || 0) > Date.now();
}

export function computeMaxHp(character) {
  const st = character.state;
  return 100
    + raceOf(character).hp + classOf(character).hp
    + (st.progression.level - 1) * HP_PER_LEVEL
    + talentSum(character, 'hp')
    + affixBonus(st, 'hp')
    + (blessingActive(st, 'vida') ? 25 : 0);
}

// Armadura total: equipo + raza/clase + talentos + Bendición de la Piedra
// + mejora temporal de habilidad (Grito de Guerra / Escudo de Fe).
export function computeArmor(character, skillBuffArmor = 0) {
  const st = character.state;
  // Suma base del objeto + lo que aporten sus afijos.
  const equipArmor = affixBonus(st, 'armor');
  return equipArmor
    + raceOf(character).armor + classOf(character).armor
    + talentSum(character, 'armor')
    + (blessingActive(st, 'piedra') ? 3 : 0)
    + skillBuffArmor;
}

export function computeHealMul(character) {
  const st = character.state;
  return classOf(character).healMul
    * (1 + talentSum(character, 'healMul') + affixBonus(st, 'healMul'));
}

// Regeneración por segundo fuera de combate
export function regenPerSec(character) {
  return 2.5 * raceOf(character).regenMul * classOf(character).regenMul
    + affixBonus(character.state, 'regen');
}

// Velocidad extra por afijos, en fracción (0.06 = +6%). El servidor la usa para
// ampliar el tope de movimiento que tolera antes de considerarlo trampa.
export function affixSpeed(st) {
  return affixBonus(st, 'speed');
}

// Multiplicador de oro por afijos de Codicia.
export function goldMultiplier(st) {
  return 1 + affixBonus(st, 'gold');
}

// ---- Recurso de clase (furia / vigor / maná) ----
// El servidor lo lleva igual que la vida: el cliente solo lo refleja.
export function resourceDef(character) {
  return resourceOf(character.class);
}

export function computeMaxResource(character) {
  return resourceDef(character).max;
}

// Valor inicial al entrar al mundo: el guerrero arranca sin furia.
export function startingResource(character) {
  const def = resourceDef(character);
  return def.startFull ? def.max : 0;
}

// Compra una bendición (el oro ya está comprobado por el llamador)
export function applyBlessing(st, id) {
  if (!MIRA_BLESSING_PRICES[id]) return false;
  st.blessings[id] = Date.now() + 10 * 60 * 1000;
  return true;
}

// ---- Bolsa ----
export function bagCount(st, itemId) {
  return st.inventory.slots.reduce((n, s) => n + (s && s.itemId === itemId ? s.count : 0), 0);
}

// roll: tirada de afijos. Una pieza con tirada nunca se apila con otra, porque
// aunque se llamen igual no son el mismo objeto.
export function bagAdd(st, itemId, count = 1, roll = null) {
  const item = ITEMS[itemId];
  if (!item || count < 1) return false;
  const slots = st.inventory.slots;
  const clean = sanitizeRoll(roll);

  if (item.stackable && !clean) {
    const existing = slots.find((s) => s && s.itemId === itemId && !s.roll);
    if (existing) { existing.count += count; return true; }
    const free = slots.findIndex((s) => !s);
    if (free === -1) return false;
    slots[free] = { itemId, count };
    return true;
  }
  const freeCount = slots.reduce((n, s) => n + (s ? 0 : 1), 0);
  if (freeCount < count) return false;
  for (let c = 0; c < count; c++) {
    const slot = { itemId, count: 1 };
    if (clean) slot.roll = clean;
    slots[slots.findIndex((s) => !s)] = slot;
  }
  return true;
}

// Añade una instancia ya formada (la que venía de una subasta, un intercambio
// o el suelo), conservando su tirada.
export function bagAddEntry(st, entry) {
  const clean = sanitizeEntry(entry);
  if (!clean) return false;
  return bagAdd(st, clean.itemId, 1, clean.roll || null);
}

// Saca de la bolsa la instancia concreta que hay en esa casilla y la devuelve.
// Vender o subastar tiene que ir por aquí y no por bagRemove(itemId): si no,
// el juego podría quitarte el Filo Glacial bueno y dejarte el malo.
export function bagTakeAt(st, index, count = 1) {
  const slot = st.inventory.slots[index];
  if (!slot || slot.count < count) return null;
  const taken = { itemId: slot.itemId, count };
  if (slot.roll) taken.roll = slot.roll;
  slot.count -= count;
  if (slot.count <= 0) st.inventory.slots[index] = null;
  return taken;
}

// Gasta objetos por id (recetas, misiones, entregas). Se lleva primero los que
// NO tienen tirada: si tienes dos espadas iguales y una salió con afijos, una
// receta no debería fundirte precisamente la buena.
export function bagRemove(st, itemId, count = 1) {
  if (bagCount(st, itemId) < count) return false;
  let remaining = count;
  const slots = st.inventory.slots;
  const order = [...slots.keys()].sort((a, b) => {
    const ra = slots[a]?.roll ? 1 : 0;
    const rb = slots[b]?.roll ? 1 : 0;
    return ra - rb || a - b;
  });
  for (const i of order) {
    if (remaining <= 0) break;
    const s = slots[i];
    if (s && s.itemId === itemId) {
      const take = Math.min(s.count, remaining);
      s.count -= take;
      remaining -= take;
      if (s.count <= 0) slots[i] = null;
    }
  }
  return true;
}

// ---- Equipo ----
// La tirada viaja con la pieza al equipar y al quitar: es lo que la hace tuya.
export function equipFromBag(st, bagIndex) {
  const s = st.inventory.slots[bagIndex];
  if (!s) return false;
  const item = ITEMS[s.itemId];
  if (!item?.slot) return false;
  const prev = st.inventory.equipment[item.slot];
  const entry = { itemId: s.itemId };
  if (s.roll) entry.roll = s.roll;
  st.inventory.equipment[item.slot] = entry;
  st.inventory.slots[bagIndex] = prev ? { ...prev, count: 1 } : null;
  return true;
}

export function unequipToBag(st, slotKey) {
  if (!EQUIP_KEYS.includes(slotKey)) return false;
  const entry = st.inventory.equipment[slotKey];
  if (!entry) return false;
  const free = st.inventory.slots.findIndex((s) => !s);
  if (free === -1) return false;
  st.inventory.slots[free] = { ...entry, count: 1 };
  st.inventory.equipment[slotKey] = null;
  return true;
}

export function equippedWeaponDmg(st) {
  return statsOf(st.inventory.equipment.arma).dmg;
}

// Daño máximo verosímil de un jugador (para acotar lo que declare el cliente).
// La fórmula vive en combat-data.js para no desincronizarse del cliente.
export function maxPlausibleHit(st) {
  return maxMeleeHit(equippedWeaponDmg(st));
}

// ---- Experiencia y talentos ----
export function addXp(st, amount) {
  const p = st.progression;
  if (!amount || p.level >= MAX_LEVEL) return false;
  p.xp += amount;
  let leveled = false;
  while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    p.points++;
    leveled = true;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return leveled;
}

export function spendTalent(st, classId, nodeId) {
  const tree = TALENT_TREES[classId];
  if (!tree) return 'clase desconocida';
  const node = tree.find((n) => n.id === nodeId);
  if (!node) return 'talento desconocido';
  const p = st.progression;
  const rank = p.talents[nodeId] || 0;
  const spent = Object.values(p.talents).reduce((a, b) => a + b, 0);
  if (p.points < 1) return 'sin puntos';
  if (rank >= node.max) return 'rango máximo';
  if (spent < node.req) return `requiere ${node.req} puntos gastados`;
  p.talents[nodeId] = rank + 1;
  p.points--;
  return null; // sin error
}

// Coste de reasignar talentos: 50 de oro por nivel del personaje.
export function respecCost(st) {
  return 50 * st.progression.level;
}

// Reasigna: devuelve todos los puntos gastados y vacía el árbol. El cobro del
// oro lo hace el llamador tras validar. Devuelve false si no hay nada que reasignar.
export function respecTalents(st) {
  const spent = Object.values(st.progression.talents).reduce((a, b) => a + b, 0);
  if (spent < 1) return false;
  st.progression.points += spent;
  st.progression.talents = {};
  return true;
}

// ---- Sincronización hacia el cliente ----
export function syncPayload(st) {
  return {
    inventory: st.inventory,
    progression: st.progression,
    blessings: st.blessings,
    bounties: st.bounties,
    weeklies: st.weeklies,
    waystones: st.waystones,
    mounts: st.mounts,
    mount: st.mount,
    auctionGold: st.auctionGold,
    guild: st.guild,
  };
}
