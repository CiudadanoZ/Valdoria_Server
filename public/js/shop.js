// Tienda de Lyra: compra de provisiones y venta de botín.
import { ITEMS } from './items.js';
import { inventory, addItem, removeItem, countItem, addGold } from './inventory.js';
import { toast, showTooltip, hideTooltip } from './ui.js';
import { renderTracker } from './quests.js';

// Lo que Lyra tiene a la venta
const BUY_LIST = ['pocion_vida', 'pocion_vida_mayor', 'pan_centeno', 'espada_acero'];

let currentTab = 'buy';

export function initShop() {
  document.getElementById('tab-buy').addEventListener('click', () => setTab('buy'));
  document.getElementById('tab-sell').addEventListener('click', () => setTab('sell'));
}

export function openShop() {
  setTab('buy');
  document.getElementById('shop-panel').classList.remove('hidden');
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
    for (const itemId of BUY_LIST) {
      const item = ITEMS[itemId];
      const canAfford = inventory.gold >= item.price;
      list.appendChild(shopRow(item, `${item.price} 🪙`, 'Comprar', canAfford, () => {
        if (inventory.gold < item.price) return;
        if (!addItem(itemId, 1)) return; // inventario lleno
        addGold(-item.price);
        render();
      }));
    }
    return;
  }

  // Vender: todo lo del inventario con valor de venta
  const sellable = [];
  const seen = new Set();
  for (const s of inventory.slots) {
    if (!s || seen.has(s.itemId)) continue;
    const item = ITEMS[s.itemId];
    if (item.sell) {
      seen.add(s.itemId);
      sellable.push({ item, count: countItem(s.itemId) });
    }
  }
  if (sellable.length === 0) {
    list.innerHTML = '<p class="shop-empty">No llevas nada que Lyra quiera comprar. El botín de las criaturas del exterior se vende bien.</p>';
    return;
  }
  for (const { item, count } of sellable) {
    list.appendChild(shopRow(item, `${item.sell} 🪙`, `Vender (x${count})`, true, () => {
      if (countItem(item.id) <= 0) return;
      removeItem(item.id, 1);
      addGold(item.sell);
      renderTracker(); // por si vende objetos que cuentan para una misión
      render();
    }));
  }
}

function shopRow(item, priceText, btnLabel, enabled, onClick) {
  const row = document.createElement('div');
  row.className = 'shop-row';

  const info = document.createElement('div');
  info.className = 'shop-info';
  info.innerHTML = `<span class="shop-icon rarity-${item.rarity}">${item.icon}</span>` +
    `<span class="shop-name">${item.name}</span>`;
  info.addEventListener('mousemove', (e) => showTooltip(
    `<div class="t-name">${item.icon} ${item.name}</div>` +
    `<div class="t-type">${item.type}</div>` +
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
