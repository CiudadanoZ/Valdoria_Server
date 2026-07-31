// Forma del mundo: que las comarcas tengan carácter propio y que el terreno se
// pueda caminar. Es geometría pura (sin servidor), así que corre en milisegundos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, slopeAt, biomeAt, COMARCAS, WORLD_RADIUS } from '../public/js/terrain.js';

// Recorre el mundo en polares y devuelve una muestra por punto.
function barrido(fn, { from = 55, to = WORLD_RADIUS, paso = 3, dAng = 0.02 } = {}) {
  const out = [];
  for (let a = -Math.PI; a < Math.PI; a += dAng) {
    for (let r = from; r < to; r += paso) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      out.push(fn(x, z, r));
    }
  }
  return out;
}

test('la Ciudadela es llana: sus edificios no necesitan tocarse', () => {
  const alturas = barrido((x, z) => Math.abs(heightAt(x, z)), { from: 0, to: 52, paso: 4 });
  assert.ok(Math.max(...alturas) < 1e-9, 'dentro de la muralla el suelo debe ser plano');
});

test('el relieve entra sin escalones al salir de la muralla', () => {
  let maxSalto = 0;
  for (let a = -Math.PI; a < Math.PI; a += 0.05) {
    for (let r = 45; r < WORLD_RADIUS - 2; r += 2) {
      const h1 = heightAt(Math.cos(a) * r, Math.sin(a) * r);
      const h2 = heightAt(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
      maxSalto = Math.max(maxSalto, Math.abs(h2 - h1));
    }
  }
  assert.ok(maxSalto < 3, `salto máximo en 2 unidades: ${maxSalto.toFixed(2)}`);
});

test('cada comarca tiene el carácter que le toca', () => {
  const media = (id) => {
    const hs = barrido((x, z) => (biomeAt(x, z).id === id ? heightAt(x, z) : null), { from: 85, to: 185, paso: 8, dAng: 0.03 })
      .filter((h) => h !== null);
    return hs.reduce((a, b) => a + b, 0) / hs.length;
  };
  const cumbres = media('cumbres'), cienaga = media('cienaga'), llanura = media('llanura'), colinas = media('colinas');

  assert.ok(cumbres > llanura + 3, `las Cumbres deben elevarse sobre la llanura (${cumbres.toFixed(1)} vs ${llanura.toFixed(1)})`);
  assert.ok(cienaga < llanura, `la Ciénaga debe ser una hondonada (${cienaga.toFixed(1)})`);
  assert.ok(colinas > llanura, `las Colinas deben ondular más que la llanura (${colinas.toFixed(1)})`);
});

test('las alturas se mantienen en un rango razonable', () => {
  const hs = barrido((x, z) => heightAt(x, z), { paso: 5, dAng: 0.05 });
  const min = Math.min(...hs), max = Math.max(...hs);
  assert.ok(max < 30 && min > -15, `rango del mundo: ${min.toFixed(1)} .. ${max.toFixed(1)}`);
});

test('las comarcas cubren los 360 grados sin huecos', () => {
  const vistos = new Set();
  for (let a = -Math.PI; a < Math.PI; a += 0.02) vistos.add(biomeAt(Math.cos(a) * 100, Math.sin(a) * 100).id);
  assert.equal(vistos.size, COMARCAS.length, `comarcas alcanzables: ${[...vistos].join(', ')}`);
});

test('el mundo se camina llano y lo escarpado es la montaña', () => {
  const pend = barrido((x, z) => ({ s: slopeAt(x, z), bioma: biomeAt(x, z).id }));
  const ss = pend.map((p) => p.s).sort((a, b) => a - b);
  const mediana = ss[Math.floor(ss.length / 2)];
  const p95 = ss[Math.floor(ss.length * 0.95)];

  assert.ok(mediana < 0.25, `el grueso del mundo debe ser llano (mediana ${mediana.toFixed(2)})`);
  assert.ok(p95 < 0.7, `percentil 95: ${p95.toFixed(2)}`);
  assert.ok(ss.filter((s) => s > 0.6).length / ss.length < 0.08, 'poco terreno escarpado');

  // Las laderas viven en las fronteras (la mitad cae del lado del vecino), así
  // que lo significativo es qué comarca es de media la más escarpada.
  const medias = {};
  for (const p of pend) (medias[p.bioma] ||= []).push(p.s);
  const rank = Object.entries(medias)
    .map(([id, arr]) => [id, arr.reduce((a, b) => a + b, 0) / arr.length])
    .sort((a, b) => b[1] - a[1]);
  assert.equal(rank[0][0], 'cumbres', `la comarca más escarpada debe ser la montañosa: ${rank.map(([i, m]) => i + ' ' + m.toFixed(2)).join(' · ')}`);
});
