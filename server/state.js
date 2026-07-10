// Operaciones autoritativas sobre el estado del personaje (bolsa, equipo, oro,
// experiencia, talentos). El servidor es el único que muta estos datos; el
// cliente recibe sincronizaciones y solo los muestra.
import { ITEMS } from '../public/js/items.js';
import { TALENT_TREES, MAX_LEVEL, HP_PER_LEVEL, xpForLevel } from '../public/js/talents-data.js';
import { RACES, CLASSES } from '../public/js/races.js';
import { MIRA_BLESSING_PRICES } from '../public/js/recipes.js';

const BAG_SLOTS = 24;
const EQUIP_KEYS = ['arma', 'cabeza', 'torso', 'escudo', 'espalda', 'accesorio'];

// Normaliza el estado antiguo de un personaje al formato autoritativo.
export function ensureState(character) {
  const st = character.state = character.state || {};
  st.inventory = st.inventory || { gold: 0, slots: [], equipment: {} };
  st.inventory.gold = Math.max(0, Number(st.inventory.gold) || 0);
  if (!Array.isArray(st.inventory.slots)) st.inventory.slots = [];
  st.inventory.slots = st.inventory.slots.slice(0, BAG_SLOTS);
  while (st.inventory.slots.length < BAG_SLOTS) st.inventory.slots.push(null);
  st.inventory.equipment = st.inventory.equipment || {};
  for (const k of EQUIP_KEYS) {
    if (st.inventory.equipment[k] === undefined) st.inventory.equipment[k] = null;
  }
  st.progression = st.progression || { level: 1, xp: 0, points: 0, talents: {} };
  st.kills = st.kills || {};
  st.claimedQuests = st.claimedQuests || [];
  // Bendiciones de Mira: id -> instante de expiración (ms época). Del servidor.
  if (!st.blessings || typeof st.blessings !== 'object') st.blessings = {};
  return st;
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
    + (blessingActive(st, 'vida') ? 25 : 0);
}

// Armadura total: equipo + raza/clase + talentos + Bendición de la Piedra
// + mejora temporal de habilidad (Grito de Guerra / Escudo de Fe).
export function computeArmor(character, skillBuffArmor = 0) {
  const st = character.state;
  const equipArmor = Object.values(st.inventory.equipment).reduce(
    (sum, itemId) => sum + (itemId ? (ITEMS[itemId]?.armor || 0) : 0), 0
  );
  return equipArmor
    + raceOf(character).armor + classOf(character).armor
    + talentSum(character, 'armor')
    + (blessingActive(st, 'piedra') ? 3 : 0)
    + skillBuffArmor;
}

export function computeHealMul(character) {
  return classOf(character).healMul * (1 + talentSum(character, 'healMul'));
}

// Regeneración por segundo fuera de combate
export function regenPerSec(character) {
  return 2.5 * raceOf(character).regenMul * classOf(character).regenMul;
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

export function bagAdd(st, itemId, count = 1) {
  const item = ITEMS[itemId];
  if (!item || count < 1) return false;
  const slots = st.inventory.slots;
  if (item.stackable) {
    const existing = slots.find((s) => s && s.itemId === itemId);
    if (existing) { existing.count += count; return true; }
    const free = slots.findIndex((s) => !s);
    if (free === -1) return false;
    slots[free] = { itemId, count };
    return true;
  }
  const freeCount = slots.reduce((n, s) => n + (s ? 0 : 1), 0);
  if (freeCount < count) return false;
  for (let c = 0; c < count; c++) {
    slots[slots.findIndex((s) => !s)] = { itemId, count: 1 };
  }
  return true;
}

export function bagRemove(st, itemId, count = 1) {
  if (bagCount(st, itemId) < count) return false;
  let remaining = count;
  const slots = st.inventory.slots;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
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
export function equipFromBag(st, bagIndex) {
  const s = st.inventory.slots[bagIndex];
  if (!s) return false;
  const item = ITEMS[s.itemId];
  if (!item?.slot) return false;
  const prev = st.inventory.equipment[item.slot];
  st.inventory.equipment[item.slot] = s.itemId;
  st.inventory.slots[bagIndex] = prev ? { itemId: prev, count: 1 } : null;
  return true;
}

export function unequipToBag(st, slotKey) {
  if (!EQUIP_KEYS.includes(slotKey)) return false;
  const itemId = st.inventory.equipment[slotKey];
  if (!itemId) return false;
  const free = st.inventory.slots.findIndex((s) => !s);
  if (free === -1) return false;
  st.inventory.slots[free] = { itemId, count: 1 };
  st.inventory.equipment[slotKey] = null;
  return true;
}

export function equippedWeaponDmg(st) {
  const itemId = st.inventory.equipment.arma;
  return itemId ? (ITEMS[itemId]?.dmg || 0) : 0;
}

// Daño máximo verosímil de un jugador (para acotar lo que declare el cliente):
// base 5 + arma + raza/clase/talentos/bendición (≤ ~11) + aleatorio 4 + margen.
export function maxPlausibleHit(st) {
  return 5 + equippedWeaponDmg(st) + 11 + 4 + 5;
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

// ---- Sincronización hacia el cliente ----
export function syncPayload(st) {
  return {
    inventory: st.inventory,
    progression: st.progression,
    blessings: st.blessings,
  };
}
