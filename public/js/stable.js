// Establo: comprar monturas, seleccionar la activa y montar/desmontar.
import { MOUNTS } from './world-data.js';
import { inventory } from './inventory.js';
import { pstate } from './pstate.js';
import { sendMountBuy, sendMountSelect, sendMountToggle } from './network.js';
import { showTooltip, hideTooltip } from './ui.js';

export function openStable() {
  render();
  document.getElementById('stable-panel').classList.remove('hidden');
}

export function refreshStable() {
  if (!document.getElementById('stable-panel').classList.contains('hidden')) render();
}

function render() {
  document.getElementById('stable-gold').textContent = inventory.gold;
  const list = document.getElementById('stable-list');
  list.innerHTML = '';
  for (const m of Object.values(MOUNTS)) {
    const owned = pstate.mounts.includes(m.id);
    const selected = pstate.mount === m.id;
    const row = document.createElement('div');
    row.className = 'craft-row';

    const info = document.createElement('div');
    info.className = 'craft-info';
    info.innerHTML =
      `<div class="craft-title">${m.icon} ${m.name} <span class="craft-stat">(+${Math.round(m.speed * 100)}% velocidad)</span></div>` +
      `<div class="craft-mats">${m.desc}</div>`;
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    if (!owned) {
      btn.textContent = `Comprar (🪙 ${m.price})`;
      btn.disabled = inventory.gold < m.price;
      btn.addEventListener('click', () => sendMountBuy(m.id));
    } else if (selected) {
      btn.textContent = 'Seleccionada';
      btn.disabled = true;
    } else {
      btn.textContent = 'Seleccionar';
      btn.addEventListener('click', () => sendMountSelect(m.id));
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}
