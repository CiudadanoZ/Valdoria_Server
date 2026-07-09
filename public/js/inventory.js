// Inventario del jugador: VISTA del estado autoritativo del servidor.
// Toda mutación (usar, equipar, comprar, forjar...) se pide por red y el
// servidor responde con un state_sync que vuelve a pintar este panel.
import { ITEMS } from './items.js';
import { sendUseItem, sendEquip, sendUnequip } from './network.js';
import { setGold, showTooltip, hideTooltip } from './ui.js';

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

export function initInventory() {
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
    el.addEventListener('click', () => { if (inventory.equipment[slotId]) sendUnequip(slotId); });
    el.addEventListener('mousemove', (e) => handleEquipHover(slotId, e));
    el.addEventListener('mouseleave', hideTooltip);
    eqGrid.appendChild(el);
  }

  render();
}

// Aplica el estado que envía el servidor (welcome y state_sync)
export function applyInventory(data) {
  if (!data) return;
  if (Array.isArray(data.slots)) {
    inventory.slots = data.slots.slice(0, SLOTS);
    while (inventory.slots.length < SLOTS) inventory.slots.push(null);
  }
  inventory.gold = data.gold || 0;
  if (data.equipment) inventory.equipment = { ...inventory.equipment, ...data.equipment };
  setGold(inventory.gold);
  render();
}

export function countItem(itemId) {
  return inventory.slots.reduce((n, s) => n + (s && s.itemId === itemId ? s.count : 0), 0);
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

// ---- Interacción (todo termina en un RPC al servidor) ----
function handleSlotClick(i) {
  const s = inventory.slots[i];
  if (!s) return;
  const item = ITEMS[s.itemId];
  if (item.slot) sendEquip(i);
  else if (item.use) sendUseItem(item.id);
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
  if (!grid.children.length) return;
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
