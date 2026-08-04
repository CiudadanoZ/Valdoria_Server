// Construcción del mundo: la Ciudadela de Valdoria (plaza, murallas, torres,
// puerta sur, edificios, fuente, antorchas, Hierbas Lumina) y el bioma exterior
// (llanuras al este, bosque al oeste y sur profundo, camino de tierra).
import * as THREE from 'three';
import { WAYSTONES } from './world-data.js';
import { heightAt, colorAt, biomeAt, WORLD_RADIUS } from './terrain.js';

export { WORLD_RADIUS };            // el límite del mundo lo define terrain.js
export const CITADEL_RADIUS = 38;   // radio interior de la plaza
export const FOUNTAIN_RADIUS = 4.5; // zona bloqueada de la fuente

// Las criptas viven en el mismo espacio de coordenadas, desplazadas a x+500,
// x+700 y x+900. Cada una define sus salas transitables en coordenadas locales.
export const CRYPT_X = 500; // cripta principal (bajo la muralla)

// [x1, z1, x2, z2] por sala
const MAIN_CRYPT_ROOMS = [
  [-6, -4, 6, 10],       // vestíbulo (portal de salida al fondo)
  [-2.5, -24, 2.5, -4],  // pasillo norte
  [-16, -46, 16, -24],   // cámara principal
  [-30, -38, -16, -32],  // osario lateral
  [-2.5, -60, 2.5, -46], // pasillo del trono
  [-14, -88, 14, -60],   // sala del Señor de la Cripta
];

// Criptas menores repartidas por el exterior
const MINI_CRYPTS = [
  {
    origin: 700,
    name: 'Cripta del Bosque',
    flame: 0x8a66ff, // llama violeta
    entrance: { x: -72, z: 58, rotY: Math.PI * 0.7 },
    exitTo: { x: -69, z: 55 },
    rooms: [
      [-5, -2, 5, 8],     // vestíbulo
      [-2, -16, 2, -2],   // pasillo
      [-12, -34, 12, -16], // cámara del Guardián
    ],
    walls: [
      [-5, 8.5, 5, 8.5], [-5.5, -2, -5.5, 8.5], [5.5, -2, 5.5, 8.5],
      [-5, -2.5, -2.5, -2.5], [2.5, -2.5, 5, -2.5],
      [-2.5, -16, -2.5, -2.5], [2.5, -16, 2.5, -2.5],
      [-12, -16.5, -2.5, -16.5], [2.5, -16.5, 12, -16.5],
      [-12, -34.5, 12, -34.5], [-12.5, -34, -12.5, -16], [12.5, -34, 12.5, -16],
    ],
    torches: [[-4, 6], [4, 6], [0, -9], [-10, -20], [10, -20], [0, -32]],
    tombs: [[-9, -30, 0.4], [9, -30, -0.4]],
    bones: [[0, -7], [-6, -22], [6, -28], [0, -30]],
  },
  {
    origin: 900,
    name: 'Cripta de la Colina',
    flame: 0xff8830, // llama de brasa
    entrance: { x: 74, z: 28, rotY: -Math.PI * 0.6 },
    exitTo: { x: 71, z: 25 },
    rooms: [
      [-5, -2, 5, 8],
      [-2, -14, 2, -2],
      [-10, -30, 10, -14],
    ],
    walls: [
      [-5, 8.5, 5, 8.5], [-5.5, -2, -5.5, 8.5], [5.5, -2, 5.5, 8.5],
      [-5, -2.5, -2.5, -2.5], [2.5, -2.5, 5, -2.5],
      [-2.5, -14, -2.5, -2.5], [2.5, -14, 2.5, -2.5],
      [-10, -14.5, -2.5, -14.5], [2.5, -14.5, 10, -14.5],
      [-10, -30.5, 10, -30.5], [-10.5, -30, -10.5, -14], [10.5, -30, 10.5, -14],
    ],
    torches: [[-4, 6], [4, 6], [0, -8], [-8, -18], [8, -18], [0, -28]],
    tombs: [[-7, -26, 0.3], [7, -26, -0.3]],
    bones: [[0, -6], [-5, -18], [5, -24], [0, -26]],
  },
];

export const CRYPT_REGIONS = [
  { origin: CRYPT_X, name: 'Criptas de Valdoria', rooms: MAIN_CRYPT_ROOMS },
  ...MINI_CRYPTS.map((c) => ({ origin: c.origin, name: c.name, rooms: c.rooms })),
];

function inRooms(rooms, lx, lz) {
  return rooms.some(([x1, z1, x2, z2]) => lx >= x1 && lx <= x2 && lz >= z1 && lz <= z2);
}

export function isInCrypt(x) { return x > 400; }

// ---- Las Profundidades ----
// Una sala circular, lejos del mundo y de las criptas. La forma es la misma en
// todos los pisos: lo que cambia de un piso a otro es lo que la habita.
export const DEPTHS_X = 2000;
export const DEPTHS_R = 34;
export function isInDepths(x) { return x > 1500; }

// La muralla ocupa el anillo [40, 44]; solo se cruza por el corredor de la puerta sur.
// En las criptas solo se camina por las salas.
export function isBlocked(x, z) {
  if (isInDepths(x)) return Math.hypot(x - DEPTHS_X, z) > DEPTHS_R - 1.5;
  if (isInCrypt(x)) {
    const region = CRYPT_REGIONS.find((c) => Math.abs(x - c.origin) <= 90);
    return !region || !inRooms(region.rooms, x - region.origin, z);
  }
  const r = Math.hypot(x, z);
  if (r > WORLD_RADIUS) return true;
  if (r < FOUNTAIN_RADIUS) return true;
  const inGate = Math.abs(x) < 5.0 && z > 34;
  if (r > 40.0 && r < 44.0 && !inGate) return true;
  return false;
}

// Facetas planas por defecto: el low-poly con sombreado suave parece plástico;
// con facetas se ve estilizado e intencionado. Es la seña del estilo del juego.
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...opts });

// Cúpula de cielo: degradado de brasa en el horizonte a violeta nocturno en el
// cénit. Sustituye al fondo de color sólido, que hacía flotar el mundo en un
// vacío. Sigue al jugador (se recoloca cada frame desde main.js).
function buildSky(scene) {
  const R = 260; // dentro del plano lejano de la cámara (300)
  const geo = new THREE.SphereGeometry(R, 24, 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(0x6e3a2e);  // brasa del ocaso
  const mid = new THREE.Color(0x2b1f33);      // malva crepuscular
  const zenith = new THREE.Color(0x110d1c);   // noche violácea
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) / R + 0.12) / 0.7));
    if (t < 0.30) c.lerpColors(horizon, mid, t / 0.30);
    else c.lerpColors(mid, zenith, (t - 0.30) / 0.70);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

// Malla del terreno: una rejilla cuyos vértices siguen la altura de terrain.js y
// se tiñen del color de su comarca. Es lo que convierte el mundo de un disco
// verde plano en regiones con laderas.
function buildTerrainMesh() {
  const SIZE = (WORLD_RADIUS + 30) * 2;   // cubre el mundo con algo de margen
  // Malla deliberadamente basta (~5,4 unidades por celda): con facetas planas,
  // los triángulos grandes son los que dan el aspecto esculpido del low-poly.
  // Con una malla fina las facetas eran tan pequeñas que el suelo parecía liso.
  const SEGS = 86;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geo.rotateX(-Math.PI / 2);              // tumbarla al plano XZ del mundo

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);

    const [r, g, b] = colorAt(x, z);
    // Sombreado por altura: las cimas se aclaran y las hondonadas se oscurecen,
    // lo que da volumen incluso con luz plana.
    const tint = 1 + Math.max(-0.32, Math.min(0.30, h * 0.022));
    colors[i * 3] = Math.min(1, r * tint);
    colors[i * 3 + 1] = Math.min(1, g * tint);
    colors[i * 3 + 2] = Math.min(1, b * tint);
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  // Facetas planas también en el terreno: cada triángulo capta la luz por su
  // cara y el relieve se lee como esculpido (el look low-poly clásico).
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.position.y = -0.05;
  mesh.receiveShadow = true;
  return mesh;
}

// Extiende una superficie (camino, claro, charca…) AMOLDADA al relieve: en vez
// de un plano rígido que el terreno entierra, sus vértices siguen la altura del
// suelo. `geo` debe venir subdividida para que pueda curvarse.
function addGroundPatch(scene, geo, x, z, color, opts = {}) {
  const { yOffset = 0.07, ...matOpts } = opts;
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, 0, z);            // llevarla a coordenadas del mundo
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) + yOffset);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat(color, { roughness: 1, ...matOpts }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Reparte n elementos por TODA la comarca indicada (no en un disco pequeño):
// es lo que hace que una región se lea como un bioma grande y no como un parche.
// Llama a fn(x, z, alturaDelSuelo) en cada punto aceptado.
function scatterInBiome(biomeId, n, fn, { rMin = 62, rMax = WORLD_RADIUS - 12 } = {}) {
  let puestos = 0;
  for (let intentos = 0; puestos < n && intentos < n * 50; intentos++) {
    const a = Math.random() * Math.PI * 2;
    const r = rMin + Math.random() * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (biomeAt(x, z).id !== biomeId) continue;
    fn(x, z, heightAt(x, z));
    puestos++;
  }
}

// Devuelve un contenedor elevado a la altura del suelo en (cx, cz). Las
// funciones de zona lo reciben en lugar de la escena —un Group tiene el mismo
// .add()— y así todos sus props se apoyan en el relieve sin tocar su código.
function zoneAt(scene, cx, cz) {
  const g = new THREE.Group();
  g.position.y = heightAt(cx, cz);
  scene.add(g);
  return g;
}

function addTree(scene, x, z, scale = 1, dark = false) {
  const g = heightAt(x, z);   // apoyar el árbol en el suelo, tenga la altura que tenga
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.6 * scale, 3 * scale, 8), mat(0x4a3628));
  trunk.position.set(x, g + 1.5 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4 * scale, 10, 8), mat(dark ? 0x2a4020 : 0x3d5a2e));
  crown.position.set(x, g + 4.4 * scale, z);
  crown.scale.y = 1.2;
  crown.castShadow = true;
  scene.add(crown);
}

function addRock(scene, x, z, scale = 1) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), mat(0x5a5650, { roughness: 1 }));
  rock.position.set(x, heightAt(x, z) + scale * 0.5, z);
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.castShadow = rock.receiveShadow = true;
  scene.add(rock);
}

export function buildWorld(scene) {
  const torchLights = [];
  const herbs = [];
  const portals = [];
  const fishingSpots = [];
  const campfires = [];

  // ---- Iluminación: ocaso dramático ----
  // La clave del look cinematográfico es el CONTRASTE DE TEMPERATURA: luz
  // cálida del sol contra relleno frío del cielo. Con relleno cálido (naranja)
  // todo se volvía mostaza y las comarcas perdían su color.
  const ambient = new THREE.AmbientLight(0x4a4668, 0.42);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x241c2e, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe0bb, 1.0);
  sun.position.set(40, 60, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Con facetas planas, el sesgo evita el acné de sombra en las caras
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  const sc = 60;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 10, far: 160 });
  scene.add(sun);

  // La niebla casa con el tono medio del cielo: el terreno se funde con el
  // horizonte en vez de cortarse contra un fondo plano.
  scene.fog = new THREE.FogExp2(0x241a2b, 0.0085);
  scene.background = new THREE.Color(0x110d1c);
  const sky = buildSky(scene);

  // ---- Terreno exterior: comarcas con relieve ----
  // Una malla subdividida cuyos vértices siguen heightAt() y se tiñen del color
  // de su comarca. Sustituye al antiguo disco plano de un solo verde: ahora el
  // mundo tiene laderas y regiones que se distinguen a simple vista.
  scene.add(buildTerrainMesh());

  // Camino de tierra: de la puerta sur hacia el sur, con claro final
  // Camino y claro del exterior: amoldados al relieve (antes eran planos rígidos
  // que las lomas nuevas dejaban enterrados, cortando la ruta al Alfa Sombrío).
  addGroundPatch(scene, new THREE.PlaneGeometry(6, 70, 3, 48), 0, 78, 0x4d4034);
  addGroundPatch(scene, new THREE.CircleGeometry(12, 28), 0, 113, 0x4d4034);

  // ---- Plaza de piedra ----
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(42, 48), mat(0x5c5650, { roughness: 0.95 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.005;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Anillos decorativos de la plaza
  for (const [r, color] of [[10, 0x6b645c], [24, 0x6b645c]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r + 0.4, 48), mat(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);
  }

  // Camino de la puerta sur al centro
  const road = new THREE.Mesh(new THREE.PlaneGeometry(5, 46), mat(0x6b645c));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, 22);
  scene.add(road);

  // ---- Murallas (anillo de segmentos, con hueco para la puerta sur) ----
  const wallMat = mat(0x4a443e, { roughness: 0.9 });
  const SEGMENTS = 28;
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    // Puerta al sur (+Z): saltar segmentos cercanos a angle = PI/2
    if (Math.abs(angle - Math.PI / 2) < 0.18) continue;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(9.6, 8, 2.4), wallMat);
    seg.position.set(Math.cos(angle) * 42, 4, Math.sin(angle) * 42);
    seg.rotation.y = -angle + Math.PI / 2;
    seg.castShadow = seg.receiveShadow = true;
    scene.add(seg);
    // Almenas
    const top = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1, 3.2), mat(0x3d3833));
    top.position.set(seg.position.x, 8.5, seg.position.z);
    top.rotation.y = seg.rotation.y;
    top.castShadow = true;
    scene.add(top);
  }

  // ---- Torres en 4 puntos ----
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const x = Math.cos(a) * 42, z = Math.sin(a) * 42;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, 14, 12), mat(0x524b44));
    tower.position.set(x, 7, z);
    tower.castShadow = tower.receiveShadow = true;
    scene.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 12), mat(0x5e3a2e));
    roof.position.set(x, 16.5, z);
    roof.castShadow = true;
    scene.add(roof);
  }

  // ---- Puerta sur: dos torreones y arco ----
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 11, 10), mat(0x524b44));
    post.position.set(side * 7.5, 5.5, 42);
    post.castShadow = true;
    scene.add(post);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 3.5, 10), mat(0x5e3a2e));
    roof.position.set(side * 7.5, 12.5, 42);
    roof.castShadow = true;
    scene.add(roof);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(15, 2, 3), mat(0x3d3833));
  arch.position.set(0, 10, 42);
  arch.castShadow = true;
  scene.add(arch);

  // ---- Fuente central ----
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 1.2, 24), mat(0x6b645c));
  basin.position.y = 0.6;
  basin.castShadow = basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.8, 3.8, 0.3, 24),
    new THREE.MeshStandardMaterial({ color: 0x3d7a9e, transparent: true, opacity: 0.85, metalness: 0.4, roughness: 0.2 })
  );
  water.position.y = 1.15;
  scene.add(water);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.5, 12), mat(0x7a736b));
  pillar.position.y = 2.4;
  pillar.castShadow = true;
  scene.add(pillar);
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x7ec8e3, emissive: 0x3d7a9e, emissiveIntensity: 1.2 })
  );
  orb.position.y = 4.6;
  scene.add(orb);
  const orbLight = new THREE.PointLight(0x7ec8e3, 30, 20);
  orbLight.position.y = 4.6;
  scene.add(orbLight);

  // ---- Edificios ----
  // [x, z, ancho, fondo, alto, colorMuro, colorTejado, rotY]
  const buildings = [
    [-20, -18, 10, 8, 6, 0x6b5d4a, 0x5e3a2e, 0.3],   // posada
    [20, -18, 9, 7, 5, 0x746553, 0x4a3628, -0.3],    // forja (Bramm)
    [-24, 4, 8, 7, 5, 0x6b5d4a, 0x5e3a2e, 1.2],      // mercado (Lyra)
    [25, 6, 8, 6, 5, 0x746553, 0x4a3628, -1.2],      // almacén
    [0, -28, 12, 9, 8, 0x7a6f5c, 0x3d3348, 0],       // capilla (Mira)
  ];
  for (const [x, z, w, d, h, cw, cr, ry] of buildings) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(cw));
    body.position.set(x, h / 2, z);
    body.rotation.y = ry;
    body.castShadow = body.receiveShadow = true;
    scene.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.6, 4), mat(cr));
    roof.position.set(x, h + h * 0.3, z);
    roof.rotation.y = ry + Math.PI / 4;
    roof.castShadow = true;
    scene.add(roof);
  }

  // Campanario de la capilla
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 8), mat(0x3d3348));
  spire.position.set(0, 15, -28);
  spire.castShadow = true;
  scene.add(spire);

  // ---- Puesto de mercado de Lyra (toldo) ----
  const stallTop = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), mat(0x8a4a3a));
  stallTop.position.set(-16, 3, 6);
  stallTop.castShadow = true;
  scene.add(stallTop);
  for (const [dx, dz] of [[-2.7, -1.7], [2.7, -1.7], [-2.7, 1.7], [2.7, 1.7]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), mat(0x4a3628));
    leg.position.set(-16 + dx, 1.5, 6 + dz);
    scene.add(leg);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1, 1.2), mat(0x5c4632));
  counter.position.set(-16, 0.5, 7.5);
  counter.castShadow = true;
  scene.add(counter);

  // ---- Yunque de la forja ----
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.6), mat(0x333338, { metalness: 0.8, roughness: 0.4 }));
  anvil.position.set(15, 1, -13);
  anvil.castShadow = true;
  scene.add(anvil);
  const anvilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.7, 8), mat(0x4a3628));
  anvilBase.position.set(15, 0.35, -13);
  scene.add(anvilBase);

  // ---- Antorchas ----
  const torchPositions = [
    [6, 8], [-6, 8], [6, -8], [-6, -8],
    [-14, 20], [14, 20], [0, 36], [-26, -8], [27, -6],
    [-6, 38], [6, 38],
    // Exterior: el camino del sur
    [-4, 55], [4, 70], [-4, 90], [5, 108],
  ];
  for (const [x, z] of torchPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.4, 6), mat(0x3a2d1f));
    pole.position.set(x, 1.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa33 })
    );
    flame.position.set(x, 3.6, z);
    scene.add(flame);
    const light = new THREE.PointLight(0xff8830, 25, 16, 2);
    light.position.set(x, 3.8, z);
    scene.add(light);
    torchLights.push({ light, flame, base: 25, seed: Math.random() * 10 });
  }

  // ---- Árboles: interior de la plaza ----
  for (const [x, z] of [[-30, 22], [30, 22], [-32, -20], [33, -18], [-10, 30], [12, 30]]) {
    addTree(scene, x, z);
  }

  // ---- Bosque oeste y sur profundo (denso, oscuro) ----
  const forestZones = [
    { cx: -70, cz: 45, r: 38, n: 22 },
    { cx: -45, cz: 90, r: 32, n: 16 },
    { cx: -90, cz: -10, r: 26, n: 12 },
    { cx: 20, cz: 118, r: 30, n: 14 },
  ];
  for (const zone of forestZones) {
    for (let i = 0; i < zone.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * zone.r;
      const x = zone.cx + Math.cos(a) * d;
      const z = zone.cz + Math.sin(a) * d;
      if (Math.hypot(x, z) < 48 || Math.hypot(x, z) > WORLD_RADIUS - 5) continue;
      if (Math.abs(x) < 6 && z > 40 && z < 115) continue; // no invadir el camino
      addTree(scene, x, z, 0.8 + Math.random() * 0.7, true);
    }
  }

  // ---- Llanura este: árboles dispersos, hierba alta y rocas ----
  for (let i = 0; i < 14; i++) {
    const x = 50 + Math.random() * 75;
    const z = -60 + Math.random() * 140;
    if (Math.hypot(x, z) > WORLD_RADIUS - 5 || Math.hypot(x, z) < 48) continue;
    addTree(scene, x, z, 0.7 + Math.random() * 0.5, false);
  }
  const grassMat = mat(0x4a6b35);
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 48 + Math.random() * (WORLD_RADIUS - 55);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 6 && z > 40) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1 + Math.random() * 0.8, 4), grassMat);
    tuft.position.set(x, 0.5, z);
    tuft.rotation.y = Math.random() * Math.PI;
    scene.add(tuft);
  }
  for (const [x, z, s] of [[30, 60, 1.6], [-25, 58, 1.2], [60, 30, 2.2], [-60, 70, 1.8], [45, 95, 1.4], [-15, 105, 1.3], [75, -20, 2.0], [-75, 30, 1.5]]) {
    addRock(scene, x, z, s);
  }

  // ---- Claro del Alfa: círculo de piedras al final del camino ----
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    addRock(scene, Math.cos(a) * 10, 113 + Math.sin(a) * 10, 1.2 + Math.random() * 0.6);
  }

  // ---- Hierbas Lumina (recolectables de la misión 2) ----
  const herbSpots = [
    [12, 14], [-19, -6], [22, -4], [-8, -20], [-28, 14], [17, 24],
  ];
  const herbMat = new THREE.MeshStandardMaterial({
    color: 0x66ff88, emissive: 0x33cc55, emissiveIntensity: 1.5,
  });
  for (const [x, z] of herbSpots) {
    const group = new THREE.Group();
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 5), herbMat);
      blade.position.set((Math.random() - 0.5) * 0.5, 0.45, (Math.random() - 0.5) * 0.5);
      blade.rotation.z = (Math.random() - 0.5) * 0.5;
      group.add(blade);
    }
    const glow = new THREE.PointLight(0x55ff77, 6, 6);
    glow.position.y = 0.8;
    group.add(glow);
    // Zona de clic invisible, más generosa que las hojas finas
    const hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 2, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.y = 1;
    group.add(hitbox);
    group.position.set(x, heightAt(x, z), z);
    group.userData.isHerb = true;
    scene.add(group);
    herbs.push(group);
  }

  // ---- Zonas del exterior ----
  // Cada una va en un contenedor apoyado en el relieve de su centro (zoneAt),
  // así el lago no queda flotando ni la ciénaga enterrada.
  buildLake(zoneAt(scene, 62, -52), fishingSpots);
  buildRuins(zoneAt(scene, 0, -85));
  // Estas dos se reparten por TODA su comarca y colocan cada prop a la altura
  // real del suelo, así que reciben la escena directamente.
  buildSwamp(scene, torchLights);                           // Ciénaga de los Ahogados (noroeste)
  buildFrostPeaks(scene, torchLights);                      // Cumbres Heladas (sureste)
  buildCamp(zoneAt(scene, -67, 55), torchLights, campfires, -67, 55, 0.6);   // campamento del Ermitaño Baldur
  buildCamp(zoneAt(scene, 70, 21), torchLights, campfires, 70, 21, -2.2);    // campamento de la Cazadora Nyra
  // Hoguera de la posada, dentro de la Ciudadela
  addCampfire(scene, torchLights, campfires, -14, -12);

  // Bosquecillo del norte, alrededor de las ruinas
  for (let i = 0; i < 14; i++) {
    const x = -40 + Math.random() * 80;
    const z = -110 + Math.random() * 45;
    const r = Math.hypot(x, z);
    if (r < 48 || r > WORLD_RADIUS - 5) continue;
    if (Math.hypot(x - 0, z + 85) < 14) continue;   // no invadir las ruinas
    if (Math.hypot(x - 62, z + 52) < 20) continue;  // ni el lago
    addTree(scene, x, z, 0.7 + Math.random() * 0.6, Math.random() < 0.5);
  }

  // ---- Entrada a la cripta principal (junto a la muralla oeste) ----
  buildCryptEntrance(scene, portals, torchLights);

  // ---- La cripta principal ----
  buildCrypt(scene, portals, torchLights);

  // ---- Criptas menores del exterior ----
  for (const cfg of MINI_CRYPTS) buildMiniCrypt(scene, portals, torchLights, cfg);

  // ---- Tablón de Encargos (junto a la fuente) ----
  const board = buildBountyBoard(scene, 8, 6);

  // ---- Piedras rúnicas de viaje rápido ----
  const waystones = [];
  for (const w of WAYSTONES) {
    waystones.push(buildWaystone(scene, w));
  }

  // ---- Trampilla de Las Profundidades y su sala ----
  const hatch = buildDepthsHatch(scene, torchLights);
  const depthsRoom = buildDepthsRoom(scene, torchLights);

  return {
    torchLights, herbs, portals, fishingSpots, campfires, board, waystones,
    hatch, depthsRoom, sky, lights: { ambient, hemi, sun },
  };
}

// Trampilla en la plaza: la boca de la escalera sin fondo. Clicable, con el
// mismo tipo de señal flotante que el Tablón para que se vea que se puede usar.
function buildDepthsHatch(scene, torchLights) {
  const group = new THREE.Group();
  group.position.set(-6, 0, -6);   // debe coincidir con HATCH_SPOT del servidor

  const marco = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.34, 3.4), mat(0x39332c));
  marco.position.y = 0.17;
  marco.receiveShadow = true;
  group.add(marco);

  // El hueco: negro de verdad, sin luz que rebote.
  const hueco = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0x04040a })
  );
  hueco.rotation.x = -Math.PI / 2;
  hueco.position.y = 0.35;
  group.add(hueco);

  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), mat(0x2f2a24));
    poste.position.set(dx, 0.75, dz);
    poste.castShadow = true;
    group.add(poste);
  }

  const brillo = new THREE.PointLight(0x7a4fd0, 9, 11);
  brillo.position.set(0, 0.7, 0);
  group.add(brillo);
  torchLights.push({ light: brillo, base: 9, seed: Math.random() * 10 });

  const marker = makeBoardMarker('🕳️', '#9a6fe0');
  marker.position.y = 3.2;
  group.add(marker);
  group.userData.marker = marker;

  scene.add(group);
  return group;
}

// La sala de Las Profundidades: un pozo circular de piedra oscura, con la
// escalera al fondo. Se construye una sola vez y sirve para todos los pisos.
function buildDepthsRoom(scene, torchLights) {
  const group = new THREE.Group();
  group.position.set(DEPTHS_X, 0, 0);

  // Piedra clara a propósito: bajo tierra no llega ni sol ni cielo, así que si
  // el suelo es oscuro no se ve absolutamente nada. El ambiente lo pone la luz
  // violeta de los fuegos, no el color de la roca.
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(DEPTHS_R, 40), mat(0x6b6478));
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  group.add(suelo);

  // Muro anular visto SOLO por dentro. Es importante que sea de una cara: la
  // cámara es cenital y se queda fuera del círculo cuando el héroe camina cerca
  // del borde; a doble cara, el muro le taparía la sala entera.
  const muro = new THREE.Mesh(
    new THREE.CylinderGeometry(DEPTHS_R, DEPTHS_R, 26, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x554e63, roughness: 1, side: THREE.BackSide, flatShading: true })
  );
  muro.position.y = 13;
  group.add(muro);

  // Sin bóveda cerrada a propósito: la cámara es cenital y un techo la dejaría
  // mirando el reverso de una tapa. Lo que oculta el exterior es esconder la
  // cúpula del cielo mientras estás abajo (lo hace main.js).

  // Columnas que sostienen la bóveda
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 11, 6), mat(0x7a7288));
    col.position.set(Math.cos(a) * (DEPTHS_R - 5), 5.5, Math.sin(a) * (DEPTHS_R - 5));
    col.castShadow = true;
    group.add(col);

    const fuego = new THREE.PointLight(0x9a5ff0, 30, 40);
    fuego.position.set(Math.cos(a) * (DEPTHS_R - 7), 5, Math.sin(a) * (DEPTHS_R - 7));
    group.add(fuego);
    torchLights.push({ light: fuego, base: 30, seed: Math.random() * 10 });
  }

  // Luz cenital fría en el centro: da forma a la sala.
  const cenital = new THREE.PointLight(0xb090ff, 45, 80);
  cenital.position.set(0, 11, 0);
  group.add(cenital);

  // Luz propia de la sala. El ambiente global del juego es oscuro a propósito
  // (es un ocaso de fantasía oscura) y a 34 de radio las antorchas no llegan al
  // centro por mucho que se suban: sin esto el suelo no se lee. Una
  // hemisférica no se atenúa con la distancia, así que ilumina la sala entera
  // sin aplanarla y sin tocar el ambiente del resto del mundo.
  const propia = new THREE.HemisphereLight(0xc9b0ff, 0x4a3f5c, 2.4);
  propia.position.set(0, 20, 0);
  group.add(propia);

  // La escalera al piso de abajo, al fondo de la sala.
  const escalera = new THREE.Group();
  escalera.position.set(0, 0, -30);
  for (let i = 0; i < 5; i++) {
    const peldano = new THREE.Mesh(new THREE.BoxGeometry(6 - i * 0.6, 0.4, 1.2), mat(0x3a3340));
    peldano.position.set(0, -i * 0.4, -i * 1.1);
    escalera.add(peldano);
  }
  const pozo = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({ color: 0x05030a })
  );
  pozo.rotation.x = -Math.PI / 2;
  pozo.position.set(0, -1.9, -5.5);
  escalera.add(pozo);

  const luzEscalera = new THREE.PointLight(0xd9a441, 0, 16);
  luzEscalera.position.set(0, 2, -3);
  escalera.add(luzEscalera);
  group.add(escalera);

  group.userData.stairs = escalera;
  group.userData.stairLight = luzEscalera;
  scene.add(group);
  return group;
}

// Portal clicable: arco de piedra con vacío oscuro y resplandor.
function makePortal(scene, x, z, rotY, glowColor, label, to) {
  const group = new THREE.Group();

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5, 0.9), mat(0x3d3833));
    post.position.set(side * 1.9, 2.5, 0);
    post.castShadow = true;
    group.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 1.1), mat(0x332f2a));
  lintel.position.y = 5.2;
  lintel.castShadow = true;
  group.add(lintel);

  // El vacío del portal
  const void_ = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 4.6),
    new THREE.MeshBasicMaterial({ color: 0x030407, side: THREE.DoubleSide })
  );
  void_.position.y = 2.3;
  group.add(void_);

  const glow = new THREE.PointLight(glowColor, 18, 12);
  glow.position.set(0, 2.5, 1);
  group.add(glow);

  // Zona de clic generosa
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 6, 3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 3;
  group.add(hitbox);

  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = rotY;
  scene.add(group);
  return { mesh: group, label, to, glow };
}

function buildCryptEntrance(scene, portals, torchLights) {
  // Escalinata descendente pegada a la muralla oeste
  const portal = makePortal(
    scene, -33, -12, Math.PI / 2.4, 0x55ff99,
    'Entrar a las Criptas de Valdoria',
    { x: CRYPT_X, z: 4 }
  );
  portals.push(portal);

  // Escalones de piedra frente al portal
  const dir = new THREE.Vector3(Math.sin(Math.PI / 2.4), 0, Math.cos(Math.PI / 2.4));
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 1), mat(0x4a443e));
    step.position.set(-33 + dir.x * (1.2 + i * 0.9), 0.12, -12 + dir.z * (1.2 + i * 0.9));
    step.rotation.y = Math.PI / 2.4;
    scene.add(step);
  }

  // Huesos decorativos junto a la entrada
  addRock(scene, -30, -8.5, 0.7);
  addRock(scene, -29.5, -15.5, 0.5);
}

function buildCrypt(scene, portals, torchLights) {
  const X = CRYPT_X;
  const floorMat = mat(0x2e2c33, { roughness: 1 });
  const wallMat = mat(0x232128, { roughness: 1 });
  const boneMat = mat(0xb8b0a0);

  // Suelo por sala
  for (const [x1, z1, x2, z2] of MAIN_CRYPT_ROOMS) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1 + 2, z2 - z1 + 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(X + (x1 + x2) / 2, 0, (z1 + z2) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // Muro: segmento entre dos puntos locales
  const wall = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 6, 1), wallMat);
    seg.position.set(X + (x1 + x2) / 2, 3, (z1 + z2) / 2);
    seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    seg.castShadow = seg.receiveShadow = true;
    scene.add(seg);
  };

  // Vestíbulo A: x[-6,6] z[-4,10]
  wall(-6, 10.5, 6, 10.5);
  wall(-6.5, -4, -6.5, 10.5); wall(6.5, -4, 6.5, 10.5);
  wall(-6, -4.5, -2.5, -4.5); wall(2.5, -4.5, 6, -4.5);
  // Pasillo B: x[-2.5,2.5] z[-24,-4]
  wall(-3, -24, -3, -4); wall(3, -24, 3, -4);
  // Cámara C: x[-16,16] z[-46,-24]
  wall(-16, -23.5, -2.5, -23.5); wall(2.5, -23.5, 16, -23.5);
  wall(-16, -46.5, -2.5, -46.5); wall(2.5, -46.5, 16, -46.5);
  wall(16.5, -46, 16.5, -24);
  wall(-16.5, -46, -16.5, -38); wall(-16.5, -32, -16.5, -24);
  // Osario D: x[-30,-16] z[-38,-32]
  wall(-30, -38.5, -16, -38.5); wall(-30, -31.5, -16, -31.5); wall(-30.5, -38, -30.5, -31.5);
  // Pasillo E: x[-2.5,2.5] z[-60,-46]
  wall(-3, -60, -3, -46); wall(3, -60, 3, -46);
  // Sala del trono F: x[-14,14] z[-88,-60]
  wall(-14, -59.5, -2.5, -59.5); wall(2.5, -59.5, 14, -59.5);
  wall(-14, -88.5, 14, -88.5);
  wall(-14.5, -88, -14.5, -60); wall(14.5, -88, 14.5, -60);

  // Portal de salida (vestíbulo)
  portals.push(makePortal(
    scene, X, 9, Math.PI, 0xffaa55,
    'Volver a la Ciudadela',
    { x: -29, z: -12 }
  ));

  // Pilares de la cámara principal
  for (const [px, pz] of [[-9, -30], [9, -30], [-9, -40], [9, -40]]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 6, 8), wallMat);
    pillar.position.set(X + px, 3, pz);
    pillar.castShadow = true;
    scene.add(pillar);
  }

  // Sarcófagos
  for (const [sx, sz, ry] of [[-13, -27, 0.3], [13, -27, -0.3], [-13, -43, -0.2], [13, -43, 0.2], [-23, -35, Math.PI / 2], [-27, -35, Math.PI / 2]]) {
    const tomb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 2.6), mat(0x3a3740));
    tomb.position.set(X + sx, 0.5, sz);
    tomb.rotation.y = ry;
    tomb.castShadow = tomb.receiveShadow = true;
    scene.add(tomb);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 2.7), mat(0x45414c));
    lid.position.set(X + sx, 1.05, sz);
    lid.rotation.y = ry;
    scene.add(lid);
  }

  // Montones de huesos
  for (const [bx, bz] of [[-4, -16], [5, -28], [-11, -35], [7, -44], [-25, -33], [-8, -66], [10, -80], [0, -12]]) {
    for (let i = 0; i < 3; i++) {
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 2, 5), boneMat);
      bone.position.set(X + bx + (Math.random() - 0.5), 0.1, bz + (Math.random() - 0.5));
      bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      scene.add(bone);
    }
  }

  // Trono del Señor de la Cripta
  const throne = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 1), mat(0x1c1a22));
  throne.position.set(X, 1.6, -86);
  throne.castShadow = true;
  scene.add(throne);
  const throneSeat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.6), mat(0x1c1a22));
  throneSeat.position.set(X, 0.5, -85.4);
  scene.add(throneSeat);

  // Antorchas espectrales (llama verde-azulada)
  const cryptTorches = [
    [-5, 8], [5, 8], [0, -14], [-14, -26], [14, -26], [-14, -44], [14, -44],
    [-28, -35], [0, -53], [-12, -62], [12, -62], [-12, -86], [12, -86], [0, -78],
  ];
  for (const [tx, tz] of cryptTorches) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 6), mat(0x2a2622));
    pole.position.set(X + tx, 1.3, tz);
    scene.add(pole);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x66ffbb })
    );
    flame.position.set(X + tx, 2.8, tz);
    scene.add(flame);
    const light = new THREE.PointLight(0x44eeaa, 20, 14, 2);
    light.position.set(X + tx, 3, tz);
    scene.add(light);
    torchLights.push({ light, flame, base: 20, seed: Math.random() * 10 });
  }
}

// Lago del noreste: agua, junquillos, rocas y puntos de pesca en la orilla.
function buildLake(scene, fishingSpots) {
  const cx = 62, cz = -52;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(16, 28),
    new THREE.MeshStandardMaterial({ color: 0x2d5a7e, transparent: true, opacity: 0.9, metalness: 0.4, roughness: 0.25 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, 0.02, cz);
  scene.add(water);
  const shore = new THREE.Mesh(new THREE.RingGeometry(16, 18, 28), mat(0x6b6350));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(cx, 0.01, cz);
  scene.add(shore);

  // Junquillos en la orilla
  const reedMat = mat(0x4a6b35);
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 16.5 + Math.random() * 2.5;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4 + Math.random(), 4), reedMat);
    reed.position.set(cx + Math.cos(a) * d, 0.7, cz + Math.sin(a) * d);
    reed.rotation.z = (Math.random() - 0.5) * 0.3;
    scene.add(reed);
  }
  addRock(scene, cx - 14, cz + 12, 1.2);
  addRock(scene, cx + 15, cz - 8, 1.5);

  // Puntos de pesca: ondas brillantes junto a la orilla (se pesca desde tierra)
  for (const a of [Math.PI * 0.15, Math.PI * 0.75, Math.PI * 1.35]) {
    const group = new THREE.Group();
    for (const [r, op] of [[0.7, 0.9], [1.3, 0.5]]) {
      const ripple = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.12, r, 20),
        new THREE.MeshBasicMaterial({ color: 0x9adcf0, transparent: true, opacity: op, side: THREE.DoubleSide })
      );
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = 0.08;
      group.add(ripple);
    }
    // Zona de clic generosa
    const hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 1.5, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.y = 0.7;
    group.add(hitbox);
    // La onda está en el agua (r 14) y se pesca desde la orilla (r 18)
    group.position.set(cx + Math.cos(a) * 14, 0, cz + Math.sin(a) * 14);
    group.userData.isFishing = true;
    group.userData.shore = new THREE.Vector3(cx + Math.cos(a) * 18.5, 0, cz + Math.sin(a) * 18.5);
    scene.add(group);
    fishingSpots.push(group);
  }
}

// Ruinas del norte: columnas rotas de un templo olvidado. Territorio de osos.
function buildRuins(scene) {
  const cx = 0, cz = -85;
  const ruinMat = mat(0x8a8578, { roughness: 1 });
  // Losa central
  const slab = new THREE.Mesh(new THREE.CircleGeometry(10, 8), mat(0x7a756a));
  slab.rotation.x = -Math.PI / 2;
  slab.position.set(cx, 0.015, cz);
  slab.receiveShadow = true;
  scene.add(slab);
  // Columnas en pie (a distintas alturas, rotas)
  for (const [dx, dz, h] of [[-8, -6, 4.5], [8, -6, 2.2], [-8, 6, 3.2], [8, 6, 5], [0, -9, 1.4]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, h, 8), ruinMat);
    col.position.set(cx + dx, h / 2, cz + dz);
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
  }
  // Columna caída
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 8), ruinMat);
  fallen.position.set(cx + 2, 0.7, cz + 9);
  fallen.rotation.z = Math.PI / 2;
  fallen.rotation.y = 0.4;
  fallen.castShadow = true;
  scene.add(fallen);
  addRock(scene, cx - 4, cz + 3, 0.9);
  addRock(scene, cx + 5, cz - 2, 0.7);
}

// Ciénaga de los Ahogados (noroeste): ya no es un disco pintado —el color y la
// hondonada los da la comarca del terreno— sino charcas, árboles muertos y
// juncos repartidos por TODA la región, con la choza de la Vidente Ysra.
function buildSwamp(scene, torchLights) {
  // Charcas de agua turbia amoldadas al relieve, repartidas por la comarca
  scatterInBiome('cienaga', 14, (x, z) => {
    const r = 4 + Math.random() * 7;
    addGroundPatch(scene, new THREE.CircleGeometry(r, 18), x, z, 0x2d3a2a,
      { yOffset: 0.10, transparent: true, opacity: 0.9, metalness: 0.3, roughness: 0.3 });
  });

  // Árboles muertos retorcidos
  const deadMat = mat(0x2e2820);
  scatterInBiome('cienaga', 46, (x, z, g) => {
    const h = 3 + Math.random() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, h, 6), deadMat);
    trunk.position.set(x, g + h / 2, z);
    trunk.rotation.z = (Math.random() - 0.5) * 0.3;
    trunk.castShadow = true;
    scene.add(trunk);
    for (let b = 0; b < 2; b++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 5), deadMat);
      branch.position.set(x + (Math.random() - 0.5), g + h * 0.7, z + (Math.random() - 0.5));
      branch.rotation.z = (Math.random() - 0.5) * 2;
      scene.add(branch);
    }
  });

  // Juncos
  const reedMat = mat(0x3a4a28);
  scatterInBiome('cienaga', 120, (x, z, g) => {
    const reed = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1 + Math.random(), 4), reedMat);
    reed.position.set(x, g + 0.5, z);
    scene.add(reed);
  });

  // Fuegos fatuos: luces verdosas flotantes (animadas como antorchas)
  scatterInBiome('cienaga', 12, (x, z, g) => {
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x9affce }));
    wisp.position.set(x, g + 1.6, z);
    scene.add(wisp);
    const light = new THREE.PointLight(0x66ffaa, 8, 12, 2);
    light.position.set(x, g + 1.8, z);
    scene.add(light);
    torchLights.push({ light, flame: wisp, base: 8, seed: Math.random() * 10 });
  });

  // Choza de la Vidente Ysra, en una isla seca junto a ella
  const hx = -75, hz = -37, hg = heightAt(hx, hz);
  addGroundPatch(scene, new THREE.CircleGeometry(7, 18), hx, hz, 0x4a4530, { yOffset: 0.12 });
  const hut = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 3, 7), mat(0x5c4a32));
  hut.position.set(hx, hg + 1.5, hz);
  hut.castShadow = true;
  scene.add(hut);
  const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.2, 7), mat(0x3a2d1f));
  hutRoof.position.set(hx, hg + 4, hz);
  hutRoof.castShadow = true;
  scene.add(hutRoof);
  addRock(scene, hx + 5, hz - 4, 1.1);
}

// Cumbres Heladas (sureste): la nieve y la meseta elevada las da la comarca del
// terreno; aquí van los pilares de hielo, los pinos escarchados y las lagunas
// heladas, repartidos por TODA la región, más la cabaña de la Cazadora Skadi.
function buildFrostPeaks(scene, torchLights) {
  // Lagunas congeladas amoldadas al relieve
  scatterInBiome('cumbres', 12, (x, z) => {
    const r = 4 + Math.random() * 7;
    addGroundPatch(scene, new THREE.CircleGeometry(r, 18), x, z, 0x9fc8e6,
      { yOffset: 0.10, transparent: true, opacity: 0.85, metalness: 0.4, roughness: 0.15 });
  });

  // Pilares y estalagmitas de hielo
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xbfe0f4, transparent: true, opacity: 0.9, metalness: 0.3, roughness: 0.2 });
  scatterInBiome('cumbres', 40, (x, z, g) => {
    const h = 2.5 + Math.random() * 4.5;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random() * 0.5, h, 6), shardMat);
    shard.position.set(x, g + h / 2, z);
    shard.rotation.z = (Math.random() - 0.5) * 0.2;
    shard.castShadow = true;
    scene.add(shard);
  });

  // Pinos escarchados (tronco oscuro, copa nevada)
  scatterInBiome('cumbres', 34, (x, z, g) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6), mat(0x3a3630));
    trunk.position.set(x, g + 1.2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    for (let c = 0; c < 3; c++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5 - c * 0.35, 1.4, 7), mat(0xeaf2f8));
      cone.position.set(x, g + 2.4 + c * 0.9, z);
      cone.castShadow = true;
      scene.add(cone);
    }
  });

  // Rocas nevadas
  scatterInBiome('cumbres', 16, (x, z) => addRock(scene, x, z, 1 + Math.random() * 0.6));

  // Luces frías flotantes (auroras de hielo), animadas como antorchas
  scatterInBiome('cumbres', 10, (x, z, g) => {
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xcfeaff }));
    glow.position.set(x, g + 1.6, z);
    scene.add(glow);
    const light = new THREE.PointLight(0x8fc4ff, 7, 12, 2);
    light.position.set(x, g + 1.8, z);
    scene.add(light);
    torchLights.push({ light, flame: glow, base: 7, seed: Math.random() * 10 });
  });

  // Cabaña de la Cazadora Skadi (refugio de troncos con techo nevado)
  const sx = 64, sz = 96, sg = heightAt(sx, sz);
  addGroundPatch(scene, new THREE.CircleGeometry(7, 18), sx, sz, 0xcdd8e2, { yOffset: 0.12 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mat(0x4a3f30));
  cabin.position.set(sx, sg + 1.5, sz);
  cabin.castShadow = true;
  scene.add(cabin);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), mat(0xeaf2f8));
  roof.rotation.y = Math.PI / 4;
  roof.position.set(sx, sg + 4, sz);
  roof.castShadow = true;
  scene.add(roof);
}

// Piedra rúnica de viaje rápido: obelisco de piedra con runas brillantes.
function buildWaystone(scene, w) {
  const group = new THREE.Group();
  const stoneMat = mat(0x4a4650, { roughness: 0.9 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 6), stoneMat);
  base.position.y = 0.25;
  base.receiveShadow = true;
  group.add(base);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 6), stoneMat);
  pillar.position.y = 1.9;
  pillar.castShadow = true;
  group.add(pillar);
  // Cristal rúnico flotante
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.45, 0),
    new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x4a90d0, emissiveIntensity: 1.4 })
  );
  crystal.position.y = 4.1;
  crystal.name = 'wsCrystal';
  group.add(crystal);
  const glow = new THREE.PointLight(0x6ab8ff, 14, 14);
  glow.position.y = 4.1;
  group.add(glow);

  // Zona de clic generosa
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 5, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 2.5;
  group.add(hitbox);

  group.position.set(w.x, heightAt(w.x, w.z), w.z);
  group.userData.waystoneId = w.id;
  scene.add(group);
  return group;
}

// Tablón de Encargos clicable: dos postes, tablero de madera y pergaminos.
function buildBountyBoard(scene, x, z) {
  const group = new THREE.Group();
  const woodDark = mat(0x4a3628);
  const woodLight = mat(0x6b5233);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.6, 6), woodDark);
    post.position.set(side * 1.1, 1.3, 0);
    post.castShadow = true;
    group.add(post);
  }
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 0.15), woodLight);
  boardMesh.position.set(0, 2, 0);
  boardMesh.castShadow = true;
  group.add(boardMesh);
  // Marco superior
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.5), woodDark);
  roof.position.set(0, 2.9, 0);
  group.add(roof);
  // Pergaminos clavados
  const paper = new THREE.MeshStandardMaterial({ color: 0xd8c9a3 });
  for (const [px, py] of [[-0.7, 2.1], [0.6, 2.2], [-0.1, 1.7]]) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), paper);
    note.position.set(px, py, 0.09);
    note.rotation.z = (Math.random() - 0.5) * 0.2;
    group.add(note);
  }

  // Zona de clic generosa
  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3, 1.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 1.5;
  group.add(hitbox);

  // Icono flotante: avisa de que el Tablón es interactuable, igual que el '!'
  // de los NPC. Se mueve arriba y abajo en animateWorld.
  const marker = makeBoardMarker();
  marker.position.y = 3.6;
  group.add(marker);
  group.userData.marker = marker;

  group.position.set(x, heightAt(x, z), z);
  group.rotation.y = -Math.PI / 4;
  group.userData.isBoard = true;
  scene.add(group);
  return group;
}

// Pergamino dorado flotante sobre el Tablón de Encargos.
function makeBoardMarker(glyph = '📜', glow = '#ffb400') {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = '72px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.fillText(glyph, 48, 50);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
  }));
  sprite.scale.set(1.5, 1.5, 1);
  return sprite;
}

// Hoguera clicable (para cocinar): piedras, llama, luz y zona de clic.
function addCampfire(scene, torchLights, campfires, fx, fz) {
  const group = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(0x5a5650));
    stone.position.set(Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7);
    group.add(stone);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
  flame.position.y = 0.5;
  group.add(flame);
  const light = new THREE.PointLight(0xff8830, 18, 14, 2);
  light.position.y = 1.2;
  group.add(light);
  torchLights.push({ light, flame, base: 18, seed: Math.random() * 10 });

  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 1.6, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 0.8;
  group.add(hitbox);

  group.position.set(fx, 0, fz);
  group.userData.isCampfire = true;
  scene.add(group);
  campfires.push(group);
}

// Campamento con tienda, hoguera clicable y tronco. Hogar de los NPC del exterior.
function buildCamp(scene, torchLights, campfires, x, z, rotY) {
  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 4), mat(0x7a6a4a));
  tent.position.set(x, 1.5, z);
  tent.rotation.y = rotY;
  tent.castShadow = true;
  scene.add(tent);

  const fx = x + Math.sin(rotY) * 4, fz = z + Math.cos(rotY) * 4;
  addCampfire(scene, torchLights, campfires, fx, fz);

  // Tronco para sentarse
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 7), mat(0x4a3628));
  log.position.set(fx + 1.8, 0.35, fz + 0.5);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = rotY + 0.8;
  log.castShadow = true;
  scene.add(log);
}

// Construye una cripta menor a partir de su configuración: entrada en el
// exterior, salas, muros, antorchas, tumbas y portal de salida.
function buildMiniCrypt(scene, portals, torchLights, cfg) {
  const X = cfg.origin;
  const floorMat = mat(0x2e2c33, { roughness: 1 });
  const wallMat = mat(0x232128, { roughness: 1 });
  const boneMat = mat(0xb8b0a0);

  // Portal de entrada en el exterior
  portals.push(makePortal(
    scene, cfg.entrance.x, cfg.entrance.z, cfg.entrance.rotY, cfg.flame,
    `Entrar a la ${cfg.name}`,
    { x: X, z: 4 }
  ));
  addRock(scene, cfg.entrance.x + 2.5, cfg.entrance.z - 2, 0.6);
  addRock(scene, cfg.entrance.x - 2, cfg.entrance.z + 2.5, 0.5);

  // Portal de salida en el vestíbulo
  portals.push(makePortal(
    scene, X, 6.5, Math.PI, 0xffaa55,
    'Salir al exterior',
    cfg.exitTo
  ));

  // Suelos
  for (const [x1, z1, x2, z2] of cfg.rooms) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1 + 2, z2 - z1 + 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(X + (x1 + x2) / 2, 0, (z1 + z2) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // Muros
  for (const [x1, z1, x2, z2] of cfg.walls) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 6, 1), wallMat);
    seg.position.set(X + (x1 + x2) / 2, 3, (z1 + z2) / 2);
    seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    seg.castShadow = seg.receiveShadow = true;
    scene.add(seg);
  }

  // Antorchas con la llama propia de la cripta
  for (const [tx, tz] of cfg.torches) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 6), mat(0x2a2622));
    pole.position.set(X + tx, 1.3, tz);
    scene.add(pole);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 8),
      new THREE.MeshBasicMaterial({ color: cfg.flame })
    );
    flame.position.set(X + tx, 2.8, tz);
    scene.add(flame);
    const light = new THREE.PointLight(cfg.flame, 20, 14, 2);
    light.position.set(X + tx, 3, tz);
    scene.add(light);
    torchLights.push({ light, flame, base: 20, seed: Math.random() * 10 });
  }

  // Tumbas y huesos
  for (const [sx, sz, ry] of cfg.tombs) {
    const tomb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 2.6), mat(0x3a3740));
    tomb.position.set(X + sx, 0.5, sz);
    tomb.rotation.y = ry;
    tomb.castShadow = true;
    scene.add(tomb);
  }
  for (const [bx, bz] of cfg.bones) {
    for (let i = 0; i < 3; i++) {
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 2, 5), boneMat);
      bone.position.set(X + bx + (Math.random() - 0.5), 0.1, bz + (Math.random() - 0.5));
      bone.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      scene.add(bone);
    }
  }
}

// Animación por frame: parpadeo de antorchas, balanceo de hierbas y ondas de pesca.
export function animateWorld({ torchLights, herbs, fishingSpots, waystones, board, hatch }, time) {
  // El pergamino del Tablón flota para llamar la atención
  const bm = board?.userData?.marker;
  if (bm) bm.position.y = 3.6 + Math.sin(time * 2.2) * 0.16;
  // Y lo mismo la boca de Las Profundidades, un poco más lenta y honda
  const hm = hatch?.userData?.marker;
  if (hm) hm.position.y = 3.2 + Math.sin(time * 1.7) * 0.2;
  for (const f of fishingSpots) {
    f.children.forEach((c, i) => {
      if (c.isMesh && c.material.transparent) {
        c.scale.setScalar(1 + Math.sin(time * 2 + i * 1.7 + f.position.x) * 0.18);
      }
    });
  }
  if (waystones) for (const w of waystones) {
    const crystal = w.getObjectByName('wsCrystal');
    if (crystal) { crystal.rotation.y = time * 1.2; crystal.position.y = 4.1 + Math.sin(time * 2 + w.position.x) * 0.15; }
  }
  for (const t of torchLights) {
    const flicker = Math.sin(time * 9 + t.seed) * 0.5 + Math.sin(time * 23 + t.seed * 3) * 0.3;
    t.light.intensity = t.base + flicker * 6;
    // No toda luz parpadeante tiene llama visible (la trampilla, los fuegos de
    // Las Profundidades): sin esta guarda, una sola rompía todo el bucle.
    if (t.flame) t.flame.scale.setScalar(1 + flicker * 0.15);
  }
  for (const h of herbs) {
    if (h.visible) h.children.forEach((c, i) => {
      if (c.isMesh) c.rotation.z = Math.sin(time * 2 + i + h.position.x) * 0.15;
    });
  }
}
