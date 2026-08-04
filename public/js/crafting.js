// Forja de Bramm: el servidor valida materiales y oro y aplica la receta.
import { ITEMS } from './items.js';
import { CRAFT_RECIPES } from './recipes.js';
import { inventory, countItem } from './inventory.js';
import { sendCraft, sendForgeRoll } from './network.js';
import { showTooltip, hideTooltip } from './ui.js';
import { rollOf, displayName, affixLines, gradeInfo, powerOf, forgeCost } from './affixes.js';

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

  renderAffixWork(list);

  const cabecera = document.createElement('h3');
  cabecera.className = 'bounty-section';
  cabecera.textContent = '🔨 Forjar equipo';
  list.appendChild(cabecera);

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

// ---- Retemplar y reforjar ----
// Es la vía de "rezar menos": el botín lo decide el azar, pero aquí se puede
// insistir sobre una pieza concreta hasta sacarle lo que buscas.
function renderAffixWork(list) {
  const conAfijos = inventory.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => rollOf(s));

  const cabecera = document.createElement('h3');
  cabecera.className = 'bounty-section';
  cabecera.textContent = '🔮 Trabajar afijos';
  list.appendChild(cabecera);

  if (!conAfijos.length) {
    const vacio = document.createElement('p');
    vacio.className = 'shop-empty';
    vacio.textContent = 'No llevas ninguna pieza con afijos. Bramm solo puede retemplar lo que ya salió encantado del suelo.';
    list.appendChild(vacio);
    return;
  }

  for (const { s, i } of conAfijos) {
    const item = ITEMS[s.itemId];
    const roll = rollOf(s);
    const grade = gradeInfo(roll.grade);
    const row = document.createElement('div');
    row.className = 'craft-row';

    const info = document.createElement('div');
    info.className = 'craft-info';
    info.innerHTML =
      `<div class="craft-title"><span class="rarity-${item.rarity}">${item.icon}</span> ` +
        `<span style="color:${grade.color}">${displayName(s)} ${grade.stars}</span></div>` +
      `<div class="craft-mats">${affixLines(s).join(' · ')}</div>`;
    info.addEventListener('mousemove', (e) => showTooltip(
      `<div class="t-name" style="color:${grade.color}">${item.icon} ${displayName(s)}</div>` +
      affixLines(s).map((l) => `<div class="t-affix">${l}</div>`).join('') +
      (powerOf(s) ? `<div class="t-power"><b>${powerOf(s).icon} ${powerOf(s).name}</b><br/>${powerOf(s).desc}</div>` : ''),
      e.clientX, e.clientY
    ));
    info.addEventListener('mouseleave', hideTooltip);
    row.appendChild(info);

    for (const kind of ['retemper', 'reforge']) {
      const coste = forgeCost(roll, kind);
      const puede = countItem('esquirla_abisal') >= coste.shards && inventory.gold >= coste.gold;
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      btn.innerHTML = `${kind === 'reforge' ? 'Reforjar' : 'Retemplar'}<br/>` +
        `<small>🔮 ${coste.shards} · 🪙 ${coste.gold}</small>`;
      btn.disabled = !puede;
      btn.title = kind === 'reforge'
        ? 'Afijos nuevos de arriba abajo. Puede salir el poder que buscas… o llevarse el que tenías.'
        : 'Mismos afijos, valores nuevos. El poder legendario no se toca.';
      btn.addEventListener('click', () => sendForgeRoll(i, kind));
      row.appendChild(btn);
    }
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
