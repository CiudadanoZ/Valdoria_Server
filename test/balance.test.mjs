// Balance del equipo: que el arma sea la fuente de poder y que la armadura
// siempre importe sin llegar nunca a la invulnerabilidad.
// La fórmula pura se comprueba directamente; la tubería (tope por arma +
// mitigación por armadura) se comprueba por JcJ, que es determinista: el
// atacante fija el daño y el servidor aplica el tope y la armadura del objetivo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { spawnBot, wait } from './helpers/bot.mjs';
import { MELEE, ARMOR_K, applyArmor, armorMitigation, maxMeleeHit } from '../public/js/combat-data.js';

// ---- Fórmula (funciones puras: exactas y sin servidor) ----

test('el arma domina sobre la base plana desarmada', () => {
  const desarmado = MELEE.flat;          // sin arma
  const conArma = MELEE.flat + 26;       // mejor arma
  assert.ok(MELEE.flat <= 4, 'la base sin arma debe ser pequeña');
  assert.ok(conArma >= desarmado * 5, 'la mejor arma debe multiplicar por mucho el daño base');
});

test('el tope de daño válido crece con el arma', () => {
  assert.ok(maxMeleeHit(26) > maxMeleeHit(0), 'más arma, más techo');
  assert.equal(maxMeleeHit(10) - maxMeleeHit(0), 10, 'cada punto de arma sube el techo 1:1');
});

test('la armadura mitiga con retornos decrecientes y nunca invulnerabiliza', () => {
  assert.equal(armorMitigation(0), 0, 'sin armadura no reduce nada');
  // Monótona: más armadura, más reducción
  let prev = -1;
  for (const a of [0, 10, 25, 50, 100, 500]) {
    const m = armorMitigation(a);
    assert.ok(m > prev, 'la reducción crece con la armadura');
    assert.ok(m < 1, `nunca llega al 100% (armadura ${a} da ${m})`);
    prev = m;
  }
  assert.equal(armorMitigation(ARMOR_K), 0.5, 'con armadura = K la reducción es del 50%');
});

test('el daño recibido nunca baja de 1, aunque la armadura sea enorme', () => {
  assert.equal(applyArmor(24, 9999), 1, 'un jefe con armadura absurda aún hace 1 (no 0)');
  assert.ok(applyArmor(24, 26) >= 14, 'con equipo completo un jefe de 24 aún pega fuerte');
  assert.ok(applyArmor(24, 26) < 24, 'pero menos que sin armadura');
});

// ---- Tubería completa por JcJ (determinista) ----

let server;
before(async () => {
  server = await startServer({
    seed: [
      { account: 'balAtaca', name: 'Atacante', gold: 0,
        items: [{ itemId: 'guadana_espectral' }] },
      { account: 'balDesnudo', name: 'Desnudo', gold: 0 },
      { account: 'balBlindado', name: 'Blindado', gold: 0, items: [
        { itemId: 'corona_cripta' }, { itemId: 'armadura_pieles' },
        { itemId: 'escudo_hueso' }, { itemId: 'manto_alfa' },
        { itemId: 'amuleto_guardian' },
      ] },
    ],
  });
});
after(async () => { await server.stop(); });

// Un golpe de JcJ con daño fijo. Devuelve el daño que registra el objetivo.
async function golpeFijo(atacante, objetivo, dmg) {
  objetivo.clear();
  atacante.send({ type: 'pvp_attack', targetId: objetivo.id, dmg });
  const hurt = await objetivo.waitFor('player_hurt');
  return hurt.dmg;
}

test('la armadura reduce el daño recibido pero deja pasar bastante (no invulnerabilidad)', async () => {
  const atacante = await spawnBot(server.url, { account: 'balAtaca', clazz: 'guerrero' });
  const desnudo = await spawnBot(server.url, { account: 'balDesnudo', clazz: 'guerrero' });
  const blindado = await spawnBot(server.url, { account: 'balBlindado', clazz: 'guerrero' });
  await blindado.equip('corona_cripta');
  await blindado.equip('armadura_pieles');
  await blindado.equip('escudo_hueso');
  await blindado.equip('manto_alfa');
  await blindado.equip('amuleto_guardian');

  for (const b of [atacante, desnudo, blindado]) await b.enablePvp();
  // Fuera de la Ciudadela (zona segura radio 45)
  await atacante.walkTo(0, 60);
  await desnudo.walkTo(1, 60);
  await blindado.walkTo(-1, 60);
  await atacante.walkTo(0, 60);

  // Atacante desarmado: el servidor le recorta a maxMeleeHit(0). El mismo golpe
  // pega a los dos; solo cambia la armadura del que lo recibe.
  const aDesnudo = await golpeFijo(atacante, desnudo, 9999);
  await wait(700); // enfriamiento de JcJ
  const aBlindado = await golpeFijo(atacante, blindado, 9999);

  assert.ok(aBlindado < aDesnudo, `el blindado debe recibir menos (${aBlindado} < ${aDesnudo})`);
  assert.ok(aBlindado > 1, `pero no ser invulnerable como en el modelo viejo (recibió ${aBlindado})`);
  // Reducción claramente perceptible (equipo completo ronda el 30%+)
  assert.ok(aBlindado <= aDesnudo * 0.85, 'la reducción debe notarse, no ser simbólica');

  atacante.disconnect(); desnudo.disconnect(); blindado.disconnect();
});

test('empuñar un arma aumenta el daño que se reparte', async () => {
  const atacante = await spawnBot(server.url, { account: 'balAtaca', clazz: 'guerrero' });
  const victima = await spawnBot(server.url, { account: 'balDesnudo', clazz: 'guerrero' });
  for (const b of [atacante, victima]) await b.enablePvp();
  await atacante.walkTo(0, 60);
  await victima.walkTo(1, 60);
  await atacante.walkTo(0, 60);

  // Desarmado: el tope recorta el golpe
  const sinArma = await golpeFijo(atacante, victima, 9999);
  await wait(700);

  // Con la guadaña equipada, el tope sube y el golpe entero pasa
  await atacante.equip('guadana_espectral');
  const conArma = await golpeFijo(atacante, victima, 9999);

  assert.ok(conArma > sinArma * 1.5,
    `la guadaña debe subir el daño con claridad (${conArma} vs ${sinArma} desarmado)`);

  atacante.disconnect(); victima.disconnect();
});
