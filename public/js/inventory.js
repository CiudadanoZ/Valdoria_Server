// Inventario del jugador: VISTA del estado autoritativo del servidor.
// Toda mutación (usar, equipar, comprar, forjar...) se pide por red y el
// servidor responde con un state_sync que vuelve a pintar este panel.
import { ITEMS } from './items.js';
import { sendUseItem, sendEquip, sendUnequip } from './network.js';
import { setGold, showTooltip, hideTooltip } from './ui.js';
import {
  statsOf, sumStats, displayName, affixLines, gradeInfo, rollOf, idOf, AFFIXES,
} from './affixes.js';

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

const equippedList = () => Object.values(inventory.equipment).filter(Boolean);

// Daño del arma EQUIPADA (0 si peleas con los puños), afijos incluidos.
export function getWeaponDamage() {
  return statsOf(inventory.equipment.arma).dmg;
}

// Armadura total de las piezas EQUIPADAS.
export function getArmor() {
  return sumStats(equippedList(), 'armor');
}

// Bonificaciones que aportan los afijos del equipo. El servidor lleva las
// suyas por su cuenta; estas son para que el cliente mueva y pinte igual.
export function getAffix(field) {
  return sumStats(equippedList(), field);
}

// ---- Interacción (todo termina en un RPC al servidor) ----
function handleSlotClick(i) {
  const s = inventory.slots[i];
  if (!s) return;
  const item = ITEMS[s.itemId];
  if (item.slot) sendEquip(i);
  else if (item.use) sendUseItem(item.id);
}

// Comparación con lo que llevas puesto. Con botín aleatorio esta es LA pregunta
// que se hace el jugador cada vez que cae algo: ¿mejora lo que tengo?
function compareLines(entry) {
  const item = ITEMS[idOf(entry)];
  if (!item?.slot) return '';
  const worn = inventory.equipment[item.slot];
  if (!worn || worn === entry) return '';

  const mine = statsOf(entry);
  const theirs = statsOf(worn);
  const rows = [];
  for (const field of ['dmg', 'armor', 'hp', 'speed', 'healMul', 'regen', 'gold']) {
    const diff = (mine[field] || 0) - (theirs[field] || 0);
    if (!diff) continue;
    const def = AFFIXES[field];
    const label = def ? def.label : field;
    const shown = field === 'dmg' || field === 'armor' || field === 'hp'
      ? Math.round(diff)
      : `${diff > 0 ? '+' : ''}${Math.round(diff * 100)}%`;
    const txt = typeof shown === 'number' ? `${shown > 0 ? '+' : ''}${shown}` : shown;
    rows.push(`<span class="${diff > 0 ? 'cmp-up' : 'cmp-down'}">${txt} ${label}</span>`);
  }
  if (!rows.length) return '<div class="t-cmp">Igual que lo equipado</div>';
  return `<div class="t-cmp">Frente a lo equipado: ${rows.join(' · ')}</div>`;
}

function itemTooltip(entry, { compare = false } = {}) {
  const item = ITEMS[idOf(entry)];
  if (!item) return '';
  const roll = rollOf(entry);
  const grade = gradeInfo(roll?.grade || 0);
  const base = [];
  if (item.dmg) base.push(`${item.dmg} de daño`);
  if (item.armor) base.push(`${item.armor} de armadura`);

  return (
    `<div class="t-name" ${roll ? `style="color:${grade.color}"` : ''}>` +
      `${item.icon} ${displayName(entry)}${roll ? ` <span class="t-stars">${grade.stars}</span>` : ''}</div>` +
    `<div class="t-type">${item.type}${roll ? ` · ${grade.name}` : ''}</div>` +
    (base.length ? `<div class="t-base">${base.join(' · ')}</div>` : '') +
    affixLines(entry).map((l) => `<div class="t-affix">${l}</div>`).join('') +
    (compare ? compareLines(entry) : '') +
    `<div class="t-desc">${item.desc}</div>` +
    (item.use ? `<div class="t-use">${item.use}</div>` : '') +
    (item.slot ? `<div class="t-use">Clic para equipar</div>` : '')
  );
}

function handleSlotHover(i, e) {
  const s = inventory.slots[i];
  if (!s) { hideTooltip(); return; }
  showTooltip(itemTooltip(s, { compare: true }), e.clientX, e.clientY);
}

function handleEquipHover(slotId, e) {
  const entry = inventory.equipment[slotId];
  if (!entry) { hideTooltip(); return; }
  showTooltip(itemTooltip(entry) + '<div class="t-use">Clic para desequipar</div>', e.clientX, e.clientY);
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
      const roll = rollOf(s);
      el.className = 'inv-slot filled' + (roll ? ` graded g${roll.grade}` : '');
      el.innerHTML =
        `<span class="rarity-${item.rarity}">${item.icon}</span>` +
        (s.count > 1 ? `<span class="count">${s.count}</span>` : '') +
        (roll ? `<span class="stars">${gradeInfo(roll.grade).stars}</span>` : '');
    }
  }

  const eqGrid = document.getElementById('equipment-grid');
  for (const el of eqGrid.children) {
    const entry = inventory.equipment[el.dataset.slot];
    const iconEl = el.querySelector('.equip-icon');
    if (entry) {
      const item = ITEMS[idOf(entry)];
      const roll = rollOf(entry);
      el.className = `equip-slot filled${roll ? ` graded g${roll.grade}` : ''}`;
      iconEl.innerHTML = `<span class="rarity-${item.rarity}">${item.icon}</span>`;
    } else {
      el.className = 'equip-slot';
      iconEl.innerHTML = '';
    }
  }

  const stats = document.getElementById('equip-stats');
  if (!stats) return;
  const dmg = getWeaponDamage();
  const extra = [];
  const hp = getAffix('hp');
  const spd = getAffix('speed');
  if (hp) extra.push(`❤️ +${hp}`);
  if (spd) extra.push(`💨 +${Math.round(spd * 100)}%`);
  stats.textContent =
    `⚔ Daño ${5 + dmg}–${9 + dmg} · 🛡 Armadura ${getArmor()}` +
    (extra.length ? ` · ${extra.join(' · ')}` : '');
}
