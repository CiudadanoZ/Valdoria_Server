// Poderes legendarios: lo que hace que una reliquia cambie CÓMO juegas y no
// solo cuánto pegas. Solo caen en ✦✦✦, uno por pieza, y se combinan entre sí.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollGear, powerOf, activePowers, displayName, POWERS, POWER_IDS,
} from '../public/js/affixes.js';
import {
  ensureState, bagAdd, equipFromBag, unequipToBag, equippedPowers, hasPower, powerValue,
} from '../server/state.js';
import { ITEMS } from '../public/js/items.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const heroe = (state = {}) => {
  const character = { name: 'Prueba', race: 'humano', class: 'guerrero', state };
  ensureState(character);
  return character;
};

const conPoder = (id) => ({ tier: 15, grade: 3, affixes: [{ id: 'dmg', v: 5 }, { id: 'hp', v: 20 }], power: id });

test('los poderes solo caen en reliquias, nunca por debajo', () => {
  const rnd = seeded(31);
  for (let i = 0; i < 6000; i++) {
    const roll = rollGear('filo_glacial', 20, rnd);
    if (roll?.power) assert.equal(roll.grade, 3, 'un poder fuera de una reliquia');
  }
});

test('una reliquia con poder cambia un afijo por el poder, no lo suma', () => {
  const rnd = seeded(77);
  let vistas = 0;
  for (let i = 0; i < 8000 && vistas < 60; i++) {
    const roll = rollGear('filo_glacial', 20, rnd);
    if (roll?.grade !== 3) continue;
    vistas++;
    if (roll.power) assert.equal(roll.affixes.length, 2, 'con poder van dos afijos, no tres');
    else assert.equal(roll.affixes.length, 3, 'sin poder van los tres');
  }
  assert.ok(vistas > 0, 'debería haber salido alguna reliquia');
});

test('todos los poderes del catálogo pueden caer', () => {
  const rnd = seeded(5);
  const vistos = new Set();
  for (let i = 0; i < 60000 && vistos.size < POWER_IDS.length; i++) {
    const p = rollGear('filo_glacial', 22, rnd)?.power;
    if (p) vistos.add(p);
  }
  assert.equal(vistos.size, POWER_IDS.length, `faltan por salir: ${POWER_IDS.filter((p) => !vistos.has(p))}`);
});

test('el poder da nombre a la pieza por encima de los afijos', () => {
  const entry = { itemId: 'filo_glacial', roll: conPoder('sed') };
  assert.equal(displayName(entry), `${ITEMS.filo_glacial.name} ${POWERS.sed.suffix}`);
  assert.equal(powerOf(entry).id, 'sed');
  // Sin poder, manda el primer afijo
  const sinPoder = { itemId: 'filo_glacial', roll: { tier: 10, grade: 1, affixes: [{ id: 'hp', v: 9 }] } };
  assert.ok(!displayName(sinPoder).includes(POWERS.sed.suffix));
  assert.equal(powerOf(sinPoder), null);
});

test('el poder viaja con la pieza al equipar y se pierde al quitarla', () => {
  const character = heroe();
  const st = character.state;
  bagAdd(st, 'filo_glacial', 1, conPoder('sed'));

  assert.equal(hasPower(st, 'sed'), false, 'en la bolsa no hace nada');
  equipFromBag(st, 0);
  assert.equal(hasPower(st, 'sed'), true, 'equipada sí');
  assert.equal(powerValue(st, 'sed'), POWERS.sed.value);

  unequipToBag(st, 'arma');
  assert.equal(hasPower(st, 'sed'), false, 'al quitársela se pierde');
  assert.equal(powerValue(st, 'sed'), 0);
});

test('varias piezas con poder se combinan: de ahí salen las builds', () => {
  const st = heroe().state;
  bagAdd(st, 'filo_glacial', 1, conPoder('sed'));
  bagAdd(st, 'egida_escarcha', 1, { tier: 15, grade: 3, affixes: [{ id: 'armor', v: 4 }, { id: 'hp', v: 22 }], power: 'espinas' });
  bagAdd(st, 'corona_cripta', 1, { tier: 15, grade: 3, affixes: [{ id: 'hp', v: 25 }, { id: 'regen', v: 1.2 }], power: 'eco' });
  equipFromBag(st, 0); equipFromBag(st, 1); equipFromBag(st, 2);

  const poderes = equippedPowers(st);
  assert.equal(poderes.size, 3, 'los tres a la vez');
  for (const id of ['sed', 'espinas', 'eco']) assert.ok(hasPower(st, id), `falta ${id}`);
});

test('el mismo poder repetido no cuenta dos veces', () => {
  const st = heroe().state;
  bagAdd(st, 'filo_glacial', 1, conPoder('sed'));
  bagAdd(st, 'anillo_helado', 1, { tier: 15, grade: 3, affixes: [{ id: 'armor', v: 3 }, { id: 'hp', v: 18 }], power: 'sed' });
  equipFromBag(st, 0); equipFromBag(st, 1);
  assert.equal(equippedPowers(st).size, 1, 'un poder es un poder, aunque lo lleves por duplicado');
  assert.equal(powerValue(st, 'sed'), POWERS.sed.value, 'y no vale el doble');
});

test('nadie puede colar tres afijos Y un poder en la misma pieza', () => {
  // Es el hueco obvio: declarar la pieza perfecta desde un cliente manipulado.
  const character = heroe({
    inventory: {
      gold: 0,
      slots: [{
        itemId: 'filo_glacial', count: 1,
        roll: {
          tier: 20, grade: 3, power: 'sed',
          affixes: [{ id: 'dmg', v: 9 }, { id: 'hp', v: 30 }, { id: 'speed', v: 0.06 }],
        },
      }],
      equipment: {},
    },
  });
  const roll = character.state.inventory.slots[0].roll;
  const huecos = roll.affixes.length + (roll.power ? 1 : 0);
  assert.ok(huecos <= 3, `una reliquia no puede tener ${huecos} huecos`);
});

test('un poder inventado se descarta y la pieza sobrevive', () => {
  const character = heroe({
    inventory: {
      gold: 0,
      slots: [{
        itemId: 'filo_glacial', count: 1,
        roll: { tier: 12, grade: 3, power: 'invencibilidad', affixes: [{ id: 'dmg', v: 6 }, { id: 'hp', v: 20 }] },
      }],
      equipment: {},
    },
  });
  const slot = character.state.inventory.slots[0];
  assert.equal(slot.itemId, 'filo_glacial', 'la pieza se conserva');
  assert.equal(slot.roll.power, undefined, 'el poder inventado se cae');
  assert.equal(slot.roll.affixes.length, 2, 'y sus afijos legítimos siguen ahí');
});

test('todo poder del catálogo está bien formado', () => {
  for (const id of POWER_IDS) {
    const p = POWERS[id];
    assert.equal(p.id, id, 'el id debe coincidir con su clave');
    assert.ok(p.name && p.suffix && p.icon, `${id} sin nombre, sufijo o icono`);
    assert.ok(p.desc && p.desc.length > 20, `${id} necesita explicar qué hace`);
    assert.ok(typeof p.value === 'number' && p.value > 0, `${id} sin valor`);
    // El sufijo es lo que bautiza la pieza: no puede repetirse entre poderes
    assert.equal(POWER_IDS.filter((o) => POWERS[o].suffix === p.suffix).length, 1,
      `el sufijo "${p.suffix}" está repetido`);
  }
});

test('activePowers ignora casillas vacías y objetos sin tirada', () => {
  const mapa = activePowers([null, 'espada_acero', { itemId: 'filo_glacial', roll: conPoder('verdugo') }]);
  assert.equal(mapa.size, 1);
  assert.ok(mapa.has('verdugo'));
});
