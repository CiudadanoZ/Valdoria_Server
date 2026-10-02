// Ejes multiplicativos: crítico, daño crítico, velocidad de ataque y % de daño,
// más bloqueo y reducción en defensa. Son lo que permite que un personaje bien
// montado crezca de verdad en vez de sumar de uno en uno.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot } from './helpers/bot.mjs';
import {
  resolveHit, resolveIncoming, attackCooldownMs, offenseMultiplier, maxOffenseMultiplier,
  BASE_CRIT, BASE_CRIT_DMG, CAP_CRIT, CAP_ATK_SPEED, CAP_BLOCK, CAP_DR, ATTACK_MS, applyArmor,
} from '../public/js/combat-data.js';
import {
  ensureState, bagAdd, equipFromBag, offenseOf, defenseOf, attackSpeedOf,
  addEchoXp, spendEcho, addXp,
} from '../server/state.js';
import { MAX_LEVEL, xpForLevel, xpForEcho, ECHOES } from '../public/js/talents-data.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const heroe = (state = {}) => {
  const character = { name: 'Prueba', race: 'humano', class: 'guerrero', state };
  ensureState(character);
  return character;
};
const tasaCritico = (offense, n = 40000) => {
  const rnd = seeded(17);
  let c = 0;
  for (let i = 0; i < n; i++) if (resolveHit(100, offense, rnd).crit) c++;
  return c / n;
};

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

test('todo héroe tiene un 5% de crítico de serie', () => {
  assert.ok(Math.abs(tasaCritico({}) - BASE_CRIT) < 0.01);
});

test('el crítico sube con el equipo pero tiene techo', () => {
  assert.ok(Math.abs(tasaCritico({ crit: 0.25 }) - (BASE_CRIT + 0.25)) < 0.012);
  assert.ok(Math.abs(tasaCritico({ crit: 5 }) - CAP_CRIT) < 0.012, 'ni con todo se pasa del tope');
});

test('un crítico multiplica, y el daño crítico lo agranda', () => {
  const siempre = () => 0;   // fuerza el crítico
  const nunca = () => 0.999;
  assert.equal(resolveHit(100, {}, nunca).dmg, 100);
  assert.equal(resolveHit(100, {}, siempre).dmg, Math.round(100 * (1 + BASE_CRIT_DMG)));
  assert.equal(resolveHit(100, { critDmg: 1 }, siempre).dmg, Math.round(100 * (1 + BASE_CRIT_DMG + 1)));
});

test('los ejes se MULTIPLICAN entre sí, no se suman', () => {
  // Esta es la razón de ser del sistema: dos ejes al 100% dan x4, no x3.
  const siempre = () => 0;
  const dmg = resolveHit(100, { dmgMul: 1, critDmg: 0.5 }, siempre).dmg;
  assert.equal(dmg, 100 * 2 * 2, '+100% daño y crítico x2 deben dar x4');
  assert.ok(offenseMultiplier({ crit: 0.35, critDmg: 1.2, dmgMul: 0.8 }) > 2.5,
    'una build ofensiva bien montada tiene que notarse de verdad');
});

test('el tope del validador cubre el peor caso, el crítico garantizado', () => {
  const perfil = { crit: 0.3, critDmg: 0.9, dmgMul: 0.6 };
  const siempre = () => 0;
  assert.ok(resolveHit(100, perfil, siempre).dmg <= Math.round(100 * maxOffenseMultiplier(perfil)));
});

test('la velocidad de ataque acelera el golpe, con techo', () => {
  assert.equal(attackCooldownMs(0), ATTACK_MS);
  assert.ok(attackCooldownMs(0.5) < attackCooldownMs(0.2));
  assert.equal(attackCooldownMs(99), attackCooldownMs(CAP_ATK_SPEED), 'no se puede atacar infinitamente rápido');
});

test('el bloqueo solo funciona con escudo', () => {
  const siempre = () => 0;
  const sinEscudo = resolveIncoming(100, { block: 0.5, hasShield: false }, siempre);
  const conEscudo = resolveIncoming(100, { block: 0.5, hasShield: true }, siempre);
  assert.equal(sinEscudo.blocked, false, 'sin escudo no hay bloqueo, lo diga el equipo o no');
  assert.equal(conEscudo.blocked, true);
  assert.ok(conEscudo.dmg < sinEscudo.dmg);
});

test('armadura, reducción y bloqueo se encadenan y nunca hacen inmune', () => {
  const siempre = () => 0;
  const tope = resolveIncoming(1000, { armor: 500, dr: 9, block: 9, hasShield: true }, siempre).dmg;
  assert.ok(tope >= 1, 'siempre entra algo');
  // Con todo al máximo, lo que entra es exactamente armadura × (1−DR) × (1−bloqueo)
  const esperado = Math.round(applyArmor(1000, 500) * (1 - CAP_DR) * 0.5);
  assert.equal(tope, esperado);
  assert.ok(CAP_BLOCK < 1 && CAP_DR < 1);
});

test('el equipo con afijos alimenta los ejes del personaje', () => {
  const character = heroe();
  const st = character.state;
  bagAdd(st, 'filo_glacial', 1, { tier: 15, grade: 3, affixes: [
    { id: 'crit', v: 0.1 }, { id: 'critDmg', v: 0.4 }, { id: 'atkSpeed', v: 0.12 },
  ] });
  bagAdd(st, 'egida_escarcha', 1, { tier: 15, grade: 2, affixes: [
    { id: 'block', v: 0.15 }, { id: 'dr', v: 0.08 },
  ] });
  equipFromBag(st, 0);
  equipFromBag(st, 1);

  const of = offenseOf(st);
  assert.ok(Math.abs(of.crit - 0.1) < 1e-9);
  assert.ok(Math.abs(of.critDmg - 0.4) < 1e-9);
  assert.ok(Math.abs(attackSpeedOf(st) - 0.12) < 1e-9);

  const def = defenseOf(character);
  assert.equal(def.hasShield, true);
  assert.ok(Math.abs(def.block - 0.15) < 1e-9);
  assert.ok(Math.abs(def.dr - 0.08) < 1e-9);
});

test('los Ecos multiplicativos también cuentan', () => {
  const st = heroe().state;
  let total = 0;
  for (let l = 1; l < MAX_LEVEL; l++) total += xpForLevel(l);
  addXp(st, total);
  addEchoXp(st, xpForEcho(0) * 30);
  for (let i = 0; i < 5; i++) spendEcho(st, 'crit');
  assert.ok(Math.abs(offenseOf(st).crit - 5 * ECHOES.crit.per) < 1e-9);
});

test('el servidor anuncia los críticos en el golpe', async () => {
  // Con un 5% base, en unos cuantos golpes tiene que aparecer el campo `crit`
  // en cada impacto, sea true o false: el cliente lo necesita para pintarlo.
  const bot = await spawnBot(server.url, { account: 'critico', clazz: 'guerrero' });
  const lobo = bot.nearestMob('lobo');
  await bot.engage(lobo.id);
  bot.clear();
  await bot.attack(lobo.id);
  const golpe = bot.msgs.find((m) => m.type === 'mob_hit' || m.type === 'mob_dead');
  assert.ok(golpe, 'el golpe debe llegar');
  if (golpe.type === 'mob_hit') assert.equal(typeof golpe.crit, 'boolean', 'cada golpe dice si fue crítico');
  bot.disconnect();
});
