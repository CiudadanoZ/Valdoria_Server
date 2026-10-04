// Tráiler de la Ciudadela de Valdoria, rodado con el motor del juego.
//
// Es el mismo mundo (buildWorld), el mismo pixel art (PixelPipeline) y los
// mismos sprites de héroes, NPCs, criaturas y monturas; lo que cambia es que
// la cámara sigue un guion y los actores una coreografía, en vez de un
// jugador y un servidor. Diez planos sobre una banda sonora sintetizada.
//
// El resultado se compone en un lienzo 1920x1080 (mundo + efectos en baja
// resolución + carteles + bandas de cine) que el navegador graba con
// MediaRecorder. Con ?t=SEGUNDOS se empieza en ese momento (para revisar).
import * as THREE from 'three';
import { buildWorld, animateWorld, setWorldDetail } from './world.js';
import { PixelPipeline } from './pixel.js';
import { SpriteSkin, HERO_HEIGHT, blobShadow } from './pixelsprites.js';
import { heroSheet, npcSheet } from './pixelfiguras.js';
import { creatureSheet, mountSheet } from './pixelcreatures.js';
import { MOB_INFO } from './enemies.js';
import { heightAt, radioCosta } from './terrain.js';
import { tocarBandaSonora } from './trailer-musica.js';

const W = 1920, H = 1080;
const PX = 2.4;                        // tamaño del píxel: 800x450 de mundo
const FW = Math.round(W / PX), FH = Math.round(H / PX);
const BARRA = 92;                      // bandas de cine arriba y abajo
export const DURACION = 66;
const URL_JUEGO = 'ciudadela-valdoria.onrender.com';

// ================================================================ escena
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, W / H, 1, 900);
const pipe = new PixelPipeline(renderer, { pixelSize: PX });
pipe.setSize(W, H);
document.body.classList.add('pixel');

const refs = buildWorld(scene);
setWorldDetail(true);
// Sin iconos de interfaz flotando: esto es cine
if (refs.board?.userData?.marker) refs.board.userData.marker.visible = false;
if (refs.hatch?.userData?.marker) refs.hatch.userData.marker.visible = false;
const FOG_SUPERFICIE = new THREE.Color(0x1a1220), FOG_CRIPTA = new THREE.Color(0x07090c);

// ================================================================ actores
const actores = [];

// Un actor: sprite animado con sombra que sigue una ruta [[t, x, z], ...].
// Solo se ve dentro de su plano.
class Actor {
  constructor(hoja, { altura = HERO_HEIGHT, sombra = 0.6, plano, mira = 0 } = {}) {
    this.root = new THREE.Group();
    this.skin = new SpriteSkin(hoja, { height: altura });
    this.root.add(this.skin.sprite);
    this.root.add(blobShadow(sombra));
    this.plano = plano;
    this.ruta = [];
    this.mira = mira;            // ángulo o actor al que mirar cuando no anda
    this.ataques = [];
    this.golpes = [];
    this.muerte = Infinity;
    this.lift = 0;
    this.yaAtaco = new Set();
    scene.add(this.root);
    actores.push(this);
  }
  por(...puntos) { this.ruta.push(...puntos); return this; }
  ataca(...ts) { this.ataques.push(...ts); return this; }

  posicion(t) {
    const r = this.ruta;
    if (!r.length) return [0, 0, false];
    if (t <= r[0][0]) return [r[0][1], r[0][2], false];
    for (let i = 0; i < r.length - 1; i++) {
      const [t0, x0, z0] = r[i], [t1, x1, z1] = r[i + 1];
      if (t >= t0 && t <= t1) {
        const u = (t - t0) / Math.max(1e-6, t1 - t0);
        return [x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, Math.hypot(x1 - x0, z1 - z0) > 0.01];
      }
    }
    const u = r[r.length - 1];
    return [u[1], u[2], false];
  }

  actualizar(t, dt, yaw, plano) {
    const visible = plano === this.plano && t < this.muerte + 0.7;
    this.root.visible = visible;
    if (!visible) return;
    const [x, z, anda] = this.posicion(t);
    let rot = this.rotActual ?? 0;
    if (anda) {
      const [x2, z2] = this.posicion(t + 0.05);
      if (Math.hypot(x2 - x, z2 - z) > 1e-4) rot = Math.atan2(x2 - x, z2 - z);
    } else if (this.mira instanceof Actor) {
      const [mx, mz] = this.mira.posicion(t);
      rot = Math.atan2(mx - x, mz - z);
    } else rot = this.mira;
    this.rotActual = rot;
    for (const ta of this.ataques) if (t >= ta && !this.yaAtaco.has(ta) && t < ta + 0.3) { this.yaAtaco.add(ta); this.skin.playAttack(); }
    this.skin.update(dt, rot, anda && t < this.muerte, yaw);
    // Destello al recibir un golpe; al morir se oscurece y se hunde
    let tinte = [1, 1, 1];
    for (const tg of this.golpes) if (t >= tg && t < tg + 0.14) tinte = [1, 0.45, 0.45];
    let hunde = 0;
    if (t >= this.muerte) {
      const k = Math.min(1, (t - this.muerte) / 0.6);
      tinte = [1 - k * 0.6, 0.3 - k * 0.2, 0.3 - k * 0.2];
      hunde = k * 1.2;
    }
    this.skin.setTint(...tinte);
    this.root.position.set(x, heightAt(x, z) + this.lift - hunde, z);
  }
  // Punto del mundo a media altura (para efectos)
  centro(t) {
    const [x, z] = this.posicion(t);
    return new THREE.Vector3(x, heightAt(x, z) + this.lift + this.skin.sprite.scale.y * 0.55, z);
  }
}

const heroe = (raza, clase, op) => new Actor(heroSheet(raza, clase), op);
const npc = (id, op) => new Actor(npcSheet(id), op);
function criatura(tipo, op = {}) {
  const info = MOB_INFO[tipo];
  const agranda = info.scale > 1.2 ? 1 + (info.scale - 1) * 0.75 : 1;
  return new Actor(creatureSheet(tipo, info), { altura: HERO_HEIGHT * agranda, sombra: 0.9 * agranda, ...op });
}

// Jinete: el héroe entre las dos capas de su montura (como en el juego).
class Jinete extends Actor {
  constructor(raza, clase, montura, op) {
    super(heroSheet(raza, clase), op);
    const hoja = mountSheet(montura, 'detras');
    const alto = HERO_HEIGHT * hoja.frameH / 48;
    this.atras = new SpriteSkin(hoja, { height: alto });
    this.delante = new SpriteSkin(mountSheet(montura, 'delante'), { height: alto });
    this.gAtras = new THREE.Group(); this.gAtras.add(this.atras.sprite); this.gAtras.add(blobShadow(1.4));
    this.gDelante = new THREE.Group(); this.gDelante.add(this.delante.sprite);
    scene.add(this.gAtras, this.gDelante);
    this.root.children[1].visible = false;     // la sombra la pone la montura
  }
  actualizar(t, dt, yaw, plano) {
    // Altura del jinete: su cadera, en pantalla, a la altura de la silla
    const vista = new THREE.Vector3(); camera.getWorldDirection(vista);
    this.lift = 1.3 / Math.max(0.35, Math.sqrt(1 - vista.y * vista.y));
    super.actualizar(t, dt, yaw, plano);
    const vis = this.root.visible;
    this.gAtras.visible = this.gDelante.visible = vis;
    if (!vis) return;
    const [x, z, anda] = this.posicion(t);
    const y = heightAt(x, z);
    this.atras.update(dt, this.rotActual, anda, yaw);
    this.delante.update(dt, this.rotActual, anda, yaw);
    this.gAtras.position.set(x, y, z).addScaledVector(vista, 0.35);
    this.gDelante.position.set(x, y, z).addScaledVector(vista, -0.35);
  }
}

// ================================================================ efectos
// Se dibujan en un lienzo a la resolución del mundo (800x450) y se escalan
// sin suavizado: así los números y los tajos son píxeles como todo lo demás.
const fx = document.createElement('canvas');
fx.width = FW; fx.height = FH;
const fctx = fx.getContext('2d');
const efectos = [];
const sacudidas = [];

function proyecta(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * FW, y: (1 - p.y) / 2 * FH, fuera: p.z > 1 };
}

const efecto = {
  numero(t, actor, texto, color = '#ffffff', grande = false) { efectos.push({ tipo: 'numero', t, dur: 0.9, actor, texto, color, grande }); },
  tajo(t, actor) { efectos.push({ tipo: 'tajo', t, dur: 0.22, actor, lado: Math.random() < 0.5 ? 1 : -1 }); },
  flecha(t, de, a) { efectos.push({ tipo: 'flecha', t, dur: 0.22, de, a }); },
  rayo(t, de, a) { efectos.push({ tipo: 'rayo', t, dur: 0.3, de, a }); },
  luz(t, actor) { efectos.push({ tipo: 'luz', t, dur: 0.8, actor }); },
  chispas(t, actor, color = '#ffd06a') {
    const p = Array.from({ length: 9 }, () => [Math.random() * Math.PI * 2, 18 + Math.random() * 30]);
    efectos.push({ tipo: 'chispas', t, dur: 0.35, actor, color, p });
  },
  sacude(t, fuerza = 0.5, dur = 0.25) { sacudidas.push({ t, fuerza, dur }); },
};

// Golpe completo: el atacante ataca, el blanco destella, chispas y número
function golpe(t, de, a, dano, { critico = false, tipo = 'tajo' } = {}) {
  if (de) de.ataca(t - 0.08);
  a.golpes.push(t);
  if (tipo === 'tajo') efecto.tajo(t, a);
  if (tipo === 'flecha') efecto.flecha(t - 0.2, de, a);
  if (tipo === 'rayo') efecto.rayo(t - 0.25, de, a);
  efecto.chispas(t, a, critico ? '#ffe680' : '#ffd06a');
  efecto.numero(t, a, critico ? `¡${dano}!` : String(dano), critico ? '#ffd24a' : '#ffffff', critico);
  if (critico) efecto.sacude(t, 0.7, 0.3);
}

const FUENTE_PIXEL = '"Press Start 2P", monospace';

function dibujarEfectos(t) {
  fctx.clearRect(0, 0, FW, FH);
  fctx.imageSmoothingEnabled = false;
  for (const e of efectos) {
    const u = (t - e.t) / e.dur;
    if (u < 0 || u > 1) continue;
    if (e.tipo === 'numero') {
      const p = proyecta(e.actor.centro(e.t));
      const y = p.y - 16 - u * 22;
      fctx.globalAlpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      fctx.font = `${e.grande ? 16 : 8}px ${FUENTE_PIXEL}`;
      fctx.textAlign = 'center';
      fctx.lineWidth = 3; fctx.strokeStyle = '#140c18';
      const escala = e.grande && u < 0.15 ? 1 + (0.15 - u) * 4 : 1;
      fctx.save(); fctx.translate(Math.round(p.x), Math.round(y)); fctx.scale(escala, escala);
      fctx.strokeText(e.texto, 0, 0); fctx.fillStyle = e.color; fctx.fillText(e.texto, 0, 0);
      fctx.restore();
    } else if (e.tipo === 'tajo') {
      const p = proyecta(e.actor.centro(e.t));
      fctx.globalAlpha = 1 - u;
      fctx.strokeStyle = '#fff8e0'; fctx.lineWidth = 2;
      fctx.beginPath();
      const a0 = -2.2 * e.lado, barrido = 2.6 * Math.min(1, u * 2.5) * e.lado;
      fctx.arc(p.x, p.y, 13, a0, a0 + barrido, e.lado < 0);
      fctx.stroke();
    } else if (e.tipo === 'flecha' || e.tipo === 'rayo') {
      const a = proyecta(e.de.centro(e.t)), b = proyecta(e.a.centro(e.t));
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      fctx.globalAlpha = 1;
      if (e.tipo === 'flecha') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        fctx.strokeStyle = '#e8dcc0'; fctx.lineWidth = 1;
        fctx.beginPath(); fctx.moveTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7); fctx.lineTo(x, y); fctx.stroke();
        fctx.fillStyle = '#ffffff'; fctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else {
        fctx.fillStyle = '#ffe9a0'; fctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
        fctx.fillStyle = '#fff'; fctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    } else if (e.tipo === 'luz') {
      const p = proyecta(e.actor.centro(e.t));
      fctx.globalAlpha = Math.sin(u * Math.PI) * 0.8;
      const g = fctx.createLinearGradient(0, p.y - 50, 0, p.y + 14);
      g.addColorStop(0, 'rgba(160,255,190,0)'); g.addColorStop(1, 'rgba(160,255,190,0.9)');
      fctx.fillStyle = g; fctx.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 50, 14, 64);
      fctx.fillStyle = '#d8ffe0';
      for (let k = 0; k < 6; k++) fctx.fillRect(Math.round(p.x - 6 + ((k * 5) % 12)), Math.round(p.y + 10 - ((u * 60 + k * 9) % 56)), 1, 2);
    } else if (e.tipo === 'chispas') {
      const p = proyecta(e.actor.centro(e.t));
      fctx.globalAlpha = 1 - u;
      fctx.fillStyle = e.color;
      for (const [ang, v] of e.p) fctx.fillRect(Math.round(p.x + Math.cos(ang) * v * u), Math.round(p.y + Math.sin(ang) * v * u * 0.7), 2, 2);
    }
  }
  fctx.globalAlpha = 1;
}

// ================================================================ los planos
// Cada plano: cuándo empieza y acaba, qué ambiente tiene y qué hace la cámara
// (posición y punto al que mira, en función de u = 0..1 dentro del plano).
const suelo = (x, z, dy = 0) => [x, heightAt(x, z) + dy, z];
const mezcla = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const suave = (u) => u * u * (3 - 2 * u);
const enOrbita = (cx, cz, r, h, ang, dyMira = 2) => ({ pos: [cx + Math.sin(ang) * r, heightAt(cx, cz) + h, cz + Math.cos(ang) * r], mira: suelo(cx, cz, dyMira) });

// La bahía del naufragio, para el plano inicial
const A_BAHIA = -0.12, R_BAHIA = radioCosta(A_BAHIA);
const enBahia = (r, y) => [Math.cos(A_BAHIA) * r, y, Math.sin(A_BAHIA) * r];

// La costa norte, para el jinete
const costaNorte = (a, dentro) => { const R = radioCosta(a) - dentro; return [Math.cos(a) * R, Math.sin(a) * R]; };

const PLANOS = [
  { // 0 · El mar y la leyenda
    desde: 0, hasta: 6, niebla: 0.0035,
    camara: (u) => ({ pos: enBahia(R_BAHIA + 125 - 85 * suave(u), 30 - 10 * suave(u)), mira: enBahia(R_BAHIA - 6 - 10 * u, -1) }),
    carteles: [[0.9, 5.4, 'Hace siglos, la oscuridad cubrió Valdoria.']],
  },
  { // 1 · La Ciudadela desde el camino
    desde: 6, hasta: 13, niebla: 0.006,
    camara: (u) => ({ pos: mezcla([0, 5.5, 100], [0, 38, 80], suave(u)), mira: mezcla([0, 9, 42], [0, 0, 8], suave(u)) }),
    carteles: [[6.6, 12.4, 'Solo una ciudadela resistió.']],
  },
  { // 2 · La plaza: NPCs, fuente y héroes que llegan
    desde: 13, hasta: 19.5, niebla: 0.008,
    camara: (u) => enOrbita(0, 0, 25, 14, 0.55 - u * 0.75, 2.5),
    carteles: [[13.4, 19.1, 'Un MMORPG de fantasía oscura en pixel art']],
  },
  { // 3 · El bosque
    desde: 19.5, hasta: 25.5, niebla: 0.008,
    camara: (u) => {
      const h = mezcla([-91, 0, 63], [-107, 0, 75], u);
      return { pos: suelo(h[0] + 9, h[2] + 15, 13), mira: suelo(h[0], h[2], 1.5) };
    },
    carteles: [[19.9, 25.1, 'Explora un continente vivo']],
  },
  { // 4 · La ciénaga
    desde: 25.5, hasta: 29.5, niebla: 0.011,
    camara: (u) => ({ pos: suelo(-118, -30 - 6 * u, 14 - 2 * u), mira: suelo(-120, -52, 1) }),
    carteles: [[25.8, 29.2, 'Ciénagas malditas']],
  },
  { // 5 · Las cumbres
    desde: 29.5, hasta: 33, niebla: 0.008,
    camara: (u) => ({ pos: suelo(122 + 14 * u, 168, 15), mira: suelo(130 + 6 * u, 148, 2) }),
    carteles: [[29.8, 32.8, 'Cumbres heladas']],
  },
  { // 6 · Combate en grupo contra la manada
    desde: 33, hasta: 37, niebla: 0.008,
    camara: (u) => ({ pos: suelo(-4 + 2 * u, 101.5 + u, 10.5 - u), mira: suelo(0, 113.5, 1.5) }),
    carteles: [[33.3, 36.8, 'Combate en tiempo real · Juega en grupo']],
  },
  { // 7 · El Alfa Sombrío
    desde: 37, hasta: 41, niebla: 0.008,
    camara: (u) => ({ pos: suelo(-10 + 4 * u, 127 - 2 * u, 10), mira: suelo(0, 111, 2) }),
    carteles: [[37.3, 40.8, 'Botín legendario · Ecos · Poderes únicos']],
  },
  { // 8 · El Coloso
    desde: 41, hasta: 45, niebla: 0.007,
    camara: (u) => ({ pos: suelo(2 - 2 * u, 186 - 8 * suave(u), 9 - 1.5 * u), mira: suelo(0, 151, 5.5) }),
    carteles: [[41.4, 44.8, 'Jefes de mundo que exigen un grupo']],
  },
  { // 9 · La cripta
    desde: 45, hasta: 50, niebla: 0.03, cripta: true,
    camara: (u) => ({ pos: [500, 13 - 3 * u, -50 - 6 * suave(u)], mira: [500, 2, -76] }),
    carteles: [[45.4, 49.8, 'Desciende a las criptas… y a Las Profundidades']],
  },
  { // 10 · A caballo por la costa
    desde: 50, hasta: 55, niebla: 0.006,
    camara: (u) => {
      const a = -1.86 + 0.2 * u;
      const [x, z] = costaNorte(a, 9);
      const [ix, iz] = costaNorte(a, 19);
      return { pos: [ix, heightAt(ix, iz) + 9, iz], mira: suelo(x, z, 1.5) };
    },
    carteles: [[50.3, 54.8, 'Monturas · Gremios · Subastas · Encargos']],
  },
  { // 11 · El título
    desde: 55, hasta: DURACION, niebla: 0.004,
    camara: (u) => {
      const k = suave(Math.min(1, u / 0.75));
      return { pos: mezcla([0, 7, 14], [0, 95, 125], k), mira: mezcla([0, 4.5, 0], [0, 0, -10], k) };
    },
    carteles: [],
  },
];

// ================================================================ reparto
function reparto() {
  // Plano 1: tres héroes suben el camino hacia la puerta sur
  heroe('humano', 'guerrero', { plano: 1 }).por([6, -1.5, 76], [13, -1.5, 58]);
  heroe('elfo', 'explorador', { plano: 1 }).por([6, 1.5, 78], [13, 1.5, 60]);
  heroe('enano', 'sacerdote', { plano: 1 }).por([6, 0, 80.5], [13, 0, 62.5]);

  // Plano 2: los NPCs en su sitio y el grupo que llega a la fuente
  for (const [id, x, z] of [['aldric', 3.5, -7], ['bramm', 14, -12], ['lyra', -16, 9.5], ['mira', -4, -19.5], ['establo', 21, 14.5], ['subastas', -24, 12.5], ['toran', 4, 36]]) {
    npc(id, { plano: 2, mira: Math.atan2(-x, -z) }).por([0, x, z]);
  }
  heroe('humano', 'guerrero', { plano: 2, mira: Math.PI }).por([13, -2, 30], [18, -2, 9]);
  heroe('elfo', 'explorador', { plano: 2, mira: Math.PI }).por([13.3, 1.5, 32], [18.6, 2, 10.5]);
  heroe('orco', 'sacerdote', { plano: 2, mira: Math.PI }).por([13.6, 0, 34], [19, 0, 12]);

  // Plano 3: una exploradora cruza el bosque; dos jabalíes salen de la espesura
  heroe('elfo', 'explorador', { plano: 3 }).por([19.5, -91, 63], [25.5, -107, 75]);
  criatura('jabali', { plano: 3 }).por([19.5, -112, 62], [21, -112, 62], [23.5, -101, 70], [25.5, -96, 76]);
  criatura('jabali', { plano: 3 }).por([19.5, -116, 66], [21.6, -116, 66], [24.5, -104, 73]);

  // Plano 4: ahogados que avanzan entre las charcas
  criatura('ahogado', { plano: 4 }).por([25.5, -124, -60], [29.5, -122, -48]);
  criatura('ahogado', { plano: 4 }).por([25.5, -114, -62], [29.5, -115, -50]);
  criatura('chaman_cienaga', { plano: 4 }).por([25.5, -120, -66], [29.5, -119, -56]);

  // Plano 5: lobos de escarcha a la carrera y un troll en el santuario
  for (const [dz, d] of [[0, 0], [3, 0.25], [-2.5, 0.45]]) {
    criatura('lobo_escarcha', { plano: 5 }).por([29.5 + d, 116, 150 + dz], [33, 146, 146 + dz]);
  }
  criatura('troll_hielo', { plano: 5, mira: 0.3 }).por([29.5, 136, 154]);

  // Planos 6 y 7: el grupo contra la manada y luego contra el Alfa
  const pos = { g: [0, 116], e: [4.5, 118.5], s: [-4.5, 118.5] };
  const g = heroe('humano', 'guerrero', { plano: 6, mira: Math.PI }).por([33, ...pos.g], [33.7, 0, 114.2]);
  const e = heroe('elfo', 'explorador', { plano: 6, mira: Math.PI }).por([33, ...pos.e]);
  const s = heroe('enano', 'sacerdote', { plano: 6, mira: Math.PI }).por([33, ...pos.s]);
  const l1 = criatura('lobo', { plano: 6 }).por([33, -14, 106], [34, -2.6, 111.6]);
  const l2 = criatura('lobo', { plano: 6 }).por([33, 13, 104], [34.1, 0.2, 112]);
  const l3 = criatura('lobo', { plano: 6 }).por([33, 15, 109], [34, 3.8, 112.2]);
  l1.mira = g; l2.mira = g; l3.mira = e; g.mira = l2; e.mira = l3; s.mira = l1;
  golpe(34.2, l1, g, 6); golpe(34.9, l3, e, 5);
  golpe(34.15, g, l2, 18); golpe(34.65, g, l2, 21); golpe(35.15, g, l2, 47, { critico: true }); l2.muerte = 35.2;
  for (const [t, d, c] of [[34.0, 14], [34.5, 16], [35.0, 15], [35.5, 52, true]]) golpe(t, e, l3, d, { tipo: 'flecha', critico: !!c });
  l3.muerte = 35.55;
  efecto.luz(34.8, g); efecto.numero(34.85, g, '+32', '#8affa8');
  golpe(35.4, s, l1, 19, { tipo: 'rayo' });
  g.ataca(35.6); golpe(35.7, g, l1, 24); golpe(36.2, g, l1, 31, { critico: true }); l1.muerte = 36.25;
  // Cambio de blanco tras cada muerte
  const cambia = (actor, blancos) => { const orig = actor.actualizar.bind(actor); actor.actualizar = (t, ...r) => { for (const [desde, b] of blancos) if (t >= desde) actor.mira = b; return orig(t, ...r); }; };
  cambia(g, [[35.25, l1]]);
  cambia(e, [[35.6, l1]]);

  const g2 = heroe('humano', 'guerrero', { plano: 7, mira: Math.PI }).por([37, 0, 114.2]);
  const e2 = heroe('elfo', 'explorador', { plano: 7, mira: Math.PI }).por([37, ...pos.e]);
  const s2 = heroe('enano', 'sacerdote', { plano: 7, mira: Math.PI }).por([37, ...pos.s]);
  const alfa = criatura('alfa', { plano: 7 }).por([37, 0, 95], [37.7, 0, 110.4]);
  alfa.mira = g2; g2.mira = alfa; e2.mira = alfa; s2.mira = alfa;
  golpe(37.85, alfa, g2, 14); efecto.sacude(37.85, 0.6, 0.3);
  golpe(38.65, alfa, g2, 17); efecto.sacude(38.65, 0.6, 0.3);
  golpe(38.0, g2, alfa, 22); golpe(38.5, g2, alfa, 25); golpe(39.0, g2, alfa, 23); golpe(39.5, g2, alfa, 28);
  for (const t of [38.2, 38.8, 39.4]) golpe(t, e2, alfa, 16 + Math.round(t * 3) % 7, { tipo: 'flecha' });
  efecto.luz(38.95, g2); efecto.numero(39.0, g2, '+41', '#8affa8');
  golpe(39.2, s2, alfa, 21, { tipo: 'rayo' });
  golpe(40.0, g2, alfa, 89, { critico: true }); efecto.sacude(40.0, 1.1, 0.4);
  alfa.muerte = 40.1;

  // Plano 8: el Coloso frente al grupo
  const coloso = criatura('coloso', { plano: 8 }).por([41, 0, 148], [42.4, 0, 151.5], [44.2, 0, 153]);
  for (const [x, z] of [[-3.5, 160.5], [0, 162], [3.5, 160.5]]) {
    heroe(x < 0 ? 'enano' : x > 0 ? 'elfo' : 'humano', x < 0 ? 'sacerdote' : x > 0 ? 'explorador' : 'guerrero', { plano: 8, mira: coloso }).por([41, x, z]);
  }
  coloso.mira = 0;
  coloso.ataca(43.3); efecto.sacude(43.45, 1.4, 0.5);

  // Plano 9: el Señor de la Cripta en su trono, con su guardia
  const senor = criatura('senor_cripta', { plano: 9, mira: 0 }).por([45, 500, -77]);
  criatura('esqueleto', { plano: 9, mira: 0 }).por([45, 494, -71]);
  criatura('esqueleto', { plano: 9, mira: 0 }).por([45, 506, -71]);
  senor.ataca(48.2); efecto.sacude(48.35, 0.8, 0.35);

  // Plano 10: el jinete por la playa
  const ruta = [];
  for (let k = 0; k <= 10; k++) {
    const a = -1.95 + 0.42 * (k / 10);
    ruta.push([50 + k * 0.5, ...costaNorte(a, 9)]);
  }
  new Jinete('humano', 'guerrero', 'corcel', { plano: 10 }).por(...ruta);
}
reparto();

// ================================================================ carteles
const salida = document.getElementById('salida');
salida.width = W; salida.height = H;
const sctx = salida.getContext('2d');

function cartel(texto, u, y = H - BARRA - 70, tam = 46) {
  const a = Math.min(1, u * 6, (1 - u) * 6);
  if (a <= 0) return;
  sctx.save();
  sctx.globalAlpha = a;
  sctx.font = `${tam}px "Pixelify Sans", monospace`;
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.lineJoin = 'round';
  const dy = (1 - Math.min(1, u * 5)) * 10;
  sctx.lineWidth = 9; sctx.strokeStyle = 'rgba(14,8,18,0.9)';
  sctx.strokeText(texto, W / 2, y + dy);
  sctx.fillStyle = '#f2dc9a';
  sctx.fillText(texto, W / 2, y + dy);
  sctx.restore();
}

function logo(t) {
  const u = t - 55.4;
  if (u < 0) return;
  const a = Math.min(1, u / 0.6);
  sctx.save();
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  // Resplandor detrás del título
  const g = sctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, 700);
  g.addColorStop(0, `rgba(255,190,90,${0.22 * a})`); g.addColorStop(1, 'rgba(255,190,90,0)');
  sctx.fillStyle = g; sctx.fillRect(0, 0, W, H);
  const escala = 1 + (1 - Math.min(1, u / 0.5)) * 0.25;
  sctx.translate(W / 2, H * 0.4); sctx.scale(escala, escala);
  sctx.globalAlpha = a;
  for (const [txt, y, tam] of [['CIUDADELA', -58, 92], ['DE VALDORIA', 52, 72]]) {
    sctx.font = `${tam}px "Press Start 2P", monospace`;
    sctx.lineWidth = 16; sctx.strokeStyle = '#120a10'; sctx.strokeText(txt, 0, y + 8);
    sctx.lineWidth = 10; sctx.strokeStyle = '#3a1e10'; sctx.strokeText(txt, 0, y);
    const oro = sctx.createLinearGradient(0, y - tam / 2, 0, y + tam / 2);
    oro.addColorStop(0, '#fff2b0'); oro.addColorStop(0.5, '#e8b24a'); oro.addColorStop(1, '#9a5a1a');
    sctx.fillStyle = oro; sctx.fillText(txt, 0, y);
  }
  sctx.restore();
  const sub = (desde, txt, y, tam, color) => {
    const k = Math.min(1, Math.max(0, (t - desde) / 0.6));
    if (!k) return;
    sctx.save(); sctx.globalAlpha = k; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
    sctx.font = `${tam}px "Pixelify Sans", monospace`;
    sctx.lineWidth = 8; sctx.strokeStyle = 'rgba(14,8,18,0.9)'; sctx.strokeText(txt, W / 2, y);
    sctx.fillStyle = color; sctx.fillText(txt, W / 2, y); sctx.restore();
  };
  sub(56.6, 'MMORPG gratuito · Juega en tu navegador', H * 0.62, 48, '#f2dc9a');
  sub(57.8, URL_JUEGO, H * 0.71, 40, '#9ad8ff');
}

function componer(t, plano) {
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(renderer.domElement, 0, 0, W, H);
  sctx.drawImage(fx, 0, 0, W, H);
  // Viñeta: bordes más oscuros, mirada al centro
  const v = sctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  sctx.fillStyle = v; sctx.fillRect(0, 0, W, H);
  // Carteles del plano
  for (const [a, b, texto] of plano.carteles) if (t >= a && t <= b) cartel(texto, (t - a) / (b - a));
  logo(t);
  // Bandas de cine
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, W, BARRA); sctx.fillRect(0, H - BARRA, W, BARRA);
  // Fundidos: entrada, cortes y salida; destello blanco en los golpes
  let negro = 0;
  if (t < 1.2) negro = 1 - t / 1.2;
  for (const p of PLANOS) {
    const d = t - p.desde;
    if (p.desde > 0 && d >= 0 && d < 0.18) negro = Math.max(negro, 1 - d / 0.18);
  }
  if (t > 63.5) negro = Math.min(1, (t - 63.5) / 2.2);
  if (negro > 0) { sctx.fillStyle = `rgba(0,0,0,${negro})`; sctx.fillRect(0, 0, W, H); }
  for (const tf of [6, 33, 55]) {
    const d = t - tf;
    if (d >= 0 && d < 0.35) { sctx.fillStyle = `rgba(255,244,220,${(1 - d / 0.35) * 0.7})`; sctx.fillRect(0, 0, W, H); }
  }
}

// ================================================================ fotograma
let tPrevio = 0;
function fotograma(t) {
  const dt = Math.max(0, Math.min(0.1, t - tPrevio));
  tPrevio = t;
  const indice = PLANOS.findIndex((p) => t >= p.desde && t < p.hasta);
  const plano = PLANOS[indice < 0 ? PLANOS.length - 1 : indice];
  const u = Math.min(1, (t - plano.desde) / (plano.hasta - plano.desde));
  const { pos, mira } = plano.camara(u);

  // Sacudida de cámara
  let sx = 0, sy = 0;
  for (const s of sacudidas) {
    const d = t - s.t;
    if (d >= 0 && d < s.dur) { const k = s.fuerza * (1 - d / s.dur); sx += (Math.random() - 0.5) * k; sy += (Math.random() - 0.5) * k; }
  }
  camera.position.set(pos[0] + sx, pos[1] + sy, pos[2]);
  camera.lookAt(mira[0], mira[1], mira[2]);
  camera.updateMatrixWorld();
  const yaw = Math.atan2(-(mira[0] - pos[0]), -(mira[2] - pos[2]));

  // Ambiente: superficie o cripta
  const { sun, hemi, ambient } = refs.lights;
  const c = plano.cripta ? 1 : 0;
  sun.intensity = 1.15 * (1 - c) + 0.06 * c;
  hemi.intensity = 0.5 * (1 - c) + 0.08 * c;
  ambient.intensity = 0.55 * (1 - c) + 0.3 * c;
  scene.fog.color.copy(c ? FOG_CRIPTA : FOG_SUPERFICIE);
  scene.fog.density = plano.niebla;
  scene.background.copy(scene.fog.color);
  if (refs.sky) { refs.sky.visible = !c; refs.sky.position.set(camera.position.x, 0, camera.position.z); }

  animateWorld(refs, t);
  for (const a of actores) a.actualizar(t, dt, yaw, PLANOS.indexOf(plano));
  pipe.render(scene, camera);
  dibujarEfectos(t);
  componer(t, plano);
}

// ================================================================ reproducción y grabación
const estado = document.getElementById('estado');
let inicio = 0, corriendo = false, grabador = null, trozos = [], audio = null, capturas = [];
const MOMENTOS_CAPTURA = [3.5, 10.5, 16.5, 22.5, 27.5, 31.5, 35.1, 40.05, 43.6, 47.5, 52.5, 59.5];

async function preparar() {
  await Promise.all([
    document.fonts.load('46px "Pixelify Sans"'),
    document.fonts.load('72px "Press Start 2P"'),
  ]);
}

function bucle() {
  if (!corriendo) return;
  const t = (performance.now() - inicio) / 1000;
  if (t >= DURACION) { terminar(); return; }
  fotograma(t);
  if (grabador) {
    while (capturas.length && t >= capturas[0]) {
      const n = MOMENTOS_CAPTURA.length - capturas.length + 1;
      capturas.shift();
      salida.toBlob((b) => subir(b, `captura-${String(n).padStart(2, '0')}.png`), 'image/png');
    }
    estado.textContent = `Grabando… ${t.toFixed(1)} / ${DURACION} s`;
  }
  requestAnimationFrame(bucle);
}

async function arrancar({ grabar = false, desde = 0 } = {}) {
  await preparar();
  const AC = window.AudioContext || window.webkitAudioContext;
  audio = new AC();
  const destinoGrabacion = audio.createMediaStreamDestination();
  const mezclaAudio = audio.createGain();
  mezclaAudio.connect(audio.destination);
  mezclaAudio.connect(destinoGrabacion);
  if (desde === 0) tocarBandaSonora(audio, mezclaAudio, audio.currentTime + 0.05);

  if (grabar) {
    const pista = salida.captureStream(60);
    for (const tr of destinoGrabacion.stream.getAudioTracks()) pista.addTrack(tr);
    const tipos = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
    const tipo = tipos.find((m) => MediaRecorder.isTypeSupported(m));
    grabador = new MediaRecorder(pista, { mimeType: tipo, videoBitsPerSecond: 16_000_000, audioBitsPerSecond: 192_000 });
    trozos = [];
    grabador.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
    grabador.start(1000);
    capturas = [...MOMENTOS_CAPTURA];
  }
  tPrevio = desde;
  inicio = performance.now() + 50 - desde * 1000;
  corriendo = true;
  requestAnimationFrame(bucle);
}

async function terminar() {
  corriendo = false;
  fotograma(DURACION - 0.01);
  if (grabador) {
    const g = grabador;
    grabador = null;
    await new Promise((r) => { g.onstop = r; g.stop(); });
    const ext = g.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(trozos, { type: g.mimeType });
    estado.textContent = `Subiendo el vídeo (${(blob.size / 1e6).toFixed(1)} MB)…`;
    const ok = await subir(blob, `trailer-valdoria.${ext}`);
    estado.textContent = ok ? `Listo: marketing/trailer-valdoria.${ext} (${(blob.size / 1e6).toFixed(1)} MB, ${g.mimeType})` : 'No se pudo guardar: descárgalo con el enlace';
    const a = document.getElementById('descargar');
    a.href = URL.createObjectURL(blob); a.download = `trailer-valdoria.${ext}`; a.hidden = false;
    window.__trailerListo = { bytes: blob.size, tipo: g.mimeType, ok };
  } else estado.textContent = 'Fin';
  setTimeout(() => audio?.close(), 500);
}

async function subir(blob, nombre) {
  try {
    const r = await fetch(`/subir?nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
    return r.ok;
  } catch { return false; }
}

document.getElementById('ver').onclick = () => arrancar({ desde: Number(new URLSearchParams(location.search).get('t')) || 0 });
document.getElementById('grabar').onclick = () => { document.getElementById('controles').classList.add('grabando'); arrancar({ grabar: true }); };

// Vista fija para revisar un momento concreto: ?t=SEGUNDOS&fijo=1
const params = new URLSearchParams(location.search);
preparar().then(() => {
  const t = Number(params.get('t')) || 0.0;
  tPrevio = t;
  fotograma(Math.max(0.0, t));
});
window.__trailer = { fotograma, DURACION, PLANOS };
