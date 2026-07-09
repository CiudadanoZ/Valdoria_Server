// Cocina en las hogueras: convierte pescado y carne cruda en platos que curan
// mucho más. Cocinar da un poco de experiencia.
import { ITEMS } from './items.js';
import { addItem, removeItem, countItem } from './inventory.js';
import { toast, showTooltip, hideTooltip } from './ui.js';
import { addXp } from './progression.js';

const RECIPES = [
  { from: 'pez_comun', to: 'pescado_asado' },
  { from: 'pez_grande', to: 'pescado_grande_asado' },
  { from: 'carne_venado', to: 'venado_asado' },
  { from: 'carne_jabali', to: 'jabali_asado' },
  { from: 'pez_dorado', to: 'festin_dorado' },
];

const COOK_XP = 3;

export function openCooking() {
  render();
  document.getElementById('cooking-panel').classList.remove('hidden');
}

function cook(recipe) {
  if (countItem(recipe.from) < 1) return;
  const dish = ITEMS[recipe.to];
  if (!addItem(recipe.to, 1)) return; // inventario lleno
  removeItem(recipe.from, 1);
  addXp(COOK_XP);
  toast(`🔥 Cocinado: ${dish.icon} ${dish.name}`);
  render();
}

function render() {
  const list = document.getElementById('cooking-list');
  list.innerHTML = '';

  let anything = false;
  for (const recipe of RECIPES) {
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
    btn.addEventListener('click', () => cook(recipe));
    row.appendChild(btn);

    list.appendChild(row);
  }

  document.getElementById('cooking-hint').textContent = anything
    ? 'El fuego crepita. Elige qué asar.'
    : 'No llevas nada crudo. Pesca en el Lago de los Ciervos o caza venados y jabalíes.';
}
