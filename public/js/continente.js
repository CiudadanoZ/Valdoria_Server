// El continente: el mar que lo rodea, los caminos que lo cruzan y todo lo que
// crece, se cae o se abandona en él.
//
// world.js levanta la Ciudadela y los sitios con nombre (criptas, campamentos,
// lago, ruinas); aquí se puebla el resto, que es la mayor parte del mapa. Todo
// es determinista (semilla fija): el continente sale igual en cada arranque y
// en cada ordenador, como el de un juego hecho a mano.
import * as THREE from 'three';
import {
  heightAt, biomeAt, costaDist, contornoCosta, NIVEL_MAR, WORLD_RADIUS, slopeAt,
} from './terrain.js';
import { CAMINOS, WAYSTONES } from './world-data.js';
import { LoteDecor } from './decor.js';
import { decorSheet } from './pixeldecor.js';
import { treeSheet, propSheet } from './pixelprops.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function smooth(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

// ============================================================ el mar
// Un anillo desde un poco tierra adentro de la costa (lo tapa la playa) hasta
// más allá de lo que alcanza la cámara. Cada vértice sabe a qué distancia está
// de la orilla: con eso el sombreador pinta la espuma que rompe en la playa y
// oscurece el agua honda. Las crestas de las olas se mueven con el tiempo.
export function buildSea(scene) {
  const costa = contornoCosta(360);
  // Hasta 140 u mar adentro: la cámara no ve más lejos, y más allá (x > 400)
  // empiezan las criptas, que no deben tener mar bajo el suelo.
  const anillos = [-8, -2, 0, 1.5, 3, 6, 12, 24, 48, 90, 140];
  const pos = [], dist = [], idx = [];
  for (const [x, z] of costa) {
    const R = Math.hypot(x, z), ux = x / R, uz = z / R;
    for (const d of anillos) {
      pos.push(ux * (R + d), NIVEL_MAR, uz * (R + d));
      dist.push(d);
    }
  }
  const n = costa.length, m = anillos.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (let k = 0; k < m - 1; k++) {
      const a = i * m + k, b = j * m + k, c = j * m + k + 1, d = i * m + k + 1;
      idx.push(a, b, d, b, c, d);     // caras hacia arriba (al revés, la cámara no las veía)
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aCosta', new THREE.Float32BufferAttribute(dist, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const tiempo = { value: 0 };
  // Mate: con brillo, el sol del ocaso (que cae de frente a la cámara) se
  // reflejaba en todo el mar y lo volvía una mancha rosada
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a5a78, transparent: true, opacity: 0.9, roughness: 1, metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTiempo = tiempo;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aCosta;\nvarying float vCosta;\nvarying vec3 vMundo;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCosta = aCosta;\nvMundo = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uTiempo;\nvarying float vCosta;\nvarying vec3 vMundo;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hondo = smoothstep(3.0, 70.0, vCosta);
        diffuseColor.rgb = mix(vec3(0.06, 0.30, 0.38), vec3(0.02, 0.09, 0.20), hondo);
        // Crestas de ola: franjas que avanzan, cortadas en trozos
        float ola = sin(vMundo.x * 0.33 + uTiempo * 1.2 + sin(vMundo.z * 0.19) * 2.2)
                  * sin(vMundo.z * 0.29 - uTiempo * 0.8 + vMundo.x * 0.05);
        diffuseColor.rgb += step(0.86, ola) * 0.16;
        // Espuma que rompe en la orilla y respira con el oleaje
        float vaiven = 0.5 + 0.5 * sin(uTiempo * 1.6 + vMundo.x * 0.21 + vMundo.z * 0.17);
        float espuma = 1.0 - smoothstep(1.2, 2.6 + vaiven * 1.8, vCosta);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.88, 0.90), espuma * 0.85);
        diffuseColor.a = mix(0.72, 0.96, hondo);`);
  };
  const mar = new THREE.Mesh(geo, material);
  mar.receiveShadow = true;
  mar.raycast = () => {};
  scene.add(mar);
  return { mar, tiempo };
}

// ============================================================ caminos
// Cada camino es una curva suave por sus puntos; se extiende como una cinta
// amoldada al relieve, con los bordes un poco irregulares (tierra pisada, no
// asfalto).
const muestrasCamino = [];   // [x, z, medioAncho] para saber si algo pisa un camino

function curvaDe(c) {
  return new THREE.CatmullRomCurve3(c.puntos.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
}

export function buildCaminos(scene, mat) {
  const rand = rng(77);
  for (const c of CAMINOS) {
    const curva = curvaDe(c);
    const largo = curva.getLength();
    const n = Math.max(2, Math.ceil(largo / 1.4));
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = curva.getPointAt(t), tg = curva.getTangentAt(t);
      const nx = -tg.z, nz = tg.x;
      const media = c.ancho / 2;
      for (const lado of [-1, 1]) {
        const w = media + (rand() - 0.5) * 0.7;
        const x = p.x + nx * w * lado, z = p.z + nz * w * lado;
        pos.push(x, heightAt(x, z) + 0.09, z);
      }
      muestrasCamino.push([p.x, p.z, media]);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Tierra clara y pisada: con la luz violeta del anochecer, un marrón oscuro
    // se veía casi negro y uno rojizo, granate
    const malla = new THREE.Mesh(geo, mat(0x76684a, { roughness: 1, detalle: 'suelo' }));
    malla.name = 'camino';
    malla.receiveShadow = true;
    scene.add(malla);
  }
  // El camino de siempre, de la puerta sur al claro del Alfa
  for (let z = 43; z <= 113; z += 1.4) muestrasCamino.push([0, z, 3]);
}

function pisaCamino(x, z, margen) {
  for (const [cx, cz, m] of muestrasCamino) {
    const dx = x - cx, dz = z - cz;
    const lim = m + margen;
    if (dx * dx + dz * dz < lim * lim) return true;
  }
  return false;
}

// ============================================================ zonas libres
// Sitios donde no debe crecer nada al azar: la Ciudadela, los sitios con
// nombre y los lugares que se montan a mano más abajo.
const LIBRES = [
  [0, 0, 50],                           // Ciudadela y su salida
  [0, 113, 14], [0, 150, 13],           // claro del Alfa y del Coloso
  [62, -52, 21], [0, -85, 12],          // lago y ruinas
  [-67, 55, 9], [70, 21, 9],            // campamentos de Baldur y Nyra
  [-72, 58, 7], [74, 28, 7],            // entradas de las criptas
  [-75, -37, 9], [64, 96, 9],           // choza de Ysra y cabaña de Skadi
  [92, 122, 10], [-118, -92, 10],       // guaridas de los jefes
  ...WAYSTONES.map((w) => [w.x, w.z, 4.5]),
];

function libre(x, z) {
  for (const [cx, cz, r] of LIBRES) {
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return false;
  }
  return !pisaCamino(x, z, 1.2);
}

// ============================================================ recetas por bioma
// [tipo, peso, opciones]. tipo es 'decor:<tipo>' (pixeldecor), 'prop:<tipo>'
// (pixelprops) o 'roble' (árboles de copa). Las opciones dan la escala, las
// variantes permitidas, si se mece con el viento y la sombra que deja.
const PLANTA = { viento: 1 };
const RECETAS = {
  llanura: { dens: 0.42, items: [
    ['decor:hierba', 40, { v: [0, 5], ...PLANTA }],
    ['decor:flores', 14, { ...PLANTA }],
    ['decor:arbusto', 8, { v: [0, 2], sombra: 1.1 }],
    ['decor:piedras', 6, {}],
    ['roble', 4, { esc: [0.8, 1.15], sombra: 2.2 }],
    ['decor:tocon', 2, {}],
  ] },
  praderas: { dens: 0.46, items: [
    ['decor:hierba', 40, { v: [0, 2, 5], ...PLANTA }],
    ['decor:flores', 18, { ...PLANTA }],
    ['decor:arbusto', 6, { v: [0, 2, 3], sombra: 1.1 }],
    ['decor:piedras', 5, {}],
    ['roble', 3, { esc: [0.8, 1.1], sombra: 2.2 }],
  ] },
  bosque: { dens: 0.62, items: [
    ['decor:pinoOscuro', 13, { esc: [0.85, 1.25], sombra: 2.0 }],
    ['roble:oscuro', 13, { esc: [0.85, 1.3], sombra: 2.4 }],
    ['decor:helecho', 16, { ...PLANTA }],
    ['decor:arbusto', 10, { v: [1], sombra: 1.1 }],
    ['decor:setas', 7, { v: [0, 1] }],
    ['decor:tocon', 5, {}],
    ['decor:tronco', 4, {}],
    ['decor:hierba', 14, { v: [1], ...PLANTA }],
  ] },
  cienaga: { dens: 0.5, items: [
    ['decor:junquera', 18, { ...PLANTA }],
    ['prop:junco', 10, { v: [0, 1, 2, 3], ...PLANTA }],
    ['prop:arbolMuerto', 6, { v: [0, 1, 2, 3], esc: [0.8, 1.3], sombra: 1.4 }],
    ['decor:setas', 7, { v: [2] }],
    ['decor:hierba', 18, { v: [3], ...PLANTA }],
    ['decor:huesos', 2, {}],
    ['decor:tocon', 4, {}],
  ] },
  colinas: { dens: 0.42, items: [
    ['decor:hierba', 28, { v: [0, 1], ...PLANTA }],
    ['prop:roca', 7, { v: [0, 1, 2, 3], esc: [0.7, 1.4], sombra: 1.4 }],
    ['decor:piedras', 8, {}],
    ['decor:arbusto', 8, { v: [0, 3], sombra: 1.1 }],
    ['decor:flores', 8, { v: [1, 3, 4], ...PLANTA }],
    ['decor:pinoOscuro', 5, { esc: [0.8, 1.1], sombra: 2.0 }],
    ['decor:menhir', 0.6, {}],
  ] },
  cumbres: { dens: 0.4, items: [
    ['prop:pinoNevado', 12, { v: [0, 1, 2, 3], esc: [0.8, 1.2], sombra: 1.8 }],
    ['decor:rocaNieve', 9, { esc: [0.8, 1.4], sombra: 1.4 }],
    ['decor:monticulo', 10, {}],
    ['prop:cristalHielo', 4, { v: [0, 1, 2, 3], esc: [0.7, 1.3] }],
    ['decor:arbusto', 6, { v: [4], sombra: 1.0 }],
    ['decor:hierba', 10, { v: [4], ...PLANTA }],
    ['decor:huesos', 1, {}],
  ] },
  playa: { dens: 0.2, items: [
    ['decor:concha', 30, {}],
    ['decor:maderaDeriva', 14, {}],
    ['decor:piedras', 20, {}],
    ['decor:hierba', 20, { v: [2], ...PLANTA }],
  ] },
};

// Un ruido suave para que la densidad venga a manchas (prados de flores,
// rodales espesos, calveros) en vez de un salpicado uniforme.
function manchas(x, z) {
  return 0.5 + 0.25 * Math.sin(x * 0.061 + Math.sin(z * 0.043) * 1.7)
             + 0.25 * Math.cos(z * 0.057 - Math.cos(x * 0.039) * 1.3);
}

// Resuelve un tipo de receta a su lienzo y su clave en el atlas.
function lienzoDe(tipo, v) {
  if (tipo === 'roble') return [`roble:${v}`, treeSheet(v % 4, false)];
  if (tipo === 'roble:oscuro') return [`robleOscuro:${v}`, treeSheet(v % 4, true)];
  const [fuente, nombre] = tipo.split(':');
  if (fuente === 'prop') return [`prop:${nombre}:${v}`, propSheet(nombre, v)];
  return [`decor:${nombre}:${v}`, decorSheet(nombre, v)];
}

const VARIANTES_POR_DEFECTO = { 'decor:flores': [0, 1, 2, 3, 4, 5], 'roble': [0, 1, 2, 3], 'roble:oscuro': [0, 1, 2, 3],
  'decor:piedras': [0, 1, 2], 'decor:tocon': [0, 1], 'decor:tronco': [0, 1], 'decor:pinoOscuro': [0, 1, 2],
  'decor:helecho': [0, 1], 'decor:junquera': [0, 1, 2], 'decor:nenufar': [0, 1], 'decor:huesos': [0, 1],
  'decor:rocaNieve': [0, 1, 2], 'decor:monticulo': [0, 1], 'decor:menhir': [0, 1], 'decor:concha': [0, 1, 2],
  'decor:maderaDeriva': [0, 1], 'decor:arbusto': [0], 'decor:hierba': [0], 'decor:setas': [0] };

function elegir(items, rand) {
  let total = 0;
  for (const it of items) total += it[1];
  let k = rand() * total;
  for (const it of items) { k -= it[1]; if (k <= 0) return it; }
  return items[items.length - 1];
}

function poner(lote, tipo, v, x, z, { esc = 1, viento = 0, sombra = 0 } = {}) {
  const [clave, lienzo] = lienzoDe(tipo, v);
  const y = heightAt(x, z);
  lote.poner(clave, lienzo, x, y, z, { escala: esc, viento, sombra: sombra * esc });
}

// ============================================================ sitios a mano
// Lugares con historia: lo que en un Diablo te hace parar a mirar.
function sitios(lote) {
  const d = (tipo, v, x, z, op) => poner(lote, 'decor:' + tipo, v, x, z, op);
  const p = (tipo, v, x, z, op) => poner(lote, 'prop:' + tipo, v, x, z, op);

  // Cementerio de las Ruinas: tumbas en hileras, cercado roto y un estandarte negro
  const [cx, cz] = [-30, -102];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    if ((i + j * 3) % 5 === 4) continue;
    d('lapida', (i * 3 + j) % 3, cx - 6 + i * 4, cz - 4 + j * 4.2);
  }
  for (const [x, z] of [[-11, -9], [-3, -9], [5, -9], [9, -3], [9, 5]]) d('murete', (x + z) & 1 ? 1 : 2, cx + x, cz + z, { esc: 0.8 });
  d('estandarte', 2, cx + 8, cz - 7);
  d('huesos', 0, cx - 9, cz + 7); d('setas', 0, cx + 2, cz + 9);
  LIBRES.push([cx, cz, 13]);

  // Caravana asaltada en el camino del este
  const [kx, kz] = [32, 52];
  d('carro', 0, kx, kz, { sombra: 2 });
  d('barril', 0, kx + 4, kz + 2); d('barril', 1, kx + 5.2, kz + 0.8); d('caja', 0, kx - 4, kz + 2); d('caja', 1, kx - 3, kz - 2);
  d('huesos', 1, kx + 2, kz + 4); d('estandarte', 0, kx - 6, kz - 1);
  d('hogueraApagada', 0, kx + 1, kz - 4);
  LIBRES.push([kx, kz, 8]);

  // Granja abandonada en las praderas: cercado, pajares, pozo y espantapájaros
  const [gx, gz] = [-30, 104];
  for (let i = -2; i <= 2; i++) { d('valla', i & 1, gx + i * 3.2, gz - 9); d('valla', (i + 1) & 1, gx + i * 3.2, gz + 9); }
  d('pajar', 0, gx - 4, gz - 2, { sombra: 2 }); d('pajar', 0, gx + 5, gz + 3, { sombra: 2 });
  d('pozo', 0, gx + 2, gz - 4, { sombra: 1.6 });
  d('espantapajaros', 0, gx - 5, gz + 5);
  d('barril', 0, gx + 7, gz - 5); d('carro', 0, gx + 12, gz + 1, { sombra: 2 });
  LIBRES.push([gx, gz, 14]);

  // Campamento de cazadores abandonado, en lo hondo del bosque
  const [hx, hz] = [-122, 70];
  p('tienda', 0, hx, hz, { sombra: 2.4 });
  d('hogueraApagada', 0, hx + 1, hz + 5);
  d('tronco', 0, hx + 5, hz + 6); d('barril', 1, hx - 4, hz + 2); d('estandarte', 1, hx + 4, hz - 2);
  d('huesos', 1, hx - 2, hz + 8);
  LIBRES.push([hx, hz, 10]);

  // Círculo de menhires en las colinas
  const [mx, mz] = [-62, -128];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    d('menhir', i & 1, mx + Math.cos(a) * 7, mz + Math.sin(a) * 7, { esc: 1.1, sombra: 1.1 });
  }
  d('piedras', 1, mx, mz);
  LIBRES.push([mx, mz, 10]);

  // Santuario de los cazadores del hielo
  const [sx, sz] = [134, 150];
  d('totem', 0, sx, sz, { sombra: 1 });
  d('estandarte', 2, sx - 4, sz - 2); d('estandarte', 2, sx + 4, sz - 2);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.4; d('rocaNieve', i % 3, sx + Math.cos(a) * 7, sz + Math.sin(a) * 5, { esc: 0.8, sombra: 1.2 }); }
  d('huesos', 0, sx + 2, sz + 3);
  LIBRES.push([sx, sz, 10]);

  // Más ruinas alrededor de las del norte: columnas y muros caídos
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, r = 14 + (i % 3) * 2.5;
    const x = Math.cos(a) * r, z = -85 + Math.sin(a) * r;
    if (i % 3 === 0) d('columna', i % 3, x, z, { sombra: 1 }); else d('murete', i % 3, x, z, { esc: 0.9 });
  }

  // Naufragio en la Bahía de las Gaviotas: busca la orilla en esa dirección
  const a = -0.12;
  let rr = 150;
  while (costaDist(Math.cos(a) * rr, Math.sin(a) * rr) > 5) rr += 1;
  const [bx, bz] = [Math.cos(a) * rr, Math.sin(a) * rr];
  d('barca', 0, bx, bz, { sombra: 2.4 });
  d('maderaDeriva', 0, bx - 5, bz + 3); d('barril', 1, bx + 3, bz + 4); d('caja', 0, bx - 2, bz - 4);
  d('concha', 1, bx + 5, bz - 2);
  LIBRES.push([bx, bz, 8]);

  // Postes indicadores en los cruces de caminos
  for (const [x, z] of [[4, 60], [-52, 52], [64, 34], [24, 70], [62, -28], [4, 120]]) d('poste', 0, x, z, { sombra: 0.6 });
}

// ============================================================ poblar
export function poblarContinente(scene) {
  const lote = new LoteDecor();
  sitios(lote);
  const rand = rng(20261004);
  const PASO = 3.2;
  const L = WORLD_RADIUS;
  for (let gz = -L; gz < L; gz += PASO) {
    for (let gx = -L; gx < L; gx += PASO) {
      const x = gx + rand() * PASO, z = gz + rand() * PASO;
      const tirada = rand(), t2 = rand(), t3 = rand(), t4 = rand(), t5 = rand();
      const dc = costaDist(x, z);
      if (dc < 1.5) continue;
      // Junto a la Ciudadela el suelo de todas las comarcas cede al verde de
      // la llanura (terrain.colorAt); el atrezo hace lo mismo, poco a poco.
      const haciaComarca = smooth((Math.hypot(x, z) - 55) / 50);
      const id = t5 < haciaComarca ? biomeAt(x, z).id : 'llanura';
      const receta = dc < 10 ? RECETAS.playa : RECETAS[id];
      if (!receta) continue;
      // Más espeso a manchas; y la orilla, poco poblada
      const dens = 1.25 * receta.dens * (0.35 + 0.95 * smooth(manchas(x, z)));
      if (tirada > dens) continue;
      if (!libre(x, z)) continue;
      const [tipo, , op] = elegir(receta.items, () => t2);
      const grande = tipo === 'roble' || tipo === 'roble:oscuro' || tipo.includes('pino') || tipo.includes('arbolMuerto');
      if (grande && slopeAt(x, z) > 0.6) continue;     // los árboles no se plantan en un barranco
      const variantes = op.v || VARIANTES_POR_DEFECTO[tipo] || [0];
      const v = variantes[Math.floor(t3 * variantes.length)];
      const [e0, e1] = op.esc || [0.9, 1.2];
      poner(lote, tipo, v, x, z, { esc: e0 + (e1 - e0) * t4, viento: op.viento || 0, sombra: op.sombra || 0 });
    }
  }
  lote.construir(scene);
  return lote;
}
