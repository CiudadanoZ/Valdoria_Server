// Forja de Bramm: el servidor valida materiales y oro y aplica la receta.
import { ITEMS } from './items.js';
import { CRAFT_RECIPES } from './recipes.js';
import { inventory, countItem } from './inventory.js';
import { sendCraft } from './network.js';
import { showTooltip, hideTooltip } from './ui.js';

export function initCrafting() {
  // El panel se rellena al abrirse
}

export function openCrafting() {
  render();
  document.getElementById('crafting-panel').classList.remove('hidden');
}

export function refreshCrafting() {
  if (!document.getElementById('crafting-panel').classList.contains('hidden')) render();
}

function canCraft(recipe) {
  if (inventory.gold < recipe.gold) return false;
  return Object.entries(recipe.mats).every(([id, n]) => countItem(id) >= n);
}

function render() {
  const list = document.getElementById('crafting-list');
  document.getElementById('crafting-gold').textContent = inventory.gold;
  list.innerHTML = '';

  CRAFT_RECIPES.forEach((recipe, index) => {
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
    btn.addEventListener('click', () => sendCraft(index));
    row.appendChild(btn);

    list.appendChild(row);
  });
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
