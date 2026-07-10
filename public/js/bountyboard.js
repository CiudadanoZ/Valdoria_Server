// Tablón de Encargos: panel que muestra los 3 encargos diarios del reino, su
// progreso (contado por el servidor) y el botón de cobro. Se abre al hacer clic
// en el Tablón junto a la fuente.
import { sendBountyClaim } from './network.js';
import { play } from './audio.js';

let state = null; // { day, list: [{id, mob, need, title, desc, gold, xp, count, claimed}] }

export function applyBounties(data) {
  if (data) state = data;
  if (!document.getElementById('bounty-panel').classList.contains('hidden')) render();
}

export function openBountyBoard() {
  render();
  document.getElementById('bounty-panel').classList.remove('hidden');
}

function render() {
  const list = document.getElementById('bounty-list');
  list.innerHTML = '';
  if (!state || !state.list?.length) {
    list.innerHTML = '<p class="shop-empty">El Tablón está vacío. Vuelve más tarde.</p>';
    return;
  }
  for (const b of state.list) {
    const done = b.count >= b.need;
    const row = document.createElement('div');
    row.className = 'bounty-row' + (b.claimed ? ' claimed' : '');

    const info = document.createElement('div');
    info.className = 'bounty-info';
    const progress = b.claimed ? 'Completado ✓' : `${Math.min(b.count, b.need)}/${b.need}`;
    info.innerHTML =
      `<div class="bounty-title">📜 ${b.title}</div>` +
      `<div class="bounty-desc">${b.desc}</div>` +
      `<div class="bounty-progress ${done ? 'done' : ''}">${progress} · 🪙 ${b.gold} · ✦ ${b.xp} EXP</div>`;
    row.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = b.claimed ? 'Cobrado' : done ? 'Cobrar' : 'En curso';
    btn.disabled = b.claimed || !done;
    btn.addEventListener('click', () => { sendBountyClaim(b.id); play('click'); });
    row.appendChild(btn);

    list.appendChild(row);
  }
}
