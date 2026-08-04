// Las Profundidades (cliente): el panel de la trampilla y el marcador de piso.
// Todo lo que decide (a qué piso puedes bajar, cuándo se abre la escalera) lo
// dice el servidor; aquí solo se muestra y se pide.
import { sendDepthsEnter, sendDepthsDescend, sendDepthsLeave, sendDepthsInfo } from './network.js';
import { toast } from './ui.js';
import { play } from './audio.js';

const $ = (id) => document.getElementById(id);

// Lo último que dijo el servidor sobre nuestro descenso.
export const depths = {
  inside: false,
  depth: 0,
  best: 0,
  record: 0,
  stairsOpen: false,
  guardian: '',
  top: [],
};

export function initDepths() {
  $('depths-close')?.addEventListener('click', () => $('depths-panel').classList.add('hidden'));
  $('depths-enter-btn')?.addEventListener('click', () => {
    const piso = Math.max(1, parseInt($('depths-floor').value, 10) || 1);
    sendDepthsEnter(piso);
    $('depths-panel').classList.add('hidden');
  });
  $('depths-leave-btn')?.addEventListener('click', () => sendDepthsLeave());
  $('depths-descend-btn')?.addEventListener('click', () => sendDepthsDescend());
}

// Abre el panel de la trampilla (clic sobre ella en la Ciudadela).
export function openDepths() {
  sendDepthsInfo();
  $('depths-panel').classList.remove('hidden');
  render();
}

export function applyDepthsInfo(msg) {
  depths.best = msg.best || 0;
  depths.record = msg.record || 0;
  depths.top = msg.top || [];
  render();
}

export function onDepthsEntered(msg) {
  depths.inside = true;
  depths.depth = msg.depth;
  depths.best = msg.best || depths.best;
  depths.stairsOpen = false;
  depths.guardian = msg.guardian || '';
  play('portal');
  toast(`⛓ Piso ${msg.depth}. Te espera ${msg.guardian}.`, 'quest');
  renderHud();
}

export function onDepthsLeft(msg) {
  depths.inside = false;
  depths.depth = 0;
  depths.stairsOpen = false;
  toast(msg.reason || 'Sales de Las Profundidades.');
  renderHud();
}

export function onStairsOpen(msg) {
  depths.stairsOpen = true;
  play('quest');
  toast(`🔓 ${msg.text}`, 'quest');
  renderHud();
}

// Marcador permanente en pantalla mientras estás dentro: a qué piso bajaste y
// qué te falta para poder seguir bajando.
function renderHud() {
  const hud = $('depths-hud');
  if (!hud) return;
  hud.classList.toggle('hidden', !depths.inside);
  $('depths-leave-btn')?.classList.toggle('hidden', !depths.inside);
  $('depths-descend-btn')?.classList.toggle('hidden', !depths.inside || !depths.stairsOpen);
  if (!depths.inside) return;
  hud.innerHTML =
    `<div class="dh-floor">⛓ Piso ${depths.depth}</div>` +
    (depths.stairsOpen
      ? '<div class="dh-open">La escalera está abierta · baja o retírate</div>'
      : `<div class="dh-lock">Vigila ${depths.guardian}</div>`) +
    `<div class="dh-warn">Si caes aquí, el descenso termina</div>`;
}

function render() {
  const info = $('depths-info');
  if (!info) return;
  const tope = depths.best + 1;
  info.innerHTML =
    `<p>Bajo la Ciudadela se abre una escalera que nadie ha visto terminar. ` +
    `Cada piso es más duro que el anterior y suelta mejores tiradas.</p>` +
    `<p class="depths-mark">Esta semana has llegado al piso <b>${depths.best || 0}</b>` +
    (depths.record ? ` · tu récord es <b>${depths.record}</b>` : '') + `.</p>`;

  const sel = $('depths-floor');
  sel.innerHTML = '';
  for (let d = 1; d <= tope; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = `Piso ${d}${d === tope ? ' · nuevo' : ''}`;
    sel.appendChild(opt);
  }
  sel.value = tope;

  const board = $('depths-board');
  if (!depths.top.length) {
    board.innerHTML = '<p class="shop-empty">Nadie ha bajado aún esta semana. Sé el primero.</p>';
    return;
  }
  board.innerHTML = depths.top.map((c, i) =>
    `<div class="lb-row"><span class="lb-pos">${i + 1}</span>` +
    `<span class="lb-name">${c.name}</span>` +
    `<span class="lb-val">Piso ${c.depth}</span></div>`
  ).join('');
}
