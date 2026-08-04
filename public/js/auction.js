// Casa de subastas: comprar objetos de otros jugadores, vender los tuyos (con
// escrow en el servidor) y recoger las ganancias. Funciona aunque el vendedor
// esté desconectado.
import { ITEMS } from './items.js';
import { inventory } from './inventory.js';
import { pstate } from './pstate.js';
import {
  sendAuctionBrowse, sendAuctionCreate, sendAuctionBuy, sendAuctionCancel, sendAuctionCollect,
} from './network.js';
import { showTooltip, hideTooltip, toast } from './ui.js';
import { idOf, rollOf, displayName, affixLines, gradeInfo } from './affixes.js';

let listings = [];
let mine = [];
let tab = 'buy';
let sellSlot = null; // índice de bolsa elegido para vender

export function initAuction() {
  document.getElementById('ah-tab-buy').addEventListener('click', () => { tab = 'buy'; render(); });
  document.getElementById('ah-tab-sell').addEventListener('click', () => { tab = 'sell'; render(); });
  document.getElementById('ah-tab-mine').addEventListener('click', () => { tab = 'mine'; render(); });
  document.getElementById('ah-sell-btn').addEventListener('click', doSell);
  document.getElementById('ah-collect').addEventListener('click', () => sendAuctionCollect());
}

export function openAuction() {
  tab = 'buy';
  sellSlot = null;
  sendAuctionBrowse(); // el servidor responde con auction_data
  document.getElementById('auction-panel').classList.remove('hidden');
}

export function applyAuctionData(msg) {
  listings = msg.listings || [];
  mine = msg.mine || [];
  render();
}

export function refreshAuction() {
  if (!document.getElementById('auction-panel').classList.contains('hidden')) sendAuctionBrowse();
}

// entry: id suelto o instancia { itemId, roll }. En una casa de subastas con
// botín aleatorio, los afijos SON el anuncio: sin verlos no se puede pujar.
function itemTip(entry) {
  const item = ITEMS[idOf(entry)];
  if (!item) return '';
  const roll = rollOf(entry);
  const grade = gradeInfo(roll?.grade || 0);
  return `<div class="t-name" ${roll ? `style="color:${grade.color}"` : ''}>${item.icon} ${displayName(entry)}</div>` +
    `<div class="t-type">${item.type}${roll ? ` · ${grade.name}` : ''}</div>` +
    affixLines(entry).map((l) => `<div class="t-affix">${l}</div>`).join('') +
    `<div class="t-desc">${item.desc}</div>`;
}

// Nombre con estrellas y color para las filas del listado.
function itemLabel(entry) {
  const roll = rollOf(entry);
  const grade = gradeInfo(roll?.grade || 0);
  return `<span class="shop-name" ${roll ? `style="color:${grade.color}"` : ''}>` +
    `${displayName(entry)}${roll ? ` ${grade.stars}` : ''}</span>`;
}

function render() {
  for (const t of ['buy', 'sell', 'mine']) {
    document.getElementById(`ah-tab-${t}`).classList.toggle('active', t === tab);
  }
  document.getElementById('ah-gold').textContent = inventory.gold;
  document.getElementById('ah-earnings').textContent = pstate.auctionGold || 0;
  document.getElementById('ah-collect').disabled = (pstate.auctionGold || 0) <= 0;

  document.getElementById('ah-buy').classList.toggle('hidden', tab !== 'buy');
  document.getElementById('ah-sell').classList.toggle('hidden', tab !== 'sell');
  document.getElementById('ah-mine').classList.toggle('hidden', tab !== 'mine');

  if (tab === 'buy') renderBuy();
  else if (tab === 'sell') renderSell();
  else renderMine();
}

function renderBuy() {
  const list = document.getElementById('ah-buy');
  if (listings.length === 0) { list.innerHTML = '<p class="shop-empty">No hay subastas activas.</p>'; return; }
  list.innerHTML = '';
  for (const a of listings) {
    const item = ITEMS[a.item];
    if (!item) continue;
    const entry = { itemId: a.item, roll: a.roll || null };
    const row = document.createElement('div');
    row.className = 'shop-row';
    const info = document.createElement('div');
    info.className = 'shop-info';
    info.innerHTML = `<span class="shop-icon rarity-${item.rarity}">${item.icon}</span>` +
      `<span class="shop-name">${itemLabel(entry)}<br/><small style="color:#8a7a5a">${a.sellerName}</small></span>`;
    info.addEventListener('mousemove', (e) => showTooltip(itemTip(entry), e.clientX, e.clientY));
    info.addEventListener('mouseleave', hideTooltip);
    row.appendChild(info);
    const price = document.createElement('span');
    price.className = 'shop-price';
    price.textContent = `${a.price} 🪙`;
    row.appendChild(price);
    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = 'Comprar';
    btn.disabled = inventory.gold < a.price;
    btn.addEventListener('click', () => sendAuctionBuy(a.id));
    row.appendChild(btn);
    list.appendChild(row);
  }
}

function renderSell() {
  // Rejilla de la bolsa para elegir el objeto a subastar
  const grid = document.getElementById('ah-sell-bag');
  grid.innerHTML = '';
  inventory.slots.forEach((s, i) => {
    const el = document.createElement('div');
    if (!s) { el.className = 'trade-slot'; grid.appendChild(el); return; }
    const item = ITEMS[s.itemId];
    const roll = rollOf(s);
    const sellable = item.type !== 'Objeto de misión';
    el.className = 'trade-slot filled' + (sellSlot === i ? ' offered' : '') + (sellable ? '' : ' locked')
      + (roll ? ` graded g${roll.grade}` : '');
    el.innerHTML = `<span class="rarity-${item.rarity}">${item.icon}</span>`
      + (s.count > 1 ? `<span class="count">${s.count}</span>` : '')
      + (roll ? `<span class="stars">${gradeInfo(roll.grade).stars}</span>` : '');
    if (sellable) el.addEventListener('click', () => { sellSlot = (sellSlot === i ? null : i); render(); });
    el.addEventListener('mousemove', (e) => showTooltip(itemTip(s), e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideTooltip);
    grid.appendChild(el);
  });
  const sel = sellSlot !== null ? inventory.slots[sellSlot] : null;
  document.getElementById('ah-sell-selected').textContent =
    sel ? `${ITEMS[sel.itemId].icon} ${displayName(sel)}` : 'ningún objeto';
  document.getElementById('ah-sell-btn').disabled = !sel;
}

function doSell() {
  if (sellSlot === null) return;
  const price = parseInt(document.getElementById('ah-sell-price').value, 10) || 0;
  if (price < 1) { toast('Pon un precio válido'); return; }
  sendAuctionCreate(sellSlot, price);
  sellSlot = null;
}

function renderMine() {
  const list = document.getElementById('ah-mine');
  if (mine.length === 0) { list.innerHTML = '<p class="shop-empty">No tienes subastas activas.</p>'; return; }
  list.innerHTML = '';
  for (const a of mine) {
    const item = ITEMS[a.item];
    if (!item) continue;
    const entry = { itemId: a.item, roll: a.roll || null };
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `<div class="shop-info"><span class="shop-icon rarity-${item.rarity}">${item.icon}</span>` +
      `${itemLabel(entry)}</div><span class="shop-price">${a.price} 🪙</span>`;
    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = 'Retirar';
    btn.addEventListener('click', () => sendAuctionCancel(a.id));
    row.appendChild(btn);
    list.appendChild(row);
  }
}
