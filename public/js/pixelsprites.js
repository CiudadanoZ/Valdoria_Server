// Personajes en pixel art, pintados píxel a píxel por código.
//
// Sustituyen a los muñecos de cilindros y esferas. Cada héroe se compone a
// partir de su raza y su clase (piel, pelo, armadura, arma) y se pinta en una
// hoja de fotogramas: tres orientaciones (de frente, de espaldas y de perfil;
// el otro perfil es el espejo) × reposo, paso y ataque.
//
// Dos técnicas que separan el pixel art profesional del de aficionado:
//   - Rampas con desplazamiento de tono: las sombras no son "el mismo color
//     más oscuro" sino que viran hacia el violeta, y las luces hacia el
//     amarillo. Así el volumen se lee con muy pocos píxeles.
//   - Contorno selectivo: el borde de cada pieza es una versión oscura de SU
//     color, no un negro uniforme. El negro puro aplasta; esto da relieve.
//
// El cuerpo 3D de antes sigue existiendo pero invisible: es la zona de clic y
// el que lleva posición, rotación y animación. El sprite solo es la piel, así
// que ninguna mecánica cambia.
import * as THREE from 'three';

export const FRAME_W = 36;
export const FRAME_H = 48;

// Columnas de la hoja: 2 de reposo, 4 de paso, 2 de ataque.
export const ANIMS = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  attack: [6, 7],
};
const COLS = 8;
// Filas: de frente (hacia la cámara), de espaldas, de perfil derecho.
export const DIRS = { S: 0, N: 1, E: 2 };
const ROWS = 3;

// ---------------------------------------------------------------- color

function hexToHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToCss(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)},${f(8)},${f(4)})`;
}

// Rampa de 5 tonos con desplazamiento de tono hacia frío en las sombras y
// hacia cálido en las luces.
export function ramp(hex) {
  const [h, s, l] = hexToHsl(hex);
  const haciaFrio = (dh) => h + dh * (h > 0.08 && h < 0.75 ? 1 : -1) * -1;
  return {
    o: hslToCss(h + 0.04, Math.min(1, s * 0.9 + 0.1), l * 0.28),   // contorno
    d: hslToCss(haciaFrio(0.03) + 0.025, s * 0.95, l * 0.62),       // sombra
    b: hslToCss(h, s, l),                                           // base
    l: hslToCss(h - 0.015, s * 0.95, Math.min(0.92, l * 1.22 + 0.04)), // luz
    h: hslToCss(h - 0.03, s * 0.8, Math.min(0.96, l * 1.45 + 0.1)),    // brillo
  };
}

// ---------------------------------------------------------------- lienzo

export class Grid {
  // `s`: escala de pintado. Los pintores dibujan en sus coordenadas de siempre
  // y el lienzo las multiplica: así las criaturas y los árboles, diseñados a
  // 32 px, se pintan a 48 sin redibujarlos, con los óvalos más finos y el
  // contorno de un píxel nítido (se traza ya a la resolución final).
  constructor(w = FRAME_W, h = FRAME_H, s = 1) {
    this.s = s;
    this.w = Math.round(w * s); this.h = Math.round(h * s);
    this.c = new Array(this.w * this.h).fill(null);
  }
  // Píxel real del lienzo, sin escalar
  px(x, y, col) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !col) return;
    this.c[y * this.w + x] = col;
  }
  set(x, y, col) {
    if (this.s === 1) this.px(Math.round(x), Math.round(y), col);
    else this.rect(x, y, 1, 1, col);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.c[y * this.w + x];
  }
  rect(x, y, w, h, col) {
    if (!col) return;
    const s = this.s;
    const x0 = Math.round(x * s), y0 = Math.round(y * s);
    const x1 = Math.max(x0 + 1, Math.round((x + w) * s));
    const y1 = Math.max(y0 + 1, Math.round((y + h) * s));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.px(i, j, col);
  }
  // Rectángulo con volumen: luz a la izquierda, sombra a la derecha y abajo.
  block(x, y, w, h, r, { top = true } = {}) {
    this.rect(x, y, w, h, r.b);
    for (let j = 0; j < h; j++) { this.set(x, y + j, r.l); this.set(x + w - 1, y + j, r.d); }
    if (top) for (let i = 0; i < w - 1; i++) this.set(x + i, y, r.l);
    for (let i = 1; i < w; i++) this.set(x + i, y + h - 1, r.d);
  }
  // Óvalo con volumen: la luz viene de arriba a la izquierda, como en todo el
  // juego. Con cuatro tonos basta para que un cuerpo parezca redondo.
  // `suave`: luz más plana, para caras. Con el sombreado de los cuerpos, la
  // mitad inferior de una cara caía en sombra y se veía sucia.
  blob(cx, cy, rx, ry, r, suave = false) {
    const [uh, ul, ud] = suave ? [0.9, 0.6, -0.78] : [0.72, 0.32, -0.42];
    const s = this.s;
    // Se recorren los píxeles REALES: a escala >1 el óvalo sale más fino.
    for (let Y = Math.floor((cy - ry) * s); Y <= Math.ceil((cy + ry + 1) * s); Y++) {
      for (let X = Math.floor((cx - rx) * s); X <= Math.ceil((cx + rx + 1) * s); X++) {
        const x = (X + 0.5) / s - 0.5, y = (Y + 0.5) / s - 0.5;
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const luz = -nx * 0.55 - ny * 0.83;
        this.px(X, Y, luz > uh ? r.h : luz > ul ? r.l : luz < ud ? r.d : r.b);
      }
    }
  }
  // Contorno selectivo: cada hueco vacío junto a un píxel lleno toma una
  // versión oscura del color de su vecino.
  outline(outlineOf) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n = this.get(x, y - 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y + 1);
        if (n) add.push([x, y, outlineOf(n)]);
      }
    }
    for (const [x, y, c] of add) this.set(x, y, c);
  }
  drawTo(ctx, ox, oy) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const col = this.c[y * this.w + x];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

// El contorno de cada color se calcula una vez: oscuro y algo más frío.
const outlineCache = new Map();
// Acepta los dos formatos que circulan por los pintores: 'rgb(r,g,b)' (los de
// ramp) y '#rrggbb' (ojos, dientes, brillos). Antes solo entendía el primero:
// con '#ffffff' fallaba y con '#1a1014' sacaba un contorno de color absurdo.
function cssAHex(css) {
  if (css[0] === '#') return parseInt(css.slice(1, 7), 16);
  const m = css.match(/\d+/g).map(Number);
  return (m[0] << 16) | (m[1] << 8) | m[2];
}

export function darkOf(css) {
  if (outlineCache.has(css)) return outlineCache.get(css);
  const out = ramp(cssAHex(css)).o;
  outlineCache.set(css, out);
  return out;
}

// ---------------------------------------------------------------- hojas
// Las figuras humanas (héroes y NPCs) se pintan en pixelfiguras.js; las
// criaturas en pixelcreatures.js; los árboles en pixelprops.js.

const sheetCache = new Map();

// Monta una hoja completa llamando a `paint(dir, anim, f)` para cada
// fotograma. La usan héroes, NPCs y criaturas; cada uno con su tamaño.
export function buildSheet(key, fw, fh, paint) {
  if (sheetCache.has(key)) return sheetCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = fw * COLS;
  canvas.height = fh * ROWS;
  canvas.frameW = fw;
  canvas.frameH = fh;
  const ctx = canvas.getContext('2d');
  for (const [dir, row] of Object.entries(DIRS)) {
    for (const [anim, cols] of Object.entries(ANIMS)) {
      cols.forEach((col, f) => paint(dir, anim, f).drawTo(ctx, col * fw, row * fh));
    }
  }
  sheetCache.set(key, canvas);
  return canvas;
}

// ---------------------------------------------------------------- en el mundo

// Sprite animado que hace de "piel" de una entidad 3D. Lee la rotación del
// cuerpo para elegir orientación y si se mueve para elegir animación.
// Una textura base por hoja. Cada entidad necesita su propia textura (cada una
// muestra un fotograma distinto: offset y repeat son por textura), pero los
// clones comparten la imagen, y Three la sube a la tarjeta gráfica UNA vez.
// Sin esto, cada lobo y cada árbol subían su propia copia de la misma hoja.
const texturasBase = new WeakMap();
export function texturaDe(canvas) {
  let base = texturasBase.get(canvas);
  if (!base) {
    base = new THREE.CanvasTexture(canvas);
    base.magFilter = THREE.NearestFilter;
    base.minFilter = THREE.NearestFilter;
    base.generateMipmaps = false;
    base.colorSpace = THREE.SRGBColorSpace;
    texturasBase.set(canvas, base);
  }
  return base;
}

export class SpriteSkin {
  constructor(sheetCanvas, { height = 2.6 } = {}) {
    const tex = texturaDe(sheetCanvas).clone();
    tex.repeat.set(1 / COLS, 1 / ROWS);
    this.tex = tex;
    this.material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false });
    profundidadDePies(this.material);
    this.sprite = new THREE.Sprite(this.material);
    // Anclado por los pies: así pisa el suelo donde pisaba el muñeco 3D.
    this.sprite.center.set(0.5, 0.02);
    const fw = sheetCanvas.frameW || FRAME_W, fh = sheetCanvas.frameH || FRAME_H;
    this.sprite.scale.set(height * fw / fh, height, 1);
    this.t = 0;
    this.anim = 'idle';
    this.dir = 'S';
    this.flip = false;
    this.attackT = 0;
    this.setFrame(0);
  }

  setFrame(col) {
    const row = DIRS[this.dir];
    // La hoja tiene el origen de UV abajo a la izquierda: fila 0 = arriba.
    // El perfil izquierdo es el derecho al revés, y se voltea en la TEXTURA:
    // un sprite de Three toma su tamaño como la longitud de la escala, así que
    // una escala negativa no lo voltearía.
    this.tex.repeat.x = (this.flip ? -1 : 1) / COLS;
    this.tex.offset.set((col + (this.flip ? 1 : 0)) / COLS, 1 - (row + 1) / ROWS);
  }

  playAttack() { this.attackT = 0.32; }

  // rotY: rotación del cuerpo en el mundo. cameraYaw: hacia dónde mira la
  // cámara (aquí siempre al norte, 0). moving: si se está desplazando.
  update(dt, rotY, moving, cameraYaw = 0) {
    this.t += dt;
    // Orientación relativa a la cámara, en cuatro cuadrantes.
    let a = rotY - cameraYaw;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) <= Math.PI / 4) { this.dir = 'S'; this.flip = false; }
    else if (Math.abs(a) >= Math.PI * 3 / 4) { this.dir = 'N'; this.flip = false; }
    else { this.dir = 'E'; this.flip = a < 0; }

    let anim = moving ? 'walk' : 'idle';
    if (this.attackT > 0) { this.attackT -= dt; anim = 'attack'; }
    if (anim !== this.anim) { this.anim = anim; this.t = 0; }

    const cols = ANIMS[anim];
    const fps = anim === 'walk' ? 8 : anim === 'attack' ? 7 : 1.6;
    const i = anim === 'attack'
      ? Math.min(cols.length - 1, Math.floor((0.32 - this.attackT) * fps))
      : Math.floor(this.t * fps) % cols.length;
    this.setFrame(cols[i]);
  }

  // Destello al recibir un golpe (el muñeco 3D lo hacía con el emisivo).
  setTint(r, g, b) { this.material.color.setRGB(r, g, b); }
}

// ---- Profundidad de figura en pie ----
// La cámara mira hacia abajo a 60°, y un sprite que la encara no está de pie:
// está recostado hacia atrás. Con su profundidad natural, cualquier muro que
// tuviera DETRÁS le cortaría la cabeza.
//
// Primer remedio (el clásico 2.5D): todo el sprite a la profundidad de sus
// pies. Funcionaba con los muros, pero fallaba con lo ELEVADO que queda
// detrás: el toldo de Lyra, un alero, una copa. Al estar en alto, su
// profundidad es menor que la de los pies aunque esté detrás, y tapaba al
// personaje que tenía delante.
//
// Remedio de verdad: cada píxel del sprite toma la profundidad que tendría si
// la figura estuviera DE PIE, vertical, sobre sus pies. Así se ordena igual que
// un cuerpo real: lo que está delante lo tapa, lo de detrás no, esté a la
// altura que esté. La figura vertical equivalente es más alta que el sprite
// (la cámara acorta las verticales), y se calcula para que ocupe exactamente
// lo mismo en pantalla.
export function profundidadDePies(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vProfPie;\nvoid main() {')
      .replace('mvPosition.xy += rotatedPosition;', [
        'vec4 pie = modelViewMatrix[ 3 ];',
        // Un pelo hacia la cámara: que el suelo bajo los pies no lo tape.
        'pie.z += 0.6;',
        // El "arriba" del mundo visto desde la cámara, y cuánto mide en pantalla.
        'vec3 arribaMundo = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz;',
        'float enPantalla = max( 0.2, length( arribaMundo.xy ) );',
        // Altura de este vértice dentro del sprite (0 en los pies, 1 arriba)
        // y su punto equivalente en la figura vertical.
        'float t = position.y + 0.5 - center.y;',
        'vec4 punto = pie + vec4( arribaMundo * ( t * scale.y / enPantalla ), 0.0 );',
        'vec4 puntoClip = projectionMatrix * punto;',
        'vProfPie = puntoClip.z / puntoClip.w;',
        'mvPosition.xy += rotatedPosition;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vProfPie;\nvoid main() {')
      .replace(/}\s*$/, 'gl_FragDepth = clamp( vProfPie * 0.5 + 0.5, 0.0, 1.0 );\n}');
  };
  material.customProgramCacheKey = () => 'sprite-figura-en-pie';
}

// Dirección "arriba" en pantalla, expresada en el mundo. Depende de la cámara
// de main.js (CAM_OFFSET = 0, 26, 15): su vertical de pantalla es
// perpendicular a ese vector. Si cambia la cámara, hay que cambiar esto.
export const CAMERA_UP = new THREE.Vector3(0, 15, -26).normalize();
const EJE_Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

// Coloca una etiqueta justo por encima del sprite en PANTALLA. Como el sprite
// se recuesta hacia la cámara, "encima" no es hacia arriba en el mundo sino a
// lo largo de CAMERA_UP. La etiqueta cuelga de un grupo que gira con el héroe,
// así que se compensa su giro.
export function placeLabelAbove(label, rotY, height) {
  tmp.copy(CAMERA_UP).multiplyScalar(height).applyAxisAngle(EJE_Y, -rotY);
  label.position.copy(tmp);
}

// Sombra en el suelo: sin el muñeco 3D no hay sombra proyectada, y sin sombra
// el sprite parece flotar. Un óvalo oscuro de pocos píxeles basta.
export function blobShadow(radius = 0.7) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(1, 0.6, 1);
  return m;
}

// ---------------------------------------------------------------- modo de arte

// Con el estilo píxel encendido se ven los sprites; apagado, los muñecos 3D de
// siempre. Así el interruptor de Ajustes sigue devolviendo el aspecto clásico.
export const artState = { sprites: true };

// Viste una entidad 3D con su piel de sprite. `root` es el grupo raíz (el que
// se mueve y gira); `body` el subgrupo de mallas que hasta ahora se veía.
// Altura en el mundo de un fotograma de héroe (48 px). Calibrada para que, con
// el píxel de render de 2 y la cámara del juego, cada píxel del dibujo caiga en
// UN píxel de pantalla: más pequeño, el sprite pierde líneas; más grande, se
// emborrona en bloques. Todo el pixel art del juego usa esta misma escala.
export const HERO_HEIGHT = 3.4;

export function dressWithSprite(root, body, sheet, { height = HERO_HEIGHT, shadow = 0.6 } = {}) {
  const skin = new SpriteSkin(sheet, { height });
  skin.sprite.name = 'skin';
  const sombra = blobShadow(shadow);
  root.add(skin.sprite);
  root.add(sombra);
  root.userData.skin = skin;
  root.userData.body = body;
  root.userData.shadow = sombra;
  applyArt(root);
  return skin;
}

export function applyArt(root) {
  const { skin, body, shadow } = root.userData;
  if (!skin) return;
  skin.sprite.visible = artState.sprites;
  if (shadow) shadow.visible = artState.sprites;
  // El cuerpo 3D se oculta pero sigue ahí: el raycaster de Three ignora la
  // visibilidad, así que continúa sirviendo de zona de clic.
  if (Array.isArray(body)) for (const b of body) b.visible = !artState.sprites;
  else if (body) body.visible = !artState.sprites;
}
