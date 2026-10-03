// Relieve, costa y comarcas del mundo.
//
// Este módulo es la ÚNICA fuente de verdad de la forma del terreno: dónde hay
// tierra y dónde mar, la altura del suelo en cada punto y a qué comarca
// pertenece. Lo usan el terreno 3D, las entidades (para pisar el suelo), los
// props, el minimapa y el servidor (para sembrar criaturas en tierra firme).
//
// Es geometría PURA y determinista: mismas coordenadas -> mismo resultado
// siempre, sin estado ni aleatoriedad, así que cliente y servidor coinciden.

// Ya no es un disco: es un continente con costa propia. WORLD_RADIUS queda como
// la extensión máxima (costa más lejana + islotes) para dimensionar mallas y
// mapas; lo que se puede pisar lo dice enTierra().
export const WORLD_RADIUS = 300;
export const CITADEL_RADIUS = 42;     // muralla de la Ciudadela
const FLAT_RADIUS = 52;               // dentro de esto el suelo es LLANO (altura 0)
// De FLAT_RADIUS a aquí el relieve entra poco a poco. Es ancho a propósito: con
// una transición corta, las comarcas altas creaban un talud de casi 60° nada más
// salir de la muralla.
const BLEND_RADIUS = 100;
// Referencia de las mesetas y montañas lejanas (antes, el radio del disco)
const ALCANCE_RELIEVE = 200;

// Nivel del mar: el agua del océano se pinta a esta altura.
export const NIVEL_MAR = -1.2;

const TAU = Math.PI * 2;

// ============================================================ la costa
// El contorno del continente es un radio que varía con el ángulo: varias ondas
// de distinta frecuencia (la costa grande y sus entrantes) más accidentes con
// nombre —cabos, penínsulas y bahías— colocados a mano donde el mapa los pide.
// Ninguno muerde el contenido: todos los NPC, criptas, jefes y criaturas
// quedan tierra adentro (lo comprueba test/terrain.test.mjs).
const ACCIDENTES = [
  // [ángulo, cambio de radio, anchura angular]
  [1.62, 58, 0.16],    // Cabo del Sur: la península tras el claro del Coloso
  [2.55, 34, 0.22],    // Punta de los Robles: el bosque se adentra en el mar
  [-0.12, -44, 0.09],  // Bahía de las Gaviotas, al este de la llanura
  [-1.05, 46, 0.20],   // Promontorio del Norte, más allá del lago
  [-2.62, -42, 0.07],  // Estuario de la Ciénaga: el mar entra en el pantano
  [0.66, -36, 0.045],  // Fiordo del Jarl: un tajo de mar entre las cumbres
  [1.06, -30, 0.04],   // Fiordo Blanco
  [2.12, -30, 0.06],   // Golfo de los Robles, entre el bosque y las praderas
  [3.05, 30, 0.10],    // Lengua de Fango: la ciénaga se derrama en el mar
  [0.88, 40, 0.14],    // Espolón Helado: las cumbres caen al mar en acantilado
  [-1.75, -22, 0.09],  // Cala de las Ruinas
];

export function radioCosta(ang) {
  let r = 236
    + 22 * Math.sin(2 * ang + 0.6)
    + 13 * Math.sin(3 * ang - 1.3)
    + 8 * Math.sin(5 * ang + 2.1)
    + 6 * Math.sin(8 * ang + 0.4)
    + 4 * Math.sin(13 * ang + 1.7)
    + 2.4 * Math.sin(21 * ang + 0.9)
    + 1.4 * Math.sin(34 * ang + 2.6);
  for (const [a0, dr, w] of ACCIDENTES) {
    const d = norm(ang - a0) / w;
    r += dr * Math.exp(-d * d);
  }
  return r;
}

/**
 * Distancia aproximada a la costa: positiva tierra adentro, negativa en el mar.
 * (Es la diferencia de radios en la dirección del punto: exacta en la costa y
 * de sobra para rampas, playas y bloqueos.)
 */
export function costaDist(x, z) {
  return radioCosta(Math.atan2(z, x)) - Math.hypot(x, z);
}

/** ¿Se puede pisar? `margen`: cuánto separarse de la orilla. */
export function enTierra(x, z, margen = 0) {
  return costaDist(x, z) >= margen;
}

// Islotes frente a la costa: se ven desde la orilla y en el mapa, pero el mar
// los separa del continente (no se llega a ellos).
export const ISLOTES = [
  [1.25, 34, 15],      // [ángulo, distancia mar adentro desde la costa, radio]
  [-0.45, 30, 11],
  [-2.05, 32, 13],
  [2.95, 28, 10],
  [0.30, 40, 8],
].map(([a, mar, r]) => {
  const R = radioCosta(a) + mar + r;
  return { x: Math.cos(a) * R, z: Math.sin(a) * R, r };
});

// ============================================================ comarcas
// Los colores son vivos a propósito: la luz violeta del anochecer los apaga, y
// con los tonos de antes el suelo se veía gris.
//
// Cada comarca ocupa un SECTOR del continente. Las fronteras ya no son radios
// rectos: el ángulo se deforma con ruido suave (angComarca), así se leen como
// regiones naturales y no como una tarta.
//
//   -z = NORTE   +z = SUR   +x = ESTE   -x = OESTE
//
// amp   = cuánto ondula el relieve (0 = casi llano)
// lift  = desplazamiento vertical de la comarca (negativo = hondonada)
// peak  = realce extra hacia el interior lejano (para mesetas y montañas)
// rampa = cuánto tarda el suelo en bajar al mar (corta = acantilado)
//
// Los sectores están recortados a medida del contenido que ya vive en cada
// dirección (criaturas, NPC, caminos): así ninguna zona de inicio cae dentro de
// una comarca de alto nivel.
export const COMARCAS = [
  {
    id: 'llanura', name: 'Llanura de Valdoria',
    from: -0.40, to: 0.50,            // este: colina de Nyra y su cripta
    color: 0x3e5a2a, amp: 1.5, lift: 0, peak: 0.05, rampa: 30,
  },
  {
    id: 'cumbres', name: 'Cumbres Heladas',
    from: 0.50, to: 1.15,             // sureste: criaturas heladas, Jarl y Skadi
    color: 0xdfe8f0, amp: 4.0, lift: 3.0, peak: 0.26, rampa: 26, colorDesde: 95,
  },
  {
    id: 'praderas', name: 'Praderas del Sur',
    from: 1.15, to: 2.10,             // sur: camino de la puerta, Alfa, piedras
    color: 0x4c5e2c, amp: 1.8, lift: 0, peak: 0.06, rampa: 30,
  },
  {
    id: 'bosque', name: 'Bosque del Oeste',
    from: 2.10, to: 2.90,             // suroeste: jabalíes y Cripta del Bosque
    color: 0x26421e, amp: 2.6, lift: 0.4, peak: 0.12, rampa: 26,
  },
  {
    id: 'cienaga', name: 'Ciénaga de los Ahogados',
    from: 2.90, to: -2.20,            // noroeste (cruza ±π): Ahogados y Rey del Fango
    color: 0x36402a, amp: 1.2, lift: -2.0, peak: -0.11, rampa: 34,
  },
  {
    id: 'colinas', name: 'Colinas del Norte',
    from: -2.20, to: -0.40,           // norte y noreste: ruinas, lago y osos
    color: 0x4a5a34, amp: 3.0, lift: 3.4, peak: 0.14, rampa: 22,
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

// Ángulo deformado: las fronteras entre comarcas serpentean en vez de ser
// radios. Cerca de la Ciudadela la amplitud es pequeña (±0,11 rad): ahí vive
// el contenido de cada comarca y nadie debe cambiar de comarca. Mar afuera,
// donde la tierra es nueva, las fronteras se retuercen mucho más.
function angComarca(x, z) {
  const r = Math.hypot(x, z);
  const lejos = 1 + 2.2 * smooth((r - 150) / 90);
  return norm(Math.atan2(z, x)
    + lejos * (0.07 * Math.sin(x * 0.019 + z * 0.011)
             + 0.045 * Math.cos(z * 0.027 - x * 0.015))
    + 0.12 * smooth((r - 150) / 90) * Math.sin(r * 0.031 + Math.atan2(z, x) * 3));
}

/** Comarca de un punto del mundo (siempre devuelve una). */
export function biomeAt(x, z) {
  const ang = angComarca(x, z);
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

// Peso de cada comarca en un punto: 1 en el centro de su sector y cae hacia el
// borde. `ancho` controla cuánto se mezclan las vecinas.
function pesos(x, z, ancho) {
  const ang = angComarca(x, z);
  const out = [];
  for (const c of COMARCAS) {
    let mid = c.from + norm(c.to - c.from) / 2;
    if (c.from > c.to) mid = norm(c.from + norm(c.to + TAU - c.from) / 2);
    const half = Math.abs(norm(c.to - c.from)) / 2 || 0.5;
    const d = Math.abs(norm(ang - mid));
    const w = Math.max(0, 1 - d / (half * ancho));
    if (w > 0) out.push([c, w * w]);
  }
  return out;
}

// Mezcla el perfil de comarcas vecinas cerca de sus bordes, para que no haya un
// escalón recto entre una y otra. El factor es ajustado a propósito (1.15): con
// una mezcla más ancha, una comarca hundida como la Ciénaga arrastraba hacia
// abajo a sus vecinas y todas se parecían.
function blendedProfile(x, z) {
  let amp = 0, lift = 0, peak = 0, rampa = 0, wsum = 0;
  for (const [c, w] of pesos(x, z, 1.15)) {
    amp += c.amp * w; lift += c.lift * w; peak += c.peak * w; rampa += c.rampa * w; wsum += w;
  }
  if (wsum === 0) { const c = biomeAt(x, z); return { amp: c.amp, lift: c.lift, peak: c.peak, rampa: c.rampa }; }
  return { amp: amp / wsum, lift: lift / wsum, peak: peak / wsum, rampa: rampa / wsum };
}

// Perfil de la orilla según la distancia a la costa: playa que sube suave
// tierra adentro y fondo marino que baja mar adentro.
function perfilOrilla(d) {
  if (d >= 0) return NIVEL_MAR + 0.3 + Math.min(d, 8) * 0.1;
  return Math.max(NIVEL_MAR - 7, NIVEL_MAR + 0.3 + d * 0.24);
}

/**
 * Altura del suelo en (x, z).
 * La Ciudadela y su plaza son LLANAS (altura 0) para no tener que rehacer sus
 * edificios; el relieve entra poco a poco al salir de la muralla y, al llegar
 * a la costa, el suelo baja hasta la playa (o cae en acantilado en la montaña).
 */
export function heightAt(x, z) {
  // Las criptas viven desplazadas a x+500/700/900, fuera del continente:
  // son interiores y su suelo es plano.
  if (x > 400) return 0;
  const r = Math.hypot(x, z);
  if (r <= FLAT_RADIUS) return 0;

  const { amp, lift, peak, rampa } = blendedProfile(x, z);
  // Cuánto "pesa" el relieve aquí: 0 junto a la muralla, 1 pasado BLEND_RADIUS
  const entrada = smooth((r - FLAT_RADIUS) / (BLEND_RADIUS - FLAT_RADIUS));
  // Realce progresivo hacia el interior lejano (mesetas y montañas)
  const haciaFuera = smooth((r - FLAT_RADIUS) / (ALCANCE_RELIEVE - FLAT_RADIUS));
  let h = (rolling(x, z) * amp + lift + peak * haciaFuera * 34) * entrada;

  // La costa: el relieve cede ante la orilla
  const d = costaDist(x, z);
  if (d < rampa + 4) {
    const t = smooth((d - 3) / rampa);
    h = perfilOrilla(d) * (1 - t) + h * t;
  }
  // Islotes: lomas que asoman del mar
  if (d < 0) {
    for (const i of ISLOTES) {
      const k = 1 - Math.hypot(x - i.x, z - i.z) / i.r;
      if (k > 0) h = Math.max(h, NIVEL_MAR - 2 + smooth(k * 1.6) * (3.2 + i.r * 0.12) + rolling(x, z) * 0.3 * k);
    }
  }
  return h;
}

/**
 * Color del suelo en (x, z), mezclado entre comarcas vecinas para que la
 * frontera sea un degradado y no una línea. Devuelve [r, g, b] en 0..1 (sin
 * depender de Three.js: este módulo es geometría pura).
 */
export function colorAt(x, z) {
  // Cerca de la Ciudadela todas las comarcas ceden al verde de la llanura, para
  // que el terreno no cambie de color de golpe al cruzar la muralla. La nieve
  // empieza más lejos (colorDesde): mezclada con el verde junto a la muralla
  // salía un gris sucio.
  const rad = Math.hypot(x, z);
  const base = COMARCAS[0].color;
  const B = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
  let r = 0, g = 0, b = 0, wsum = 0;
  let lista = pesos(x, z, 1.35);
  if (!lista.length) lista = [[biomeAt(x, z), 1]];
  for (const [c, w] of lista) {
    const desde = c.colorDesde ?? FLAT_RADIUS;
    const m = smooth((rad - desde) / (BLEND_RADIUS - FLAT_RADIUS));
    r += (((c.color >> 16) & 255) * m + B[0] * (1 - m)) * w;
    g += (((c.color >> 8) & 255) * m + B[1] * (1 - m)) * w;
    b += ((c.color & 255) * m + B[2] * (1 - m)) * w;
    wsum += w;
  }
  let col = [r / wsum, g / wsum, b / wsum];

  // Manchas: claros más secos y hondonadas más verdes, para que la hierba no
  // sea un único tono de punta a punta.
  const mancha = 1 + 0.08 * Math.sin(x * 0.09 + Math.cos(z * 0.05) * 2) * Math.cos(z * 0.083)
                   + 0.05 * Math.sin((x - z) * 0.047);
  col = col.map((v) => v * mancha);

  // Orilla: arena en la playa (roca clara al pie de los acantilados nevados) y
  // fondo arenoso bajo el agua.
  const d = costaDist(x, z);
  if (d < 12) {
    const nieve = biomeAt(x, z).id === 'cumbres';
    // Arena tirando a oliva: la luz violeta del ocaso la vuelve salmón si no
    const arena = nieve ? [104, 108, 120] : [124, 118, 70];
    const t = smooth((12 - d) / 9);
    col = col.map((v, i) => v * (1 - t) + arena[i] * t);
    if (d < 0) {
      const hondo = smooth(-d / 20);
      col = col.map((v, i) => v * (1 - hondo * 0.5) + [40, 70, 80][i] * hondo * 0.5);
    }
  }
  return col.map((v) => Math.max(0, Math.min(255, v)) / 255);
}

/** Pendiente aproximada (para colocar props o evitar sitios muy inclinados). */
export function slopeAt(x, z, d = 2) {
  const hx = heightAt(x + d, z) - heightAt(x - d, z);
  const hz = heightAt(x, z + d) - heightAt(x, z - d);
  return Math.hypot(hx, hz) / (2 * d);
}

/** Contorno de la costa como polígono (para el mapa y la malla del mar). */
export function contornoCosta(n = 360) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i / n) * TAU;
    const R = radioCosta(a);
    out.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  return out;
}
