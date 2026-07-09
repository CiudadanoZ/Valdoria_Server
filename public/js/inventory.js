// Inventario del jugador: 24 casillas, apilado, oro, consumibles y EQUIPO.
// Solo el arma y las piezas de armadura equipadas cuentan para el daño y la
// reducción de daño. Clic en un objeto equipable -> se equipa (intercambiando
// con lo que hubiera); clic en una casilla de equipo -> se desequipa.
import { ITEMS } from './items.js';
import { toast, setGold, showTooltip, hideTooltip } from './ui.js';

const SLOTS = 24;

export const EQUIP_SLOTS = {
  arma: 'Arma',
  cabeza: 'Cabeza',
  torso: 'Torso',
  escudo: 'Escudo',
  espalda: 'Espalda',
  accesorio: 'Accesorio',
};

export const inventory = {
  slots: new Array(SLOTS).fill(null), // { itemId, count }
  gold: 0,
  equipment: { arma: null, cabeza: null, torso: null, escudo: null, espalda: null, accesorio: null },
};

let onUseItem = null;   // callback (item) => bool, decide si se consume
let onChanged = null;   // callback para guardar partida

export function initInventory({ useItem, changed }) {
  onUseItem = useItem;
  onChanged = changed;

  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    slot.dataset.index = i;
    slot.addEventListener('click', () => handleSlotClick(i));
    slot.addEventListener('mousemove', (e) => handleSlotHover(i, e));
    slot.addEventListener('mouseleave', hideTooltip);
    grid.appendChild(slot);
  }

  const eqGrid = document.getElementById('equipment-grid');
  eqGrid.innerHTML = '';
  for (const [slotId, label] of Object.entries(EQUIP_SLOTS)) {
    const el = document.createElement('div');
    el.className = 'equip-slot';
    el.dataset.slot = slotId;
    el.innerHTML = `<span class="equip-icon"></span><span class="equip-label">${label}</span>`;
    el.addEventListener('click', () => unequip(slotId));
    el.addEventListener('mousemove', (e) => handleEquipHover(slotId, e));
    el.addEventListener('mouseleave', hideTooltip);
    eqGrid.appendChild(el);
  }

  render();
}

export function addGold(amount) {
  inventory.gold += amount;
  setGold(inventory.gold);
  if (amount > 0) toast(`+${amount} de oro`);
  onChanged?.();
}

export function addItem(itemId, count = 1) {
  const item = ITEMS[itemId];
  if (!item) return false;

  if (item.stackable) {
    const existing = inventory.slots.find((s) => s && s.itemId === itemId);
    if (existing) {
      existing.count += count;
      finishAdd(item, count);
      return true;
    }
  }
  const needed = item.stackable ? 1 : count;
  const free = inventory.slots.reduce((n, s) => n + (s ? 0 : 1), 0);
  if (free < needed) {
    toast('Inventario lleno');
    return false;
  }
  if (item.stackable) {
    inventory.slots[inventory.slots.findIndex((s) => !s)] = { itemId, count };
  } else {
    for (let c = 0; c < count; c++) {
      inventory.slots[inventory.slots.findIndex((s) => !s)] = { itemId, count: 1 };
    }
  }
  finishAdd(item, count);
  return true;
}

function finishAdd(item, count) {
  toast(`Obtenido: ${item.icon} ${item.name}${count > 1 ? ` x${count}` : ''}`);
  render();
  onChanged?.();
}

export function removeItem(itemId, count = 1) {
  let remaining = count;
  for (let i = 0; i < SLOTS && remaining > 0; i++) {
    const s = inventory.slots[i];
    if (s && s.itemId === itemId) {
      const take = Math.min(s.count, remaining);
      s.count -= take;
      remaining -= take;
      if (s.count <= 0) inventory.slots[i] = null;
    }
  }
  render();
  onChanged?.();
  return remaining === 0;
}

export function countItem(itemId) {
  return inventory.slots.reduce((n, s) => n + (s && s.itemId === itemId ? s.count : 0), 0);
}

// ---- Equipo ----
export function equipFromSlot(i) {
  const s = inventory.slots[i];
  if (!s) return;
  const item = ITEMS[s.itemId];
  if (!item.slot) return;
  const prev = inventory.equipment[item.slot];
  inventory.equipment[item.slot] = s.itemId;
  inventory.slots[i] = prev ? { itemId: prev, count: 1 } : null;
  toast(`Equipado: ${item.icon} ${item.name}`);
  render();
  onChanged?.();
}

export function unequip(slotId) {
  const itemId = inventory.equipment[slotId];
  if (!itemId) return;
  const free = inventory.slots.findIndex((s) => !s);
  if (free === -1) {
    toast('Inventario lleno: no puedes desequipar');
    return;
  }
  inventory.slots[free] = { itemId, count: 1 };
  inventory.equipment[slotId] = null;
  toast(`Desequipado: ${ITEMS[itemId].icon} ${ITEMS[itemId].name}`);
  render();
  onChanged?.();
}

// Daño del arma EQUIPADA (0 si peleas con los puños).
export function getWeaponDamage() {
  const itemId = inventory.equipment.arma;
  return itemId ? (ITEMS[itemId].dmg || 0) : 0;
}

// Armadura total de las piezas EQUIPADAS.
export function getArmor() {
  return Object.values(inventory.equipment).reduce(
    (sum, itemId) => sum + (itemId ? (ITEMS[itemId].armor || 0) : 0), 0
  );
}

// ---- Interacción ----
function handleSlotClick(i) {
  const s = inventory.slots[i];
  if (!s) return;
  const item = ITEMS[s.itemId];
  if (item.slot) {
    equipFromSlot(i);
    return;
  }
  if (item.use && onUseItem) {
    const consumed = onUseItem(item);
    if (consumed) {
      s.count -= 1;
      if (s.count <= 0) inventory.slots[i] = null;
      render();
      onChanged?.();
    }
  }
}

function itemTooltip(item) {
  const stats = [];
  if (item.dmg) stats.push(`+${item.dmg} daño`);
  if (item.armor) stats.push(`+${item.armor} armadura`);
  return (
    `<div class="t-name">${item.icon} ${item.name}</div>` +
    `<div class="t-type">${item.type}</div>` +
    (stats.length ? `<div class="t-use">${stats.join(' · ')}</div>` : '') +
    `<div class="t-desc">${item.desc}</div>` +
    (item.use ? `<div class="t-use">${item.use}</div>` : '') +
    (item.slot ? `<div class="t-use">Clic para equipar</div>` : '')
  );
}

function handleSlotHover(i, e) {
  const s = inventory.slots[i];
  if (!s) { hideTooltip(); return; }
  showTooltip(itemTooltip(ITEMS[s.itemId]), e.clientX, e.clientY);
}

function handleEquipHover(slotId, e) {
  const itemId = inventory.equipment[slotId];
  if (!itemId) { hideTooltip(); return; }
  showTooltip(itemTooltip(ITEMS[itemId]) + '<div class="t-use">Clic para desequipar</div>', e.clientX, e.clientY);
}

// ---- Renderizado ----
function render() {
  const grid = document.getElementById('inventory-grid');
  for (let i = 0; i < SLOTS; i++) {
    const el = grid.children[i];
    const s = inventory.slots[i];
    if (!s) {
      el.className = 'inv-slot';
      el.innerHTML = '';
    } else {
      const item = ITEMS[s.itemId];
      el.className = 'inv-slot filled';
      el.innerHTML =
        `<span class="rarity-${item.rarity}">${item.icon}</span>` +
        (s.count > 1 ? `<span class="count">${s.count}</span>` : '');
    }
  }

  const eqGrid = document.getElementById('equipment-grid');
  for (const el of eqGrid.children) {
    const itemId = inventory.equipment[el.dataset.slot];
    const iconEl = el.querySelector('.equip-icon');
    if (itemId) {
      const item = ITEMS[itemId];
      el.classList.add('filled');
      iconEl.innerHTML = `<span class="rarity-${item.rarity}">${item.icon}</span>`;
    } else {
      el.classList.remove('filled');
      iconEl.innerHTML = '';
    }
  }

  const stats = document.getElementById('equip-stats');
  if (stats) stats.textContent = `⚔ Daño ${5 + getWeaponDamage()}–${9 + getWeaponDamage()} · 🛡 Armadura ${getArmor()}`;
}

// ---- Guardado / carga ----
export function serializeInventory() {
  return { slots: inventory.slots, gold: inventory.gold, equipment: inventory.equipment };
}

export function loadInventory(data) {
  if (!data) return;
  if (Array.isArray(data.slots)) {
    inventory.slots = data.slots.slice(0, SLOTS);
    while (inventory.slots.length < SLOTS) inventory.slots.push(null);
  }
  inventory.gold = data.gold || 0;

  if (data.equipment) {
    inventory.equipment = { ...inventory.equipment, ...data.equipment };
  } else {
    // Partida antigua sin equipo: equipar automáticamente lo mejor de cada casilla
    autoEquipBest();
  }
  setGold(inventory.gold);
  render();
}

function autoEquipBest() {
  for (const slotId of Object.keys(EQUIP_SLOTS)) {
    let bestIdx = -1, bestValue = -1;
    for (let i = 0; i < SLOTS; i++) {
      const s = inventory.slots[i];
      if (!s) continue;
      const item = ITEMS[s.itemId];
      if (item.slot !== slotId) continue;
      const value = (item.dmg || 0) + (item.armor || 0);
      if (value > bestValue) { bestValue = value; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      const s = inventory.slots[bestIdx];
      inventory.equipment[slotId] = s.itemId;
      inventory.slots[bestIdx] = null;
    }
  }
}
