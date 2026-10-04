// Diapositiva de la actualización, compuesta con el motor del juego.
//
// De fondo, una toma real del mundo (buildWorld + PixelPipeline, igual que el
// juego y el tráiler); encima, los paneles con las novedades y el resumen del
// juego, con iconos sacados de los propios sprites. Sale un PNG 1920x1080 que
// scripts/trailer-server.mjs guarda en marketing/.
import * as THREE from 'three';
import { buildWorld, animateWorld, setWorldDetail } from './world.js';
import { PixelPipeline } from './pixel.js';
import { Grid, ramp, darkOf } from './pixelsprites.js';
import { heroSheet } from './pixelfiguras.js';
import { creatureSheet } from './pixelcreatures.js';
import { treeSheet, propSheet } from './pixelprops.js';
import { MOB_INFO } from './enemies.js';
import { heightAt } from './terrain.js';

const W = 1920, H = 1080, PX = 2.4;
const ORO = '#f2dc9a', ORO_FUERTE = '#e8b24a', TEXTO = '#e6dccb', TENUE = '#a89a84', AZUL = '#9ad8ff';
const PIXEL = '"Pixelify Sans", monospace';
const PS2P = '"Press Start 2P", monospace';

// ================================================================ fondo
function fondo() {
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
  const refs = buildWorld(scene);
  setWorldDetail(true);
  if (refs.board?.userData?.marker) refs.board.userData.marker.visible = false;
  if (refs.hatch?.userData?.marker) refs.hatch.userData.marker.visible = false;
  const { sun, hemi, ambient } = refs.lights;
  sun.intensity = 1.15; hemi.intensity = 0.5; ambient.intensity = 0.55;
  scene.fog.color.set(0x1a1220); scene.fog.density = 0.005;
  scene.background.copy(scene.fog.color);
  // La Ciudadela desde el sur, con el ocaso detrás y el continente alrededor
  camera.position.set(-18, 46, 92);
  camera.lookAt(4, 0, -6);
  refs.sky.position.set(camera.position.x, 0, camera.position.z);
  animateWorld(refs, 3);
  pipe.render(scene, camera);
  return renderer.domElement;
}

// ================================================================ iconos
// Un fotograma de una hoja de sprites (fila 0 = de frente)
function fotograma(hoja, col = 0, fila = 0) {
  const fw = hoja.frameW, fh = hoja.frameH;
  const c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  c.getContext('2d').drawImage(hoja, col * fw, fila * fh, fw, fh, 0, 0, fw, fh);
  return c;
}

// Cofre del botín, pintado como el resto del juego
function cofre() {
  const g = new Grid(28, 24, 1.5);
  const madera = ramp(0x7a4a2a), hierro = ramp(0x4a4650), oro = ramp(0xe8b24a), gema = ramp(0x5ad8ff);
  g.block(3, 11, 22, 11, madera);
  for (const x of [3, 13, 23]) g.rect(x, 11, 2, 11, hierro.b);
  g.rect(3, 11, 22, 2, hierro.l);
  // Tapa abierta y el tesoro asomando
  g.block(4, 2, 20, 6, madera); g.rect(4, 2, 20, 1, madera.h);
  g.blob(14, 10, 9, 2.6, oro);
  for (const [x, y] of [[8, 9], [12, 8], [17, 9], [20, 10], [10, 11]]) g.set(x, y, '#fff4c0');
  g.blob(15, 7.5, 1.6, 1.6, gema, true); g.set(14.5, 7, '#ffffff');
  g.rect(12, 14, 4, 4, oro.b); g.set(13, 15, '#2a1a10');
  g.outline(darkOf);
  const c = document.createElement('canvas');
  c.width = g.w; c.height = g.h;
  g.drawTo(c.getContext('2d'), 0, 0);
  return c;
}

// ================================================================ dibujo
function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(16, 10, 14, 0.84)';
  ctx.fillRect(x, y, w, h);
  // Doble marco dorado, como las ventanas del juego
  ctx.strokeStyle = '#c9a55c'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = '#5a4428'; ctx.lineWidth = 2; ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.fillStyle = '#e8c878'; ctx.fillRect(cx - 7, cy - 7, 14, 14);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }
  ctx.restore();
}

function texto(ctx, t, x, y, { tam = 28, color = TEXTO, fuente = PIXEL, alinear = 'left', borde = 6, peso = '' } = {}) {
  ctx.save();
  ctx.font = `${peso} ${tam}px ${fuente}`;
  ctx.textAlign = alinear;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  if (borde) { ctx.lineWidth = borde; ctx.strokeStyle = 'rgba(10,6,10,0.95)'; ctx.strokeText(t, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(t, x, y);
  ctx.restore();
}

// Texto en varias líneas dentro de un ancho
function parrafo(ctx, t, x, y, ancho, { tam = 24, interlinea = 1.3, color = TEXTO } = {}) {
  ctx.font = `${tam}px ${PIXEL}`;
  const palabras = t.split(' ');
  let linea = '', yy = y;
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) {
      texto(ctx, linea, x, yy, { tam, color, borde: 4 }); linea = p; yy += tam * interlinea;
    } else linea = prueba;
  }
  if (linea) texto(ctx, linea, x, yy, { tam, color, borde: 4 });
  return yy;
}

// Escala entera siempre que se pueda (píxeles iguales); si con un entero el
// dibujo quedaría diminuto, se acepta la escala justa.
function icono(ctx, lienzo, cx, cy, cajaW, cajaH = cajaW) {
  const justa = Math.min(cajaW / lienzo.width, cajaH / lienzo.height) * 0.92;
  const esc = justa >= 2 ? Math.floor(justa) : justa;
  const w = lienzo.width * esc, h = lienzo.height * esc;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(lienzo, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
}

// ================================================================ contenido
const NOVEDADES = [
  { titulo: 'Nuevo estilo pixel art', texto: 'Héroes, NPCs, 19 criaturas, monturas y todo el escenario dibujados a mano, al estilo de los RPG de 16 bits.', icono: () => fotograma(heroSheet('humano', 'guerrero')) },
  { titulo: 'Un continente vivo', texto: 'Adiós al mundo redondo: costa con cabos, fiordos e islotes, mar con oleaje, caminos y miles de detalles en cada bioma.', icono: () => treeSheet(1, false) },
  { titulo: 'Las Profundidades', texto: 'Una mazmorra sin fondo bajo la Ciudadela. Cada piso, más duro; sus guardianes guardan el set abisal.', icono: () => fotograma(creatureSheet('senor_cripta', MOB_INFO.senor_cripta)) },
  { titulo: 'Botín aleatorio', texto: '75 objetos, 13 afijos con 4 grados de calidad y 6 poderes legendarios: ningún objeto sale igual que otro.', icono: cofre },
  { titulo: 'Ecos y la forja de Bramm', texto: 'Sigue progresando tras el nivel 15 con 9 Ecos. Bramm retempla y reforja los afijos de tu equipo.', icono: () => propSheet('yunque', 0) },
  { titulo: 'Combate más profundo', texto: 'Crítico, daño crítico, velocidad de ataque, bloqueo y reducción de daño. Y un 91 % menos de tráfico de red.', icono: () => fotograma(heroSheet('elfo', 'explorador'), 7) },
];

const CIFRAS = [
  ['6', 'comarcas'], ['19', 'tipos de criatura'],
  ['6+1', 'jefes + el Coloso'], ['3+1', 'criptas + Profundidades'],
  ['4', 'razas'], ['3', 'clases'],
  ['+20', 'misiones'], ['8', 'piedras rúnicas'],
];

const SISTEMAS = 'Grupos · Gremios · Subastas · Comercio · JcJ · Clasificaciones · Pesca · Cocina · Artesanía · Encargos diarios y semanales · 3 monturas · 2 reinos';

async function componer() {
  await Promise.all([document.fonts.load(`28px ${PIXEL}`), document.fonts.load(`28px ${PS2P}`), document.fonts.load(`bold 28px ${PIXEL}`)]);
  const salida = document.getElementById('salida');
  salida.width = W; salida.height = H;
  const ctx = salida.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fondo(), 0, 0, W, H);

  // Oscurecer los bordes y la franja de título para que el texto respire
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const franja = ctx.createLinearGradient(0, 0, 0, 220);
  franja.addColorStop(0, 'rgba(8,4,8,0.85)'); franja.addColorStop(1, 'rgba(8,4,8,0)');
  ctx.fillStyle = franja; ctx.fillRect(0, 0, W, 220);

  // ---- cabecera
  texto(ctx, 'CIUDADELA DE VALDORIA', 70, 78, { tam: 26, fuente: PS2P, color: ORO_FUERTE, borde: 8 });
  texto(ctx, 'Nueva actualización: El Continente', 66, 158, { tam: 76, color: ORO, borde: 10, peso: 'bold' });
  texto(ctx, 'La mayor actualización hasta la fecha', W - 70, 78, { tam: 30, color: TENUE, alinear: 'right', borde: 6 });

  // ---- novedades
  const NX = 56, NY = 200, NW = 1200, NH = 812;
  panel(ctx, NX, NY, NW, NH);
  texto(ctx, 'NOVEDADES', NX + 36, NY + 66, { tam: 30, fuente: PS2P, color: ORO_FUERTE, borde: 8 });
  const cw = (NW - 36 * 2 - 28) / 2, ch = 218;
  NOVEDADES.forEach((n, i) => {
    const col = i % 2, fila = Math.floor(i / 2);
    const x = NX + 36 + col * (cw + 28), y = NY + 100 + fila * (ch + 16);
    ctx.fillStyle = 'rgba(40, 26, 22, 0.75)'; ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    // Caja del icono
    ctx.fillStyle = 'rgba(12, 8, 12, 0.85)'; ctx.fillRect(x + 16, y + 16, 150, ch - 32);
    ctx.strokeStyle = '#c9a55c'; ctx.strokeRect(x + 16, y + 16, 150, ch - 32);
    icono(ctx, n.icono(), x + 91, y + ch / 2, 140, ch - 44);
    // El título se encoge si no cabe en la tarjeta
    let tt = 34;
    ctx.font = `bold ${tt}px ${PIXEL}`;
    while (ctx.measureText(n.titulo).width > cw - 206 && tt > 22) { tt -= 1; ctx.font = `bold ${tt}px ${PIXEL}`; }
    texto(ctx, n.titulo, x + 186, y + 58, { tam: tt, color: ORO, borde: 6, peso: 'bold' });
    parrafo(ctx, n.texto, x + 186, y + 98, cw - 206, { tam: 23 });
  });

  // ---- el juego
  const JX = 1290, JY = 200, JW = 574, JH = 812;
  panel(ctx, JX, JY, JW, JH);
  texto(ctx, 'EL JUEGO', JX + 36, JY + 66, { tam: 30, fuente: PS2P, color: ORO_FUERTE, borde: 8 });
  const tw = (JW - 72 - 16) / 2, th = 108;
  CIFRAS.forEach(([num, etiqueta], i) => {
    const x = JX + 36 + (i % 2) * (tw + 16), y = JY + 96 + Math.floor(i / 2) * (th + 12);
    ctx.fillStyle = 'rgba(40, 26, 22, 0.75)'; ctx.fillRect(x, y, tw, th);
    ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, tw - 2, th - 2);
    texto(ctx, num, x + 18, y + 58, { tam: 48, fuente: PS2P, color: ORO, borde: 8 });
    // Etiqueta en una sola línea: se encoge si no cabe
    let te = 21;
    ctx.font = `${te}px ${PIXEL}`;
    while (ctx.measureText(etiqueta).width > tw - 30 && te > 14) { te -= 1; ctx.font = `${te}px ${PIXEL}`; }
    texto(ctx, etiqueta, x + 18, y + 92, { tam: te, color: TEXTO, borde: 4 });
  });
  const sy = JY + 96 + 4 * (th + 12) + 22;
  texto(ctx, 'Y además', JX + 36, sy, { tam: 30, color: ORO, borde: 6, peso: 'bold' });
  parrafo(ctx, SISTEMAS, JX + 36, sy + 40, JW - 72, { tam: 23, interlinea: 1.32 });

  // ---- pie
  texto(ctx, 'Juega gratis en tu navegador:', W / 2 - 16, H - 26, { tam: 30, color: TEXTO, alinear: 'right', borde: 6 });
  texto(ctx, 'ciudadela-valdoria.onrender.com', W / 2, H - 26, { tam: 30, color: AZUL, borde: 6, peso: 'bold' });

  const blob = await new Promise((r) => salida.toBlob(r, 'image/png'));
  try {
    const res = await fetch('/subir?nombre=novedades-actualizacion.png', { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
    window.__diapositiva = { ok: res.ok, bytes: blob.size };
  } catch { window.__diapositiva = { ok: false, bytes: blob.size }; }
}

componer();
