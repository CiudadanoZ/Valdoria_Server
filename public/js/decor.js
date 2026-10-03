// Lotes de atrezo: miles de sprites en unas pocas llamadas de dibujo.
//
// Cada THREE.Sprite es una llamada de dibujo propia. Con un centenar de árboles
// no importa; con los miles de matas, flores, piedras y lápidas que necesita un
// mundo con vida, sí. Aquí todos los dibujos van a UN atlas, y cada trozo del
// mapa (una celda de LADO unidades) es UNA malla instanciada: un rectángulo
// que la tarjeta gráfica repite por cada elemento, colocado en el vértice.
//
// El sombreador hace lo mismo que los sprites del juego: el rectángulo encara
// a la cámara, se ancla por los pies y escribe la profundidad de una figura EN
// PIE (ver profundidadDePies en pixelsprites.js), así que se ordena igual que
// héroes y árboles. Además, lo que es planta se mece con el viento.
import * as THREE from 'three';
import { texturaDe } from './pixelsprites.js';

const UNIDADES_POR_PX = 3.4 / 48;   // la misma densidad de píxel que todo
const LADO = 72;                    // celda de un lote (para el recorte por cámara)

// ---------------------------------------------------------------- atlas
// Empaquetado en estantes: suficiente para unos cientos de lienzos pequeños.
function construirAtlas(lienzos) {
  const ANCHO = 2048, HUECO = 2;
  const orden = [...lienzos.entries()].sort((a, b) => b[1].height - a[1].height);
  const sitios = new Map();
  let x = HUECO, y = HUECO, altoFila = 0;
  for (const [clave, c] of orden) {
    if (x + c.width + HUECO > ANCHO) { x = HUECO; y += altoFila + HUECO; altoFila = 0; }
    sitios.set(clave, { x, y, w: c.width, h: c.height });
    x += c.width + HUECO;
    altoFila = Math.max(altoFila, c.height);
  }
  let alto = 1;
  while (alto < y + altoFila + HUECO) alto *= 2;
  const atlas = document.createElement('canvas');
  atlas.width = ANCHO; atlas.height = alto;
  const ctx = atlas.getContext('2d');
  for (const [clave, s] of sitios) ctx.drawImage(lienzos.get(clave), s.x, s.y);
  // UV de cada dibujo (origen abajo, como las texturas de Three)
  const uv = new Map();
  for (const [clave, s] of sitios) {
    uv.set(clave, [s.x / ANCHO, 1 - (s.y + s.h) / alto, s.w / ANCHO, s.h / alto, s.w, s.h]);
  }
  return { atlas, uv };
}

// ---------------------------------------------------------------- sombreador
const VERTEX = /* glsl */`
attribute vec3 aPos;
attribute vec2 aTam;
attribute vec4 aUv;
attribute float aViento;
uniform float uTiempo;
varying vec2 vUv;
varying float vProf;
#include <fog_pars_vertex>
void main() {
  vec4 pie = viewMatrix * vec4(aPos, 1.0);
  float t = position.y + 0.5;                       // 0 en los pies, 1 arriba
  vec4 mvPosition = pie;
  vec2 desplaza = vec2(position.x, t - 0.02) * aTam;
  // El viento mueve la parte alta de las plantas, cada una a su ritmo
  desplaza.x += aViento * t * t * sin(uTiempo * 1.7 + aPos.x * 0.37 + aPos.z * 0.23) * 0.09 * aTam.y;
  mvPosition.xy += desplaza;
  // Profundidad de figura en pie (igual que los sprites del juego)
  vec3 arribaMundo = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  float enPantalla = max(0.2, length(arribaMundo.xy));
  vec4 punto = pie + vec4(0.0, 0.0, 0.6, 0.0) + vec4(arribaMundo * ((t - 0.02) * aTam.y / enPantalla), 0.0);
  vec4 puntoClip = projectionMatrix * punto;
  vProf = puntoClip.z / puntoClip.w;
  vUv = aUv.xy + vec2(position.x + 0.5, t) * aUv.zw;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */`
uniform sampler2D mapa;
varying vec2 vUv;
varying float vProf;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(mapa, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  gl_FragDepth = clamp(vProf * 0.5 + 0.5, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- lotes
/**
 * Reúne elementos y los convierte en mallas instanciadas por celdas.
 *   const lote = new LoteDecor();
 *   lote.poner('roble:1', lienzo, x, y, z, { escala, viento });
 *   lote.construir(scene);
 */
export class LoteDecor {
  constructor() {
    this.lienzos = new Map();   // clave -> canvas
    this.items = [];            // { clave, x, y, z, escala, viento }
    this.sombras = [];          // [x, y, z, radio]
    this.material = null;
  }

  poner(clave, lienzo, x, y, z, { escala = 1, viento = 0, sombra = 0 } = {}) {
    if (!this.lienzos.has(clave)) this.lienzos.set(clave, lienzo);
    this.items.push({ clave, x, y, z, escala, viento });
    if (sombra) this.sombras.push([x, y, z, sombra]);
  }

  construir(scene) {
    if (!this.items.length) return [];
    const { atlas, uv } = construirAtlas(this.lienzos);
    const tex = texturaDe(atlas);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { mapa: { value: null }, uTiempo: { value: 0 } }]),
      fog: true,
    });
    this.material.uniforms.mapa.value = tex;

    // Repartir por celdas
    const celdas = new Map();
    for (const it of this.items) {
      const k = `${Math.floor(it.x / LADO)},${Math.floor(it.z / LADO)}`;
      if (!celdas.has(k)) celdas.set(k, []);
      celdas.get(k).push(it);
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    const mallas = [];
    for (const lista of celdas.values()) {
      const n = lista.length;
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = quad.index;
      geo.setAttribute('position', quad.getAttribute('position'));
      const pos = new Float32Array(n * 3), tam = new Float32Array(n * 2), uvs = new Float32Array(n * 4), vie = new Float32Array(n);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = -Infinity, minY = Infinity;
      lista.forEach((it, i) => {
        const [u, v, du, dv, pw, ph] = uv.get(it.clave);
        pos.set([it.x, it.y, it.z], i * 3);
        tam.set([pw * UNIDADES_POR_PX * it.escala, ph * UNIDADES_POR_PX * it.escala], i * 2);
        uvs.set([u, v, du, dv], i * 4);
        vie[i] = it.viento;
        minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x);
        minZ = Math.min(minZ, it.z); maxZ = Math.max(maxZ, it.z);
        minY = Math.min(minY, it.y); maxY = Math.max(maxY, it.y + ph * UNIDADES_POR_PX * it.escala);
      });
      geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
      geo.setAttribute('aTam', new THREE.InstancedBufferAttribute(tam, 2));
      geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(uvs, 4));
      geo.setAttribute('aViento', new THREE.InstancedBufferAttribute(vie, 1));
      geo.instanceCount = n;
      // Esfera envolvente a mano: la de la geometría base (un cuadrado en el
      // origen) haría que Three descartara la celda entera al no "verla".
      const centro = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      const radio = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 8;
      geo.boundingSphere = new THREE.Sphere(centro, radio);
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(minX - 8, minY, minZ - 8), new THREE.Vector3(maxX + 8, maxY + 8, maxZ + 8));
      const malla = new THREE.Mesh(geo, this.material);
      malla.raycast = () => {};      // el atrezo no se clica
      malla.frustumCulled = true;
      scene.add(malla);
      mallas.push(malla);
    }

    // Sombras de contacto bajo árboles y rocas grandes: una sola malla
    if (this.sombras.length) {
      const geo = new THREE.CircleGeometry(1, 12);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
      const inst = new THREE.InstancedMesh(geo, mat, this.sombras.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      this.sombras.forEach(([x, y, z, r], i) => {
        m.compose(p.set(x, y + 0.07, z), q, s.set(r, 1, r * 0.62));
        inst.setMatrixAt(i, m);
      });
      inst.raycast = () => {};
      inst.frustumCulled = false;
      scene.add(inst);
      mallas.push(inst);
    }
    return mallas;
  }

  // El viento avanza con el tiempo del juego
  animar(tiempo) {
    if (this.material) this.material.uniforms.uTiempo.value = tiempo;
  }
}
