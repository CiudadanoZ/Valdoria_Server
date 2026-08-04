// Comercio entre jugadores: panel con tu oferta, la del socio y tu bolsa.
// El intercambio lo ejecuta el servidor de forma atómica cuando ambos confirman.
import { ITEMS } from './items.js';
import { inventory } from './inventory.js';
import { sendTradeOffer, sendTradeConfirm, sendTradeCancel } from './network.js';
import { toast, showTooltip, hideTooltip } from './ui.js';
import { play } from './audio.js';
import { idOf, rollOf, displayName, affixLines, gradeInfo } from './affixes.js';

const $ = (id) => document.getElementById(id);

let active = false;
let offerSlots = new Set(); // índices de la bolsa ofrecidos
let lastUpdate = { mine: { items: [], gold: 0, confirmed: false }, theirs: { items: [], gold: 0, confirmed: false } };

export function initTrade() {
  $('trade-close').addEventListener('click', () => sendTradeCancel());
  $('trade-cancel').addEventListener('click', () => sendTradeCancel());
  $('trade-confirm').addEventListener('click', () => { sendTradeConfirm(); play('click'); });
  $('trade-gold').addEventListener('input', pushOffer);
}

export function isTrading() { return active; }

// Re-render de la bolsa si cambia el inventario durante el comercio
export function refreshTradeBag() { if (active) renderBag(); }

export function openTrade(partnerName) {
  active = true;
  offerSlots = new Set();
  $('trade-partner').textContent = partnerName;
  $('trade-partner2').textContent = partnerName;
  $('trade-gold').value = 0;
  lastUpdate = { mine: { items: [], gold: 0, confirmed: false }, theirs: { items: [], gold: 0, confirmed: false } };
  renderBag();
  render();
  $('trade-panel').classList.remove('hidden');
}

export function applyTradeUpdate(msg) {
  lastUpdate = msg;
  render();
}

export function closeTrade(reason) {
  if (!active) return;
  active = false;
  $('trade-panel').classList.add('hidden');
  hideTooltip();
  if (reason) toast(reason);
}

export function tradeDone() {
  active = false;
  $('trade-panel').classList.add('hidden');
  toast('✓ Comercio completado', 'quest');
  play('buy');
}

// Envía la oferta actual (índices de bolsa + oro) al servidor
function pushOffer() {
  const gold = Math.max(0, Math.min(inventory.gold, parseInt($('trade-gold').value, 10) || 0));
  sendTradeOffer([...offerSlots], gold);
}

function toggleSlot(i) {
  if (offerSlots.has(i)) offerSlots.delete(i);
  else offerSlots.add(i);
  pushOffer();
  renderBag();
}

function renderBag() {
  const bag = $('trade-bag');
  bag.innerHTML = '';
  inventory.slots.forEach((s, i) => {
    const el = document.createElement('div');
    if (!s) { el.className = 'trade-slot'; bag.appendChild(el); return; }
    const item = ITEMS[s.itemId];
    const roll = rollOf(s);
    el.className = 'trade-slot filled' + (offerSlots.has(i) ? ' offered' : '') + (roll ? ` graded g${roll.grade}` : '');
    el.innerHTML = `<span class="rarity-${item.rarity}">${item.icon}</span>`
      + (s.count > 1 ? `<span class="count">${s.count}</span>` : '')
      + (roll ? `<span class="stars">${gradeInfo(roll.grade).stars}</span>` : '');
    el.addEventListener('click', () => toggleSlot(i));
    el.addEventListener('mousemove', (e) => showTooltip(tradeTooltip(s), e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideTooltip);
    bag.appendChild(el);
  });
}

// Lo que se ve al pasar por encima de una pieza puesta sobre la mesa. Con
// afijos hay que poder mirar bien lo que te ofrecen antes de aceptar.
function tradeTooltip(entry) {
  const item = ITEMS[idOf(entry)];
  if (!item) return '<div class="t-name">¿?</div>';
  const roll = rollOf(entry);
  const grade = gradeInfo(roll?.grade || 0);
  return `<div class="t-name" ${roll ? `style="color:${grade.color}"` : ''}>${item.icon} ${displayName(entry)}</div>` +
    `<div class="t-type">${item.type}${roll ? ` · ${grade.name}` : ''}</div>` +
    affixLines(entry).map((l) => `<div class="t-affix">${l}</div>`).join('');
}

function renderOffer(container, items) {
  container.innerHTML = '';
  for (const entry of items) {
    const item = ITEMS[idOf(entry)];
    const roll = rollOf(entry);
    const el = document.createElement('div');
    el.className = 'trade-slot filled' + (roll ? ` graded g${roll.grade}` : '');
    el.innerHTML = `<span class="rarity-${item?.rarity || 'common'}">${item?.icon || '?'}</span>`
      + (roll ? `<span class="stars">${gradeInfo(roll.grade).stars}</span>` : '');
    if (item) {
      el.addEventListener('mousemove', (e) => showTooltip(tradeTooltip(entry), e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideTooltip);
    }
    container.appendChild(el);
  }
}

function render() {
  const { mine, theirs } = lastUpdate;
  renderOffer($('trade-mine'), mine.items);
  renderOffer($('trade-theirs'), theirs.items);
  $('trade-theirs-gold').textContent = `🪙 ${theirs.gold} de oro`;
  $('trade-mine-state').innerHTML = mine.confirmed ? '<span class="trade-state-ok">✓ confirmado</span>' : '';
  $('trade-theirs-state').innerHTML = theirs.confirmed ? '<span class="trade-state-ok">✓ confirmado</span>' : '<span class="trade-state-wait">esperando…</span>';
  const btn = $('trade-confirm');
  btn.classList.toggle('confirmed', mine.confirmed);
  btn.textContent = mine.confirmed ? 'Confirmado ✓' : 'Confirmar';
}
