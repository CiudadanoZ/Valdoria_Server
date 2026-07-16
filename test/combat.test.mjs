// Combate: recursos de clase, coste de habilidades y precio de la muerte.
// Todo lo que se comprueba aquí es autoritativo del servidor: un cliente
// manipulado no debe poder saltárselo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';
import { RESOURCES } from '../public/js/skills-data.js';
import { xpForLevel } from '../public/js/talents-data.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('el guerrero entra sin furia y el sacerdote con el maná lleno', async () => {
  const gue = await spawnBot(server.url, { account: 'furiaIni', clazz: 'guerrero' });
  const sac = await spawnBot(server.url, { account: 'manaIni', clazz: 'sacerdote' });

  assert.equal(gue.mp, 0, 'la furia se gana luchando: se empieza a 0');
  assert.equal(gue.maxMp, RESOURCES.guerrero.max);
  assert.equal(sac.mp, RESOURCES.sacerdote.max, 'el sacerdote entra con el pozo lleno');

  gue.disconnect(); sac.disconnect();
});

test('sin recurso, el servidor rechaza la habilidad', async () => {
  const bot = await spawnBot(server.url, { account: 'sinFuria', clazz: 'guerrero' });
  bot.clear();
  bot.send({ type: 'skill_hits', skillId: 'golpe', hits: [] });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /furia/i);
  assert.equal(bot.mp, 0, 'no debe cobrar nada si rechaza');
  bot.disconnect();
});

test('el guerrero acumula furia al golpear y al recibir golpes', async () => {
  const bot = await spawnBot(server.url, { account: 'acumFuria', clazz: 'guerrero' });
  const lobo = bot.nearestMob('lobo');
  await bot.engage(lobo.id);

  const antes = bot.mp;
  await bot.attack(lobo.id);
  await bot.until(() => bot.mp > antes, 3000, 'la furia sube al golpear');

  assert.ok(bot.mp >= RESOURCES.guerrero.onAttack,
    `tras golpear debe tener al menos ${RESOURCES.guerrero.onAttack} de furia, tiene ${bot.mp}`);
  bot.disconnect();
});

test('lanzar una habilidad cobra exactamente su coste', async () => {
  const bot = await spawnBot(server.url, { account: 'cobroSkill', clazz: 'sacerdote' });
  // El sacerdote entra lleno: se puede medir el cobro sin ruido de acumulación.
  const antes = bot.mp;
  bot.clear();
  bot.send({ type: 'skill_heal', skillId: 'palabra' }); // cuesta 30
  await bot.waitFor('skill_heal_ok');
  // El maná regenera 5/s: se compara contra el valor del propio mensaje.
  const cobrado = antes - bot.mp;
  assert.ok(cobrado >= 28 && cobrado <= 30, `debe cobrar ~30 de maná, cobró ${cobrado}`);
  bot.disconnect();
});

test('el maná regenera solo con el tiempo', async () => {
  const bot = await spawnBot(server.url, { account: 'regenMana', clazz: 'sacerdote' });
  bot.send({ type: 'skill_heal', skillId: 'palabra' });
  await bot.waitFor('skill_heal_ok');
  const bajo = bot.mp;
  await bot.until(() => bot.mp > bajo + 5, 4000, 'el maná regenera');
  assert.ok(bot.mp > bajo, 'el maná debe subir solo');
  bot.disconnect();
});

test('la furia decae al dejar de luchar', async () => {
  const bot = await spawnBot(server.url, { account: 'decaeFuria', clazz: 'guerrero' });
  const lobo = bot.nearestMob('lobo');
  await bot.engage(lobo.id);
  await bot.attack(lobo.id);
  await bot.until(() => bot.mp > 0, 3000, 'gana furia');

  // Alejarse: recibir golpes también da furia, así que hay que salir de combate.
  await bot.walkTo(0, 20);
  const alSalir = bot.mp;
  assert.ok(alSalir > 0, 'debe llegar con furia acumulada');
  await bot.until(() => bot.mp < alSalir, 12000, 'la furia decae fuera de combate');
  bot.disconnect();
});

// ---- Muerte ----
// Se mata por JcJ: es inmediato frente a esperar a que un jefe te tumbe, y
// recorre el mismo applyDeathPenalty que la muerte por criatura.
// Cada llamada usa cuentas propias: el servidor es compartido por la suite.
async function matarPorJcJ(url, tag) {
  const victima = await spawnBot(url, { account: `victima${tag}`, clazz: 'guerrero' });
  const verdugo = await spawnBot(url, { account: `verdugo${tag}`, clazz: 'guerrero' });
  for (const b of [victima, verdugo]) b.send({ type: 'pvp_toggle' });
  await victima.waitFor('pvp_state');
  await verdugo.waitFor('pvp_state');

  // Hay que salir de la Ciudadela: dentro es zona segura (radio 45)
  await victima.walkTo(0, 60);
  await verdugo.walkTo(0, 60);

  for (let i = 0; i < 40 && !victima.died; i++) {
    verdugo.send({ type: 'pvp_attack', targetId: victima.id, dmg: 1000 });
    await wait(650);
  }
  return { victima, verdugo };
}

test('morir cuesta experiencia y deja el Alma Debilitada', async () => {
  const { victima, verdugo } = await matarPorJcJ(server.url, 'Exp');

  assert.ok(victima.died, 'la víctima debe haber caído');
  const nivel = victima.sync.progression.level;
  const tope = Math.round(xpForLevel(nivel) * 0.10);

  // Un héroe recién creado no tiene EXP: no puede perder más de la que lleva.
  assert.ok(victima.died.xpLost <= tope, `no puede perder más del 10% del nivel (${tope})`);
  assert.ok(victima.sync.progression.xp >= 0, 'la EXP nunca queda negativa');
  assert.equal(victima.sync.progression.level, nivel, 'morir no hace bajar de nivel');
  assert.equal(victima.died.weak, true, 'queda con el Alma Debilitada');
  assert.ok(victima.died.weakLeft > 0, 'el debuff debe traer su duración');
  assert.equal(victima.mp, 0, 'el guerrero pierde la furia al caer');

  victima.disconnect(); verdugo.disconnect();
});

test('el Alma Debilitada la aplica el SERVIDOR al daño (no el cliente)', async () => {
  // Sano y debilitado se miden en el MISMO héroe: el tope de daño depende de su
  // nivel y equipo, así que compararlo entre personajes sería frágil. Se pide
  // un daño disparatado a propósito: lo que se mide es el tope del servidor.
  const victima = await spawnBot(server.url, { account: 'victimaDano', clazz: 'guerrero' });
  const verdugo = await spawnBot(server.url, { account: 'verdugoDano', clazz: 'guerrero' });
  const [loboA, loboB] = (victima.mobs || []).filter((m) => m.type === 'lobo' && !m.dead);

  // 1) SANO: golpear antes de morir
  await victima.engage(loboA.id);
  victima.mobHits = [];
  await victima.attack(loboA.id);
  await victima.until(() => victima.mobHits.length > 0, 3000, 'registra el golpe sano');
  const sano = victima.mobHits[0];

  // 2) Morir por JcJ ahí mismo (fuera de la Ciudadela)
  for (const b of [victima, verdugo]) b.send({ type: 'pvp_toggle' });
  await victima.waitFor('pvp_state');
  await verdugo.waitFor('pvp_state');
  await verdugo.walkTo(victima.pos.x, victima.pos.z - 1);
  for (let i = 0; i < 40 && !victima.died; i++) {
    verdugo.send({ type: 'pvp_attack', targetId: victima.id, dmg: 1000 });
    await wait(650);
  }
  assert.ok(victima.died?.weak, 'debe caer y quedar debilitada');

  // 3) DEBILITADO: mismo héroe, otro lobo (el tope depende del héroe, no del bicho)
  await victima.engage(loboB.id);
  victima.mobHits = [];
  await victima.attack(loboB.id);
  await victima.until(() => victima.mobHits.length > 0, 3000, 'registra el golpe debilitado');
  const debil = victima.mobHits[0];

  assert.ok(debil < sano, `debilitado debe pegar menos: sano=${sano} debil=${debil}`);
  assert.equal(debil, Math.round(sano * 0.7), 'el recorte debe ser exactamente x0,7');

  victima.disconnect(); verdugo.disconnect();
});

test('el Alma Debilitada sobrevive a reconectar (no se burla saliendo)', async () => {
  const { victima, verdugo } = await matarPorJcJ(server.url, 'Persist');
  assert.ok(victima.died?.weak);
  victima.disconnect();
  await wait(400);

  const vuelve = await spawnBot(server.url, { account: 'victimaPersist', clazz: 'guerrero' });
  assert.equal(vuelve.weak?.on, true, 'al volver debe seguir debilitado');
  assert.ok(vuelve.weak.left > 0);

  vuelve.disconnect(); verdugo.disconnect();
});

// Un héroe nuevo empieza con 0 de oro, así que hay que ganarlo jugando. El
// Alfa Sombrío suelta 55-80 de una tacada: es la vía más corta y de paso
// ejercita el reparto de botín.
async function farmearOro(bot, minimo) {
  const alfa = bot.nearestMob('alfa');
  await bot.engage(alfa.id);
  for (let i = 0; i < 12 && !bot.deadMobs.has(alfa.id); i++) await bot.attack(alfa.id);
  await bot.until(() => (bot.sync?.inventory?.gold ?? 0) >= minimo, 4000,
    `juntar ${minimo} de oro (lleva ${bot.sync?.inventory?.gold})`);
  return bot.sync.inventory.gold;
}

test('cazar al Alfa reparte oro y experiencia', async () => {
  const bot = await spawnBot(server.url, { account: 'botinAlfa', clazz: 'guerrero', realm: 'valdoria' });
  const oro = await farmearOro(bot, 30);
  assert.ok(oro >= 55 && oro <= 80, `el Alfa suelta entre 55 y 80 de oro, dio ${oro}`);
  // Da 100 de EXP y el primer nivel cuesta 100: el héroe sube a nivel 2 y la
  // EXP del nivel vuelve a 0. Lo que se comprueba es que progresó.
  assert.ok(bot.sync.progression.level > 1 || bot.sync.progression.xp > 0,
    'debe progresar (subir de nivel o acumular EXP)');
  bot.disconnect();
});

// Cada reino simula sus propias criaturas. El Alfa es único por reino y tarda
// 75 s en reaparecer, así que este test usa Penumbra para tener el suyo.
test('Mira purga el Alma Debilitada por oro y no deja purgar dos veces', async () => {
  const victima = await spawnBot(server.url, { account: 'victimaMira', clazz: 'guerrero', realm: 'penumbra' });
  const verdugo = await spawnBot(server.url, { account: 'verdugoMira', clazz: 'guerrero', realm: 'penumbra' });

  // Ganar oro antes de morir (la purga cuesta 30 y se empieza sin nada)
  await farmearOro(victima, 30);

  for (const b of [victima, verdugo]) b.send({ type: 'pvp_toggle' });
  await victima.waitFor('pvp_state');
  await verdugo.waitFor('pvp_state');
  await verdugo.walkTo(victima.pos.x, victima.pos.z - 1);
  for (let i = 0; i < 40 && !victima.died; i++) {
    verdugo.send({ type: 'pvp_attack', targetId: victima.id, dmg: 1000 });
    await wait(650);
  }
  assert.ok(victima.died?.weak, 'debe caer y quedar debilitada');

  // Lejos de Mira debe rechazar
  victima.clear();
  victima.send({ type: 'mira', service: 'cleanse' });
  const lejos = await victima.waitFor('rpc_fail');
  assert.match(lejos.reason, /lejos de la Sacerdotisa/i);

  // Junto a Mira ([-3,-22]) sí purga y cobra
  await victima.walkTo(0, 20);
  await victima.walkTo(-3, -22);
  const oroAntes = victima.sync.inventory.gold;
  victima.clear();
  victima.send({ type: 'mira', service: 'cleanse' });
  const ok = await victima.waitFor('mira_ok');

  assert.equal(ok.service, 'cleanse');
  assert.equal(ok.weak, false, 'tras purgar ya no está debilitado');
  assert.equal(victima.sync.inventory.gold, oroAntes - 30, 'la purga cuesta 30 de oro');

  victima.clear();
  victima.send({ type: 'mira', service: 'cleanse' });
  const fail = await victima.waitFor('rpc_fail');
  assert.match(fail.reason, /alma ya está entera/i);

  victima.disconnect(); verdugo.disconnect();
});
