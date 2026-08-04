// Tienda de Lyra: compra y venta validadas por el servidor.
import { ITEMS } from './items.js';
import { SHOP_BUY_LIST } from './recipes.js';
import { inventory, countItem } from './inventory.js';
import { sendShopBuy, sendShopSell, sendShopSellSlot } from './network.js';
import { showTooltip, hideTooltip } from './ui.js';
import { idOf, rollOf, displayName, affixLines, gradeInfo, sellValueOf } from './affixes.js';

let currentTab = 'buy';

export function initShop() {
  document.getElementById('tab-buy').addEventListener('click', () => setTab('buy'));
  document.getElementById('tab-sell').addEventListener('click', () => setTab('sell'));
}

export function openShop() {
  setTab('buy');
  document.getElementById('shop-panel').classList.remove('hidden');
}

// Repintar si está abierta (llega un state_sync del servidor)
export function refreshShop() {
  if (!document.getElementById('shop-panel').classList.contains('hidden')) render();
}

function setTab(tab) {
  currentTab = tab;
  document.getElementById('tab-buy').classList.toggle('active', tab === 'buy');
  document.getElementById('tab-sell').classList.toggle('active', tab === 'sell');
  render();
}

function render() {
  const list = document.getElementById('shop-list');
  document.getElementById('shop-gold').textContent = inventory.gold;
  list.innerHTML = '';

  if (currentTab === 'buy') {
    for (const itemId of SHOP_BUY_LIST) {
      const item = ITEMS[itemId];
      const canAfford = inventory.gold >= item.price;
      list.appendChild(shopRow({ itemId }, `${item.price} 🪙`, 'Comprar', canAfford, () => sendShopBuy(itemId)));
    }
    return;
  }

  // Lo corriente se agrupa por tipo; cada pieza CON AFIJOS va en su propia
  // fila, porque no es intercambiable con otra que se llame igual.
  const sellable = [];
  const seen = new Set();
  inventory.slots.forEach((s, i) => {
    if (!s) return;
    const item = ITEMS[s.itemId];
    if (!item?.sell) return;
    if (rollOf(s)) {
      sellable.push({ entry: s, index: i, count: 1 });
    } else if (!seen.has(s.itemId)) {
      seen.add(s.itemId);
      sellable.push({ entry: s, index: -1, count: countItem(s.itemId) });
    }
  });

  if (sellable.length === 0) {
    list.innerHTML = '<p class="shop-empty">No llevas nada que Lyra quiera comprar. El botín de las criaturas del exterior se vende bien.</p>';
    return;
  }
  for (const { entry, index, count } of sellable) {
    const gold = sellValueOf(entry);
    const label = index >= 0 ? 'Vender' : `Vender (x${count})`;
    list.appendChild(shopRow(entry, `${gold} 🪙`, label, true,
      () => (index >= 0 ? sendShopSellSlot(index) : sendShopSell(entry.itemId))));
  }
}

function shopRow(entry, priceText, btnLabel, enabled, onClick) {
  const item = ITEMS[idOf(entry)];
  const roll = rollOf(entry);
  const grade = gradeInfo(roll?.grade || 0);
  const row = document.createElement('div');
  row.className = 'shop-row';

  const info = document.createElement('div');
  info.className = 'shop-info';
  info.innerHTML = `<span class="shop-icon rarity-${item.rarity}">${item.icon}</span>` +
    `<span class="shop-name" ${roll ? `style="color:${grade.color}"` : ''}>` +
      `${displayName(entry)}${roll ? ` ${grade.stars}` : ''}</span>`;
  info.addEventListener('mousemove', (e) => showTooltip(
    `<div class="t-name" ${roll ? `style="color:${grade.color}"` : ''}>${item.icon} ${displayName(entry)}</div>` +
    `<div class="t-type">${item.type}${roll ? ` · ${grade.name}` : ''}</div>` +
    affixLines(entry).map((l) => `<div class="t-affix">${l}</div>`).join('') +
    `<div class="t-desc">${item.desc}</div>`,
    e.clientX, e.clientY
  ));
  info.addEventListener('mouseleave', hideTooltip);
  row.appendChild(info);

  const price = document.createElement('span');
  price.className = 'shop-price';
  price.textContent = priceText;
  row.appendChild(price);

  const btn = document.createElement('button');
  btn.className = 'shop-btn';
  btn.textContent = btnLabel;
  btn.disabled = !enabled;
  btn.addEventListener('click', onClick);
  row.appendChild(btn);

  return row;
}
