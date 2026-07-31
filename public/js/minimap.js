// Minimapa (arriba a la izquierda) y mapa grande (tecla M).
// Dibuja el mundo en 2D: terreno, Ciudadela, caminos, lago, ruinas, portales,
// NPCs con sus marcadores de misión, objetivos de misiones activas, criaturas
// y jugadores. Dentro de una cripta muestra el plano de sus salas.
import { WORLD_RADIUS, CRYPT_REGIONS, isInCrypt } from './world.js';
import { COMARCAS } from './terrain.js';
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

function drawOverworld(ctx, px, py, s, big) {
  // ---- Comarcas: sectores grandes, no manchas ----
  // Cada región ocupa su porción del anillo, igual que en el mundo 3D, así que
  // el mapa se lee como un reino con comarcas que se tocan.
  const cx = px(0), cy = py(0);
  const R = (WORLD_RADIUS + 12) * s;
  for (const c of COMARCAS) {
    // El canvas mide los ángulos igual que atan2(z, x): se puede usar tal cual.
    let from = c.from, to = c.to;
    if (from > to) to += Math.PI * 2;     // sector que cruza ±π
    ctx.fillStyle = '#' + c.color.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, from, to);
    ctx.closePath();
    ctx.fill();
  }
  // El entorno de la Ciudadela es llano y verde: suaviza el centro de la tarta
  circle(ctx, cx, cy, 62 * s, COLORS.hierba);

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
    label(ctx, px(0), py(-46), 'CIUDADELA DE VALDORIA', '#8a7a5a', 12);
    label(ctx, px(62), py(-72), 'Lago de los Ciervos', '#5a8aa8', 11);
    label(ctx, px(0), py(-98), 'Ruinas del norte', '#7a756a', 11);
    label(ctx, px(0), py(128), 'Círculo de piedras', '#7a6a4d', 11);
    // Nombre de cada comarca, colocado en el centro de su sector
    for (const c of COMARCAS) {
      let mid = c.from + (c.to - c.from) / 2;
      if (c.from > c.to) mid = c.from + ((c.to + Math.PI * 2) - c.from) / 2;
      const rr = 148;
      label(ctx, px(Math.cos(mid) * rr), py(Math.sin(mid) * rr), c.name.toUpperCase(), '#9a9482', 11);
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
    drawMap(bigCtx, W, H, W / ((WORLD_RADIUS + 30) * 2), 0, 0, true);
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
