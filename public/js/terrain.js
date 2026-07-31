// Relieve y comarcas del mundo.
//
// Este módulo es la ÚNICA fuente de verdad de la forma del terreno: la altura
// del suelo en cada punto y a qué comarca pertenece. Lo usan el terreno 3D, las
// entidades (para pisar el suelo), los props y el minimapa.
//
// Es geometría PURA y determinista: mismas coordenadas -> misma altura siempre,
// sin estado ni aleatoriedad, así que cliente y servidor coincidirían si hiciera
// falta. (Hoy el servidor no la necesita: valida el movimiento en 2D sobre x/z.)

export const WORLD_RADIUS = 200;      // límite absoluto del mundo
export const CITADEL_RADIUS = 42;     // muralla de la Ciudadela
const FLAT_RADIUS = 52;               // dentro de esto el suelo es LLANO (altura 0)
// De FLAT_RADIUS a aquí el relieve entra poco a poco. Es ancho a propósito: con
// una transición corta, las comarcas altas creaban un talud de casi 60° nada más
// salir de la muralla.
const BLEND_RADIUS = 100;

// ---- Comarcas ----
// Cada comarca ocupa un SECTOR del anillo exterior (una porción de tarta), no
// una mancha circular: por eso se leen como regiones grandes que se tocan entre
// sí. `from`/`to` son ángulos en radianes de Math.atan2(z, x).
//
//   -z = NORTE   +z = SUR   +x = ESTE   -x = OESTE
//
// amp   = cuánto ondula el relieve (0 = casi llano)
// lift  = desplazamiento vertical de la comarca (negativo = hondonada)
// peak  = realce extra hacia el borde exterior (para mesetas y montañas)
const TAU = Math.PI * 2;

// Los sectores están recortados a medida del contenido que ya vive en cada
// dirección (criaturas, NPC, caminos): así ninguna zona de inicio cae dentro de
// una comarca de alto nivel.
export const COMARCAS = [
  {
    id: 'llanura', name: 'Llanura de Valdoria',
    from: -0.40, to: 0.50,            // este: colina de Nyra y su cripta
    color: 0x3a4a2a, amp: 1.5, lift: 0, peak: 0.05,     // la más llana: sirve de referencia
  },
  {
    id: 'cumbres', name: 'Cumbres Heladas',
    from: 0.50, to: 1.15,             // sureste: criaturas heladas, Jarl y Skadi
    color: 0xdfe8f0, amp: 4.0, lift: 3.0, peak: 0.26,   // meseta elevada de verdad
  },
  {
    id: 'praderas', name: 'Praderas del Sur',
    from: 1.15, to: 2.10,             // sur: camino de la puerta, Alfa, piedras
    color: 0x33452a, amp: 1.8, lift: 0, peak: 0.06,     // llana: es la ruta de inicio
  },
  {
    id: 'bosque', name: 'Bosque del Oeste',
    from: 2.10, to: 2.90,             // suroeste: jabalíes y Cripta del Bosque
    color: 0x24301c, amp: 2.6, lift: 0.4, peak: 0.12,
  },
  {
    id: 'cienaga', name: 'Ciénaga de los Ahogados',
    from: 2.90, to: -2.20,            // noroeste (cruza ±π): Ahogados y Rey del Fango
    color: 0x2a3320, amp: 1.2, lift: -2.0, peak: -0.11,  // hondonada encharcada
  },
  {
    id: 'colinas', name: 'Colinas del Norte',
    from: -2.20, to: -0.40,           // norte y noreste: ruinas, lago y osos
    color: 0x3d4a30, amp: 3.0, lift: 3.4, peak: 0.14,
  },
];

// Normaliza un ángulo a [-π, π)
function norm(a) {
  while (a < -Math.PI) a += TAU;
  while (a >= Math.PI) a -= TAU;
  return a;
}

// ¿Está el ángulo dentro del sector [from, to)? (soporta sectores que cruzan ±π)
function inSector(ang, from, to) {
  if (from <= to) return ang >= from && ang < to;
  return ang >= from || ang < to;   // el sector cruza la discontinuidad
}

/** Comarca de un punto del mundo (siempre devuelve una). */
export function biomeAt(x, z) {
  const ang = Math.atan2(z, x);
  return COMARCAS.find((c) => inSector(ang, c.from, c.to)) || COMARCAS[0];
}

// Ruido suave y determinista (suma de senos): ondulación natural sin librerías.
function rolling(x, z) {
  return Math.sin(x * 0.031) * Math.cos(z * 0.027) * 1.15
       + Math.sin((x + z) * 0.018) * 0.85
       + Math.cos(x * 0.012 - z * 0.014) * 1.25
       + Math.sin(x * 0.071 + z * 0.053) * 0.28;   // detalle fino
}

// Suavizado 0..1 (curva S) para transiciones sin costuras.
function smooth(t) {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

// Mezcla el perfil de comarcas vecinas cerca de sus bordes, para que no haya un
// escalón recto entre una y otra.
function blendedProfile(x, z) {
  const ang = Math.atan2(z, x);
  let amp = 0, lift = 0, peak = 0, wsum = 0;
  for (const c of COMARCAS) {
    // Distancia angular al centro del sector (tratando el cruce de ±π)
    let mid = c.from + norm(c.to - c.from) / 2;
    if (c.from > c.to) mid = norm(c.from + norm(c.to + TAU - c.from) / 2);
    const half = Math.abs(norm(c.to - c.from)) / 2 || 0.5;
    const d = Math.abs(norm(ang - mid));
    // Peso: 1 en el centro y cae hacia el borde. El factor es ajustado a
    // propósito (1.15): con una mezcla más ancha, una comarca hundida como la
    // Ciénaga arrastraba hacia abajo a sus vecinas y todas se parecían.
    const w = Math.max(0, 1 - d / (half * 1.15));
    if (w <= 0) continue;
    const ww = w * w;
    amp += c.amp * ww; lift += c.lift * ww; peak += c.peak * ww; wsum += ww;
  }
  if (wsum === 0) { const c = biomeAt(x, z); return { amp: c.amp, lift: c.lift, peak: c.peak }; }
  return { amp: amp / wsum, lift: lift / wsum, peak: peak / wsum };
}

/**
 * Altura del suelo en (x, z).
 * La Ciudadela y su plaza son LLANAS (altura 0) para no tener que rehacer sus
 * edificios; el relieve entra poco a poco al salir de la muralla.
 */
export function heightAt(x, z) {
  // Las criptas viven desplazadas a x+500/700/900, fuera del mundo circular:
  // son interiores y su suelo es plano.
  if (x > 400) return 0;
  const r = Math.hypot(x, z);
  if (r <= FLAT_RADIUS) return 0;

  const { amp, lift, peak } = blendedProfile(x, z);
  // Cuánto "pesa" el relieve aquí: 0 junto a la muralla, 1 pasado BLEND_RADIUS
  const entrada = smooth((r - FLAT_RADIUS) / (BLEND_RADIUS - FLAT_RADIUS));
  // Realce progresivo hacia el borde del mundo (mesetas y montañas lejanas)
  const haciaFuera = smooth((r - FLAT_RADIUS) / (WORLD_RADIUS - FLAT_RADIUS));

  const h = rolling(x, z) * amp + lift + peak * haciaFuera * 34;
  return h * entrada;
}

/**
 * Color del suelo en (x, z), mezclado entre comarcas vecinas para que la
 * frontera sea un degradado y no una línea recta. Devuelve [r, g, b] en 0..1
 * (sin depender de Three.js: este módulo es geometría pura).
 */
export function colorAt(x, z) {
  const ang = Math.atan2(z, x);
  let r = 0, g = 0, b = 0, wsum = 0;
  for (const c of COMARCAS) {
    let mid = c.from + norm(c.to - c.from) / 2;
    if (c.from > c.to) mid = norm(c.from + norm(c.to + TAU - c.from) / 2);
    const half = Math.abs(norm(c.to - c.from)) / 2 || 0.5;
    const d = Math.abs(norm(ang - mid));
    const w = Math.max(0, 1 - d / (half * 1.35));
    if (w <= 0) continue;
    const ww = w * w;
    r += ((c.color >> 16) & 255) * ww;
    g += ((c.color >> 8) & 255) * ww;
    b += (c.color & 255) * ww;
    wsum += ww;
  }
  if (wsum === 0) {
    const c = biomeAt(x, z).color;
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }
  // Cerca de la Ciudadela todas las comarcas ceden al verde de la llanura, para
  // que el terreno no cambie de color de golpe al cruzar la muralla.
  const rad = Math.hypot(x, z);
  const mezcla = smooth((rad - FLAT_RADIUS) / (BLEND_RADIUS - FLAT_RADIUS));
  const base = COMARCAS[0].color;
  const bl = (v, bc) => (v / wsum) * mezcla + bc * (1 - mezcla);
  return [
    bl(r, (base >> 16) & 255) / 255,
    bl(g, (base >> 8) & 255) / 255,
    bl(b, base & 255) / 255,
  ];
}

/** Pendiente aproximada (para colocar props o evitar sitios muy inclinados). */
export function slopeAt(x, z, d = 2) {
  const hx = heightAt(x + d, z) - heightAt(x - d, z);
  const hz = heightAt(x, z + d) - heightAt(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}
