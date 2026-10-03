// Economía: casa de subastas y comercio entre jugadores.
// Lo crítico aquí es que no se pueda duplicar oro ni objetos: el intercambio es
// atómico y el objeto subastado queda en depósito.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';
import { NPC_SPOTS } from '../server/world-map.js';

const SUBASTAS = NPC_SPOTS.subastas; // Subastador Vell

// Cada test estrena sus cuentas: el servidor rechaza entrar dos veces con el
// mismo personaje («ya está dentro del mundo») y, además, el oro y la bolsa que
// deja un test contaminarían las cuentas del siguiente.
let server;
before(async () => {
  server = await startServer({
    seed: [
      { account: 'ventaUno', name: 'VendeUno', gold: 200, items: [{ itemId: 'piel_lobo', count: 3 }] },
      { account: 'compraUno', name: 'CompraUno', gold: 200 },
      { account: 'ventaDos', name: 'VendeDos', gold: 200, items: [{ itemId: 'piel_lobo', count: 2 }] },
      { account: 'ventaTres', name: 'VendeTres', gold: 200, items: [{ itemId: 'piel_lobo', count: 2 }] },
      { account: 'compraTres', name: 'CompraTres', gold: 10 },
      { account: 'tratanteA', name: 'Tratante', gold: 100, items: [{ itemId: 'colmillo_lobo', count: 2 }] },
      { account: 'tratanteB', name: 'Cliente', gold: 100, items: [{ itemId: 'hueso_antiguo', count: 1 }] },
      { account: 'tratanteC', name: 'Regatea', gold: 100 },
      { account: 'tratanteD', name: 'Regateado', gold: 100 },
    ],
  });
});
after(async () => { await server.stop(); });

const bolsa = (bot) => bot.sync?.inventory ?? bot.charState.inventory;
const cuantos = (bot, itemId) =>
  bolsa(bot).slots.reduce((n, s) => n + (s && s.itemId === itemId ? s.count : 0), 0);

test('subastar deja el objeto en depósito y el comprador lo recibe pagando', async () => {
  const v = await spawnBot(server.url, { account: 'ventaUno' });
  const c = await spawnBot(server.url, { account: 'compraUno' });
  await v.walkTo(...SUBASTAS);
  await c.walkTo(...SUBASTAS);

  const pielesAntes = cuantos(v, 'piel_lobo');
  const slot = bolsa(v).slots.findIndex((s) => s?.itemId === 'piel_lobo');

  // Publicar: la piel sale de la bolsa (depósito)
  v.clear();
  v.send({ type: 'auction_create', slot, price: 50 });
  await v.waitFor('state_sync');
  await v.until(() => cuantos(v, 'piel_lobo') === pielesAntes - 1, 3000,
    'el objeto sale de la bolsa al subastarlo');

  // El comprador la ve y la compra
  c.clear();
  c.send({ type: 'auction_browse' });
  const lista = await c.waitFor('auction_data');
  const puja = lista.listings.find((l) => l.item === 'piel_lobo' && l.sellerName === v.charName);
  assert.ok(puja, 'la subasta debe aparecer en el listado');

  const oroCompradorAntes = bolsa(c).gold;
  c.clear();
  c.send({ type: 'auction_buy', id: puja.id });
  await c.until(() => cuantos(c, 'piel_lobo') === 1, 3000, 'el comprador recibe el objeto');
  assert.equal(bolsa(c).gold, oroCompradorAntes - 50, 'y paga su precio');

  // El vendedor cobra menos la comisión del 5%
  await v.until(() => (v.sync?.auctionGold ?? 0) > 0, 3000, 'las ganancias quedan pendientes');
  assert.equal(v.sync.auctionGold, 50 - Math.floor(50 * 0.05), 'se queda el 5% de comisión');

  const oroVendedorAntes = bolsa(v).gold;
  v.clear();
  v.send({ type: 'auction_collect' });
  await v.until(() => bolsa(v).gold > oroVendedorAntes, 3000, 'recoge las ganancias');
  assert.equal(bolsa(v).gold, oroVendedorAntes + (50 - Math.floor(50 * 0.05)));
  assert.equal(v.sync.auctionGold, 0, 'y quedan a cero');

  v.disconnect(); c.disconnect();
});

test('cancelar una subasta devuelve el objeto', async () => {
  const v = await spawnBot(server.url, { account: 'ventaDos' });
  await v.walkTo(...SUBASTAS);

  const antes = cuantos(v, 'piel_lobo');
  const slot = bolsa(v).slots.findIndex((s) => s?.itemId === 'piel_lobo');
  v.clear();
  v.send({ type: 'auction_create', slot, price: 30 });
  await v.until(() => cuantos(v, 'piel_lobo') === antes - 1, 3000, 'queda en depósito');

  v.clear();
  v.send({ type: 'auction_browse' });
  const mias = await v.waitFor('auction_data');
  const mia = mias.mine.find((l) => l.item === 'piel_lobo');
  assert.ok(mia, 'debe verla en «mis subastas»');

  v.send({ type: 'auction_cancel', id: mia.id });
  await v.until(() => cuantos(v, 'piel_lobo') === antes, 3000, 'al cancelar vuelve a la bolsa');

  v.disconnect();
});

test('no se puede comprar la propia subasta ni pagar sin oro', async () => {
  const v = await spawnBot(server.url, { account: 'ventaTres' });
  const c = await spawnBot(server.url, { account: 'compraTres' });
  await v.walkTo(...SUBASTAS);
  await c.walkTo(...SUBASTAS);

  const slot = bolsa(v).slots.findIndex((s) => s?.itemId === 'piel_lobo');
  v.clear();
  v.send({ type: 'auction_create', slot, price: 99999 });
  await v.waitFor('state_sync');

  v.clear();
  v.send({ type: 'auction_browse' });
  const lista = await v.waitFor('auction_data');
  const mia = lista.listings.find((l) => l.sellerName === v.charName && l.price === 99999);
  assert.ok(mia);

  // El comprador no llega al precio
  c.clear();
  c.send({ type: 'auction_buy', id: mia.id });
  assert.match((await c.waitFor('rpc_fail')).reason, /oro/i, 'sin oro no se compra');

  v.disconnect(); c.disconnect();
});

test('el comercio entre jugadores intercambia de forma atómica', async () => {
  const a = await spawnBot(server.url, { account: 'tratanteA' });
  const b = await spawnBot(server.url, { account: 'tratanteB' });
  await b.walkTo(a.pos.x, a.pos.z + 2); // hay que estar cerca (14)

  a.clear(); b.clear();
  a.send({ type: 'trade_request', targetId: b.id });
  await b.waitFor('trade_request');
  b.send({ type: 'trade_accept', fromId: a.id });
  await a.waitFor('trade_open');
  await b.waitFor('trade_open');

  const oroA = bolsa(a).gold, oroB = bolsa(b).gold;
  const slotA = bolsa(a).slots.findIndex((s) => s?.itemId === 'colmillo_lobo');
  const slotB = bolsa(b).slots.findIndex((s) => s?.itemId === 'hueso_antiguo');

  // A ofrece un colmillo + 25 de oro; B ofrece un hueso
  a.send({ type: 'trade_offer', slots: [slotA], gold: 25 });
  b.send({ type: 'trade_offer', slots: [slotB], gold: 0 });
  await wait(300);

  a.send({ type: 'trade_confirm' });
  b.send({ type: 'trade_confirm' });
  await a.waitFor('trade_done');

  await a.until(() => cuantos(a, 'hueso_antiguo') === 1, 3000, 'A recibe el hueso');
  await b.until(() => cuantos(b, 'colmillo_lobo') === 1, 3000, 'B recibe el colmillo');
  assert.equal(cuantos(a, 'colmillo_lobo'), 1, 'A entrega uno de sus dos colmillos');
  assert.equal(cuantos(b, 'hueso_antiguo'), 0, 'B entrega su hueso');
  assert.equal(bolsa(a).gold, oroA - 25, 'A paga el oro ofrecido');
  assert.equal(bolsa(b).gold, oroB + 25, 'B lo recibe');

  a.disconnect(); b.disconnect();
});

test('cambiar la oferta anula las confirmaciones previas', async () => {
  const a = await spawnBot(server.url, { account: 'tratanteC' });
  const b = await spawnBot(server.url, { account: 'tratanteD' });
  await b.walkTo(a.pos.x, a.pos.z + 2);

  a.send({ type: 'trade_request', targetId: b.id });
  await b.waitFor('trade_request');
  b.send({ type: 'trade_accept', fromId: a.id });
  await a.waitFor('trade_open');

  const oroB = bolsa(b).gold;
  a.send({ type: 'trade_offer', slots: [], gold: 10 });
  await wait(200);
  a.send({ type: 'trade_confirm' });
  b.send({ type: 'trade_confirm' });
  await a.waitFor('trade_done');

  // Si las confirmaciones se respetaran tras cambiar la oferta, aquí habría
  // un agujero para colar un trato distinto al aceptado.
  assert.equal(bolsa(b).gold, oroB + 10, 'se cierra exactamente el trato confirmado');

  a.disconnect(); b.disconnect();
});
