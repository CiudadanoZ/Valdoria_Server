// Prueba de humo: el arnés arranca un servidor aislado y un bot entra al mundo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot } from './helpers/bot.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('el servidor arranca con una base de datos vacía y aislada', () => {
  assert.match(server.logs(), /0 cuentas, 0 personajes/);
});

test('un héroe nuevo puede crear cuenta, personaje y entrar al mundo', async () => {
  const bot = await spawnBot(server.url, { account: 'humoTest', charName: 'Chispa' });
  assert.equal(bot.charName, 'Chispa');
  assert.ok(bot.maxHp > 0, 'debe recibir su vida máxima');
  assert.ok(Array.isArray(bot.mobs) && bot.mobs.length > 0, 'debe recibir las criaturas del reino');
  bot.disconnect();
});
