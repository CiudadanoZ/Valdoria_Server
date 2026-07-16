// Anti-trampas: lo que un cliente manipulado NO debe poder conseguir.
// Estos tests envían mensajes que el juego nunca manda, a propósito.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('el servidor corrige un teletransporte', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoTp' });
  const antes = { ...bot.pos };

  bot.clear();
  bot.send({ type: 'move', x: 500, z: -30, rot: 0 }); // saltar a la cripta
  const corr = await bot.waitFor('pos_correct');

  assert.ok(Math.hypot(corr.x - antes.x, corr.z - antes.z) < 5,
    'debe devolverte a tu última posición válida, no dejarte saltar');
  bot.disconnect();
});

test('el daño declarado por el cliente se recorta a un tope creíble', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoDmg' });
  // Contra el Alfa (150 de vida) a propósito: si el servidor se fiara del
  // cliente, un solo golpe lo fulminaría. Contra un lobo el síntoma sería que
  // muere de un tirón, y el test fallaría por un motivo confuso.
  const alfa = bot.nearestMob('alfa');
  await bot.engage(alfa.id);

  bot.mobHits = [];
  await bot.attack(alfa.id, 99999); // un golpe imposible
  await wait(400);

  assert.ok(!bot.deadMobs.has(alfa.id),
    'un solo golpe no puede fulminar al Alfa: el servidor debe recortar el daño');
  assert.ok(bot.mobHits[0] > 0 && bot.mobHits[0] < 100,
    `el daño debe quedar en un valor creíble, aplicó ${bot.mobHits[0]}`);
  bot.disconnect();
});

test('el golpe básico tiene enfriamiento en el servidor', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoSpam' });
  const lobo = bot.nearestMob('lobo');
  await bot.engage(lobo.id);

  // Ráfaga: solo debería colar uno (hay 600 ms de enfriamiento)
  bot.mobHits = [];
  for (let i = 0; i < 8; i++) bot.send({ type: 'attack', mobId: lobo.id, dmg: 10 });
  await wait(500);

  assert.equal(bot.mobHits.length, 1, 'ocho golpes seguidos solo deben contar como uno');
  bot.disconnect();
});

test('no se puede golpear a una criatura lejana', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoLejos' });
  const lobo = bot.nearestMob('lobo'); // lejos: el bot está en la plaza

  bot.mobHits = [];
  await bot.attack(lobo.id);
  await wait(300);

  assert.equal(bot.mobHits.length, 0, 'no debe poder pegar desde el otro lado del mapa');
  bot.disconnect();
});

test('no se puede comprar sin oro', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoPobre' });
  assert.equal(bot.charState.inventory.gold, 0, 'un héroe nuevo empieza sin oro');

  bot.clear();
  bot.send({ type: 'shop_buy', itemId: 'pocion_vida' });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /oro|lejos/i);
  bot.disconnect();
});

test('el estado que envía el cliente no puede inventar oro ni vida', async () => {
  const bot = await spawnBot(server.url, { account: 'tramposoState' });
  const oroReal = bot.charState.inventory.gold;

  // save_state solo acepta las banderas de misión: lo demás lo dicta el servidor
  bot.send({ type: 'save_state', state: {
    inventory: { gold: 999999, slots: [], equipment: {} },
    progression: { level: 99, xp: 0, points: 99, talents: {} },
    hp: 9999,
  } });
  await wait(400);

  bot.clear();
  bot.send({ type: 'shop_buy', itemId: 'pocion_vida' });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /oro|lejos/i, 'el oro inventado no debe existir');
  assert.equal(bot.sync?.inventory?.gold ?? oroReal, oroReal, 'el oro no cambia');
  bot.disconnect();
});

test('no se puede lanzar JcJ contra quien no lo tiene activado', async () => {
  const atacante = await spawnBot(server.url, { account: 'pvpAtaca' });
  const pacifico = await spawnBot(server.url, { account: 'pvpPasa' });

  atacante.send({ type: 'pvp_toggle' });
  await atacante.waitFor('pvp_state');

  await pacifico.walkTo(0, 60);
  await atacante.walkTo(0, 60);

  // No vale comparar la vida a secas: regenera sola y los lobos del camino
  // muerden. Lo que se comprueba es que NINGÚN golpe venga del atacante.
  pacifico.clear();
  for (let i = 0; i < 3; i++) {
    atacante.send({ type: 'pvp_attack', targetId: pacifico.id, dmg: 1000 });
    await wait(650);
  }
  const golpes = pacifico.msgs.filter(
    (m) => m.type === 'player_hurt' && m.mobName === atacante.charName);
  assert.equal(golpes.length, 0, 'sin JcJ activo no debe recibir ni un rasguño');
  assert.equal(pacifico.died, null, 'ni morir');

  atacante.disconnect(); pacifico.disconnect();
});

test('la Ciudadela es zona segura aunque ambos tengan JcJ activo', async () => {
  const a = await spawnBot(server.url, { account: 'pvpSeguraA' });
  const b = await spawnBot(server.url, { account: 'pvpSeguraB' });
  for (const x of [a, b]) x.send({ type: 'pvp_toggle' });
  await a.waitFor('pvp_state');
  await b.waitFor('pvp_state');

  // Ambos en la plaza (dentro del radio seguro de 45)
  a.clear(); b.clear();
  a.send({ type: 'pvp_attack', targetId: b.id, dmg: 1000 });
  await wait(400);

  const golpes = b.msgs.filter((m) => m.type === 'player_hurt' && m.mobName === a.charName);
  assert.equal(golpes.length, 0, 'dentro de la Ciudadela nadie recibe daño');
  const aviso = a.last('chat');
  assert.match(aviso?.text || '', /no se puede luchar dentro de la ciudadela/i);

  a.disconnect(); b.disconnect();
});
