// Criaturas en pixel art, pintadas por código igual que los héroes.
//
// Veinte criaturas comparten seis anatomías: cuadrúpedo (lobo, jabalí, rata,
// ciervo, oso), no-muerto (esqueletos y los grandes jefes: el Señor de la
// Cripta, el Jarl y el Coloso), ahogado (con chamán y aparecido helado),
// troll, sanguijuela y masa de cieno. Cada anatomía es un pintor; cada
// criatura, una receta de colores y adornos sobre él.
//
// Mismo formato de hoja que los héroes (tres orientaciones × reposo, paso y
// ataque), así que las anima el mismo SpriteSkin.
import { Grid, ramp, darkOf, buildSheet } from './pixelsprites.js';

// Se pintan a 1,5x su diseño (32 px → 48) para casar con la definición de
// héroes y NPCs: con el píxel de render a 2, 48 px de sprite = 3,4 unidades.
const ESC = 1.5;

const OJO_ROJO = '#ff3a24';
const OJO_AMARILLO = '#f2d23a';
const OJO_HIELO = '#8ff4ff';
const DIENTE = '#efe6d2';

const paso = (anim, f) => (anim === 'walk' ? [0, 2, 0, -2][f] : 0);
const bote = (anim, f) => ((anim === 'walk' && (f === 1 || f === 3)) || (anim === 'idle' && f === 1) ? 1 : 0);

// Pata inclinada: de la cadera al pie, desplazando el pie para dar el paso.
function pata(g, cx, top, bottom, w, despl, r) {
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / Math.max(1, bottom - top);
    const x = Math.round(cx + despl * t);
    g.rect(x, y, w, 1, y === bottom ? r.d : r.b);
    g.set(x, y, y === bottom ? r.d : r.l);
  }
}

// ============================================================ cuadrúpedos

const BESTIAS = {
  lobo:  { cuerpo: [16, 20, 8, 4], cabeza: [25, 16, 4, 3], hocico: 4, orejas: 'punta', cola: 'poblada', patas: [10, 13, 19, 22], pataW: 2, alto: 22 },
  jabali: { cuerpo: [15, 21, 9, 5], cabeza: [25, 21, 4, 3.5], hocico: 3, orejas: 'punta', cola: 'rabito', patas: [9, 12, 18, 21], pataW: 2, alto: 25, colmillos: true, cresta: true },
  rata:  { cuerpo: [16, 26, 5, 2.5], cabeza: [22, 26, 2.5, 2], hocico: 2, orejas: 'redonda', cola: 'fina', patas: [13, 15, 18, 19], pataW: 1, alto: 28 },
  ciervo: { cuerpo: [15, 17, 7, 3.5], cabeza: [24, 9, 2.5, 2], hocico: 3, orejas: 'punta', cola: 'rabito', patas: [10, 12, 19, 21], pataW: 1, alto: 20, cuello: true, astas: true },
  oso:   { cuerpo: [15, 18, 10, 6], cabeza: [25, 17, 4.5, 4], hocico: 3, orejas: 'redonda', cola: 'rabito', patas: [8, 12, 19, 23], pataW: 3, alto: 23 },
  // Monturas: el caballo es un ciervo sin astas, más ancho, con crin y cola larga
  caballo: { cuerpo: [15, 17, 8, 4], cabeza: [25, 9, 2.5, 2.2], hocico: 3, orejas: 'punta', cola: 'larga', patas: [9, 12, 19, 22], pataW: 2, alto: 20, cuello: true, crin: true },
};

function paintBestia(B, c, dir, anim, f) {
  const g = new Grid(32, 32, ESC);
  const p = paso(anim, f);
  const b = bote(anim, f);
  const ataque = anim === 'attack' ? f : -1;
  const ojo = c.ojosRojos ? OJO_ROJO : c.ojo || OJO_AMARILLO;
  if (dir === 'E') return paintBestiaPerfil(g, B, c, p, b, ataque, ojo);

  // ---- de frente (S) o de espaldas (N): el cuerpo en escorzo
  const frente = dir === 'S';
  const [, cy, rx, ry] = B.cuerpo;
  const suelo = 29;
  const alto = Math.min(suelo - 2, cy + ry);
  // Patas: de frente se ven las delanteras; levantan alternas al andar.
  const sep = Math.max(3, Math.round(rx * 0.55));
  for (const [lado, sube] of [[-1, p > 0 ? 1 : 0], [1, p < 0 ? 1 : 0]]) {
    const x = 16 + lado * sep - (lado < 0 ? B.pataW : 0);
    g.rect(x, alto - 1, B.pataW + 1, suelo - alto + 1 - sube, c.piel.d);
    g.rect(x, alto - 1, 1, suelo - alto + 1 - sube, c.piel.b);
  }
  g.blob(16, cy + b - 1, rx * 0.72, ry + 0.5, c.piel);
  if (c.silla) {
    const sy = cy - ry + b - 1;
    g.rect(16 - Math.round(rx * 0.72) - 1, sy + 2, Math.round(rx * 1.44) + 2, 3, c.manta.b);
    g.rect(13, sy, 7, 2, c.silla.b);
    for (const l of [-1, 1]) { g.rect(16 + l * (Math.round(rx * 0.72) + 1), sy + 4, 1, 4, c.silla.d); g.set(16 + l * (Math.round(rx * 0.72) + 1), sy + 8, c.metal); }
  }
  if (frente) {
    // Cabeza grande en primer plano
    const [, hy, hrx, hry] = B.cabeza;
    const cabezaY = Math.min(cy - 1, hy + 2) + b + (ataque === 1 ? 2 : 0);
    if (B.astas) astas(g, 16, cabezaY - hry - 1, c, true);
    orejasFrente(g, B, 16, cabezaY, hrx, hry, c);
    g.blob(16, cabezaY, hrx + 0.6, hry + 0.6, c.piel);
    if (B.crin) { g.rect(16, cabezaY - hry - 1, 1, 3, c.crin.b); g.set(15, cabezaY - hry, c.crin.l); }
    g.blob(16, cabezaY + hry * 0.7, hrx * 0.55, hry * 0.5, c.vientre);
    g.set(16, cabezaY + Math.round(hry * 0.5), '#1a1014');                 // nariz
    g.set(16 - Math.round(hrx * 0.5), cabezaY - 1, ojo);
    g.set(16 + Math.round(hrx * 0.5), cabezaY - 1, ojo);
    if (B.colmillos) { g.set(14, cabezaY + 2, DIENTE); g.set(18, cabezaY + 2, DIENTE); }
    if (ataque === 1) g.rect(15, cabezaY + Math.round(hry), 3, 1, '#3a0a10');  // fauces abiertas
  } else {
    // De espaldas: lomo, cola y patas traseras
    cola(g, B, 16, cy - ry + 1 + b, c, true);
    if (B.astas) astas(g, 16, B.cabeza[1] - 4 + b, c, false);
    g.blob(16, cy - ry + 2 + b, rx * 0.5, 2, c.piel);
  }
  g.outline(darkOf);
  return g;
}

function paintBestiaPerfil(g, B, c, p, b, ataque, ojo) {
  const [bx, by, rx, ry] = B.cuerpo;
  const [hx, hy, hrx, hry] = B.cabeza;
  const embiste = ataque === 0 ? -1 : ataque === 1 ? 3 : 0;   // se recoge y luego salta
  const suelo = 29;
  // Patas del lado lejano, algo más oscuras, por detrás del cuerpo
  const [pt1, pt2, pd1, pd2] = B.patas;
  const top = Math.round(by + ry * 0.4);
  pata(g, pt2 + embiste, top, suelo, B.pataW, -p, { ...c.piel, b: c.piel.d, l: c.piel.d });
  pata(g, pd2 + embiste, top, suelo, B.pataW, p, { ...c.piel, b: c.piel.d, l: c.piel.d });
  // Cola, cuerpo y vientre
  cola(g, B, bx - rx + 1 + embiste, by - ry + 2 + b, c, false);
  g.blob(bx + embiste, by + b, rx, ry, c.piel);
  g.blob(bx + 1 + embiste, by + ry * 0.55 + b, rx * 0.7, ry * 0.35, c.vientre);
  if (B.cresta) for (let x = -rx + 2; x < rx - 1; x += 2) g.set(bx + x + embiste, by - ry + b, c.piel.o || c.piel.d);
  // Cuello largo del ciervo
  if (B.cuello) {
    for (let j = 0; j < 7; j++) g.rect(bx + rx - 3 + Math.round(j * 0.5) + embiste, by - 2 - j + b, 3, 1, j < 3 ? c.piel.b : c.piel.l);
  }
  if (B.crin) for (let j = 0; j < 8; j++) g.set(bx + rx - 4 + Math.round(j * 0.5) + embiste, by - 2 - j + b, c.crin.b);
  if (c.silla) {
    const sx = bx - 2 + embiste, sy = by - ry + b;
    g.rect(sx - 2, sy + 1, 8, 3, c.manta.b); g.rect(sx - 2, sy + 3, 8, 1, c.manta.d);   // manta
    g.rect(sx - 1, sy - 1, 6, 2, c.silla.b); g.set(sx - 1, sy - 2, c.silla.l); g.set(sx + 4, sy - 2, c.silla.d);
    g.rect(sx + 1, sy + 4, 1, 4, c.silla.d); g.set(sx + 1, sy + 8, c.metal);      // estribo
  }
  // Patas del lado cercano
  pata(g, pt1 + embiste, top, suelo, B.pataW, p, c.piel);
  pata(g, pd1 + embiste, top, suelo, B.pataW, -p, c.piel);
  // Cabeza
  const cxh = hx + embiste;
  const cyh = hy + b + (ataque === 1 ? 1 : 0);
  if (B.astas) astas(g, cxh - 1, cyh - hry - 1, c, false);
  if (B.orejas === 'punta') { g.set(cxh - 1, cyh - hry - 1, c.piel.b); g.set(cxh - 1, cyh - hry - 2, c.piel.l); g.set(cxh, cyh - hry - 1, c.piel.d); }
  else { g.blob(cxh - 1, cyh - hry, 1.2, 1.2, c.piel); }
  g.blob(cxh, cyh, hrx, hry, c.piel);
  // Hocico y fauces
  for (let i = 1; i <= B.hocico; i++) g.rect(cxh + hrx - 1 + i, cyh, 1, Math.max(1, Math.round(hry) - (i > 2 ? 1 : 0)), i === B.hocico ? c.piel.d : c.piel.b);
  g.set(cxh + hrx + B.hocico, cyh, '#1a1014');                                  // nariz
  if (ataque === 1) { g.rect(cxh + hrx, cyh + 1, B.hocico, 1, '#3a0a10'); g.set(cxh + hrx + 1, cyh + 2, DIENTE); }
  if (B.colmillos) { g.set(cxh + hrx + B.hocico - 1, cyh + 1, DIENTE); g.set(cxh + hrx + B.hocico - 1, cyh - 1, DIENTE); }
  g.set(cxh + 1, cyh - 1, ojo);
  g.outline(darkOf);
  return g;
}

function orejasFrente(g, B, cx, cy, rx, ry, c) {
  const ex = Math.round(rx * 0.75);
  if (B.orejas === 'punta') {
    for (const l of [-1, 1]) { g.set(cx + l * ex, cy - ry - 1, c.piel.b); g.set(cx + l * ex, cy - ry - 2, c.piel.l); g.set(cx + l * (ex + 1), cy - ry, c.piel.b); }
  } else {
    for (const l of [-1, 1]) g.blob(cx + l * ex, cy - ry + 0.5, 1.3, 1.3, c.piel);
  }
}

function cola(g, B, x, y, c, centrada) {
  if (B.cola === 'poblada') {
    if (centrada) { g.blob(x, y - 2, 1.6, 3, c.piel); g.set(x, y - 5, c.vientre.l); }
    else for (let i = 0; i < 6; i++) g.rect(x - i, y - Math.round(i * 0.6), 2, 2, i > 3 ? c.vientre.l : c.piel.b);
  } else if (B.cola === 'larga') {
    if (centrada) { for (let j = 0; j < 8; j++) g.rect(x - 1 + (j > 5 ? (j % 2) : 0), y + j - 1, 2, 1, j % 3 ? c.crin.b : c.crin.l); }
    else for (let i = 0; i < 9; i++) g.rect(x - 1 - Math.round(i * 0.35), y + i - 1, 2, 1, i % 3 ? c.crin.b : c.crin.l);
  } else if (B.cola === 'fina') {
    for (let i = 0; i < 9; i++) g.set(x - i, y + 2 + Math.round(Math.sin(i * 0.7)), c.rosa?.b || c.piel.l);
  } else {
    g.set(centrada ? x : x - 1, y, c.vientre.l);
  }
}

function astas(g, cx, top, c, frente) {
  const asta = ramp(0xd8c49a);
  const ramas = frente ? [-1, 1] : [-1];
  for (const l of ramas) {
    for (let j = 0; j < 6; j++) g.set(cx + l * (1 + Math.floor(j / 2)), top - j, asta.b);
    g.set(cx + l * 2, top - 3, asta.l); g.set(cx + l * 4, top - 4, asta.l);
    g.set(cx + l * 1, top - 6, asta.l);
  }
}

// ============================================================ humanoides

// No-muertos: huesos, y sobre ellos lo que los distingue (yelmo oxidado,
// corona, capa raída, armadura de hielo o de bronce).
function paintNoMuerto(c, dir, anim, f) {
  const g = new Grid(24, 32, ESC);
  const b = bote(anim, f);
  const p = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
  const ataque = anim === 'attack' ? f : -1;
  const hueso = c.hueso;
  const frente = dir === 'S';
  const perfil = dir === 'E';

  if (c.capa && !frente) g.block(perfil ? 6 : 7, 12 + b, perfil ? 4 : 10, 15, c.capa);
  // Piernas de hueso, con rodilla
  for (const [x, sube] of perfil ? [[10 + p, 0], [12 - p, 0]] : [[9, p > 0 ? 1 : 0], [13, p < 0 ? 1 : 0]]) {
    if (c.armadura) { g.block(x - 1, 21, 4, 8 - sube, c.armadura, { top: false }); continue; }
    g.rect(x, 21, 2, 8 - sube, hueso.b);
    g.set(x, 21, hueso.l);
    g.set(x + 1, 25 - sube, hueso.h);                       // rótula
    g.rect(x - (perfil ? 0 : 1), 29 - sube, 3, 1, hueso.d); // pie
  }
  // Pelvis, columna y costillas
  g.rect(perfil ? 10 : 9, 20 + b, perfil ? 4 : 6, 2, hueso.d);
  if (c.armadura) {
    g.block(perfil ? 9 : 7, 12 + b, perfil ? 6 : 10, 9, c.armadura);
    g.rect(perfil ? 9 : 7, 15 + b, perfil ? 6 : 10, 1, c.armadura.d);
    if (c.runa) { g.set(perfil ? 12 : 11, 17 + b, c.runa); g.set(perfil ? 12 : 12, 17 + b, c.runa); }
  } else {
    g.rect(perfil ? 11 : 11, 12 + b, 2, 9, hueso.d);       // columna
    for (const y of [13, 15, 17]) {
      g.rect(perfil ? 9 : 8, y + b, perfil ? 5 : 8, 1, hueso.b);
      g.set(perfil ? 9 : 8, y + b, hueso.l);
    }
  }
  g.rect(perfil ? 9 : 7, 12 + b, perfil ? 6 : 10, 1, (c.armadura || hueso).l);   // hombros
  if (c.hombreras) { g.block(5, 11 + b, 4, 3, c.armadura || hueso); g.block(15, 11 + b, 4, 3, c.armadura || hueso); }

  // Brazos (el del arma se alza al atacar)
  const brazos = perfil ? [[12, 1]] : [[6, -1], [17, 1]];
  for (const [x, lado] of brazos) {
    const arriba = ataque === 0 && (perfil || lado === -1);
    const y0 = 13 + b + (arriba ? -4 : 0) + (perfil ? 0 : lado * p);
    g.rect(x, y0, 1 + (c.armadura ? 1 : 0), 7, (c.armadura || hueso).b);
    g.set(x, y0 + 7, hueso.l);
  }
  // Arma
  const manoX = perfil ? 13 : 5;
  const manoY = 20 + b + (ataque === 0 ? -4 : 0);
  if (c.arma === 'espada') {
    const largo = c.armaLarga ? 14 : 10;
    if (ataque === 1) for (let j = 0; j < largo - 2; j++) g.set(manoX + (perfil ? j : -j), manoY - 2 + Math.floor(j / 2), c.filo.h);
    else for (let j = 1; j <= largo; j++) { g.set(manoX, manoY - j, c.filo.l); g.set(manoX + 1, manoY - j, c.filo.d); }
    g.rect(manoX - 1, manoY, 3, 1, c.guarda.b);
  } else if (c.arma === 'lanza') {
    for (let j = -12; j < 8; j++) g.set(manoX, manoY + j, ramp(0x6a4a2a).b);
    g.set(manoX, manoY - 13, c.filo.h); g.set(manoX - 1, manoY - 12, c.filo.d); g.set(manoX + 1, manoY - 12, c.filo.d);
  }
  if (c.escudo && !perfil) {
    const sx = frente ? 16 : 3;
    g.block(sx, 14 + b, 5, 7, c.escudo);
    g.rect(sx + 2, 15 + b, 1, 5, c.escudo.d);
  }

  // Cráneo
  const hx = perfil ? 9 : 8, hy = 3 + b;
  g.blob(hx + (perfil ? 3.5 : 3.5), hy + 3.5, perfil ? 3.6 : 4, 4, hueso);
  if (!(dir === 'N')) {
    const brillo = c.ojos || OJO_ROJO;
    if (perfil) {
      g.rect(hx + 4, hy + 3, 2, 2, '#120a10'); g.set(hx + 5, hy + 3, brillo);
      g.rect(hx + 3, hy + 6, 4, 1, hueso.d);                                  // mandíbula
    } else {
      g.rect(hx + 1, hy + 3, 2, 2, '#120a10'); g.rect(hx + 5, hy + 3, 2, 2, '#120a10');
      g.set(hx + 2, hy + 3, brillo); g.set(hx + 5, hy + 3, brillo);
      g.set(hx + 4, hy + 5, '#120a10');                                       // nariz
      for (let i = 1; i < 7; i += 2) g.set(hx + i, hy + 7, '#120a10');        // dientes
    }
  }
  if (c.yelmo) { g.rect(hx - 1, hy - 1, perfil ? 9 : 10, 3, c.yelmo.b); g.rect(hx - 1, hy - 1, perfil ? 9 : 10, 1, c.yelmo.l); }
  if (c.corona) {
    const oro = ramp(0xe0b040);
    g.rect(hx, hy - 1, perfil ? 7 : 8, 2, oro.b);
    for (let i = 0; i < (perfil ? 7 : 8); i += 2) g.set(hx + i, hy - 2, oro.l);
    g.set(hx + (perfil ? 3 : 3), hy - 3, oro.h);
    if (c.gema) g.set(hx + (perfil ? 3 : 4), hy, c.gema);
  }
  if (c.capa && frente) { g.rect(6, 12 + b, 1, 12, c.capa.d); g.rect(17, 12 + b, 1, 12, c.capa.d); }
  g.outline(darkOf);
  return g;
}

// Ahogados: encorvados, harapientos y chorreando. El chamán lleva capucha y
// báculo; el aparecido helado no tiene piernas: flota y se deshace en jirones.
function paintAhogado(c, dir, anim, f) {
  const g = new Grid(24, 32, ESC);
  const b = bote(anim, f) + (c.flota ? Math.round(Math.sin(f * 1.6)) : 0);
  const p = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
  const ataque = anim === 'attack' ? f : -1;
  const perfil = dir === 'E';
  const frente = dir === 'S';
  const carne = c.carne;

  if (c.flota) {
    // Jirones de niebla en lugar de piernas
    for (let j = 0; j < 8; j++) {
      const ancho = Math.max(1, 6 - j);
      g.rect(12 - Math.floor(ancho / 2) + Math.round(Math.sin(j + f) * 1), 21 + j + b, ancho, 1, j > 4 ? c.ropa.l : c.ropa.b);
    }
  } else {
    for (const [x, sube] of perfil ? [[10 + p, 0], [12 - p, 0]] : [[9, p > 0 ? 1 : 0], [13, p < 0 ? 1 : 0]]) {
      g.rect(x, 22, 2, 7 - sube, carne.d);
      g.set(x, 22, carne.b);
    }
  }
  // Torso encorvado con harapos de bajo en zigzag
  const tx = perfil ? 9 : 7, tw = perfil ? 7 : 10;
  g.block(tx, 13 + b, tw, 9, c.ropa);
  for (let i = 0; i < tw; i++) g.rect(tx + i, 22 + b, 1, (i % 3 === 0) ? 2 : 1, c.ropa.d);
  if (!c.flota) for (let i = 1; i < tw; i += 3) g.set(tx + i, 15 + b + (i % 2), carne.d);   // rotos en la tela
  // Algas colgando
  if (c.algas) { g.set(tx + 1, 16 + b, '#3a6a2a'); g.set(tx + 1, 17 + b, '#3a6a2a'); g.set(tx + tw - 2, 18 + b, '#2e5a24'); }
  // Brazos largos que cuelgan
  const brazos = perfil ? [[13, 1]] : [[5, -1], [17, 1]];
  for (const [x, lado] of brazos) {
    const alza = ataque === 0 ? -5 : ataque === 1 ? -1 : 0;
    const y0 = 14 + b + alza + (perfil ? 0 : lado * p);
    g.rect(x, y0, 2, 9, carne.b);
    g.set(x, y0, carne.l);
    g.rect(x, y0 + 9, 2, 1, carne.d);
    if (ataque === 1) g.set(x + (lado > 0 ? 2 : -1), y0 + 9, carne.l);   // garra
  }
  if (c.baculo) {
    const sx = perfil ? 15 : 4;
    for (let j = 0; j < 24; j++) g.set(sx, 6 + j + b, ramp(0x4a3a2a).b);
    g.rect(sx - 1, 3 + b, 3, 3, c.brillo.b);
    g.set(sx, 2 + b, c.brillo.h);
  }
  // Cabeza adelantada (encorvado)
  const hx = perfil ? 11 : 8, hy = 5 + b;
  if (c.capucha) {
    // Capucha redondeada y acabada en pico, con la cara hundida en su sombra.
    g.blob(hx + 3.5, hy + 3, 4.8, 4.6, c.ropa);
    g.set(hx + (perfil ? 2 : 3), hy - 2, c.ropa.l);
    g.set(hx + (perfil ? 1 : 3), hy - 3, c.ropa.l);
    if (dir !== 'N') g.blob(hx + 3.5 + (perfil ? 1 : 0), hy + 4, 2.6, 2.6, carne);
  } else {
    g.blob(hx + 3.5, hy + 3.5, 3.6, 3.8, carne);
    // Pelo ralo y empapado
    for (let i = 0; i < 7; i += 2) g.rect(hx + i, hy - 1, 1, 3 + (i % 4 === 0 ? 2 : 0), c.pelo.b);
  }
  if (dir !== 'N') {
    const ojo = c.ojos || '#c8f0a0';
    if (perfil) g.set(hx + 5, hy + 3, ojo);
    else { g.set(hx + 2, hy + 3, ojo); g.set(hx + 5, hy + 3, ojo); g.rect(hx + 2, hy + 6, 4, 1, '#1a0a10'); }
  }
  g.outline(darkOf);
  return g;
}

// Troll: espaldas enormes, cabeza pequeña hundida entre los hombros, brazos
// que llegan a las rodillas y un garrote de hielo.
function paintTroll(c, dir, anim, f) {
  const g = new Grid(24, 32, ESC);
  const b = bote(anim, f);
  const p = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
  const ataque = anim === 'attack' ? f : -1;
  const perfil = dir === 'E';
  const piel = c.piel;
  // Piernas cortas y gruesas
  for (const [x, sube] of perfil ? [[9 + p, 0], [12 - p, 0]] : [[7, p > 0 ? 1 : 0], [13, p < 0 ? 1 : 0]]) {
    g.block(x, 23, 4, 6 - sube, piel, { top: false });
    g.rect(x - 1, 29 - sube, 5, 1, piel.d);
  }
  // Torso enorme
  g.blob(12, 16 + b, perfil ? 6 : 9, 7.5, piel);
  g.blob(12, 19 + b, perfil ? 4 : 6, 4, c.pelaje);
  // Cabeza pequeña, baja
  const hx = perfil ? 15 : 12;
  g.blob(hx, 9 + b, 3, 3, piel);
  if (dir !== 'N') {
    if (perfil) { g.set(hx + 1, 8 + b, OJO_HIELO); g.set(hx + 2, 11 + b, DIENTE); }
    else { g.set(hx - 1, 8 + b, OJO_HIELO); g.set(hx + 1, 8 + b, OJO_HIELO); g.set(hx - 2, 11 + b, DIENTE); g.set(hx + 2, 11 + b, DIENTE); }
  }
  // Brazos largos
  const brazos = perfil ? [[15, 1]] : [[2, -1], [20, 1]];
  for (const [x, lado] of brazos) {
    const alza = ataque === 0 ? -7 : 0;
    const y0 = 12 + b + alza + (perfil ? 0 : lado * p);
    g.block(x, y0, 3, 12, piel);
    g.blob(x + 1, y0 + 12, 2, 1.5, piel);
    if (lado === 1 || perfil) {
      // Garrote de hielo
      const gy = ataque === 1 ? y0 + 10 : y0 - 4;
      const hielo = c.garrote;
      for (let j = 0; j < 7; j++) g.rect(x + (ataque === 1 ? j : 1), gy + (ataque === 1 ? 2 : j), 2, 1, hielo.b);
      g.blob(x + (ataque === 1 ? 7 : 2), gy + (ataque === 1 ? 2 : -1), 2, 2, hielo);
    }
  }
  g.outline(darkOf);
  return g;
}

// Sanguijuela gigante: un gusano de segmentos que ondula al avanzar y abre una
// boca circular llena de dientes.
function paintSanguijuela(c, dir, anim, f) {
  const g = new Grid(32, 32, ESC);
  const piel = c.piel;
  const ataque = anim === 'attack' ? f : -1;
  if (dir === 'E') {
    for (let i = 0; i < 6; i++) {
      const x = 6 + i * 3.6 + (ataque === 1 ? 2 : 0);
      const y = 25 + Math.round(Math.sin(i * 1.1 + f * 1.4) * (anim === 'walk' ? 1.2 : 0.4));
      g.blob(x, y, 2.6 + i * 0.25, 2.2 + i * 0.2, piel);
    }
    // Boca en el extremo
    const bx = 27 + (ataque === 1 ? 2 : 0);
    g.blob(bx, 24, 2.5, 3, c.boca);
    g.rect(bx, 23, 1, 3, '#2a0a12');
    g.set(bx - 1, 22, DIENTE); g.set(bx - 1, 26, DIENTE);
  } else {
    // De frente o de espaldas: un ovillo
    g.blob(16, 24, 7, 4.5, piel);
    if (dir === 'S') {
      g.blob(16, 23 - (ataque === 1 ? 1 : 0), 3.5, 3.5, c.boca);
      g.blob(16, 23 - (ataque === 1 ? 1 : 0), 1.8, 1.8, { h: '#2a0a12', l: '#2a0a12', b: '#2a0a12', d: '#2a0a12' });
      for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [0, 3]]) g.set(16 + dx, 23 + dy, DIENTE);
    }
  }
  g.outline(darkOf);
  return g;
}

// Rey del Fango: un montículo de lodo con brazos, corona y ojos encendidos.
function paintReyFango(c, dir, anim, f) {
  const g = new Grid(32, 32, ESC);
  const b = bote(anim, f);
  const ataque = anim === 'attack' ? f : -1;
  const lodo = c.piel;
  g.blob(16, 21 + b, 11, 8.5, lodo);
  g.blob(16, 13 + b, 7, 6, lodo);
  // Goterones en la base
  for (const x of [7, 12, 19, 24]) g.rect(x, 28, 2, 2, lodo.d);
  // Brazos de barro
  for (const lado of [-1, 1]) {
    const alza = ataque === 0 ? -5 : ataque === 1 ? 2 : 0;
    g.blob(16 + lado * 11, 18 + b + alza, 3, 4, lodo);
  }
  if (dir !== 'N') {
    g.rect(12, 12 + b, 2, 2, '#120a08'); g.rect(18, 12 + b, 2, 2, '#120a08');
    g.set(12, 12 + b, OJO_ROJO); g.set(19, 12 + b, OJO_ROJO);
    g.rect(13, 16 + b, 6, 1 + (ataque === 1 ? 1 : 0), '#1a0a08');
  }
  // Corona hundida en el barro
  const oro = ramp(0xd9a441);
  g.rect(11, 6 + b, 10, 2, oro.b);
  for (let i = 0; i < 10; i += 3) { g.set(11 + i, 5 + b, oro.l); g.set(11 + i, 4 + b, oro.h); }
  g.set(16, 7 + b, '#3ad08a');
  g.outline(darkOf);
  return g;
}

// ============================================================ recetas

// Una receta por criatura: anatomía + colores + adornos. El color base sale de
// MOB_INFO (el mismo que usaba el muñeco 3D) para que nada cambie de identidad.
function receta(type, info) {
  const base = ramp(info.color);
  const clara = (hex) => ramp(hex);
  switch (info.kind) {
    case 'wolf': return { pintor: 'bestia', B: BESTIAS.lobo, c: { piel: base, vientre: clara(mezcla(info.color, 0xffffff, 0.35)), ojosRojos: info.redEyes, ojo: type === 'lobo_escarcha' ? OJO_HIELO : null } };
    case 'boar': return { pintor: 'bestia', B: BESTIAS.jabali, c: { piel: base, vientre: clara(mezcla(info.color, 0xd0a080, 0.4)) } };
    case 'rat':  return { pintor: 'bestia', B: BESTIAS.rata, c: { piel: base, vientre: clara(mezcla(info.color, 0xffffff, 0.25)), rosa: ramp(0xd88a8a), ojosRojos: true } };
    case 'deer': return { pintor: 'bestia', B: BESTIAS.ciervo, c: { piel: base, vientre: clara(0xe8dcc4), ojo: '#1a1014' } };
    case 'bear':
      // Piel gris azulada y pelaje blanco: con el blanco puro de MOB_INFO en
      // todo el cuerpo no se distinguía ni la cara.
      if (type === 'troll_hielo') return { pintor: 'troll', c: { piel: ramp(0x7a98ae), pelaje: clara(0xf0f6fc), garrote: ramp(0x8fd0f0) } };
      return { pintor: 'bestia', B: BESTIAS.oso, c: { piel: base, vientre: clara(mezcla(info.color, 0xc89060, 0.35)), ojo: '#1a1014' } };
    case 'blob':
      if (type === 'rey_fango') return { pintor: 'reyFango', c: { piel: base } };
      return { pintor: 'sanguijuela', c: { piel: base, boca: ramp(0xc06a7a) } };
    case 'drowned':
      if (type === 'chaman_cienaga') return { pintor: 'ahogado', c: { carne: ramp(0x7a9a6a), ropa: base, pelo: ramp(0x2a3a22), capucha: true, baculo: true, brillo: ramp(0x9cff7a), ojos: '#c8ff7a' } };
      // Espectro encapuchado: la capucha oscura enmarca los ojos que brillan, y
      // sin ella era un bloque claro sobre fondo claro, sin cara.
      if (type === 'aparecido_helado') return { pintor: 'ahogado', c: { carne: ramp(0x5a7a98), ropa: ramp(0x6a9ac0), pelo: ramp(0xe8f4ff), flota: true, capucha: true, ojos: OJO_HIELO } };
      return { pintor: 'ahogado', c: { carne: ramp(0x7a9a72), ropa: base, pelo: ramp(0x2a3a22), algas: true } };
    case 'skeleton': {
      const c = { hueso: ramp(type === 'esqueleto' || type === 'guardian_oseo' || type === 'centinela_oseo' ? info.color : 0xd8d0bc), ojos: info.redEyes ? OJO_ROJO : '#ffd060', filo: ramp(0xc8d0dc), guarda: ramp(0x8a6a3a) };
      if (type === 'esqueleto') Object.assign(c, { arma: 'espada' });
      if (type === 'guardian_oseo') Object.assign(c, { arma: 'espada', escudo: ramp(0x6a5a40), yelmo: ramp(0x7a6a5a), ojos: '#ffb040' });
      if (type === 'centinela_oseo') Object.assign(c, { arma: 'lanza', escudo: ramp(0x5a6a72), yelmo: ramp(0x6a7a82), ojos: '#a0e0ff' });
      if (type === 'senor_cripta') Object.assign(c, { arma: 'espada', armaLarga: true, corona: true, gema: '#e03a5a', capa: ramp(0x4a2a5a), hombreras: true });
      if (type === 'jarl_cumbres') Object.assign(c, { arma: 'espada', armaLarga: true, corona: true, gema: OJO_HIELO, armadura: ramp(0x9cc8e4), capa: ramp(0xe8f0f8), hombreras: true, ojos: OJO_HIELO, filo: ramp(0xb8f0ff) });
      if (type === 'coloso') Object.assign(c, { arma: 'espada', armaLarga: true, corona: true, gema: OJO_ROJO, armadura: ramp(0x8a6a38), hombreras: true, runa: '#ff7a3a', capa: ramp(0x5a2a1a) });
      return { pintor: 'noMuerto', c };
    }
    default: return { pintor: 'bestia', B: BESTIAS.lobo, c: { piel: base, vientre: base } };
  }
}

function mezcla(a, b, t) {
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(ch(a, s) * (1 - t) + ch(b, s) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

const PINTORES = {
  bestia: (r, dir, anim, f) => paintBestia(r.B, r.c, dir, anim, f),
  noMuerto: (r, dir, anim, f) => paintNoMuerto(r.c, dir, anim, f),
  ahogado: (r, dir, anim, f) => paintAhogado(r.c, dir, anim, f),
  troll: (r, dir, anim, f) => paintTroll(r.c, dir, anim, f),
  sanguijuela: (r, dir, anim, f) => paintSanguijuela(r.c, dir, anim, f),
  reyFango: (r, dir, anim, f) => paintReyFango(r.c, dir, anim, f),
};

// ============================================================ monturas
// Una montura va en DOS capas alrededor del jinete, como en los juegos 2D de
// siempre: la de atrás (lomo, manta, estribos) queda detrás de él y la de
// delante (de frente: cabeza, pecho y manos; de espaldas: grupa y cola) le
// tapa las piernas. Con una sola capa detrás, de frente el jinete tapaba la
// cabeza del caballo y solo asomaban cuatro patas: parecía una mesa.
const MONTURAS = {
  corcel:   { B: BESTIAS.caballo, especie: 'caballo', piel: 0x8a6a4a, vientre: 0xb89a78, crin: 0x2a2320, manta: 0x7a1e1e, ojo: '#1a1014', lucero: true },
  huargo:   { B: BESTIAS.lobo,    especie: 'lobo',    piel: 0x5a5a66, vientre: 0x9a9aa6, crin: 0x3a3a44, manta: 0x2a4a6a, ojo: OJO_AMARILLO },
  espectro: { B: BESTIAS.caballo, especie: 'caballo', piel: 0x7ab8a8, vientre: 0xb8f0e0, crin: 0xd8fff4, manta: 0x3a2a5a, ojo: '#eaffff', aura: true },
};

// Pata vista de frente o de espaldas, con su casco (o zarpa) al final.
function pataFrontal(g, x, top, suelo, w, sube, piel, casco) {
  g.rect(x, top, w, suelo - top - sube, piel.b);
  g.rect(x, top, 1, suelo - top - sube, piel.l);
  g.rect(x + w - 1, top, 1, suelo - top - sube, piel.d);
  g.rect(x, suelo - sube - 1, w, 2, casco);
}

// Lomo con la manta y los estribos colgando a los lados del jinete.
function lomoFrontal(g, c, b, cy) {
  g.blob(16, cy + b, 7.5, 4.6, c.piel);
  // Manta: cae por los costados, se estrecha hacia abajo y lleva ribete
  for (const [x, l] of [[9, -1], [23, 1]]) {
    for (let j = 0; j < 5; j++) {
      const w = j < 3 ? 3 : 2;
      const x0 = l < 0 ? x - j * 0.4 : x - w + 1 + j * 0.4;
      g.rect(x0, cy - 3 + j + b, w, 1, j === 0 ? c.manta.l : c.manta.b);
    }
    g.rect(l < 0 ? x - 2 : x - 1, cy + 2 + b, 2, 1, c.oro);
  }
  // Estribos colgando bajo la manta
  for (const x of [8, 24]) { g.rect(x, cy + 3 + b, 1, 2, c.silla.d); g.rect(x - 0.5, cy + 5 + b, 2, 1, c.metal); }
}

// Las monturas se pintan a 2x (64 px): con el mismo diseño de 32 que las
// bestias salían del tamaño de un perro junto al jinete. El píxel del lienzo
// mide lo mismo que en todo el juego; solo hay más.
const ESC_MONTURA = 2;

function paintMontura(m, c, dir, anim, f, capa) {
  const g = new Grid(32, 32, ESC_MONTURA);
  const p = paso(anim, f);
  const b = bote(anim, f);
  const suelo = 29;
  const casco = m.especie === 'caballo' ? c.casco : c.piel.d;
  const delante = capa === 'delante';
  const lejana = { ...c.piel, b: c.piel.d, l: c.piel.d };

  if (dir === 'E') {
    // De perfil la montura entera va detrás: el jinete la monta por encima
    if (!delante) paintBestiaPerfil(g, m.B, c, p, b, -1, c.ojo);
    return g;
  }

  if (dir === 'S') {
    if (!delante) {
      // Patas traseras asomando y el lomo con su equipo
      pataFrontal(g, 10, 20, suelo, 2, p < 0 ? 1 : 0, lejana, casco);
      pataFrontal(g, 20, 20, suelo, 2, p > 0 ? 1 : 0, lejana, casco);
      lomoFrontal(g, c, b, 15);
    } else {
      // Pecho y manos
      pataFrontal(g, 12, 21, suelo, 3, p > 0 ? 1 : 0, c.piel, casco);
      pataFrontal(g, 17, 21, suelo, 3, p < 0 ? 1 : 0, c.piel, casco);
      g.blob(16, 21 + b, 5, 2.4, c.piel);
      if (m.especie === 'caballo') {
        // Cabeza larga de frente: orejas, tupé, lucero, ollares y cabezada
        const y = 16 + b;
        for (const x of [13, 19]) { g.set(x, y - 4, c.piel.b); g.set(x, y - 5, c.piel.l); g.set(x + (x < 16 ? 1 : -1), y - 4, c.piel.d); }
        g.blob(16, y, 2.8, 4.4, c.piel, true);
        g.blob(16, y + 4.5, 2.4, 1.8, c.vientre, true);
        g.set(15, y + 5, '#1a1014'); g.set(17, y + 5, '#1a1014');             // ollares
        g.set(13, y - 1, c.ojo); g.set(19, y - 1, c.ojo);
        for (let i = 0; i < 3; i++) g.set(15 + (i % 2), y - 4 + i, c.crin.b);  // tupé
        if (m.lucero) { g.set(16, y - 1, c.vientre.h); g.set(16, y, c.vientre.h); g.set(16, y + 1, c.vientre.l); }
        g.rect(14, y + 2, 5, 1, c.silla.d);                                    // muserola
        g.set(13, y + 1, c.silla.d); g.set(19, y + 1, c.silla.d);
        g.set(13, y + 3, c.metal); g.set(19, y + 3, c.metal);                  // filete
      } else {
        // Cabeza de lobo: ancha, orejas en punta y hocico claro
        const y = 17 + b;
        for (const l of [-1, 1]) { g.set(16 + l * 3, y - 4, c.piel.b); g.set(16 + l * 3, y - 5, c.piel.l); g.set(16 + l * 4, y - 3, c.piel.b); }
        g.blob(16, y, 4.2, 3.4, c.piel, true);
        g.blob(16, y + 2.4, 2.2, 1.6, c.vientre, true);
        g.set(16, y + 2, '#1a1014');
        g.set(14, y - 1, c.ojo); g.set(18, y - 1, c.ojo);
        g.rect(12, y + 4, 9, 1, c.silla.d); g.set(16, y + 4, c.metal);         // collar del arnés
      }
    }
  } else {
    // ---- de espaldas (N)
    if (!delante) {
      // Lo que queda al otro lado del jinete: cuello, orejas, manos y equipo
      pataFrontal(g, 11, 20, suelo, 2, p > 0 ? 1 : 0, lejana, casco);
      pataFrontal(g, 19, 20, suelo, 2, p < 0 ? 1 : 0, lejana, casco);
      if (m.especie === 'caballo') {
        g.blob(16, 8 + b, 2.6, 3, c.piel);
        for (const x of [14, 18]) { g.set(x, 4 + b, c.piel.b); g.set(x, 3 + b, c.piel.l); }
        g.rect(15, 6 + b, 2, 6, c.crin.b);
      } else {
        for (const l of [-1, 1]) { g.set(16 + l * 3, 9 + b, c.piel.b); g.set(16 + l * 3, 8 + b, c.piel.l); }
        g.blob(16, 12 + b, 4, 3, c.piel);
      }
      lomoFrontal(g, c, b, 14);
    } else {
      // Grupa, cola y patas traseras: lo más cercano a la cámara
      pataFrontal(g, 11, 21, suelo, 3, p < 0 ? 1 : 0, c.piel, casco);
      pataFrontal(g, 18, 21, suelo, 3, p > 0 ? 1 : 0, c.piel, casco);
      g.blob(16, 18 + b, 6.5, 4.2, c.piel);
      for (let y = 16; y < 22; y++) g.set(16, y + b, c.piel.d);                // raya de la grupa
      const ond = anim === 'walk' ? [0, 1, 0, -1][f] : 0;
      if (m.especie === 'caballo') {
        for (let j = 0; j < 11; j++) g.rect(15 + (j > 5 ? ond : 0), 15 + j + b, 2, 1, j % 3 ? c.crin.b : c.crin.l);
      } else {
        g.blob(16 + ond, 21 + b, 1.6, 3.2, c.piel);
        g.set(16 + ond, 24 + b, c.vientre.l);
      }
    }
  }
  g.outline(darkOf);
  // Corcel espectral: destellos sueltos sobre el cuerpo (repartidos con un
  // hash, no en rejilla: en rejilla salían franjas diagonales)
  if (m.aura) for (let i = 0; i < g.c.length; i++) {
    if (g.c[i] && ((Math.imul(i + f * 977, 2654435761) >>> 0) % 41) === 0) g.c[i] = c.vientre.h;
  }
  return g;
}

export function mountSheet(id, capa = 'detras') {
  const m = MONTURAS[id] || MONTURAS.corcel;
  const c = {
    piel: ramp(m.piel), vientre: ramp(m.vientre), crin: ramp(m.crin), ojo: m.ojo,
    silla: ramp(0x5a3a22), manta: ramp(m.manta), metal: '#9a9aa8', casco: '#2a2024', oro: '#d9a441',
  };
  return buildSheet(`montura:${id}:${capa}`, 32 * ESC_MONTURA, 32 * ESC_MONTURA, (dir, anim, f) => paintMontura(m, c, dir, anim, f, capa));
}

// Hoja de fotogramas de una criatura. `info` es su entrada de MOB_INFO.
export function creatureSheet(type, info) {
  const r = receta(type, info);
  const pintar = PINTORES[r.pintor];
  const ancho = r.pintor === 'bestia' || r.pintor === 'sanguijuela' || r.pintor === 'reyFango' ? 32 : 24;
  return buildSheet(`criatura:${type}`, ancho * ESC, 32 * ESC, (dir, anim, f) => pintar(r, dir, anim, f));
}
