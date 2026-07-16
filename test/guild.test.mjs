// Gremios: ciclo completo y permisos. Lo delicado es el traspaso de liderazgo
// y que un miembro raso no pueda mandar.
// Fundar cuesta 500 de oro: los héroes se siembran ya ricos en vez de farmear
// jefes durante minutos (eso lo cubre el test de botín en combat.test.mjs).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot } from './helpers/bot.mjs';

let server;
before(async () => {
  server = await startServer({
    seed: [
      { account: 'gremioVal', name: 'Pobreton', gold: 0 },
      { account: 'gremioLider', name: 'Lidera', gold: 800 },
      { account: 'gremioSocio', name: 'Socia', gold: 800 },
      { account: 'traspasoLider', name: 'Cede', gold: 800 },
      { account: 'traspasoHered', name: 'Hereda', gold: 800 },
    ],
  });
});
after(async () => { await server.stop(); });

test('el nombre del gremio se valida y fundar cuesta oro', async () => {
  const bot = await spawnBot(server.url, { account: 'gremioVal' });

  bot.clear();
  bot.send({ type: 'guild_create', name: 'ab' });
  assert.match((await bot.waitFor('rpc_fail')).reason, /3 caracteres/i);

  bot.clear();
  bot.send({ type: 'guild_create', name: 'Los Sin Blanca' });
  assert.match((await bot.waitFor('rpc_fail')).reason, /500 de oro/i,
    'sin oro no se puede fundar');

  bot.disconnect();
});

test('ciclo completo: fundar, invitar, chatear, expulsar y disolver', async () => {
  const lider = await spawnBot(server.url, { account: 'gremioLider' });
  const socio = await spawnBot(server.url, { account: 'gremioSocio' });
  const oro = lider.charState.inventory.gold;

  // Fundar
  lider.clear();
  lider.send({ type: 'guild_create', name: 'Orden de Prueba' });
  await lider.waitFor('guild_info');
  assert.equal(lider.guild.name, 'Orden de Prueba');
  assert.equal(lider.guild.leader, lider.charName);
  assert.equal(lider.guild.members.length, 1);
  assert.equal(lider.sync.inventory.gold, oro - 500, 'fundar cuesta 500 de oro');

  // Nombre duplicado (sin distinguir mayúsculas)
  socio.clear();
  socio.send({ type: 'guild_create', name: 'ORDEN DE PRUEBA' });
  assert.match((await socio.waitFor('rpc_fail')).reason, /ya existe un gremio/i);

  // Invitar y aceptar
  socio.clear();
  lider.send({ type: 'guild_invite', targetName: socio.charName });
  const inv = await socio.waitFor('guild_invite');
  assert.equal(inv.guild, 'Orden de Prueba');
  assert.equal(inv.fromName, lider.charName);
  socio.send({ type: 'guild_accept', guild: inv.guild });
  await socio.until(() => socio.guild?.members.length === 2, 3000, 'el socio entra al gremio');
  assert.equal(socio.guild.members.find((m) => m.name === socio.charName).leader, false);

  // Chat de gremio
  socio.clear();
  lider.send({ type: 'chat', text: '/g a las armas' });
  await socio.until(
    () => socio.msgs.some((m) => m.type === 'chat' && m.guild && m.text === 'a las armas'),
    3000, 'el chat de gremio llega a los miembros');

  // Un miembro raso no manda
  socio.clear();
  socio.send({ type: 'guild_motd', motd: 'no deberia poder' });
  assert.match((await socio.waitFor('rpc_fail')).reason, /solo el líder/i);
  socio.clear();
  socio.send({ type: 'guild_kick', targetName: lider.charName });
  assert.match((await socio.waitFor('rpc_fail')).reason, /solo el líder/i);
  assert.ok(lider.guild, 'el líder sigue en su gremio');

  // El líder pone lema y expulsa
  lider.send({ type: 'guild_motd', motd: 'Por la gloria' });
  await lider.until(() => lider.guild?.motd === 'Por la gloria', 3000, 'se guarda el lema');
  lider.send({ type: 'guild_kick', targetName: socio.charName });
  await socio.until(() => socio.guild === null, 3000, 'al expulsado se le quita el gremio');
  await lider.until(() => lider.guild?.members.length === 1, 3000, 'queda solo el líder');

  // Disolver
  lider.send({ type: 'guild_disband' });
  await lider.until(() => lider.guild === null, 3000, 'el gremio se disuelve');

  lider.disconnect(); socio.disconnect();
});

test('si el líder se marcha, el mando pasa a otro miembro', async () => {
  const lider = await spawnBot(server.url, { account: 'traspasoLider' });
  const heredero = await spawnBot(server.url, { account: 'traspasoHered' });

  lider.clear();
  lider.send({ type: 'guild_create', name: 'Casa del Relevo' });
  await lider.waitFor('guild_info');

  heredero.clear();
  lider.send({ type: 'guild_invite', targetName: heredero.charName });
  const inv = await heredero.waitFor('guild_invite');
  heredero.send({ type: 'guild_accept', guild: inv.guild });
  await heredero.until(() => heredero.guild?.members.length === 2, 3000, 'entra el heredero');

  // Se va el líder: el gremio NO debe morir, debe heredarlo el otro
  lider.send({ type: 'guild_leave' });
  await lider.until(() => lider.guild === null, 3000, 'el líder sale');
  await heredero.until(() => heredero.guild?.leader === heredero.charName, 3000,
    'el mando pasa al miembro que queda');
  assert.equal(heredero.guild.members.length, 1);

  lider.disconnect(); heredero.disconnect();
});

test('al marcharse el último miembro, el gremio desaparece y libera el nombre', async () => {
  const bot = await spawnBot(server.url, { account: 'gremioSocio' });

  bot.clear();
  bot.send({ type: 'guild_create', name: 'Efimeros' });
  await bot.waitFor('guild_info');
  bot.send({ type: 'guild_leave' });
  await bot.until(() => bot.guild === null, 3000, 'sale el único miembro');

  // Si el gremio quedó huérfano en la base, este intento diría «ya existe».
  // El servidor comprueba el nombre ANTES que el oro, así que la queja por
  // oro demuestra que el nombre volvió a estar libre.
  bot.clear();
  bot.send({ type: 'guild_create', name: 'Efimeros' });
  const res = await Promise.race([
    bot.waitFor('guild_info', 2500).then(() => 'refundado'),
    bot.waitFor('rpc_fail', 2500).then((m) => m.reason),
  ]);
  assert.ok(!/ya existe un gremio/i.test(String(res)),
    `el gremio vacío debe borrarse y dejar el nombre libre (respuesta: ${res})`);

  bot.disconnect();
});
