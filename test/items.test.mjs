// El catálogo de objetos: que cada casilla tenga una curva completa, que todo
// lo que se puede soltar, comprar o forjar exista de verdad, y que el set
// abisal sea lo mejor del juego y solo caiga en Las Profundidades.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot } from './helpers/bot.mjs';
import { ITEMS } from '../public/js/items.js';
import { CRAFT_RECIPES, SHOP_BUY_LIST, QUEST_REWARDS } from '../public/js/recipes.js';
import { MOB_TYPES } from '../server/mobs-data.js';
import { buildDepthMobs, SET_ABISAL } from '../server/depths.js';
import { armorMitigation } from '../public/js/combat-data.js';

const CASILLAS = ['arma', 'cabeza', 'torso', 'escudo', 'espalda', 'accesorio'];
const valor = (it) => it.dmg || it.armor || 0;
const deCasilla = (slot) => Object.values(ITEMS).filter((it) => it.slot === slot);

let server;
before(async () => {
  server = await startServer({
    seed: [{ account: 'tonico', name: 'Sediento', gold: 0, items: [{ itemId: 'tonico_vigor' }, { itemId: 'tonico_vigor' }] }],
  });
});
after(async () => { await server.stop(); });

test('cada casilla tiene al menos seis piezas', () => {
  // Antes había un solo peto en todo el juego: los afijos no tenían dónde caer.
  for (const slot of CASILLAS) {
    assert.ok(deCasilla(slot).length >= 6, `${slot} solo tiene ${deCasilla(slot).length} piezas`);
  }
});

test('cada casilla cubre la curva entera, del arranque al final', () => {
  for (const slot of CASILLAS) {
    const valores = deCasilla(slot).map(valor).sort((a, b) => a - b);
    const min = valores[0], max = valores.at(-1);
    assert.ok(max >= min * 4, `${slot}: de ${min} a ${max} no es una curva, es un escalón`);
    // Sin huecos enormes entre una pieza y la siguiente
    for (let i = 1; i < valores.length; i++) {
      assert.ok(valores[i] - valores[i - 1] <= Math.max(4, max * 0.25),
        `${slot}: salto de ${valores[i - 1]} a ${valores[i]} deja un hueco sin pieza`);
    }
  }
});

test('el set abisal es lo mejor de cada casilla', () => {
  for (const [id] of SET_ABISAL) {
    const it = ITEMS[id];
    assert.ok(it, `${id} no existe`);
    const mejor = Math.max(...deCasilla(it.slot).map(valor));
    assert.equal(valor(it), mejor, `${id} debería ser lo mejor en ${it.slot}`);
  }
});

test('el set abisal solo cae en Las Profundidades', () => {
  const abisales = new Set(SET_ABISAL.map(([id]) => id));
  for (const [tipo, def] of Object.entries(MOB_TYPES)) {
    for (const [id] of def.drops) {
      assert.ok(!abisales.has(id), `${tipo} suelta ${id} en el mundo: debe ser exclusivo de la mazmorra`);
    }
  }
  let n = 1;
  const guardian = buildDepthMobs(4, () => n++, 9).find((m) => m.isGuardian);
  for (const id of abisales) {
    assert.ok(guardian.def.drops.some(([d]) => d === id), `el guardián debería poder soltar ${id}`);
  }
});

test('todo botín, receta y artículo de tienda apunta a algo que existe', () => {
  for (const [tipo, def] of Object.entries(MOB_TYPES)) {
    for (const [id, p] of def.drops) {
      assert.ok(ITEMS[id], `${tipo} suelta ${id}, que no existe`);
      assert.ok(p > 0 && p <= 1, `${tipo}: probabilidad imposible para ${id}`);
    }
  }
  for (const r of CRAFT_RECIPES) {
    assert.ok(ITEMS[r.result], `receta de ${r.result}, que no existe`);
    for (const m of Object.keys(r.mats)) assert.ok(ITEMS[m], `${r.result} pide ${m}, que no existe`);
  }
  for (const id of SHOP_BUY_LIST) assert.ok(ITEMS[id]?.price > 0, `Lyra vende ${id} sin precio`);
});

test('cada pieza nueva se puede conseguir de alguna forma', () => {
  // Un objeto que no cae, no se vende y no se forja es un objeto que no existe.
  const conseguibles = new Set([
    ...SHOP_BUY_LIST,
    ...CRAFT_RECIPES.map((r) => r.result),
    ...Object.values(MOB_TYPES).flatMap((d) => d.drops.map(([id]) => id)),
    ...SET_ABISAL.map(([id]) => id),
    ...Object.values(QUEST_REWARDS).flatMap((r) => Object.keys(r.items || {})),
  ]);
  for (const it of Object.values(ITEMS)) {
    if (!it.slot) continue;
    assert.ok(conseguibles.has(it.id), `${it.id} no se puede conseguir de ninguna forma`);
  }
});

test('la armadura completa ya pesa de verdad', () => {
  // Con el set legendario completo se mitigaba un 32%: poco contra pisos que
  // pegan cinco veces más. El abisal tiene que acercarse a la mitad.
  const abisal = SET_ABISAL.map(([id]) => ITEMS[id].armor || 0).reduce((a, b) => a + b, 0);
  assert.ok(armorMitigation(abisal) > 0.45, `el set abisal mitiga solo un ${Math.round(armorMitigation(abisal) * 100)}%`);
  assert.ok(ITEMS.casco_cuero.armor >= 2 && ITEMS.corona_cripta.armor >= 8, 'las piezas viejas también subieron');
});

// ---- Contra el servidor ----

test('el tónico devuelve recurso de clase y no cura vida', async () => {
  // Un guerrero empieza con la furia a cero: puede beber.
  const bot = await spawnBot(server.url, { account: 'tonico', clazz: 'guerrero' });
  const idx = bot.charState.inventory.slots.findIndex((s) => s?.itemId === 'tonico_vigor');
  assert.ok(idx >= 0, 'el héroe sembrado debe llevar tónicos');
  const antes = bot.mp;

  bot.clear();
  bot.send({ type: 'use_item', itemId: 'tonico_vigor' });
  const usado = await bot.waitFor('item_used');
  assert.ok(usado.resource > 0, 'debe devolver furia');
  assert.ok(usado.mp > antes, `la furia debe subir (${antes} → ${usado.mp})`);
  assert.equal(usado.heal, 0, 'no cura vida: es solo de recurso');
  bot.disconnect();
});
