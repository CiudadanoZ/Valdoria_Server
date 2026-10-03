// La forja de Bramm sobre afijos. Todo botín aleatorio necesita una vía de
// rezar menos: retemplar y reforjar dejan APUNTAR a una pieza concreta en vez
// de esperar a que el suelo te la regale.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot } from './helpers/bot.mjs';
import { retemper, reforge, forgeCost, AFFIXES, POWERS } from '../public/js/affixes.js';
import { ITEMS } from '../public/js/items.js';
import { buildDepthMobs } from '../server/depths.js';
import { NPC_SPOTS } from '../server/world-map.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const FORJA = NPC_SPOTS.bramm;
const reliquia = () => ({ tier: 16, grade: 3, affixes: [{ id: 'dmg', v: 8 }, { id: 'hp', v: 30 }], power: 'sed' });

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('la Esquirla Abisal solo cae en Las Profundidades', () => {
  let id = 1;
  const mobs = buildDepthMobs(5, () => id++, 42);
  for (const m of mobs) {
    const suelta = m.def.drops.some(([itemId]) => itemId === 'esquirla_abisal');
    assert.ok(suelta, `${m.type} de la mazmorra debería poder soltar esquirlas`);
  }
  // El guardián la suelta seguro; los secuaces, a veces
  const guardian = mobs.find((m) => m.isGuardian);
  const chanceGuardian = guardian.def.drops.find(([i]) => i === 'esquirla_abisal')[1];
  const secuaz = mobs.find((m) => !m.isGuardian);
  const chanceSecuaz = secuaz.def.drops.find(([i]) => i === 'esquirla_abisal')[1];
  assert.equal(chanceGuardian, 1, 'el guardián la suelta siempre');
  assert.ok(chanceSecuaz < 1, 'los secuaces no');
});

test('retemplar cambia los valores pero respeta afijos y poder', () => {
  const rnd = seeded(13);
  const antes = reliquia();
  const despues = retemper(antes, rnd);

  assert.deepEqual(despues.affixes.map((a) => a.id), antes.affixes.map((a) => a.id),
    'los afijos son los mismos');
  assert.equal(despues.power, antes.power, 'el poder legendario no se toca');
  assert.equal(despues.grade, antes.grade);
  assert.equal(despues.tier, antes.tier);
});

test('retemplar de verdad mueve los valores', () => {
  const rnd = seeded(29);
  const original = reliquia();
  let distinto = false;
  for (let i = 0; i < 40 && !distinto; i++) {
    const r = retemper(original, rnd);
    if (r.affixes.some((a, n) => a.v !== original.affixes[n].v)) distinto = true;
  }
  assert.ok(distinto, 'si nunca cambia nada, retemplar no sirve de nada');
});

test('los valores retemplados siguen sin salirse del techo de su tier', () => {
  const rnd = seeded(51);
  const original = reliquia();
  for (let i = 0; i < 500; i++) {
    for (const a of retemper(original, rnd).affixes) {
      const def = AFFIXES[a.id];
      assert.ok(a.v <= Math.round(def.base + def.per * original.tier) + 1,
        `${a.id}=${a.v} se pasa del techo del tier ${original.tier}`);
    }
  }
});

test('reforjar cambia los afijos y puede dar (o quitar) el poder', () => {
  const rnd = seeded(97);
  const original = reliquia();
  let vistoConPoder = false, vistoSinPoder = false, afijosDistintos = false;

  for (let i = 0; i < 600; i++) {
    const r = reforge('filo_glacial', original, rnd);
    assert.equal(r.grade, original.grade, 'el grado se conserva');
    assert.equal(r.tier, original.tier, 'y el tier también');
    const huecos = r.affixes.length + (r.power ? 1 : 0);
    assert.equal(huecos, r.grade, 'los huecos deben cuadrar con el grado');
    if (r.power) vistoConPoder = true; else vistoSinPoder = true;
    if (r.affixes.some((a, n) => a.id !== original.affixes[n]?.id)) afijosDistintos = true;
  }
  assert.ok(afijosDistintos, 'reforjar tiene que poder cambiar los afijos');
  assert.ok(vistoConPoder, 'y poder devolver un poder legendario');
  assert.ok(vistoSinPoder, 'pero también quitártelo: por eso es la apuesta grande');
});

test('reforjar una pieza de grado 1 nunca le regala un poder', () => {
  const rnd = seeded(7);
  const humilde = { tier: 10, grade: 1, affixes: [{ id: 'hp', v: 12 }] };
  for (let i = 0; i < 800; i++) {
    assert.equal(reforge('filo_glacial', humilde, rnd).power, undefined,
      'los poderes son cosa de reliquias');
  }
});

test('reforjar cuesta más que retemplar, y lo hondo más que lo de la llanura', () => {
  const r = reliquia();
  const ret = forgeCost(r, 'retemper');
  const ref = forgeCost(r, 'reforge');
  assert.ok(ref.shards > ret.shards && ref.gold > ret.gold, 'la apuesta grande cuesta más');

  const humilde = { tier: 2, grade: 1, affixes: [{ id: 'hp', v: 6 }] };
  const barato = forgeCost(humilde, 'retemper');
  assert.ok(barato.gold < ret.gold && barato.shards < ret.shards,
    'una pieza de la llanura no puede costar lo mismo que una reliquia abisal');
});

// ---- Contra el servidor de verdad ----

test('hay que estar en la forja para que Bramm trabaje', async () => {
  const bot = await spawnBot(server.url, { account: 'lejosForja' });
  await bot.walkTo(0, 40);
  bot.clear();
  bot.send({ type: 'forge_roll', bagIndex: 0, kind: 'retemper' });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /lejos de la forja/i);
  bot.disconnect();
});

test('Bramm no trabaja piezas sin afijos', async () => {
  const bot = await spawnBot(server.url, { account: 'sinAfijos' });
  await bot.walkTo(...FORJA);
  bot.clear();
  bot.send({ type: 'forge_roll', bagIndex: 0, kind: 'retemper' });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /piezas con afijos/i);
  bot.disconnect();
});

test('sin esquirlas no hay trabajo', async () => {
  const bot = await spawnBot(server.url, { account: 'sinEsquirlas' });
  await bot.walkTo(...FORJA);
  // Una casilla vacía y otra imposible: en ambos casos debe negarse, no romper
  for (const idx of [3, 99, -1]) {
    bot.clear();
    bot.send({ type: 'forge_roll', bagIndex: idx, kind: 'reforge' });
    const fail = await bot.waitFor('rpc_fail');
    assert.ok(fail.reason, `el índice ${idx} debe fallar con motivo, no colgarse`);
  }
  bot.disconnect();
});

test('el objeto del catálogo existe y es apilable', () => {
  const e = ITEMS.esquirla_abisal;
  assert.ok(e, 'la Esquirla Abisal tiene que estar en el catálogo');
  assert.equal(e.stackable, true, 'es un material: se apila');
  assert.ok(e.sell > 0, 'y se puede vender');
  assert.ok(!e.slot, 'no es equipo, así que nunca tira afijos');
});

test('todos los poderes que puede dar la forja existen', () => {
  const rnd = seeded(3);
  const original = reliquia();
  for (let i = 0; i < 2000; i++) {
    const p = reforge('filo_glacial', original, rnd).power;
    if (p) assert.ok(POWERS[p], `la forja inventó el poder ${p}`);
  }
});
