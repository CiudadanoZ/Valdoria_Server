// Elementos del escenario en pixel art: por ahora, los árboles.
//
// Eran un cilindro con una esfera encima, y con el filtro de píxel seguían
// pareciendo exactamente eso. Ahora son sprites dibujados, con la misma
// técnica que los personajes (rampas con desplazamiento de tono, contorno
// selectivo) y la misma profundidad por los pies: un héroe que pasa por
// detrás de un tronco queda tapado por la copa; por delante, no.
import * as THREE from 'three';
import { Grid, ramp, darkOf, profundidadDePies } from './pixelsprites.js';

// Mismo tamaño de píxel que todo lo demás: 32 px = 3,4 unidades.
const UNIDADES_POR_PX = 3.4 / 32;

const cache = new Map();

// Variantes deterministas: cada árbol del bosque elige una de varias copas,
// así el bosque no parece un sello repetido.
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Copa redonda de hoja ancha. `oscuro`: los del bosque espeso, más sombríos.
function paintRoble(variante, oscuro) {
  const W = 48, H = 64;
  const g = new Grid(W, H);
  const r = rnd(variante * 977 + (oscuro ? 31 : 7));
  const hoja = ramp(oscuro ? 0x2e4a24 : 0x41662e);
  const hojaHonda = ramp(oscuro ? 0x203a1c : 0x2e5024);
  const corteza = ramp(0x5a3e2a);

  // Tronco con raíces que se abren al llegar al suelo
  const tx = 21, tw = 6;
  for (let y = 38; y < H - 1; y++) {
    const abre = y > H - 6 ? (y - (H - 6)) : 0;
    g.rect(tx - abre, y, tw + abre * 2, 1, corteza.b);
    g.set(tx - abre, y, corteza.l);
    g.set(tx + tw - 1 + abre, y, corteza.d);
    if ((y * 7) % 5 === 0) g.set(tx + 2, y, corteza.d);   // vetas
  }
  // Una rama asomando
  for (let i = 0; i < 5; i++) g.set(tx + tw + i, 40 - i, corteza.b);

  // Copa: un racimo de óvalos. Primero la masa en sombra, luego la iluminada
  // desplazada hacia arriba a la izquierda: así la copa tiene volumen.
  const nubes = [[24, 24, 17, 14], [13, 30, 9, 7], [35, 30, 9, 7], [24, 11, 11, 8], [16, 17, 9, 8], [32, 17, 9, 8]];
  for (const [cx, cy, rx, ry] of nubes) {
    g.blob(cx + (r() - 0.5) * 2, cy + 2, rx, ry, hojaHonda);
  }
  for (const [cx, cy, rx, ry] of nubes) {
    g.blob(cx - 1 + (r() - 0.5) * 2, cy, rx * 0.82, ry * 0.78, hoja);
  }
  // Racimos de hojas sueltos para romper el contorno liso
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const x = 24 + Math.cos(a) * (14 + r() * 4);
    const y = 22 + Math.sin(a) * (12 + r() * 3);
    g.blob(x, y, 2.2, 1.8, r() < 0.5 ? hoja : hojaHonda);
  }
  // Brillos sueltos en la parte alta
  for (let i = 0; i < 10; i++) g.set(12 + r() * 20, 8 + r() * 14, hoja.h);
  g.outline(darkOf);
  return g;
}

// Hoja de un árbol: un único fotograma (no se anima).
export function treeSheet(variante = 0, oscuro = false) {
  const key = `roble:${variante}:${oscuro}`;
  if (cache.has(key)) return cache.get(key);
  const g = paintRoble(variante, oscuro);
  const canvas = document.createElement('canvas');
  canvas.width = g.w; canvas.height = g.h;
  g.drawTo(canvas.getContext('2d'), 0, 0);
  cache.set(key, canvas);
  return canvas;
}

// Sprite estático anclado por la base, con profundidad por los pies.
export function makePropSprite(canvas, escala = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
  profundidadDePies(material);
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0.02);
  sprite.scale.set(canvas.width * UNIDADES_POR_PX * escala, canvas.height * UNIDADES_POR_PX * escala, 1);
  return sprite;
}
