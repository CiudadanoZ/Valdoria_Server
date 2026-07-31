// Criaturas dirigidas por el servidor: este módulo solo renderiza e interpola.
// La IA, el daño y el botín viven en server/server.js — todos los jugadores
// ven y cazan las mismas criaturas.
import * as THREE from 'three';
import { makeNameSprite } from './entities.js';
import { heightAt } from './terrain.js';

// Datos visuales y de interfaz por tipo (las estadísticas reales están en el servidor)
export const MOB_INFO = {
  lobo:         { name: 'Lobo Gris',          maxHp: 30,  kind: 'wolf',     color: 0x7d7d86, scale: 1 },
  jabali:       { name: 'Jabalí Salvaje',     maxHp: 55,  kind: 'boar',     color: 0x5c4030, scale: 1 },
  alfa:         { name: 'Alfa Sombrío',       maxHp: 150, kind: 'wolf',     color: 0x232330, scale: 1.7, redEyes: true, label: true },
  rata:         { name: 'Rata de Cripta',     maxHp: 25,  kind: 'rat',      color: 0x4a4038, scale: 0.62 },
  esqueleto:    { name: 'Esqueleto Guardián', maxHp: 70,  kind: 'skeleton', color: 0xcfc6b4, scale: 1 },
  guardian_oseo: { name: 'Guardián Óseo',     maxHp: 180, kind: 'skeleton', color: 0xb8ae98, scale: 1.3, label: true },
  centinela_oseo: { name: 'Centinela Óseo',   maxHp: 200, kind: 'skeleton', color: 0xa8b8c0, scale: 1.3, label: true },
  senor_cripta: { name: 'Señor de la Cripta', maxHp: 400, kind: 'skeleton', color: 0x9a94a8, scale: 1.5, redEyes: true, crown: true, label: true },
  ciervo:       { name: 'Ciervo del Lago',    maxHp: 35,  kind: 'deer',     color: 0x9a7350, scale: 1 },
  oso:          { name: 'Oso Pardo',          maxHp: 120, kind: 'bear',     color: 0x5a4632, scale: 1.35 },
  // Ciénaga de los Ahogados
  sanguijuela:  { name: 'Sanguijuela Gigante', maxHp: 28, kind: 'blob',     color: 0x5a3a4a, scale: 0.8 },
  ahogado:      { name: 'Ahogado',            maxHp: 90,  kind: 'drowned',  color: 0x5a7a5a, scale: 1 },
  chaman_cienaga: { name: 'Chamán de la Ciénaga', maxHp: 110, kind: 'drowned', color: 0x6a5a8a, scale: 1.05, staff: true },
  rey_fango:    { name: 'Rey del Fango',      maxHp: 450, kind: 'blob',     color: 0x4a5a38, scale: 2.4, redEyes: true, crown: true, label: true },
  // Cumbres Heladas (sureste)
  lobo_escarcha:   { name: 'Lobo de Escarcha',  maxHp: 110, kind: 'wolf',     color: 0xc8e2f2, scale: 1.3, redEyes: true },
  aparecido_helado: { name: 'Aparecido Helado', maxHp: 140, kind: 'drowned',  color: 0x9cc4e0, scale: 1.05 },
  troll_hielo:     { name: 'Troll de Hielo',    maxHp: 260, kind: 'bear',     color: 0xdde8f2, scale: 1.55, label: true },
  jarl_cumbres:    { name: 'Jarl de las Cumbres', maxHp: 700, kind: 'skeleton', color: 0xb4d6ee, scale: 2.6, redEyes: true, crown: true, label: true },
  // Jefe de mundo (evento)
  coloso:       { name: 'Coloso de Valdoria', maxHp: 3000, kind: 'skeleton', color: 0x6a5030, scale: 3.6, redEyes: true, crown: true, label: true },
};

// ---- Malla cuadrúpeda (lobo / jabalí / rata) ----
function makeBeast(info) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: info.color });

  const isBoar = info.kind === 'boar';
  const isRat = info.kind === 'rat';
  const isDeer = info.kind === 'deer';
  const isBear = info.kind === 'bear';

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 1.5), bodyMat);
  body.position.y = 0.75;
  if (isBoar) body.scale.set(1.15, 1.1, 0.95);
  if (isRat) body.scale.set(0.9, 0.8, 1.1);
  if (isDeer) { body.scale.set(0.85, 0.85, 1.05); body.position.y = 0.95; }
  if (isBear) body.scale.set(1.3, 1.25, 1.1);
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.6), bodyMat);
  head.position.set(0, isDeer ? 1.35 : 0.95, 0.95);
  head.castShadow = true;
  g.add(head);

  if (isDeer) {
    // Cuello alto y cornamenta
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6), bodyMat);
    neck.position.set(0, 1.1, 0.8);
    neck.rotation.x = 0.4;
    g.add(neck);
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a8 });
    for (const side of [-1, 1]) {
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), antlerMat);
      antler.position.set(side * 0.15, 1.7, 0.85);
      antler.rotation.z = side * 0.5;
      g.add(antler);
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 5), antlerMat);
      tine.position.set(side * 0.28, 1.8, 0.85);
      tine.rotation.z = side * 1.1;
      g.add(tine);
    }
  } else if (isBear) {
    // Orejas redondas y hocico
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), bodyMat);
      ear.position.set(side * 0.2, 1.25, 0.85);
      g.add(ear);
    }
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x3d2f22 }));
    snout.position.set(0, 0.88, 1.32);
    g.add(snout);
  } else if (isBoar) {
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x8a6a55 }));
    snout.position.set(0, 0.85, 1.3);
    g.add(snout);
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0 });
    for (const side of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), tuskMat);
      tusk.position.set(side * 0.18, 0.78, 1.28);
      tusk.rotation.x = -0.5;
      g.add(tusk);
    }
  } else {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(isRat ? 0.13 : 0.1, isRat ? 0.2 : 0.28, 4), bodyMat);
      ear.position.set(side * 0.15, 1.28, 0.85);
      g.add(ear);
    }
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.35), bodyMat);
    muzzle.position.set(0, 0.86, 1.32);
    g.add(muzzle);
    const tail = new THREE.Mesh(
      isRat
        ? new THREE.CylinderGeometry(0.03, 0.06, 1.2, 5)
        : new THREE.ConeGeometry(0.12, 0.55, 5),
      isRat ? new THREE.MeshStandardMaterial({ color: 0x8a7a70 }) : bodyMat
    );
    tail.position.set(0, isRat ? 0.7 : 0.95, isRat ? -1.2 : -0.85);
    tail.rotation.x = isRat ? 1.4 : 1.1;
    g.add(tail);
  }

  if (info.redEyes) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
      eye.position.set(side * 0.13, 1.02, 1.24);
      g.add(eye);
    }
  }

  let li = 0;
  for (const [lx, lz] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.55, 5), bodyMat);
    leg.position.set(lx, 0.28, lz);
    leg.name = `leg${li++}`;
    g.add(leg);
  }

  return g;
}

// ---- Malla de esqueleto (guardián / Señor de la Cripta) ----
function makeSkeleton(info) {
  const g = new THREE.Group();
  const boneMat = new THREE.MeshStandardMaterial({ color: info.color });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2530 });

  // Caja torácica
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.9, 8), boneMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 5, 10), boneMat);
    rib.position.y = 0.95 + i * 0.22;
    rib.rotation.x = Math.PI / 2;
    g.add(rib);
  }

  // Cráneo
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), boneMat);
  skull.position.y = 1.95;
  skull.castShadow = true;
  g.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.2), boneMat);
  jaw.position.set(0, 1.78, 0.14);
  g.add(jaw);

  // Ojos
  const eyeColor = info.redEyes ? 0xff2222 : 0x66ffbb;
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 2.2 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eye.position.set(side * 0.11, 1.98, 0.26);
    g.add(eye);
  }

  if (info.crown) {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.25, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8a7020, metalness: 0.7, roughness: 0.3 }));
    crown.position.y = 2.24;
    g.add(crown);
  }

  // Piernas y brazos huesudos
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.66, 5), boneMat);
    leg.position.set(side * 0.16, 0.33, 0);
    leg.name = side === -1 ? 'legL' : 'legR';
    leg.castShadow = true;
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), boneMat);
    arm.position.set(side * 0.5, 1.2, 0);
    arm.rotation.z = side * 0.2;
    arm.name = side === -1 ? 'armL' : 'armR';
    g.add(arm);
  }

  // Espada oxidada en la mano derecha
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.16), darkMat);
  blade.position.set(0.62, 0.95, 0.35);
  blade.rotation.x = 0.9;
  g.add(blade);

  return g;
}

// ---- Masa gelatinosa (sanguijuela pequeña / Rey del Fango grande) ----
function makeBlob(info) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.4, metalness: 0.1 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), bodyMat);
  body.position.y = 0.6;
  body.scale.set(1.1, 0.8, 1.3);
  body.castShadow = true;
  body.name = 'blobBody';
  g.add(body);
  // Bultos supurantes
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const lump = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), bodyMat);
    lump.position.set(Math.cos(a) * 0.55, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.7);
    g.add(lump);
  }

  if (info.crown) {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x8a7020, metalness: 0.7, roughness: 0.3 }));
    crown.position.y = 1.4;
    g.add(crown);
  }
  if (info.redEyes) {
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffe000, emissive: 0xffb000, emissiveIntensity: 2 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
      eye.position.set(side * 0.22, 0.75, 0.95);
      g.add(eye);
    }
  }
  return g;
}

// ---- Ahogado / Chamán: humanoide encorvado de la ciénaga ----
function makeDrowned(info) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 8), skinMat);
  torso.position.y = 1.0;
  torso.rotation.x = 0.2; // encorvado
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skinMat);
  head.position.set(0, 1.7, 0.15);
  head.castShadow = true;
  g.add(head);
  // Ojos vacíos
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9affd0, emissive: 0x3aaa70, emissiveIntensity: 1.5 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeMat);
    eye.position.set(side * 0.11, 1.72, 0.38);
    g.add(eye);
  }
  // Brazos colgantes
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 6), skinMat);
    arm.position.set(side * 0.42, 1.05, 0.1);
    arm.rotation.z = side * 0.25;
    arm.name = side === -1 ? 'armL' : 'armR';
    g.add(arm);
  }
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.7, 6), skinMat);
    leg.position.set(side * 0.16, 0.35, 0);
    leg.name = side === -1 ? 'legL' : 'legR';
    g.add(leg);
  }
  // Bastón del chamán con una luz
  if (info.staff) {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2d1f }));
    staff.position.set(0.55, 0.9, 0.2);
    g.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xb090e0, emissive: 0x7050b0, emissiveIntensity: 1.5 }));
    orb.position.set(0.55, 1.85, 0.2);
    g.add(orb);
  }
  return g;
}

// ---- Barra de vida flotante ----
function makeHPBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 16;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.2, 0.28, 1);
  sprite.position.y = 2.6;
  sprite.visible = false;
  return { sprite, canvas, tex };
}

function drawHPBar(bar, ratio) {
  const ctx = bar.canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, 128, 16);
  ctx.fillStyle = ratio > 0.4 ? '#b03028' : '#e05020';
  ctx.fillRect(2, 2, 124 * Math.max(0, Math.min(1, ratio)), 12);
  bar.tex.needsUpdate = true;
}

// ---- Texto flotante de daño ----
const floatTexts = [];
export function spawnFloatText(scene, text, color, worldPos, big = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${big ? 44 : 34}px Georgia`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 5;
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(2, 1, 1);
  sprite.position.copy(worldPos);
  sprite.position.y += 2.4;
  scene.add(sprite);
  floatTexts.push({ sprite, life: 1 });
}

function updateFloatTexts(scene, dt) {
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.life -= dt;
    f.sprite.position.y += dt * 1.6;
    f.sprite.material.opacity = Math.max(0, f.life);
    if (f.life <= 0) {
      scene.remove(f.sprite);
      f.sprite.material.map.dispose();
      f.sprite.material.dispose();
      floatTexts.splice(i, 1);
    }
  }
}

// Duración del destello blanco-rojizo al recibir un golpe
const FLASH_DUR = 0.14;

// ---- Chispas de impacto ----
// Geometría y material se comparten entre todas las chispas (se clona solo el
// material para poder desvanecer cada tanda por separado).
const SPARK_GEO = new THREE.SphereGeometry(0.09, 5, 4);
const sparks = [];

export function spawnImpact(scene, worldPos, color = 0xffd06a, count = 7) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const s = new THREE.Mesh(SPARK_GEO, mat);
    s.position.copy(worldPos);
    s.position.y += 1.1;
    scene.add(s);
    const ang = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 2.6;
    sparks.push({
      mesh: s, life: 0.34, maxLife: 0.34,
      vx: Math.cos(ang) * speed,
      vy: 2.2 + Math.random() * 2.4,
      vz: Math.sin(ang) * speed,
    });
  }
}

function updateSparks(scene, dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.vy -= 11 * dt; // gravedad
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.mesh.material.opacity = Math.max(0, s.life / s.maxLife);
    if (s.life <= 0) {
      scene.remove(s.mesh);
      s.mesh.material.dispose(); // la geometría es compartida: no se libera
      sparks.splice(i, 1);
    }
  }
}

// ---- Renderizador de mobs sincronizados ----
export class Mobs {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> mob
  }

  // Estado inicial completo (mensaje welcome)
  init(list) {
    for (const data of list) this.create(data);
  }

  create({ id, type, x, z, hp, dead }) {
    const info = MOB_INFO[type];
    if (!info || this.map.has(id)) return;
    const mesh = info.kind === 'skeleton' ? makeSkeleton(info)
      : info.kind === 'blob' ? makeBlob(info)
      : info.kind === 'drowned' ? makeDrowned(info)
      : makeBeast(info);
    mesh.scale.setScalar(info.scale);
    mesh.position.set(x, heightAt(x, z), z);
    if (info.label) {
      const label = makeNameSprite(info.name, '#ff8866');
      label.position.y = 3.2;
      mesh.add(label);
    }
    const bar = makeHPBar();
    mesh.add(bar.sprite);
    this.scene.add(mesh);

    // Materiales propios de esta criatura (el factory los crea por instancia):
    // se usan para el destello al recibir un golpe.
    const mats = [];
    mesh.traverse((o) => { if (o.isMesh && o.material?.emissive) mats.push(o.material); });

    const mob = {
      id, type, info, mesh, bar,
      hp, target: { x, z, rot: 0 },
      chasing: false,
      dead: !!dead,
      walkPhase: Math.random() * 10,
      mats,
      flash: 0,    // destello al ser golpeada
      punch: 0,    // achatado del impacto
      deathT: 0,   // tiempo desde que cayó
      deathDir: 1, // hacia qué lado se desploma
    };
    if (mob.dead) mesh.visible = false;
    this.map.set(id, mob);
  }

  byId(id) { return this.map.get(id); }

  aliveMeshes() {
    return [...this.map.values()].filter((m) => !m.dead && m.mesh.visible).map((m) => m.mesh);
  }

  findByObject(obj) {
    while (obj) {
      for (const m of this.map.values()) {
        if (m.mesh === obj) return m;
      }
      obj = obj.parent;
    }
    return null;
  }

  // Instantánea periódica del servidor: [[id, x, z, rot, hp, chasing], ...]
  onSnapshot(entries) {
    for (const [id, x, z, rot, hp, chasing] of entries) {
      const m = this.map.get(id);
      if (!m) continue;
      m.target = { x, z, rot };
      m.hp = hp;
      m.chasing = !!chasing;
      if (m.dead) continue; // la reaparición llega por mob_spawn
      if (m.bar.sprite.visible) drawHPBar(m.bar, hp / m.info.maxHp);
      m.bar.sprite.visible = hp < m.info.maxHp;
    }
  }

  onHit({ id, hp, dmg }) {
    const m = this.map.get(id);
    if (!m || m.dead) return;
    const big = dmg >= m.info.maxHp * 0.15; // golpe contundente
    m.hp = hp;
    drawHPBar(m.bar, hp / m.info.maxHp);
    m.bar.sprite.visible = true;
    spawnFloatText(this.scene, `-${dmg}`, big ? '#ffb03a' : '#ffd97a', m.mesh.position, big);
    // Impacto: destello, achatado y chispas
    m.flash = FLASH_DUR;
    m.punch = 1;
    spawnImpact(this.scene, m.mesh.position, big ? 0xffa030 : 0xffd06a, big ? 10 : 6);
    return big;
  }

  onDead({ id }) {
    const m = this.map.get(id);
    if (!m) return;
    m.dead = true;
    m.deathT = 0;
    m.deathDir = Math.random() < 0.5 ? 1 : -1;
    m.bar.sprite.visible = false;
    // Estallido final más generoso
    spawnImpact(this.scene, m.mesh.position, 0xffc04a, 12);
  }

  onSpawn({ id, x, z, hp }) {
    const m = this.map.get(id);
    if (!m) return;
    m.dead = false;
    m.hp = hp;
    m.target = { x, z, rot: 0 };
    m.mesh.position.set(x, heightAt(x, z), z);
    m.mesh.rotation.z = 0; // deshacer el desplome de la muerte anterior
    m.mesh.scale.setScalar(m.info.scale);
    m.mesh.visible = true;
    m.flash = 0;
    m.punch = 0;
    m.deathT = 0;
    for (const mat of m.mats) mat.emissive.setRGB(0, 0, 0);
    m.bar.sprite.visible = false;
    drawHPBar(m.bar, 1);
  }

  update(dt) {
    updateFloatTexts(this.scene, dt);
    updateSparks(this.scene, dt);

    for (const m of this.map.values()) {
      if (m.dead) {
        // Muerte: se desploma de lado y luego se encoge hasta desaparecer
        if (m.mesh.visible) {
          m.deathT += dt;
          const t = Math.min(1, m.deathT / 0.45);
          m.mesh.rotation.z = m.deathDir * t * Math.PI * 0.5;
          m.mesh.position.y = heightAt(m.mesh.position.x, m.mesh.position.z) - 0.25 * t;
          if (m.deathT > 0.65) {
            m.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 5));
            if (m.mesh.scale.x < 0.05 * m.info.scale) m.mesh.visible = false;
          }
        }
        continue;
      }

      // Destello del golpe: se apaga en FLASH_DUR
      if (m.flash > 0) {
        m.flash = Math.max(0, m.flash - dt);
        const k = m.flash / FLASH_DUR;
        for (const mat of m.mats) mat.emissive.setRGB(k * 0.95, k * 0.3, k * 0.12);
      }
      // Achatado del impacto: se hincha a lo ancho y se recupera
      if (m.punch > 0) {
        m.punch = Math.max(0, m.punch - dt * 7);
        const p = m.punch;
        const s = m.info.scale;
        m.mesh.scale.set(s * (1 + 0.22 * p), s * (1 - 0.18 * p), s * (1 + 0.22 * p));
      }

      const pos = m.mesh.position;
      const dx = m.target.x - pos.x;
      const dz = m.target.z - pos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > 25) {
        // Teletransporte (reaparición o corrección grande)
        pos.set(m.target.x, heightAt(m.target.x, m.target.z), m.target.z);
      } else if (distSq > 0.002) {
        const k = Math.min(1, dt * 10);
        pos.x += dx * k;
        pos.z += dz * k;
        pos.y = heightAt(pos.x, pos.z);   // pisar el relieve al desplazarse
        // Trote de patas
        m.walkPhase += dt * (m.chasing ? 14 : 8);
        const swing = Math.sin(m.walkPhase) * 0.5;
        for (const name of ['leg0', 'leg1', 'leg2', 'leg3', 'legL', 'legR']) {
          const leg = m.mesh.getObjectByName(name);
          if (leg) leg.rotation.x = (name.endsWith('1') || name.endsWith('2') || name === 'legR') ? -swing : swing;
        }
      }

      // Rotación suave
      let dr = m.target.rot - m.mesh.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      m.mesh.rotation.y += dr * Math.min(1, dt * 10);
    }
  }
}
