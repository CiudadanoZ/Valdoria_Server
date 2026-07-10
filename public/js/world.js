// Construcción del mundo: la Ciudadela de Valdoria (plaza, murallas, torres,
// puerta sur, edificios, fuente, antorchas, Hierbas Lumina) y el bioma exterior
// (llanuras al este, bosque al oeste y sur profundo, camino de tierra).
import * as THREE from 'three';

export const WORLD_RADIUS = 140;    // límite absoluto del mundo
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

// La muralla ocupa el anillo [40, 44]; solo se cruza por el corredor de la puerta sur.
// En las criptas solo se camina por las salas.
export function isBlocked(x, z) {
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

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, ...opts });

function addTree(scene, x, z, scale = 1, dark = false) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.6 * scale, 3 * scale, 8), mat(0x4a3628));
  trunk.position.set(x, 1.5 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4 * scale, 10, 8), mat(dark ? 0x2a4020 : 0x3d5a2e));
  crown.position.set(x, 4.4 * scale, z);
  crown.scale.y = 1.2;
  crown.castShadow = true;
  scene.add(crown);
}

function addRock(scene, x, z, scale = 1) {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), mat(0x5a5650, { roughness: 1 }));
  rock.position.set(x, scale * 0.5, z);
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

  // ---- Iluminación: atardecer dorado ----
  const ambient = new THREE.AmbientLight(0x6b5d8a, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xbfa77a, 0x2a1f2e, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a0, 1.15);
  sun.position.set(40, 60, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = 60;
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 10, far: 160 });
  scene.add(sun);

  scene.fog = new THREE.FogExp2(0x1a1220, 0.008);
  scene.background = new THREE.Color(0x1a1220);

  // ---- Terreno exterior: llanuras ----
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(WORLD_RADIUS + 25, 48), mat(0x2e3d24));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -0.05;
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Suelo del bosque (parches más oscuros al oeste y sur profundo)
  for (const [x, z, r] of [[-70, 45, 40], [-45, 90, 35], [15, 115, 38], [-90, -10, 30]]) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat(0x24301c));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, -0.02, z);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  // Camino de tierra: de la puerta sur hacia el sur, con claro final
  const outerRoad = new THREE.Mesh(new THREE.PlaneGeometry(6, 70), mat(0x4d4034));
  outerRoad.rotation.x = -Math.PI / 2;
  outerRoad.position.set(0, 0.01, 78);
  outerRoad.receiveShadow = true;
  scene.add(outerRoad);
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(12, 24), mat(0x4d4034));
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.set(0, 0.012, 113);
  clearing.receiveShadow = true;
  scene.add(clearing);

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
    group.position.set(x, 0, z);
    group.userData.isHerb = true;
    scene.add(group);
    herbs.push(group);
  }

  // ---- El norte y el este: lago de los ciervos, ruinas, campamentos ----
  buildLake(scene, fishingSpots);
  buildRuins(scene);
  buildCamp(scene, torchLights, campfires, -67, 55, 0.6);   // campamento del Ermitaño Baldur (bosque)
  buildCamp(scene, torchLights, campfires, 70, 21, -2.2);   // campamento de la Cazadora Nyra (colina)
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

  return { torchLights, herbs, portals, fishingSpots, campfires, board, lights: { ambient, hemi, sun } };
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

  group.position.set(x, 0, z);
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

  group.position.set(x, 0, z);
  group.rotation.y = -Math.PI / 4;
  group.userData.isBoard = true;
  scene.add(group);
  return group;
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
export function animateWorld({ torchLights, herbs, fishingSpots }, time) {
  for (const f of fishingSpots) {
    f.children.forEach((c, i) => {
      if (c.isMesh && c.material.transparent) {
        c.scale.setScalar(1 + Math.sin(time * 2 + i * 1.7 + f.position.x) * 0.18);
      }
    });
  }
  for (const t of torchLights) {
    const flicker = Math.sin(time * 9 + t.seed) * 0.5 + Math.sin(time * 23 + t.seed * 3) * 0.3;
    t.light.intensity = t.base + flicker * 6;
    t.flame.scale.setScalar(1 + flicker * 0.15);
  }
  for (const h of herbs) {
    if (h.visible) h.children.forEach((c, i) => {
      if (c.isMesh) c.rotation.z = Math.sin(time * 2 + i + h.position.x) * 0.15;
    });
  }
}
