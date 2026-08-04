// Ecos: la progresión de después del nivel 15. Existen porque Las Profundidades
// reparten experiencia a espuertas justo cuando el personaje ya no puede subir,
// y esa experiencia se tiraba entera.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureState, addXp, addEchoXp, spendEcho, echoBonus,
  computeMaxHp, computeArmor, regenPerSec, goldMultiplier, maxPlausibleHit,
  bagAdd, equipFromBag,
} from '../server/state.js';
import { MAX_LEVEL, xpForLevel, xpForEcho, ECHOES } from '../public/js/talents-data.js';
import { maxMeleeHit } from '../public/js/combat-data.js';
import { ITEMS } from '../public/js/items.js';

const heroe = (state = {}) => {
  const character = { name: 'Prueba', race: 'humano', class: 'guerrero', state };
  ensureState(character);
  return character;
};

// Sube un personaje hasta el techo de nivel gastando la experiencia justa.
function alTecho(st) {
  let total = 0;
  for (let l = 1; l < MAX_LEVEL; l++) total += xpForLevel(l);
  addXp(st, total);
  return st;
}

test('un personaje nuevo empieza sin Ecos', () => {
  const p = heroe().state.progression;
  assert.equal(p.echoes, 0);
  assert.equal(p.echoPoints, 0);
  assert.deepEqual(p.echoSpend, {});
});

test('por debajo del techo la experiencia sigue subiendo niveles, no Ecos', () => {
  const st = heroe().state;
  addXp(st, xpForLevel(1));
  assert.equal(st.progression.level, 2);
  assert.equal(st.progression.echoes, 0, 'todavía no hay Ecos que ganar');
});

test('al tocar el techo, la experiencia deja de perderse', () => {
  const st = heroe().state;
  alTecho(st);
  assert.equal(st.progression.level, MAX_LEVEL);

  // Esto es exactamente lo que antes se tiraba a la basura
  addXp(st, 4000);
  assert.ok(st.progression.echoes > 0, 'la experiencia al máximo tiene que dar Ecos');
  assert.equal(st.progression.echoPoints, st.progression.echoes, 'un punto por Eco');
});

test('la experiencia que sobra al subir el último nivel no se tira', () => {
  const st = heroe().state;
  let hastaEl14 = 0;
  for (let l = 1; l < MAX_LEVEL - 1; l++) hastaEl14 += xpForLevel(l);
  addXp(st, hastaEl14);
  assert.equal(st.progression.level, MAX_LEVEL - 1);

  // Un golpe de experiencia enorme: sube el último nivel Y arranca los Ecos
  addXp(st, xpForLevel(MAX_LEVEL - 1) + 5000);
  assert.equal(st.progression.level, MAX_LEVEL);
  assert.ok(st.progression.echoXp > 0 || st.progression.echoes > 0,
    'el sobrante debe caer en los Ecos, no evaporarse');
});

test('cada Eco cuesta un poco más que el anterior', () => {
  assert.ok(xpForEcho(10) > xpForEcho(0), 'el coste crece');
  const st = heroe().state;
  alTecho(st);
  addEchoXp(st, xpForEcho(0));
  assert.equal(st.progression.echoes, 1);
  assert.equal(st.progression.echoXp, 0);
  // El segundo cuesta más: la misma cantidad ya no basta
  addEchoXp(st, xpForEcho(0));
  assert.equal(st.progression.echoes, 1, 'con lo que costó el primero no llega el segundo');
});

test('los puntos de Eco se invierten y no se pueden inventar', () => {
  const st = heroe().state;
  alTecho(st);
  assert.equal(spendEcho(st, 'hp'), 'no tienes puntos de Eco');

  addEchoXp(st, xpForEcho(0));
  assert.equal(spendEcho(st, 'inventado'), 'mejora desconocida');
  assert.equal(spendEcho(st, 'hp'), null, 'con un punto sí se puede');
  assert.equal(st.progression.echoPoints, 0, 'el punto se gasta');
  assert.equal(st.progression.echoSpend.hp, 1);

  assert.equal(spendEcho(st, 'hp'), 'no tienes puntos de Eco', 'y no se puede repetir sin puntos');
});

test('lo invertido se nota en las estadísticas del personaje', () => {
  const character = heroe();
  const st = character.state;
  alTecho(st);
  addEchoXp(st, xpForEcho(0) * 40);

  const vidaAntes = computeMaxHp(character);
  const armaduraAntes = computeArmor(character);
  const regenAntes = regenPerSec(character);
  const oroAntes = goldMultiplier(st);

  spendEcho(st, 'hp');
  spendEcho(st, 'armor');
  spendEcho(st, 'regen');
  spendEcho(st, 'gold');

  assert.equal(computeMaxHp(character), vidaAntes + ECHOES.hp.per);
  assert.equal(computeArmor(character), armaduraAntes + ECHOES.armor.per);
  assert.ok(Math.abs(regenPerSec(character) - (regenAntes + ECHOES.regen.per)) < 1e-9);
  assert.ok(Math.abs(goldMultiplier(st) - (oroAntes + ECHOES.gold.per)) < 1e-9);
});

test('los Ecos se acumulan sin techo', () => {
  const character = heroe();
  const st = character.state;
  alTecho(st);
  addEchoXp(st, xpForEcho(0) * 500);
  const puntos = st.progression.echoPoints;
  assert.ok(puntos > 20, `debería haber muchos puntos, hay ${puntos}`);

  for (let i = 0; i < 20; i++) spendEcho(st, 'hp');
  assert.equal(echoBonus(st, 'hp'), 20 * ECHOES.hp.per, 'sin tope por estadística');
});

test('el servidor NO recorta los golpes de un veterano con Ecos de Filo', () => {
  // Este es el fallo fácil de colar: el tope antitrampa se calcula solo con el
  // arma, así que un personaje con mucho Filo vería sus golpes buenos
  // recortados por el propio servidor.
  const character = heroe();
  const st = character.state;
  bagAdd(st, 'filo_glacial', 1);
  equipFromBag(st, 0);
  const topeBase = maxPlausibleHit(st);
  assert.equal(topeBase, maxMeleeHit(ITEMS.filo_glacial.dmg));

  alTecho(st);
  addEchoXp(st, xpForEcho(0) * 60);
  for (let i = 0; i < 15; i++) spendEcho(st, 'dmg');

  assert.equal(maxPlausibleHit(st), topeBase + 15 * ECHOES.dmg.per,
    'el tope tiene que crecer con el Filo invertido');
});

test('los personajes de antes de los Ecos entran sin perder nada', () => {
  // Estado tal y como lo guardaba la versión anterior: sin campos de Eco.
  const character = heroe({
    progression: { level: 15, xp: 0, points: 3, talents: { golpe_pesado: 2 } },
  });
  const p = character.state.progression;
  assert.equal(p.level, 15, 'conserva el nivel');
  assert.equal(p.points, 3, 'y sus puntos de talento sin gastar');
  assert.deepEqual(p.talents, { golpe_pesado: 2 }, 'y sus talentos');
  assert.equal(p.echoes, 0, 'los Ecos empiezan de cero');
  assert.equal(p.echoPoints, 0);
});

test('una inversión de Eco corrupta se descarta al cargar', () => {
  const character = heroe({
    progression: {
      level: 15, xp: 0, points: 0, talents: {},
      echoes: 5, echoPoints: 2, echoSpend: { hp: 3, inventado: 9999, dmg: -4 },
    },
  });
  const spend = character.state.progression.echoSpend;
  assert.equal(spend.hp, 3, 'lo legítimo se conserva');
  assert.equal(spend.inventado, undefined, 'lo inventado se cae');
  assert.equal(spend.dmg, 0, 'los negativos se saneen a cero');
});
