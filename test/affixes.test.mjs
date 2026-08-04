// Botín aleatorio: los afijos son lo que hace que valga la pena matar al mismo
// jefe dos veces. Estos casos vigilan las dos cosas que pueden estropearlo:
// que las tiradas se descontrolen, y que una tirada buena se pierda o se
// duplique al equiparla, venderla o guardarla.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollGear, statsOf, displayName, affixLines, sellValueOf, gradeInfo,
  tierFromXp, clampTier, affixesFor, AFFIXES, MAX_TIER,
} from '../public/js/affixes.js';
import { ITEMS } from '../public/js/items.js';
import {
  ensureState, bagAdd, bagRemove, bagCount, bagTakeAt, bagAddEntry,
  equipFromBag, unequipToBag, equippedWeaponDmg, computeArmor, computeMaxHp,
  affixBonus,
} from '../server/state.js';

// Generador determinista: los tests no pueden depender de la suerte.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const heroe = (state = {}) => {
  const character = { name: 'Prueba', race: 'humano', class: 'guerrero', state };
  ensureState(character);
  return character;
};

test('una tirada nunca tiene más afijos que su grado, ni afijos repetidos', () => {
  const rnd = seeded(7);
  for (let i = 0; i < 400; i++) {
    const roll = rollGear('filo_glacial', 1 + (i % MAX_TIER), rnd);
    if (!roll) continue;
    // El grado son los HUECOS de la pieza, y un poder legendario ocupa uno.
    const huecos = roll.affixes.length + (roll.power ? 1 : 0);
    assert.equal(huecos, roll.grade, 'el grado debe coincidir con los huecos ocupados');
    assert.ok(roll.grade >= 1 && roll.grade <= 3, `grado fuera de rango: ${roll.grade}`);
    const ids = roll.affixes.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'no puede repetirse el mismo afijo');
  }
});

test('los afijos caen solo donde tienen sentido', () => {
  const rnd = seeded(11);
  // El daño es cosa de armas: un escudo no puede salir con "+daño"
  for (let i = 0; i < 300; i++) {
    const roll = rollGear('escudo_hueso', 12, rnd);
    if (!roll) continue;
    assert.ok(!roll.affixes.some((a) => a.id === 'dmg'), 'un escudo no debe llevar daño');
  }
  assert.ok(affixesFor('arma').includes('dmg'));
  assert.ok(!affixesFor('arma').includes('armor'), 'una espada no da armadura');
});

test('lo que no es equipo no se tira', () => {
  const rnd = seeded(3);
  for (const id of ['pocion_vida', 'piel_lobo', 'reliquia_cripta']) {
    for (let i = 0; i < 50; i++) {
      assert.equal(rollGear(id, 20, rnd), null, `${id} no debería tirar afijos`);
    }
  }
});

test('las tiradas escalan con el tier y se quedan dentro de su techo', () => {
  const rnd = seeded(23);
  const mejorPorTier = (tier) => {
    let best = 0;
    for (let i = 0; i < 3000; i++) {
      const roll = rollGear('filo_glacial', tier, rnd);
      for (const a of roll?.affixes || []) {
        if (a.id !== 'dmg') continue;
        const techo = AFFIXES.dmg.base + AFFIXES.dmg.per * tier;
        assert.ok(a.v <= Math.round(techo) + 1, `+${a.v} de daño se pasa del techo ${techo} en tier ${tier}`);
        best = Math.max(best, a.v);
      }
    }
    return best;
  };
  assert.ok(mejorPorTier(20) > mejorPorTier(2), 'lo que cae hondo debe pegar más que lo de la superficie');
});

test('un bicho duro reparte mejores grados que uno flojo', () => {
  const rnd = seeded(99);
  const reliquias = (tier) => {
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollGear('filo_glacial', tier, rnd)?.grade === 3) n++;
    return n;
  };
  assert.ok(reliquias(20) > reliquias(1), 'las reliquias deben salir más hondo, no en la llanura');
});

test('el tier sale de la dureza del bicho y no se dispara', () => {
  assert.ok(tierFromXp(12) < tierFromXp(360), 'el Jarl debe superar al lobo');
  assert.equal(clampTier(999), MAX_TIER);
  assert.equal(clampTier(-5), 1);
});

test('las estadísticas suman base y afijos, y el nombre lleva el sufijo', () => {
  const entry = { itemId: 'filo_glacial', roll: { tier: 10, grade: 2, affixes: [{ id: 'dmg', v: 5 }, { id: 'hp', v: 20 }] } };
  const stats = statsOf(entry);
  assert.equal(stats.dmg, ITEMS.filo_glacial.dmg + 5, 'el daño del arma más el afijo');
  assert.equal(stats.hp, 20);
  assert.equal(displayName(entry), `${ITEMS.filo_glacial.name} ${AFFIXES.dmg.suffix}`);
  assert.equal(affixLines(entry).length, 2);
  assert.ok(sellValueOf(entry) > ITEMS.filo_glacial.sell, 'una buena tirada vale más');
  assert.equal(gradeInfo(2).stars, '✦✦');
});

test('un id suelto (personaje de antes de los afijos) sigue valiendo', () => {
  assert.equal(statsOf('espada_acero').dmg, ITEMS.espada_acero.dmg);
  assert.equal(displayName('espada_acero'), ITEMS.espada_acero.name);
  assert.deepEqual(affixLines('espada_acero'), []);
});

// ---- Estado del personaje ----

test('el equipo guardado a la vieja usanza se migra sin perder nada', () => {
  const character = heroe({ inventory: { gold: 10, slots: [], equipment: { arma: 'espada_acero', torso: 'armadura_pieles' } } });
  const st = character.state;
  assert.equal(st.inventory.equipment.arma.itemId, 'espada_acero', 'sigue llevando la espada puesta');
  assert.equal(equippedWeaponDmg(st), ITEMS.espada_acero.dmg);
  assert.ok(computeArmor(character) >= ITEMS.armadura_pieles.armor);
});

test('una tirada corrupta o inventada se descarta, no tumba al personaje', () => {
  const character = heroe({
    inventory: {
      gold: 0, slots: [{ itemId: 'espada_acero', count: 1, roll: { grade: 99, affixes: [{ id: 'inventado', v: 9999 }] } }],
      equipment: {},
    },
  });
  const slot = character.state.inventory.slots[0];
  assert.equal(slot.itemId, 'espada_acero', 'el objeto se conserva');
  assert.equal(slot.roll, undefined, 'la tirada inventada se cae');
});

test('nadie puede colar un grado más alto que sus afijos', () => {
  // Un cliente manipulado podría declarar "grado 3" con un solo afijo para que
  // la pieza brillara como reliquia sin serlo: el grado se recalcula.
  const character = heroe({
    inventory: {
      gold: 0,
      slots: [{ itemId: 'filo_glacial', count: 1, roll: { tier: 5, grade: 3, affixes: [{ id: 'dmg', v: 4 }] } }],
      equipment: {},
    },
  });
  assert.equal(character.state.inventory.slots[0].roll.grade, 1, 'el grado se ajusta a los afijos que hay');
});

test('la tirada viaja con la pieza al equipar y al quitársela', () => {
  const character = heroe();
  const st = character.state;
  const roll = { tier: 10, grade: 2, affixes: [{ id: 'dmg', v: 6 }, { id: 'hp', v: 18 }] };

  assert.ok(bagAdd(st, 'filo_glacial', 1, roll));
  const hpAntes = computeMaxHp(character);

  assert.ok(equipFromBag(st, 0));
  assert.equal(equippedWeaponDmg(st), ITEMS.filo_glacial.dmg + 6, 'el afijo cuenta en el daño');
  assert.equal(computeMaxHp(character), hpAntes + 18, 'y la vida sube por el afijo');
  assert.equal(affixBonus(st, 'hp'), 18);

  assert.ok(unequipToBag(st, 'arma'));
  const vuelta = st.inventory.slots.find((s) => s?.itemId === 'filo_glacial');
  assert.deepEqual(vuelta.roll, roll, 'la tirada vuelve intacta a la bolsa');
  assert.equal(computeMaxHp(character), hpAntes, 'y al quitársela se pierde la ventaja');
});

test('dos piezas con tirada no se apilan aunque se llamen igual', () => {
  const st = heroe().state;
  bagAdd(st, 'filo_glacial', 1, { tier: 5, grade: 1, affixes: [{ id: 'dmg', v: 3 }] });
  bagAdd(st, 'filo_glacial', 1, { tier: 9, grade: 1, affixes: [{ id: 'dmg', v: 7 }] });
  const llenas = st.inventory.slots.filter((s) => s?.itemId === 'filo_glacial');
  assert.equal(llenas.length, 2, 'cada una ocupa su casilla');
  assert.notDeepEqual(llenas[0].roll, llenas[1].roll);
});

test('gastar objetos en recetas no funde la pieza con afijos', () => {
  const st = heroe().state;
  const buena = { tier: 12, grade: 3, affixes: [{ id: 'dmg', v: 8 }, { id: 'hp', v: 22 }, { id: 'speed', v: 0.05 }] };
  bagAdd(st, 'espada_recluta', 1, buena);   // la buena entra primero, a propósito
  bagAdd(st, 'espada_recluta', 1);          // y la corriente después

  assert.equal(bagCount(st, 'espada_recluta'), 2);
  assert.ok(bagRemove(st, 'espada_recluta', 1));

  const queda = st.inventory.slots.find((s) => s?.itemId === 'espada_recluta');
  assert.deepEqual(queda.roll, buena, 'la que sobrevive debe ser la buena');
});

test('sacar una pieza concreta se lleva su tirada y deja el resto quieto', () => {
  const st = heroe().state;
  const roll = { tier: 8, grade: 1, affixes: [{ id: 'armor', v: 3 }] };
  bagAdd(st, 'escudo_hueso', 1, roll);
  bagAdd(st, 'escudo_hueso', 1);

  const sacada = bagTakeAt(st, 0, 1);
  assert.equal(sacada.itemId, 'escudo_hueso');
  assert.deepEqual(sacada.roll, roll, 'sale con sus afijos, lista para la subasta');
  assert.equal(st.inventory.slots[0], null, 'la casilla queda libre');
  assert.equal(bagCount(st, 'escudo_hueso'), 1, 'la otra sigue ahí');

  // Y al devolverla (subasta retirada) vuelve igual que salió
  assert.ok(bagAddEntry(st, sacada));
  const devuelta = st.inventory.slots.find((s) => s?.itemId === 'escudo_hueso' && s.roll);
  assert.deepEqual(devuelta.roll, roll);
});

test('la armadura de los afijos cuenta en la mitigación', () => {
  const character = heroe();
  const st = character.state;
  const base = computeArmor(character);
  bagAdd(st, 'escudo_hueso', 1, { tier: 10, grade: 1, affixes: [{ id: 'armor', v: 4 }] });
  equipFromBag(st, 0);
  assert.equal(computeArmor(character), base + ITEMS.escudo_hueso.armor + 4);
});
