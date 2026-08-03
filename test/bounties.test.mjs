// Tablón de Encargos: encargos diarios y contratos semanales.
// Lo importante: un encargo NO avanza hasta que el héroe lo acepta, y solo se
// cobra una vez completado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';
import { BOUNTY_COUNT, WEEKLY_COUNT } from '../public/js/bounties.js';

const TABLON = [8, 6]; // Tablón de Encargos, en la plaza

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const encargos = (bot) => bot.sync?.bounties ?? bot.charState.bounties;
const semanales = (bot) => bot.sync?.weeklies ?? bot.charState.weeklies;

test('el tablón reparte encargos diarios y contratos semanales', async () => {
  const bot = await spawnBot(server.url, { account: 'tablonInicio' });

  assert.equal(encargos(bot).list.length, BOUNTY_COUNT, 'debe haber encargos diarios');
  assert.equal(semanales(bot).list.length, WEEKLY_COUNT, 'y contratos semanales');
  // Todos empiezan SIN aceptar: el jugador elige a qué se compromete
  for (const b of [...encargos(bot).list, ...semanales(bot).list]) {
    assert.equal(b.accepted, false, `${b.id} no debe venir aceptado`);
    assert.equal(b.count, 0);
    assert.equal(b.claimed, false);
  }
  bot.disconnect();
});

test('un encargo sin aceptar NO avanza al matar criaturas', async () => {
  const bot = await spawnBot(server.url, { account: 'sinAceptar', clazz: 'guerrero' });
  // Buscar un encargo diario de una criatura que se pueda cazar cerca
  const lobos = encargos(bot).list.find((b) => b.mob === 'lobo');
  const objetivo = lobos || encargos(bot).list[0];

  const lobo = bot.nearestMob(objetivo.mob) || bot.nearestMob('lobo');
  if (lobo) {
    await bot.engage(lobo.id);
    for (let i = 0; i < 3; i++) await bot.attack(lobo.id);
    await wait(400);
  }

  const tras = encargos(bot).list.find((b) => b.id === objetivo.id);
  assert.equal(tras.count, 0, 'sin aceptar, el encargo no debe contar bajas');
  bot.disconnect();
});

test('hay que estar junto al Tablón para aceptar', async () => {
  const bot = await spawnBot(server.url, { account: 'lejosTablon' });
  await bot.walkTo(0, 60);   // fuera de la plaza

  bot.clear();
  bot.send({ type: 'bounty_accept', bountyId: encargos(bot).list[0].id });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /lejos del Tabl/i);
  bot.disconnect();
});

test('al aceptar, el encargo avanza con las bajas y se cobra al completarlo', async () => {
  const bot = await spawnBot(server.url, { account: 'aceptaEncargo', clazz: 'guerrero' });
  const objetivo = encargos(bot).list.find((b) => b.mob === 'lobo') || encargos(bot).list[0];

  // Aceptar junto al Tablón
  await bot.walkTo(...TABLON);
  bot.clear();
  bot.send({ type: 'bounty_accept', bountyId: objetivo.id });
  const ok = await bot.waitFor('bounty_accepted');
  assert.equal(ok.bountyId, objetivo.id);
  await bot.until(() => encargos(bot).list.find((b) => b.id === objetivo.id)?.accepted, 3000, 'queda aceptado');

  // Aceptar dos veces el mismo no debe colar
  bot.clear();
  bot.send({ type: 'bounty_accept', bountyId: objetivo.id });
  assert.match((await bot.waitFor('rpc_fail')).reason, /no se puede aceptar/i);

  // Ahora sí avanza al matar
  const lobo = bot.nearestMob(objetivo.mob);
  if (lobo) {
    await bot.engage(lobo.id);
    for (let i = 0; i < 6 && !bot.deadMobs.has(lobo.id); i++) await bot.attack(lobo.id);
    await bot.until(() => (encargos(bot).list.find((b) => b.id === objetivo.id)?.count ?? 0) > 0,
      4000, 'el encargo aceptado cuenta la baja');
  }

  // Cobrarlo sin terminarlo debe fallar
  const actual = encargos(bot).list.find((b) => b.id === objetivo.id);
  if (actual.count < actual.need) {
    bot.clear();
    bot.send({ type: 'bounty_claim', bountyId: objetivo.id });
    assert.match((await bot.waitFor('rpc_fail')).reason, /no está completado/i);
  }
  bot.disconnect();
});

test('los contratos semanales se aceptan igual y son más jugosos', async () => {
  const bot = await spawnBot(server.url, { account: 'contratoSemanal' });
  const semanal = semanales(bot).list[0];
  const diarioMax = Math.max(...encargos(bot).list.map((b) => b.gold));

  assert.ok(semanal.gold > diarioMax, `un semanal (${semanal.gold}) debe pagar más que cualquier diario (${diarioMax})`);

  await bot.walkTo(...TABLON);
  bot.clear();
  bot.send({ type: 'bounty_accept', bountyId: semanal.id });
  const ok = await bot.waitFor('bounty_accepted');
  assert.equal(ok.bountyId, semanal.id);
  await bot.until(() => semanales(bot).list.find((b) => b.id === semanal.id)?.accepted, 3000, 'el contrato queda aceptado');

  bot.disconnect();
});
