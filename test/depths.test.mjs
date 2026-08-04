// Las Profundidades: la escalera sin fondo. Lo que estos casos vigilan es que
// bajar sea SIEMPRE más duro y más rentable, que no se pueda saltar pisos sin
// ganárselos, y que una instancia no se lleve por delante al personaje.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';
import {
  scaleFor, depthSeed, buildDepthMobs, bandFor, guardianFor, minionCount,
  depthRealmId, isDepthRealm, ensureDepths, recordDepth, DEPTHS_RADIUS, DEPTHS_ORIGIN,
  HATCH_SPOT,
} from '../server/depths.js';
import { MOB_TYPES } from '../server/mobs-data.js';
import { tierFromXp, MAX_TIER, clampTier } from '../public/js/affixes.js';

const mobsDe = (depth, week = 100) => {
  let id = 1;
  return buildDepthMobs(depth, () => id++, week);
};

const TRAMPILLA = HATCH_SPOT;

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('cada piso es más duro que el anterior', () => {
  let hpAnterior = 0, dmgAnterior = 0;
  for (let d = 1; d <= 30; d++) {
    const s = scaleFor(d);
    assert.ok(s.hp > hpAnterior, `el piso ${d} debe tener más vida que el anterior`);
    assert.ok(s.dmg > dmgAnterior, `el piso ${d} debe pegar más que el anterior`);
    hpAnterior = s.hp; dmgAnterior = s.dmg;
  }
});

test('y también más rentable: mejor botín y más experiencia', () => {
  const superficie = scaleFor(1);
  const hondo = scaleFor(20);
  assert.ok(hondo.xp > superficie.xp, 'más experiencia abajo');
  assert.ok(hondo.gold > superficie.gold, 'más oro abajo');
  assert.ok(hondo.tier > superficie.tier, 'y mejores tiradas de afijos');
  // El tier que se suma no puede desbordar la escala de los afijos
  assert.ok(clampTier(tierFromXp(MOB_TYPES.jarl_cumbres.xp) + scaleFor(999).tier) <= MAX_TIER);
});

test('la sala se puebla y el guardián cierra la escalera', () => {
  const mobs = mobsDe(7);
  assert.equal(mobs.length, minionCount(7) + 1, 'los secuaces del tramo más el guardián');

  const guardianes = mobs.filter((m) => m.isGuardian);
  assert.equal(guardianes.length, 1, 'un solo guardián por piso');
  assert.equal(guardianes[0].type, guardianFor(7));

  // Todo cae dentro de la sala
  for (const m of mobs) {
    const d = Math.hypot(m.x - DEPTHS_ORIGIN[0], m.z - DEPTHS_ORIGIN[1]);
    assert.ok(d <= DEPTHS_RADIUS, `${m.type} aparece fuera de la sala (${d.toFixed(1)})`);
  }
});

test('las criaturas de la mazmorra vienen endurecidas y NO reaparecen', () => {
  const mobs = mobsDe(10);
  const secuaz = mobs.find((m) => !m.isGuardian);
  const base = MOB_TYPES[secuaz.type];
  const s = scaleFor(10);

  assert.equal(secuaz.def.hp, Math.round(base.hp * s.hp));
  assert.ok(secuaz.def.dmgMax > base.dmgMax, 'pega más que su versión de superficie');
  assert.equal(secuaz.depthBonus, s.tier, 'lleva el empujón de tier para el botín');
  assert.ok(secuaz.def.respawn > 1e8, 'en la mazmorra se limpia la sala, no se repuebla');

  // Y el original del mundo queda intacto: la copia no puede contaminarlo
  assert.equal(MOB_TYPES[secuaz.type].hp, base.hp, 'el bicho del mundo no se toca');
});

test('la misma semana y el mismo piso dan la misma sala para todos', () => {
  const a = mobsDe(5, 42);
  const b = mobsDe(5, 42);
  assert.deepEqual(a.map((m) => [m.type, +m.x.toFixed(3), +m.z.toFixed(3)]),
    b.map((m) => [m.type, +m.x.toFixed(3), +m.z.toFixed(3)]),
    'dos héroes que bajen al piso 5 esta semana deben encontrarse lo mismo');

  // Y a la semana siguiente cambia: la carrera vuelve a empezar
  const otra = mobsDe(5, 43);
  assert.notDeepEqual(a.map((m) => [m.x, m.z]), otra.map((m) => [m.x, m.z]));
  assert.notEqual(depthSeed(5, 42), depthSeed(5, 43));
});

test('pisos distintos son salas distintas', () => {
  assert.notEqual(depthSeed(3, 42), depthSeed(4, 42));
  assert.notDeepEqual(mobsDe(3, 42).map((m) => m.x), mobsDe(4, 42).map((m) => m.x));
});

test('lo que habita cada tramo cambia al bajar', () => {
  assert.notDeepEqual(bandFor(1), bandFor(20), 'no puede haber ratas a veinte pisos');
  for (const d of [1, 5, 9, 30]) {
    for (const type of bandFor(d)) {
      assert.ok(MOB_TYPES[type], `${type} no existe en el catálogo de criaturas`);
    }
  }
  // Los guardianes rotan para que el descenso no sea monótono
  assert.notEqual(guardianFor(1), guardianFor(4));
  for (const d of [1, 4, 7, 10, 25]) assert.ok(MOB_TYPES[guardianFor(d)]);
});

test('el número de secuaces crece pero se estanca', () => {
  assert.ok(minionCount(20) > minionCount(1), 'abajo hay más');
  assert.equal(minionCount(500), minionCount(999), 'pero no infinitos: lo que mata es la dureza');
});

test('cada héroe baja a su propia instancia', () => {
  assert.notEqual(depthRealmId('char-a'), depthRealmId('char-b'));
  assert.ok(isDepthRealm(depthRealmId('char-a')));
  assert.ok(!isDepthRealm('valdoria'), 'el mundo normal no es una instancia');
  assert.ok(!isDepthRealm(null));
});

// ---- De punta a punta, contra el servidor de verdad ----

test('hay que estar junto a la trampilla para bajar', async () => {
  const bot = await spawnBot(server.url, { account: 'lejosPozo' });
  await bot.walkTo(0, 60);
  bot.clear();
  bot.send({ type: 'depths_enter', depth: 1 });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /lejos de la trampilla/i);
  bot.disconnect();
});

test('no se puede saltar a un piso que no te has ganado', async () => {
  const bot = await spawnBot(server.url, { account: 'saltaPisos' });
  await bot.walkTo(...TRAMPILLA);
  bot.clear();
  bot.send({ type: 'depths_enter', depth: 12 });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /no has llegado tan hondo/i);
  bot.disconnect();
});

test('bajar te mete en tu propia instancia, con su guardián', async () => {
  const bot = await spawnBot(server.url, { account: 'bajaPozo', clazz: 'guerrero' });
  await bot.walkTo(...TRAMPILLA);
  bot.clear();
  bot.send({ type: 'depths_enter', depth: 1 });

  const dentro = await bot.waitFor('depths_entered');
  assert.equal(dentro.depth, 1);
  assert.ok(dentro.realm.startsWith('prof:'), 'debe ser una instancia propia');
  assert.ok(dentro.guardian, 'y anunciar a quién vigila la escalera');
  assert.ok(dentro.mobs.length > 1, 'la sala viene poblada');
  // Aparece dentro de la sala, no en la Ciudadela
  assert.ok(dentro.x > 1500, `debería estar en la mazmorra, no en ${dentro.x}`);
  bot.disconnect();
});

test('la escalera no se abre hasta que cae el guardián', async () => {
  const bot = await spawnBot(server.url, { account: 'escaleraCerrada' });
  await bot.walkTo(...TRAMPILLA);
  bot.clear();
  bot.send({ type: 'depths_enter', depth: 1 });
  await bot.waitFor('depths_entered');

  bot.clear();
  bot.send({ type: 'depths_descend' });
  const fail = await bot.waitFor('rpc_fail');
  assert.match(fail.reason, /guardián del umbral/i);
  bot.disconnect();
});

test('salir te devuelve a la Ciudadela, junto a la trampilla', async () => {
  const bot = await spawnBot(server.url, { account: 'saleDelPozo' });
  await bot.walkTo(...TRAMPILLA);
  bot.clear();
  bot.send({ type: 'depths_enter', depth: 1 });
  await bot.waitFor('depths_entered');

  bot.clear();
  bot.send({ type: 'depths_leave' });
  const fuera = await bot.waitFor('depths_left');
  assert.ok(fuera.x < 400, 'vuelve al mundo, no se queda en coordenadas de mazmorra');
  assert.equal(Math.round(fuera.x), TRAMPILLA[0]);
  bot.disconnect();
});

test('la marca semanal se guarda, mejora y se reinicia el lunes', () => {
  const st = {};
  ensureDepths(st);
  assert.equal(st.depths.best, 0);

  assert.equal(recordDepth(st, 4), true, 'bajar más hondo mejora la marca');
  assert.equal(st.depths.best, 4);
  assert.equal(recordDepth(st, 2), false, 'quedarse corto no la empeora');
  assert.equal(st.depths.best, 4, 'la marca no baja');

  // Semana nueva: la marca semanal se va, el récord de siempre se queda
  st.depths.week = st.depths.week - 1;
  ensureDepths(st);
  assert.equal(st.depths.best, 0, 'la carrera vuelve a empezar');
  assert.equal(st.depths.record, 4, 'pero el récord personal no se pierde');
});
