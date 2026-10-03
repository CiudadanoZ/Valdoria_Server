// Minimapa (arriba a la izquierda) y mapa grande (tecla M).
// Dibuja el mundo en 2D: terreno, Ciudadela, caminos, lago, ruinas, portales,
// NPCs con sus marcadores de misión, objetivos de misiones activas, criaturas
// y jugadores. Dentro de una cripta muestra el plano de sus salas.
import { CRYPT_REGIONS, isInCrypt } from './world.js';
import { COMARCAS, colorAt, heightAt, costaDist, biomeAt, contornoCosta, radioCosta, NIVEL_MAR } from './terrain.js';
import { CAMINOS } from './world-data.js';
import { questState } from './quests.js';

let deps = null; // { getPlayerPos, getPlayerRot, npcs, remotes, mobs, portals }
let miniCtx, bigCtx;
let lastMiniDraw = 0;
let bigMapTimer = null;

const COLORS = {
  fondo: '#0d0a08',
  hierba: '#26301d',
  bosque: '#1d2615',
  agua: '#2d5a7e',
  camino: '#4d4034',
  plaza: '#55504a',
  muralla: '#2b2926',
  edificio: '#3a352f',
  ruinas: '#6a665c',
  criptaSuelo: '#3a3742',
  criptaMuro: '#211f26',
  npc: '#ffd97a',
  mob: '#c0392b',
  jugador: '#ffffff',
  remoto: '#7fd4ff',
  mision: '#ffe14a',
};

export function initMinimap(dependencies) {
  deps = dependencies;
  miniCtx = document.getElementById('minimap').getContext('2d');
  bigCtx = document.getElementById('bigmap').getContext('2d');
}

// ---- Región actual: exterior o una de las criptas ----
function regionOf(x) {
  if (!isInCrypt(x)) return null; // exterior
  return CRYPT_REGIONS.find((c) => Math.abs(x - c.origin) <= 90) || null;
}

function sameRegion(x, region) {
  return regionOf(x)?.origin === region?.origin || (!regionOf(x) && !region);
}

// ---- Objetivos de misiones activas en el exterior ----
function questPOIs() {
  const q = questState;
  const pois = [];
  if (q.q2 === 'active') pois.push({ x: 12, z: 14, label: 'Hierbas Lumina (plaza)' });
  if (q.t1 === 'active' || q.t2 === 'active') pois.push({ x: 25, z: 72, label: 'Lobos Grises' });
  if (q.t3 === 'active' && !q.alfaDead) pois.push({ x: 0, z: 113, label: 'Alfa Sombrío' });
  if (q.a1 === 'active' || q.a2 === 'active') pois.push({ x: -33, z: -12, label: 'Criptas (esqueletos)' });
  if (q.a3 === 'active') pois.push({ x: -33, z: -12, label: 'Señor de la Cripta' });
  if (q.b1 === 'active') pois.push({ x: -72, z: 58, label: 'Ratas (Cripta del Bosque)' });
  if (q.b2 === 'active' && !q.guardianDead) pois.push({ x: -72, z: 58, label: 'Guardián Óseo' });
  if (q.c1 === 'active') pois.push({ x: 25, z: 72, label: 'Colmillos de lobo' });
  if (q.c2 === 'active' && !q.centinelaDead) pois.push({ x: 74, z: 28, label: 'Centinela Óseo' });
  if (q.s1 === 'active' || q.s2 === 'active') pois.push({ x: -95, z: -55, label: 'Ciénaga (Ahogados)' });
  if (q.h1 === 'active' || q.h2 === 'active' || q.h3 === 'active') pois.push({ x: 82, z: 82, label: 'Cumbres Heladas' });
  if (q.s3 === 'active' && !q.reyFangoDead) pois.push({ x: -118, z: -92, label: 'Rey del Fango' });
  return pois;
}

// ---- Dibujo compartido ----
// world->canvas: px = W/2 + (x - cx) * s ; py = H/2 + (z - cz) * s
function drawMap(ctx, W, H, s, cx, cz, big) {
  const px = (x) => W / 2 + (x - cx) * s;
  const py = (z) => H / 2 + (z - cz) * s;
  const playerPos = deps.getPlayerPos();
  const region = regionOf(playerPos.x);

  ctx.fillStyle = COLORS.fondo;
  ctx.fillRect(0, 0, W, H);

  if (!region) {
    drawOverworld(ctx, px, py, s, big);
  } else {
    drawCrypt(ctx, px, py, s, region, big);
  }

  // Criaturas vivas de la región
  for (const m of deps.mobs.map.values()) {
    if (m.dead || !sameRegion(m.mesh.position.x, region)) continue;
    dot(ctx, px(m.mesh.position.x), py(m.mesh.position.z), big ? 3 : 2.2, COLORS.mob);
  }

  // Otros jugadores
  for (const p of deps.remotes.players.values()) {
    if (!sameRegion(p.mesh.position.x, region)) continue;
    dot(ctx, px(p.mesh.position.x), py(p.mesh.position.z), big ? 4.5 : 3.5, COLORS.remoto);
    if (big) label(ctx, px(p.mesh.position.x), py(p.mesh.position.z) - 8, p.name, COLORS.remoto, 11);
  }

  // NPCs y sus marcadores (solo en el exterior)
  if (!region) {
    for (const npc of deps.npcs) {
      const nx = px(npc.mesh.position.x), ny = py(npc.mesh.position.z);
      dot(ctx, nx, ny, big ? 4.5 : 3.2, COLORS.npc);
      if (npc.markerSymbol) {
        ctx.fillStyle = '#ffd400';
        ctx.font = `bold ${big ? 16 : 12}px Georgia`;
        ctx.textAlign = 'center';
        ctx.fillText(npc.markerSymbol, nx, ny - (big ? 7 : 5));
      }
      if (big) label(ctx, nx, ny + 14, npc.name, COLORS.npc, 11);
    }

    // Objetivos de misiones activas
    for (const poi of questPOIs()) {
      diamond(ctx, px(poi.x), py(poi.z), big ? 7 : 5, COLORS.mision);
      if (big) label(ctx, px(poi.x), py(poi.z) - 11, poi.label, COLORS.mision, 11);
    }
  }

  // Portales de la región
  for (const portal of deps.portals) {
    const pp = portal.mesh.position;
    if (!sameRegion(pp.x, region)) continue;
    const color = portal.label.includes('Bosque') ? '#8a66ff'
      : portal.label.includes('Colina') ? '#ff8830'
      : portal.label.includes('Valdoria') && portal.label.includes('Entrar') ? '#55ff99'
      : '#ffaa55';
    ring(ctx, px(pp.x), py(pp.z), big ? 6 : 4, color);
    if (big) label(ctx, px(pp.x), py(pp.z) + 16, portal.label, color, 10);
  }

  // El jugador: flecha con su orientación
  drawPlayerArrow(ctx, px(playerPos.x), py(playerPos.z), deps.getPlayerRot(), big ? 9 : 7);
}

// ---- El continente, pintado una vez ----
// Se muestrea el terreno de verdad (color de cada comarca, sombreado del
// relieve con luz del noroeste, playa, fondo marino) en una imagen que luego
// solo se copia. Así el mapa enseña la costa con sus cabos y bahías, y no una
// tarta de colores.
const MAPA_L = 330;            // semilado del área pintada (u)
const MAPA_PX = 440;           // resolución de la imagen
let mapaBase = null;
let centrosComarca = null;

function pintarContinente() {
  const c = document.createElement('canvas');
  c.width = c.height = MAPA_PX;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(MAPA_PX, MAPA_PX);
  const u = (2 * MAPA_L) / MAPA_PX;
  const suma = {};
  for (let j = 0; j < MAPA_PX; j++) {
    for (let i = 0; i < MAPA_PX; i++) {
      const x = -MAPA_L + (i + 0.5) * u, z = -MAPA_L + (j + 0.5) * u;
      const o = (j * MAPA_PX + i) * 4;
      const h = heightAt(x, z);
      let r, g, b;
      // Mar es lo que queda FUERA de la costa y bajo el agua (los islotes
      // asoman); las hondonadas del interior, aunque bajen del nivel del mar,
      // son tierra: el mar 3D solo rodea el continente.
      if (h < NIVEL_MAR && costaDist(x, z) < 0) {
        // Mar: claro en los bajíos, hondo y oscuro mar adentro
        const hondo = Math.min(1, (NIVEL_MAR - h) / 6);
        r = 52 - hondo * 30; g = 92 - hondo * 44; b = 112 - hondo * 40;
      } else {
        let [cr, cg, cb] = colorAt(x, z);
        // En el mapa, cada comarca con su tinte propio: a escala de mapa los
        // verdes del terreno se confundían entre sí
        const tinte = TINTE_MAPA[biomeAt(x, z).id];
        if (tinte && Math.hypot(x, z) > 46 && costaDist(x, z) > 6) {
          cr = cr * 0.45 + tinte[0] * 0.55; cg = cg * 0.45 + tinte[1] * 0.55; cb = cb * 0.45 + tinte[2] * 0.55;
        }
        // Sombreado: laderas que miran al noroeste, más claras
        const dx = heightAt(x + u, z) - heightAt(x - u, z);
        const dz = heightAt(x, z + u) - heightAt(x, z - u);
        const luz = 1 + Math.max(-0.35, Math.min(0.35, (-dx - dz) * 0.22)) + h * 0.012;
        // La nieve, un punto más apagada: a pleno blanco deslumbraba el mapa
        const nieve = (cr + cg + cb) / 3 > 0.75 ? 0.82 : 1;
        r = cr * 255 * luz * nieve; g = cg * 255 * luz * nieve; b = cb * 255 * luz * nieve;
        const rr = Math.hypot(x, z);
        if (rr > 70 && costaDist(x, z) > 12) {
          const id = biomeAt(x, z).id;
          const acc = (suma[id] ||= [0, 0, 0]);
          acc[0] += x; acc[1] += z; acc[2]++;
        }
      }
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Línea de costa, para que el contorno se lea a cualquier escala
  ctx.strokeStyle = 'rgba(20, 16, 12, 0.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  contornoCosta(360).forEach(([x, z], k) => {
    const X = (x + MAPA_L) / u, Y = (z + MAPA_L) / u;
    if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  });
  ctx.closePath();
  ctx.stroke();
  centrosComarca = Object.fromEntries(Object.entries(suma).map(([id, [sx, sz, n]]) => [id, [sx / n, sz / n]]));
  return c;
}

const TINTE_MAPA = {
  llanura: [0.36, 0.48, 0.24], praderas: [0.50, 0.54, 0.28], bosque: [0.16, 0.30, 0.15],
  cienaga: [0.30, 0.30, 0.20], colinas: [0.42, 0.42, 0.30],
};

// Accidentes de la costa con nombre (ángulo, para buscar su orilla)
const NOMBRES_COSTA = [
  [1.62, 'Cabo del Sur'], [2.55, 'Punta de los Robles'], [-0.12, 'Bahía de las Gaviotas'],
  [-1.05, 'Promontorio del Norte'], [-2.62, 'Estuario de la Ciénaga'], [0.88, 'Espolón Helado'],
  [0.66, 'Fiordo del Jarl'], [2.12, 'Golfo de los Robles'], [3.05, 'Lengua de Fango'],
];
const LUGARES = [
  [-30, -102, 'Cementerio'], [32, 52, 'Caravana asaltada'], [-30, 104, 'Granja abandonada'],
  [-122, 70, 'Campamento de cazadores'], [-62, -128, 'Círculo de menhires'], [134, 150, 'Santuario del hielo'],
];

function drawOverworld(ctx, px, py, s, big) {
  mapaBase ||= pintarContinente();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapaBase, px(-MAPA_L), py(-MAPA_L), 2 * MAPA_L * s, 2 * MAPA_L * s);

  // Caminos de tierra
  ctx.strokeStyle = COLORS.camino;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const c of CAMINOS) {
    ctx.lineWidth = Math.max(1.5, c.ancho * s * 0.8);
    ctx.beginPath();
    c.puntos.forEach(([x, z], k) => (k ? ctx.lineTo(px(x), py(z)) : ctx.moveTo(px(x), py(z))));
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

  // Lago y claro del Alfa
  circle(ctx, px(62), py(-52), 16 * s, COLORS.agua);
  circle(ctx, px(0), py(113), 12 * s, COLORS.camino);
  // Ruinas
  circle(ctx, px(0), py(-85), 10 * s, COLORS.ruinas);
  // Camino exterior e interior
  ctx.fillStyle = COLORS.camino;
  ctx.fillRect(px(-3), py(43), 6 * s, 70 * s);
  // Plaza
  circle(ctx, px(0), py(0), 42 * s, COLORS.plaza);
  ctx.fillStyle = '#635d55';
  ctx.fillRect(px(-2.5), py(0), 5 * s, 42 * s);
  // Muralla con hueco de la puerta sur
  ctx.strokeStyle = COLORS.muralla;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath();
  ctx.arc(px(0), py(0), 42 * s, Math.PI / 2 + 0.14, Math.PI / 2 - 0.14 + Math.PI * 2);
  ctx.stroke();
  // Torres
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    dot(ctx, px(Math.cos(a) * 42), py(Math.sin(a) * 42), Math.max(2.5, 4 * s), COLORS.muralla);
  }
  // Edificios y fuente
  for (const [x, z] of [[-20, -18], [20, -18], [-24, 4], [25, 6], [0, -28]]) {
    ctx.fillStyle = COLORS.edificio;
    ctx.fillRect(px(x) - 4 * s, py(z) - 3.5 * s, 8 * s, 7 * s);
  }
  dot(ctx, px(0), py(0), 4.5 * s, COLORS.agua);

  if (big) {
    label(ctx, px(0), py(-46), 'CIUDADELA DE VALDORIA', '#d8c8a0', 12);
    label(ctx, px(62), py(-72), 'Lago de los Ciervos', '#9ac8e8', 11);
    label(ctx, px(0), py(-98), 'Ruinas del norte', '#c8c0b0', 11);
    label(ctx, px(0), py(128), 'Círculo de piedras', '#c8b890', 11);
    // Nombre de cada comarca, en el centro de lo que ocupa de verdad
    for (const c of COMARCAS) {
      const centro = centrosComarca?.[c.id];
      if (centro) label(ctx, px(centro[0]), py(centro[1]), c.name.toUpperCase(), '#f0e6c8', 12);
    }
    for (const [ang, nombre] of NOMBRES_COSTA) {
      const R = radioCosta(ang) + 16;
      label(ctx, px(Math.cos(ang) * R), py(Math.sin(ang) * R), nombre, '#a8d0e0', 10);
    }
    for (const [x, z, nombre] of LUGARES) {
      diamond(ctx, px(x), py(z), 3, '#b8a078');
      label(ctx, px(x), py(z) - 7, nombre, '#d8c8a8', 10);
    }
  }
}

function drawCrypt(ctx, px, py, s, region, big) {
  // Salas (coordenadas locales -> mundo con el origen de la región)
  for (const [x1, z1, x2, z2] of region.rooms) {
    ctx.fillStyle = COLORS.criptaSuelo;
    ctx.strokeStyle = COLORS.criptaMuro;
    ctx.lineWidth = Math.max(2, 1.5 * s);
    const rx = px(region.origin + x1), ry = py(z1);
    ctx.fillRect(rx, ry, (x2 - x1) * s, (z2 - z1) * s);
    ctx.strokeRect(rx, ry, (x2 - x1) * s, (z2 - z1) * s);
  }
  if (big) label(ctx, ctx.canvas.width / 2, 24, region.name.toUpperCase(), '#8a7a8a', 13);
}

// ---- Primitivas ----
function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function dot(ctx, x, y, r, color) {
  circle(ctx, x, y, r, color);
}
function ring(ctx, x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function diamond(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}
function label(ctx, x, y, text, color, size) {
  ctx.font = `${size}px Georgia`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function drawPlayerArrow(ctx, x, y, rot, size) {
  // rot 0 mira a +z (abajo en el mapa); el vector de avance es (sin rot, cos rot)
  const dx = Math.sin(rot), dy = Math.cos(rot);
  ctx.fillStyle = COLORS.jugador;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + dx * size, y + dy * size);
  ctx.lineTo(x - dy * size * 0.55 - dx * size * 0.45, y + dx * size * 0.55 - dy * size * 0.45);
  ctx.lineTo(x + dy * size * 0.55 - dx * size * 0.45, y - dx * size * 0.55 - dy * size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---- Minimapa pequeño (centrado en el jugador, recorte circular) ----
export function updateMinimap() {
  if (!deps) return;
  const now = performance.now();
  if (now - lastMiniDraw < 150) return;
  lastMiniDraw = now;

  const c = miniCtx.canvas;
  const W = c.width, H = c.height;
  miniCtx.save();
  miniCtx.clearRect(0, 0, W, H);
  miniCtx.beginPath();
  miniCtx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
  miniCtx.clip();

  const p = deps.getPlayerPos();
  const scale = regionOf(p.x) ? 2.2 : 0.85;
  drawMap(miniCtx, W, H, scale, p.x, p.z, false);
  miniCtx.restore();
}

// ---- Mapa grande (tecla M) ----
export function toggleMap() {
  const panel = document.getElementById('map-panel');
  const opening = panel.classList.contains('hidden');
  if (bigMapTimer) { clearInterval(bigMapTimer); bigMapTimer = null; }
  panel.classList.toggle('hidden');
  if (opening) {
    drawBigMap();
    bigMapTimer = setInterval(drawBigMap, 500);
  }
}

export function closeMap() {
  const panel = document.getElementById('map-panel');
  if (!panel.classList.contains('hidden')) toggleMap();
}

function drawBigMap() {
  if (!deps) return;
  // Si el panel se cerró con el botón ✕, detener el redibujado
  const panel = document.getElementById('map-panel');
  if (panel.classList.contains('hidden')) {
    if (bigMapTimer) { clearInterval(bigMapTimer); bigMapTimer = null; }
    return;
  }
  const c = bigCtx.canvas;
  const W = c.width, H = c.height;
  const p = deps.getPlayerPos();
  const region = regionOf(p.x);

  if (!region) {
    // Encuadre del continente entero (su caja envolvente, con margen)
    const costa = contornoCosta(180);
    const xs = costa.map(([x]) => x), zs = costa.map(([, z]) => z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const escala = Math.min(W / (maxX - minX + 40), H / (maxZ - minZ + 40));
    drawMap(bigCtx, W, H, escala, (minX + maxX) / 2, (minZ + maxZ) / 2, true);
  } else {
    // Encuadre de la cripta actual: caja envolvente de sus salas
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x1, z1, x2, z2] of region.rooms) {
      minX = Math.min(minX, x1); minZ = Math.min(minZ, z1);
      maxX = Math.max(maxX, x2); maxZ = Math.max(maxZ, z2);
    }
    const scale = Math.min(W / (maxX - minX + 16), H / (maxZ - minZ + 16));
    drawMap(bigCtx, W, H, scale, region.origin + (minX + maxX) / 2, (minZ + maxZ) / 2, true);
  }
}
