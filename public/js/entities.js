// Personajes: malla low-poly del héroe, etiquetas de nombre, jugador local
// (movimiento por clic estilo Diablo) y jugadores remotos interpolados.
import * as THREE from 'three';
import { asOverlay, drawLabel } from './pixel.js';
import { isBlocked } from './world.js';
import { heightAt } from './terrain.js';
import { MOUNTS } from './world-data.js';

const MOUNT_LIFT = 0.75; // cuánto se eleva el héroe al ir montado

// Malla sencilla de montura (cuadrúpedo) que se coloca bajo el héroe.
export function makeMount(mountId) {
  const def = MOUNTS[mountId] || MOUNTS.corcel;
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ flatShading: true, color: def.color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.7), m);
  body.position.y = 0.7; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), m);
  neck.position.set(0, 1.0, 0.9); neck.rotation.x = 0.7; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.55), m);
  head.position.set(0, 1.25, 1.2); g.add(head);
  for (const [lx, lz] of [[-0.26, 0.6], [0.26, 0.6], [-0.26, -0.6], [0.26, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.75, 5), m);
    leg.position.set(lx, 0.35, lz); g.add(leg);
  }
  // Cola / melena
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 5), new THREE.MeshStandardMaterial({ flatShading: true, color: 0x2a2320 }));
  tail.position.set(0, 0.8, -1.0); tail.rotation.x = 1.2; g.add(tail);
  if (mountId === 'espectro') {
    g.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.75; o.material.emissive = new THREE.Color(0x3a7a6a); o.material.emissiveIntensity = 0.6; } });
  }
  g.position.y = -MOUNT_LIFT; // el héroe se eleva; la montura queda en el suelo
  g.name = 'mount';
  return g;
}
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
    new THREE.MeshStandardMaterial({ flatShading: true, color: bodyColor })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshStandardMaterial({ flatShading: true, color: skinColor })
  );
  head.position.y = 1.95;
  head.castShadow = true;
  g.add(head);

  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.5, 8),
    new THREE.MeshStandardMaterial({ flatShading: true, color: trimColor })
  );
  hood.position.y = 2.25;
  hood.castShadow = true;
  g.add(hood);

  const legMat = new THREE.MeshStandardMaterial({ flatShading: true, color: trimColor });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.6, 6), legMat);
    leg.position.set(side * 0.2, 0.3, 0);
    leg.castShadow = true;
    leg.name = side === -1 ? 'legL' : 'legR';
    g.add(leg);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.85, 6),
      new THREE.MeshStandardMaterial({ flatShading: true, color: bodyColor }));
    arm.position.set(side * 0.58, 1.15, 0);
    arm.rotation.z = side * 0.15;
    arm.castShadow = true;
    arm.name = side === -1 ? 'armL' : 'armR';
    g.add(arm);
  }

  // Rasgos raciales
  if (race) {
    const skinMat = new THREE.MeshStandardMaterial({ flatShading: true, color: skinColor });
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
        new THREE.MeshStandardMaterial({ flatShading: true, color: 0x8a5a2a }));
      beard.position.set(0, 1.62, 0.2);
      beard.rotation.x = 0.25;
      g.add(beard);
    }
    if (race.tusks) { // colmillos de orco
      const tuskMat = new THREE.MeshStandardMaterial({ flatShading: true, color: 0xe8e0d0 });
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
  drawLabel(ctx, text, 128, 32, { size: 30, color });
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  asOverlay(sprite); // nítido, por encima del pixel art
  sprite.scale.set(4, 1, 1);
  sprite.position.y = 3.1;
  return sprite;
}

// Marcador de misión (! amarillo o ? dorado) sobre un NPC.
export function makeQuestMarker(symbol) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  drawLabel(ctx, symbol, 32, 48, { size: 80, color: '#ffd400', glow: '#ffb400', blur: 12 });
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  asOverlay(sprite); // nítido, por encima del pixel art
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
    // El suelo tiene relieve: la base es la altura del terreno bajo los pies,
    // más la elevación de la montura si va montado.
    const base = heightAt(this.mesh.position.x, this.mesh.position.z) + (this.mountLift || 0);
    if (walking) {
      this.walkTime += dt * 10;
      const swing = Math.sin(this.walkTime) * 0.5;
      this.mesh.getObjectByName('legL').rotation.x = swing;
      this.mesh.getObjectByName('legR').rotation.x = -swing;
      this.mesh.getObjectByName('armL').rotation.x = -swing * 0.7;
      this.mesh.getObjectByName('armR').rotation.x = swing * 0.7;
      this.mesh.position.y = base + Math.abs(Math.sin(this.walkTime)) * 0.06;
    } else {
      for (const n of ['legL', 'legR', 'armL', 'armR']) {
        this.mesh.getObjectByName(n).rotation.x *= 0.8;
      }
      this.mesh.position.y += (base - this.mesh.position.y) * 0.3;
      this.moving = false;
    }
  }

  // Muestra u oculta la montura bajo el héroe local.
  setMount(mountId) {
    if (this.mountMesh) { this.mesh.remove(this.mountMesh); this.mountMesh = null; }
    this.mountLift = 0;
    if (mountId) {
      this.mountMesh = makeMount(mountId);
      this.mesh.add(this.mountMesh);
      this.mountLift = MOUNT_LIFT;
    }
  }
}

// ---- Jugadores remotos ----
export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> { mesh, target: {x,z,rot}, walkTime }
  }

  // Vacía la escena de otros héroes. Al cruzar a una instancia de Las
  // Profundidades dejas de compartir mundo con ellos, y se quedarían ahí
  // plantados como fantasmas.
  clear() {
    for (const p of this.players.values()) this.scene.remove(p.mesh);
    this.players.clear();
  }

  add({ id, name, race, class: clazz, x, z, rot, pvp, mount }) {
    if (this.players.has(id)) return;
    const mesh = makeHero(race, clazz);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rot || 0;
    mesh.add(makeNameSprite(name, '#ffd97a'));
    mesh.traverse((o) => { o.userData.remoteId = id; });
    this.scene.add(mesh);
    const p = { id, name, mesh, target: { x, z, rot: rot || 0 }, walkTime: 0, pvp: false, mark: null, mountMesh: null, mountLift: 0 };
    this.players.set(id, p);
    if (pvp) this.setPvp(id, true);
    if (mount) this.setMount(id, mount);
  }

  // Marca de JcJ: dos espadas rojas flotando sobre el jugador señalado.
  setPvp(id, pvp) {
    const p = this.players.get(id);
    if (!p) return;
    p.pvp = pvp;
    if (pvp && !p.mark) {
      p.mark = makeNameSprite('⚔', '#ff5040');
      p.mark.position.y = 3.5;
      p.mark.scale.set(1.4, 1.4, 1);
      p.mesh.add(p.mark);
    } else if (!pvp && p.mark) {
      p.mesh.remove(p.mark);
      p.mark = null;
    }
  }

  isPvp(id) { return !!this.players.get(id)?.pvp; }

  // Muestra u oculta la montura de un jugador remoto.
  setMount(id, mountId) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.mountMesh) { p.mesh.remove(p.mountMesh); p.mountMesh = null; }
    p.mountLift = 0;
    if (mountId) {
      p.mountMesh = makeMount(mountId);
      p.mesh.add(p.mountMesh);
      p.mountLift = MOUNT_LIFT;
    }
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
      // Suelo bajo sus pies (el mundo tiene relieve) + elevación por montura
      const base = heightAt(p.mesh.position.x, p.mesh.position.z) + (p.mountLift || 0);
      p.mesh.position.y += (base - p.mesh.position.y) * 0.3;
      // Interpolación suave de rotación
      let dr = p.target.rot - p.mesh.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      p.mesh.rotation.y += dr * Math.min(1, dt * 12);
    }
  }
}
