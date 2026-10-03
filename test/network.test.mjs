// Tráfico de criaturas. Antes cada jugador recibía las 99 criaturas del reino
// diez veces por segundo (~25 KB/s), estuvieran cerca o lejos y aunque no se
// movieran. Estos casos vigilan que eso no vuelva.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

async function escuchar(bot, ms) {
  bot.clear();
  await wait(ms);
  return bot.msgs.filter((m) => m.type === 'mobs');
}

test('ya no viajan todas las criaturas en cada mensaje', async () => {
  const bot = await spawnBot(server.url, { account: 'redTodas' });
  const msgs = await escuchar(bot, 2500);
  assert.ok(msgs.length > 0, 'debe seguir recibiendo actualizaciones');
  const media = msgs.reduce((n, m) => n + m.m.length, 0) / msgs.length;
  const total = bot.mobs.length;
  assert.ok(media < total * 0.5, `cada mensaje lleva ${media.toFixed(1)} de ${total} criaturas: no se está filtrando`);
  bot.disconnect();
});

test('lo lejano llega como mucho una vez por segundo', async () => {
  const bot = await spawnBot(server.url, { account: 'redLejos' });
  const lejos = new Set(bot.mobs
    .filter((m) => Math.hypot(m.x - bot.pos.x, m.z - bot.pos.z) > 110)
    .map((m) => m.id));
  assert.ok(lejos.size > 10, 'debe haber criaturas lejos para medir');

  const msgs = await escuchar(bot, 3000);
  const veces = new Map();
  for (const msg of msgs) for (const [id] of msg.m) if (lejos.has(id)) veces.set(id, (veces.get(id) || 0) + 1);
  const max = Math.max(0, ...veces.values());
  // 3 s a 1 Hz son 3 envíos; se deja margen por si el corte cae entre ticks.
  assert.ok(max <= 4, `una criatura lejana llegó ${max} veces en 3 s: debería ir a 1 Hz`);
  bot.disconnect();
});

test('lo cercano sigue llegando con fluidez', async () => {
  // Los lobos del camino sur deambulan: al acercarse, sus movimientos tienen
  // que llegar a 10 Hz, que es lo que hace que se vean fluidos y se pueda pelear.
  const bot = await spawnBot(server.url, { account: 'redCerca' });
  await bot.walkTo(0, 60);
  const msgs = await escuchar(bot, 3000);
  const cercanas = new Map();
  for (const msg of msgs) {
    for (const [id, x, z] of msg.m) {
      if (Math.hypot(x - bot.pos.x, z - bot.pos.z) < 40) cercanas.set(id, (cercanas.get(id) || 0) + 1);
    }
  }
  const max = Math.max(0, ...cercanas.values());
  assert.ok(max >= 8, `la criatura cercana más activa solo llegó ${max} veces en 3 s`);
  bot.disconnect();
});
