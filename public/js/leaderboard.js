// Panel de Clasificaciones: muestra el top 10 de héroes del reino por nivel,
// oro y bajas. Los datos los calcula el servidor sobre todas las cuentas.
import { RACES, CLASSES } from './races.js';
import { sendLeaderboard } from './network.js';

let boards = null;
let tab = 'level';

const TABS = {
  level: { label: 'Nivel', render: (c) => `Nv ${c.level}` },
  gold: { label: 'Oro', render: (c) => `🪙 ${c.gold}` },
  kills: { label: 'Bajas', render: (c) => `⚔ ${c.kills}` },
  pvp: { label: 'JcJ', render: (c) => `⚔ ${c.pvp || 0}` },
};

export function initLeaderboard() {
  document.getElementById('lb-close')?.addEventListener('click', close);
  for (const id of Object.keys(TABS)) {
    document.getElementById(`lb-tab-${id}`)?.addEventListener('click', () => { tab = id; render(); });
  }
}

export function openLeaderboard() {
  document.getElementById('leaderboard-panel').classList.remove('hidden');
  document.getElementById('lb-list').innerHTML = '<p class="shop-empty">Cargando…</p>';
  sendLeaderboard(); // el servidor responde con applyLeaderboard
}

export function applyLeaderboard(data) {
  boards = data;
  if (!document.getElementById('leaderboard-panel').classList.contains('hidden')) render();
}

function close() {
  document.getElementById('leaderboard-panel').classList.add('hidden');
}

function render() {
  for (const id of Object.keys(TABS)) {
    document.getElementById(`lb-tab-${id}`)?.classList.toggle('active', id === tab);
  }
  const list = document.getElementById('lb-list');
  const rows = boards?.[tab] || [];
  if (rows.length === 0) {
    list.innerHTML = '<p class="shop-empty">Aún no hay héroes en esta clasificación.</p>';
    return;
  }
  list.innerHTML = rows.map((c, i) => {
    const race = RACES[c.race] || RACES.humano;
    const clazz = CLASSES[c.class] || CLASSES.guerrero;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `<div class="lb-row">` +
      `<span class="lb-rank">${medal}</span>` +
      `<span class="lb-name">${race.icon}${clazz.icon} ${escapeHtml(c.name)}</span>` +
      `<span class="lb-value">${TABS[tab].render(c)}</span>` +
      `</div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
