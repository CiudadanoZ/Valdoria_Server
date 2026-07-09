// Cocina en las hogueras: el servidor valida ingredientes y otorga la comida y la EXP.
import { ITEMS } from './items.js';
import { COOK_RECIPES, COOK_XP } from './recipes.js';
import { countItem } from './inventory.js';
import { sendCook } from './network.js';
import { showTooltip, hideTooltip } from './ui.js';

export function openCooking() {
  render();
  document.getElementById('cooking-panel').classList.remove('hidden');
}

export function refreshCooking() {
  if (!document.getElementById('cooking-panel').classList.contains('hidden')) render();
}

function render() {
  const list = document.getElementById('cooking-list');
  list.innerHTML = '';

  let anything = false;
  COOK_RECIPES.forEach((recipe, index) => {
    const raw = ITEMS[recipe.from];
    const dish = ITEMS[recipe.to];
    const have = countItem(recipe.from);
    if (have > 0) anything = true;

    const row = document.createElement('div');
    row.className = 'craft-row';

    const info = document.createElement('div');
    info.className = 'craft-info';
    info.innerHTML =
      `<div class="craft-title">${raw.icon} ${raw.name} → <span class="rarity-${dish.rarity}">${dish.icon}</span> ${dish.name} <span class="craft-stat">(+${dish.heal} vida)</span></div>` +
      `<div class="craft-mats"><span class="${have > 0 ? 'mat-ok' : 'mat-missing'}">${raw.icon} ${have}/1</span> · +${COOK_XP} EXP</div>`;
    info.addEventListener('mousemove', (e) => showTooltip(
      `<div class="t-name">${dish.icon} ${dish.name}</div>` +
      `<div class="t-type">${dish.type}</div>` +
      `<div class="t-desc">${dish.desc}</div>`,
      e.clientX, e.clientY
    ));
    info.addEventListener('mouseleave', hideTooltip);
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = 'Asar';
    btn.disabled = have < 1;
    btn.addEventListener('click', () => sendCook(index));
    row.appendChild(btn);

    list.appendChild(row);
  });

  document.getElementById('cooking-hint').textContent = anything
    ? 'El fuego crepita. Elige qué asar.'
    : 'No llevas nada crudo. Pesca en el Lago de los Ciervos o caza venados y jabalíes.';
}
