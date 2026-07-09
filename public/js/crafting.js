// Forja de Bramm: convierte materiales de caza (pieles, colmillos, huesos,
// esencias) y oro en armas y armaduras.
import { ITEMS } from './items.js';
import { inventory, addItem, removeItem, countItem, addGold } from './inventory.js';
import { toast, showTooltip, hideTooltip } from './ui.js';

// Recetas: resultado + materiales + coste de mano de obra
const RECIPES = [
  { result: 'cuchillo_colmillos', mats: { colmillo_lobo: 4 }, gold: 15 },
  { result: 'armadura_pieles', mats: { piel_lobo: 5 }, gold: 30 },
  { result: 'capa_oso', mats: { piel_oso: 3 }, gold: 40 },
  { result: 'hoja_cazador', mats: { colmillo_lobo: 6, piel_lobo: 2 }, gold: 60 },
  { result: 'escudo_hueso', mats: { hueso_antiguo: 6 }, gold: 40 },
  { result: 'espada_espectral', mats: { esencia_espectral: 4, hueso_antiguo: 6 }, gold: 100 },
];

export function initCrafting() {
  // El panel se rellena al abrirse
}

export function openCrafting() {
  render();
  document.getElementById('crafting-panel').classList.remove('hidden');
}

function canCraft(recipe) {
  if (inventory.gold < recipe.gold) return false;
  return Object.entries(recipe.mats).every(([id, n]) => countItem(id) >= n);
}

function craft(recipe) {
  if (!canCraft(recipe)) return;
  const item = ITEMS[recipe.result];
  if (!addItem(recipe.result, 1)) return; // inventario lleno
  for (const [id, n] of Object.entries(recipe.mats)) removeItem(id, n);
  addGold(-recipe.gold);
  toast(`🔨 Bramm forja: ${item.icon} ${item.name}`, 'quest');
  render();
}

function render() {
  const list = document.getElementById('crafting-list');
  document.getElementById('crafting-gold').textContent = inventory.gold;
  list.innerHTML = '';

  for (const recipe of RECIPES) {
    const item = ITEMS[recipe.result];
    const row = document.createElement('div');
    row.className = 'craft-row';

    const info = document.createElement('div');
    info.className = 'craft-info';
    const statText = item.dmg ? `+${item.dmg} daño` : `+${item.armor} armadura`;
    info.innerHTML =
      `<div class="craft-title"><span class="rarity-${item.rarity}">${item.icon}</span> ${item.name} <span class="craft-stat">(${statText})</span></div>` +
      `<div class="craft-mats">${matsHtml(recipe)}</div>`;
    info.addEventListener('mousemove', (e) => showTooltip(
      `<div class="t-name">${item.icon} ${item.name}</div>` +
      `<div class="t-type">${item.type}</div>` +
      `<div class="t-desc">${item.desc}</div>`,
      e.clientX, e.clientY
    ));
    info.addEventListener('mouseleave', hideTooltip);
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = 'Forjar';
    btn.disabled = !canCraft(recipe);
    btn.addEventListener('click', () => craft(recipe));
    row.appendChild(btn);

    list.appendChild(row);
  }
}

function matsHtml(recipe) {
  const parts = Object.entries(recipe.mats).map(([id, n]) => {
    const have = countItem(id);
    const ok = have >= n;
    return `<span class="${ok ? 'mat-ok' : 'mat-missing'}">${ITEMS[id].icon} ${have}/${n}</span>`;
  });
  const goldOk = inventory.gold >= recipe.gold;
  parts.push(`<span class="${goldOk ? 'mat-ok' : 'mat-missing'}">🪙 ${recipe.gold}</span>`);
  return parts.join(' · ');
}
