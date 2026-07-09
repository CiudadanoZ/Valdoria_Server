// Personajes: malla low-poly del héroe, etiquetas de nombre, jugador local
// (movimiento por clic estilo Diablo) y jugadores remotos interpolados.
import * as THREE from 'three';
import { isBlocked } from './world.js';
import { RACES, CLASSES } from './races.js';

// Héroe de un jugador: aspecto según raza (piel, proporciones, rasgos) y
// especialización (color de la túnica).
export function makeHero(raceId, classId) {
  const race = RACES[raceId] || RACES.humano;
  const clazz = CLASSES[classId] || CLASSES.guerrero;
  const g = makeCharacter({ bodyColor: clazz.body, skinColor: race.skin, race });
  return g;
}

// ---- Malla de personaje ----
// Las piezas del cuerpo van en un subgrupo para que la escala racial no
// deforme las etiquetas/marcadores que se añaden después al grupo raíz.
export function makeCharacter({ bodyColor = 0x8a1a12, trimColor = 0x2c2c34, skinColor = 0xd9b38c, race = null } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);

  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: bodyColor })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshStandardMaterial({ color: skinColor })
  );
  head.position.y = 1.95;
  head.castShadow = true;
  g.add(head);

  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: trimColor })
  );
  hood.position.y = 2.25;
  hood.castShadow = true;
  g.add(hood);

  const legMat = new THREE.MeshStandardMaterial({ color: trimColor });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.6, 6), legMat);
    leg.position.set(side * 0.2, 0.3, 0);
    leg.castShadow = true;
    leg.name = side === -1 ? 'legL' : 'legR';
    g.add(leg);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.85, 6),
      new THREE.MeshStandardMaterial({ color: bodyColor }));
    arm.position.set(side * 0.58, 1.15, 0);
    arm.rotation.z = side * 0.15;
    arm.castShadow = true;
    arm.name = side === -1 ? 'armL' : 'armR';
    g.add(arm);
  }

  // Rasgos raciales
  if (race) {
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor });
    if (race.ears) { // orejas puntiagudas de elfo
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 5), skinMat);
        ear.position.set(side * 0.32, 2.02, 0);
        ear.rotation.z = -side * 1.15;
        g.add(ear);
      }
    }
    if (race.beard) { // barba de enano
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
      beard.position.set(0, 1.62, 0.2);
      beard.rotation.x = 0.25;
      g.add(beard);
    }
    if (race.tusks) { // colmillos de orco
      const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0 });
      for (const side of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), tuskMat);
        tusk.position.set(side * 0.12, 1.82, 0.26);
        tusk.rotation.x = -0.4;
        g.add(tusk);
      }
    }
    const [sx, sy, sz] = race.bodyScale;
    g.scale.set(sx, sy, sz);
  }
  return root;
}

// ---- Etiqueta de nombre (sprite con canvas) ----
export function makeNameSprite(text, color = '#ffd97a') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(4, 1, 1);
  sprite.position.y = 3.1;
  return sprite;
}

// Marcador de misión (! amarillo o ? dorado) sobre un NPC.
export function makeQuestMarker(symbol) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 80px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ffb400';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffd400';
  ctx.fillText(symbol, 32, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(0.9, 1.35, 1);
  sprite.position.y = 4.0;
  return sprite;
}

const WALK_SPEED = 7;

// Intenta mover de (pos) a (nx, nz) respetando muros: si el destino directo está
// bloqueado, prueba a deslizar por cada eje. Devuelve false si no hay avance.
function tryMove(pos, nx, nz) {
  if (!isBlocked(nx, nz)) { pos.x = nx; pos.z = nz; return true; }
  if (!isBlocked(nx, pos.z)) { pos.x = nx; return true; }
  if (!isBlocked(pos.x, nz)) { pos.z = nz; return true; }
  return false;
}

// ---- Jugador local: clic para moverse ----
export class LocalPlayer {
  constructor(scene, name, spawn, raceId, classId) {
    this.mesh = makeHero(raceId, classId);
    this.mesh.position.set(spawn.x, 0, spawn.z);
    this.mesh.add(makeNameSprite(name, '#7fd4ff'));
    scene.add(this.mesh);

    this.target = null;          // THREE.Vector3 destino
    this.onArrive = null;        // callback al llegar (interacción pendiente)
    this.moving = false;
    this.walkTime = 0;

    // Marcador de destino en el suelo
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.8 })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.05;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  moveTo(point, onArrive = null, arriveDist = 0.3) {
    this.target = point.clone();
    this.onArrive = onArrive;
    this.arriveDist = arriveDist;
    this.marker.position.set(this.target.x, 0.05, this.target.z);
    this.marker.visible = true;
  }

  stop() {
    this.target = null;
    this.onArrive = null;
    this.moving = false;
    this.marker.visible = false;
  }

  update(dt) {
    if (!this.target) { this.animate(dt, false); return; }
    const pos = this.mesh.position;
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= (this.arriveDist || 0.3)) {
      const cb = this.onArrive;
      this.stop();
      cb?.();
      this.animate(dt, false);
      return;
    }

    const step = Math.min(dist, WALK_SPEED * (this.speedMul || 1) * dt);
    const moved = tryMove(pos, pos.x + (dx / dist) * step, pos.z + (dz / dist) * step);
    if (!moved) {
      // Bloqueado por un muro sin posibilidad de deslizar: abandonar el destino
      this.stop();
      this.animate(dt, false);
      return;
    }
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.moving = true;
    this.animate(dt, true);
  }

  animate(dt, walking) {
    if (walking) {
      this.walkTime += dt * 10;
      const swing = Math.sin(this.walkTime) * 0.5;
      this.mesh.getObjectByName('legL').rotation.x = swing;
      this.mesh.getObjectByName('legR').rotation.x = -swing;
      this.mesh.getObjectByName('armL').rotation.x = -swing * 0.7;
      this.mesh.getObjectByName('armR').rotation.x = swing * 0.7;
      this.mesh.position.y = Math.abs(Math.sin(this.walkTime)) * 0.06;
    } else {
      for (const n of ['legL', 'legR', 'armL', 'armR']) {
        this.mesh.getObjectByName(n).rotation.x *= 0.8;
      }
      this.mesh.position.y *= 0.8;
      this.moving = false;
    }
  }
}

// ---- Jugadores remotos ----
export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> { mesh, target: {x,z,rot}, walkTime }
  }

  add({ id, name, race, class: clazz, x, z, rot }) {
    if (this.players.has(id)) return;
    const mesh = makeHero(race, clazz);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rot || 0;
    mesh.add(makeNameSprite(name, '#ffd97a'));
    mesh.traverse((o) => { o.userData.remoteId = id; });
    this.scene.add(mesh);
    this.players.set(id, { id, name, mesh, target: { x, z, rot: rot || 0 }, walkTime: 0 });
  }

  meshes() {
    return [...this.players.values()].map((p) => p.mesh);
  }

  findByObject(obj) {
    const id = obj?.userData?.remoteId;
    return id !== undefined ? this.players.get(id) : null;
  }

  updateState({ id, x, z, rot }) {
    const p = this.players.get(id);
    if (p) p.target = { x, z, rot };
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.mesh);
    this.players.delete(id);
  }

  update(dt) {
    for (const p of this.players.values()) {
      const pos = p.mesh.position;
      const dx = p.target.x - pos.x;
      const dz = p.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 25) {
        // Teletransporte (portal de la cripta): saltar sin interpolar
        pos.x = p.target.x;
        pos.z = p.target.z;
        continue;
      }
      const walking = dist > 0.05;
      if (walking) {
        const k = Math.min(1, dt * 10);
        pos.x += dx * k;
        pos.z += dz * k;
        p.walkTime += dt * 10;
        const swing = Math.sin(p.walkTime) * 0.5;
        p.mesh.getObjectByName('legL').rotation.x = swing;
        p.mesh.getObjectByName('legR').rotation.x = -swing;
      } else {
        p.mesh.getObjectByName('legL').rotation.x *= 0.8;
        p.mesh.getObjectByName('legR').rotation.x *= 0.8;
      }
      // Interpolación suave de rotación
      let dr = p.target.rot - p.mesh.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      p.mesh.rotation.y += dr * Math.min(1, dt * 12);
    }
  }
}
