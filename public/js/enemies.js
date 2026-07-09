// Criaturas dirigidas por el servidor: este módulo solo renderiza e interpola.
// La IA, el daño y el botín viven en server/server.js — todos los jugadores
// ven y cazan las mismas criaturas.
import * as THREE from 'three';
import { makeNameSprite } from './entities.js';

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
    const mesh = info.kind === 'skeleton' ? makeSkeleton(info) : makeBeast(info);
    mesh.scale.setScalar(info.scale);
    mesh.position.set(x, 0, z);
    if (info.label) {
      const label = makeNameSprite(info.name, '#ff8866');
      label.position.y = 3.2;
      mesh.add(label);
    }
    const bar = makeHPBar();
    mesh.add(bar.sprite);
    this.scene.add(mesh);

    const mob = {
      id, type, info, mesh, bar,
      hp, target: { x, z, rot: 0 },
      chasing: false,
      dead: !!dead,
      walkPhase: Math.random() * 10,
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
    m.hp = hp;
    drawHPBar(m.bar, hp / m.info.maxHp);
    m.bar.sprite.visible = true;
    spawnFloatText(this.scene, `-${dmg}`, '#ffd97a', m.mesh.position);
  }

  onDead({ id }) {
    const m = this.map.get(id);
    if (!m) return;
    m.dead = true;
    m.bar.sprite.visible = false;
  }

  onSpawn({ id, x, z, hp }) {
    const m = this.map.get(id);
    if (!m) return;
    m.dead = false;
    m.hp = hp;
    m.target = { x, z, rot: 0 };
    m.mesh.position.set(x, 0, z);
    m.mesh.scale.setScalar(m.info.scale);
    m.mesh.visible = true;
    m.bar.sprite.visible = false;
    drawHPBar(m.bar, 1);
  }

  update(dt) {
    updateFloatTexts(this.scene, dt);

    for (const m of this.map.values()) {
      if (m.dead) {
        // Animación de muerte: encoger hasta desaparecer
        if (m.mesh.visible) {
          m.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
          if (m.mesh.scale.x < 0.05 * m.info.scale) m.mesh.visible = false;
        }
        continue;
      }

      const pos = m.mesh.position;
      const dx = m.target.x - pos.x;
      const dz = m.target.z - pos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq > 25) {
        // Teletransporte (reaparición o corrección grande)
        pos.set(m.target.x, 0, m.target.z);
      } else if (distSq > 0.002) {
        const k = Math.min(1, dt * 10);
        pos.x += dx * k;
        pos.z += dz * k;
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
