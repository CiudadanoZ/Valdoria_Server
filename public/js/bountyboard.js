// Tablón de Encargos: encargos DIARIOS (3, se renuevan cada día) y contratos
// SEMANALES (2, más largos y mejor pagados). Hay que aceptarlos para que
// empiecen a contar; el progreso lo lleva el servidor y aparece en el rastreador
// de misiones mientras están en curso.
import { sendBountyAccept, sendBountyClaim } from './network.js';
import { play } from './audio.js';

let daily = null;   // { day, list: [...] }
let weekly = null;  // { week, list: [...] }

export function applyBounties(data, weeklyData) {
  if (data) daily = data;
  if (weeklyData) weekly = weeklyData;
  if (!document.getElementById('bounty-panel').classList.contains('hidden')) render();
}

export function openBountyBoard() {
  render();
  document.getElementById('bounty-panel').classList.remove('hidden');
}

/** Encargos aceptados y sin cobrar: lo que debe seguir el rastreador. */
export function activeBounties() {
  const out = [];
  for (const [tanda, datos] of [['diario', daily], ['semanal', weekly]]) {
    for (const b of datos?.list || []) {
      if (b.accepted && !b.claimed) out.push({ ...b, tanda });
    }
  }
  return out;
}

// Cuánto queda para que se renueve la tanda (para que el jugador sepa si le da
// tiempo). El día y la semana se reinician en UTC.
function tiempoRestante(esSemanal) {
  const ahora = Date.now();
  const dia = 86400000;
  const finDia = Math.ceil(ahora / dia) * dia;
  const ms = esSemanal
    ? (Math.ceil((ahora / dia + 3) / 7) * 7 - 3) * dia - ahora
    : finDia - ahora;
  const horas = Math.floor(ms / 3600000);
  if (horas >= 24) return `${Math.floor(horas / 24)} d ${horas % 24} h`;
  if (horas >= 1) return `${horas} h`;
  return `${Math.max(1, Math.floor(ms / 60000))} min`;
}

function fila(b) {
  const done = b.count >= b.need;
  const row = document.createElement('div');
  row.className = 'bounty-row' + (b.claimed ? ' claimed' : '') + (b.accepted && !b.claimed ? ' accepted' : '');

  const info = document.createElement('div');
  info.className = 'bounty-info';
  const progreso = b.claimed ? 'Completado ✓'
    : !b.accepted ? 'Sin aceptar'
    : `${Math.min(b.count, b.need)}/${b.need}`;
  info.innerHTML =
    `<div class="bounty-title">📜 ${b.title}</div>` +
    `<div class="bounty-desc">${b.desc}</div>` +
    `<div class="bounty-progress ${done ? 'done' : ''}">${progreso} · 🪙 ${b.gold} · ✦ ${b.xp} EXP</div>`;
  row.appendChild(info);

  const btn = document.createElement('button');
  btn.className = 'shop-btn';
  if (b.claimed) {
    btn.textContent = 'Cobrado';
    btn.disabled = true;
  } else if (!b.accepted) {
    btn.textContent = 'Aceptar';
    btn.addEventListener('click', () => { sendBountyAccept(b.id); play('click'); });
  } else if (done) {
    btn.textContent = 'Cobrar';
    btn.addEventListener('click', () => { sendBountyClaim(b.id); play('click'); });
  } else {
    btn.textContent = 'En curso';
    btn.disabled = true;
  }
  row.appendChild(btn);
  return row;
}

function seccion(list, titulo, restante, vacio) {
  const frag = document.createDocumentFragment();
  const h = document.createElement('h3');
  h.className = 'bounty-section';
  h.innerHTML = `${titulo} <span class="bounty-timer">se renuevan en ${restante}</span>`;
  frag.appendChild(h);
  if (!list?.length) {
    const p = document.createElement('p');
    p.className = 'shop-empty';
    p.textContent = vacio;
    frag.appendChild(p);
  } else {
    for (const b of list) frag.appendChild(fila(b));
  }
  return frag;
}

function render() {
  const list = document.getElementById('bounty-list');
  list.innerHTML = '';
  if (!daily && !weekly) {
    list.innerHTML = '<p class="shop-empty">El Tablón está vacío. Vuelve más tarde.</p>';
    return;
  }
  list.appendChild(seccion(daily?.list, '📅 Encargos diarios', tiempoRestante(false), 'Sin encargos hoy.'));
  list.appendChild(seccion(weekly?.list, '🗓️ Contratos semanales', tiempoRestante(true), 'Sin contratos esta semana.'));
}
