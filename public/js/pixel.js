// Motor de render en pixel art.
//
// El mundo sigue siendo 3D: la misma geometría, la misma cámara, los mismos
// clics. Lo que cambia es CÓMO se pinta:
//
//   1. La escena se renderiza a baja resolución (la mitad de la pantalla por
//      defecto: píxel de 2) en una textura propia.
//   2. Esa textura se lleva a pantalla SIN suavizar: cada píxel del juego es un
//      cuadrado nítido de 3×3.
//   3. Por el camino, un sombreador reduce los colores (cada canal a 7 niveles,
//      como el hardware de 16 bits, con tramado ordenado para los degradados)
//      y dibuja un contorno de un píxel allí donde cambia la profundidad: la
//      silueta oscura que hace que cada personaje, árbol o casa se lea como un
//      sprite dibujado a mano.
//
//      Hay también una paleta fija (ENDESGA 32 + piedra), apagada por defecto:
//      da más identidad de consola, pero al forzar el mundo entero a 37 colores
//      la hierba del anochecer caía en gris y la plaza en fucsia. Posterizar
//      conserva el color propio de cada comarca.
//   4. Los nombres, barras de vida y números flotantes se pintan DESPUÉS, a
//      resolución completa: pixelados serían ilegibles.
//
// Como nada de esto toca la lógica del juego, se puede apagar desde Ajustes y
// el juego vuelve a verse como antes.
import * as THREE from 'three';

// Capa de los elementos de interfaz dentro del mundo (nombres, barras de vida,
// marcadores, números flotantes). Se pintan aparte, nítidos.
export const OVERLAY_LAYER = 1;

// Paleta ENDESGA 32: 32 colores pensados precisamente para pixel art, con
// verdes, tierras, fríos y una buena escala de oscuros — que en un juego de
// fantasía oscura es donde se juega casi todo.
const PALETTE_HEX = [
  0xbe4a2f, 0xd77643, 0xead4aa, 0xe4a672, 0xb86f50, 0x733e39, 0x3e2731, 0xa22633,
  0xe43b44, 0xf77622, 0xfeae34, 0xfee761, 0x63c74d, 0x3e8948, 0x265c42, 0x193c3e,
  0x124e89, 0x0099db, 0x2ce8f5, 0xffffff, 0xc0cbdc, 0x8b9bb4, 0x5a6988, 0x3a4466,
  0x262b44, 0x181425, 0xff0044, 0x68386c, 0xb55088, 0xf6757a, 0xe8b796, 0xc28569,
  // Añadidos para Valdoria: grises de piedra y una tierra apagada. Sin ellos, el
  // empedrado de la Ciudadela al anochecer no encontraba su color y caía en el
  // morado de la paleta, y la ciudad entera se volvía fucsia.
  0x3a3236, 0x4b4453, 0x6e6474, 0x5b4a44,
];
const PALETTE = PALETTE_HEX.map((h) => new THREE.Vector3(
  ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255,
));

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 resolution;      // tamaño de la textura de baja resolución
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec3 palette[${PALETTE.length}];
  uniform float paletteMix;     // 0 = color original, 1 = paleta pura
  uniform float dither;         // fuerza del tramado
  uniform float outline;        // 0 = sin contornos
  uniform float exposure;       // realce de luz previo a la paleta
  uniform float gamma;          // <1 abre las sombras
  uniform float saturation;     // >1 aviva los colores
  uniform float levels;         // niveles por canal al posterizar (0 = no)
  varying vec2 vUv;

  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }

  // Matriz de Bayer 4x4: el tramado clásico de las consolas de 8 y 16 bits.
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
    m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
    m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
    for (int k = 0; k < 16; k++) { if (k == i) return m[k] / 16.0 - 0.5; }
    return 0.0;
  }

  // Color más cercano de la paleta. Distancia "redmean": barata y bastante más
  // fiel a como ve el ojo que la euclídea pura.
  vec3 nearestPalette(vec3 c) {
    vec3 best = palette[0];
    float bestD = 1e9;
    for (int i = 0; i < ${PALETTE.length}; i++) {
      vec3 p = palette[i];
      float rm = (c.r + p.r) * 0.5;
      vec3 d = c - p;
      float dist = (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
      if (dist < bestD) { bestD = dist; best = p; }
    }
    return best;
  }

  void main() {
    // Centro exacto del píxel grande: todo el bloque toma el mismo color.
    vec2 px = floor(vUv * resolution);
    vec2 uv = (px + 0.5) / resolution;
    vec3 col = texture2D(tColor, uv).rgb;

    // Tono y espacio de color: al pintar en una textura propia, Three no los
    // aplica, así que se hacen aquí, antes de reducir a la paleta (que está en sRGB).
    #ifdef TONE_MAPPING
      col = toneMapping(col);
    #endif
    col = linearToOutputTexel(vec4(col, 1.0)).rgb;

    // Realce: el ocaso del juego vive en tonos casi negros, y una paleta de 32
    // colores solo tiene cuatro o cinco oscuros. Sin abrir las sombras antes,
    // todo lo oscuro caería en el mismo color y el mundo se volvería una mancha.
    // Se realza la LUMINOSIDAD, no cada canal: aplicar la curva canal a canal
    // aplasta las diferencias entre ellos, y la hierba se volvía gris.
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    float lumaNueva = pow(clamp(luma * exposure, 0.0, 1.0), gamma);
    col = clamp(col * (lumaNueva / max(luma, 1e-4)), 0.0, 1.0);
    // Saturación: el render 3D al anochecer sale apagado, y el pixel art es vivo.
    float l2 = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(l2), col, saturation), 0.0, 1.0);

    // Contorno: si algún vecino está bastante más lejos, este píxel es el
    // borde de algo que tiene delante el vacío o el suelo. Se oscurece.
    if (outline > 0.0) {
      vec2 t = 1.0 / resolution;
      float d0 = linearDepth(uv);
      float dl = linearDepth(uv - vec2(t.x, 0.0));
      float dr = linearDepth(uv + vec2(t.x, 0.0));
      float du = linearDepth(uv + vec2(0.0, t.y));
      float dd = linearDepth(uv - vec2(0.0, t.y));
      float salto = max(max(dl, dr), max(du, dd)) - d0;
      float umbral = d0 * 0.035 + 0.35;
      if (salto > umbral && d0 < cameraFar * 0.9) {
        col = mix(col, vec3(0.094, 0.078, 0.145), 0.82 * outline);
      }
    }

    // Tramado + reducción de color. Dos caminos que se pueden mezclar:
    //  - posterizar: cada canal a pocos niveles, como el hardware de 16 bits.
    //    Conserva el tono de cada comarca (la hierba sigue siendo verde).
    //  - paleta fija: identidad más "consola", pero fuerza todo a 37 colores y
    //    con la luz del anochecer algunos biomas caen en el tono equivocado.
    vec3 conTrama = clamp(col + bayer4(px) * dither, 0.0, 1.0);
    vec3 reducido = levels > 0.0
      ? floor(conTrama * (levels - 1.0) + 0.5) / (levels - 1.0)
      : conTrama;
    // La búsqueda en la paleta recorre 36 colores por píxel: solo se hace si
    // la paleta está en uso (por defecto no lo está).
    vec3 final = reducido;
    if (paletteMix > 0.0) final = mix(reducido, nearestPalette(conTrama), paletteMix);
    gl_FragColor = vec4(final, 1.0);
  }
`;

export class PixelPipeline {
  constructor(renderer, { pixelSize = 2 } = {}) {
    this.renderer = renderer;
    this.pixelSize = pixelSize;
    this.target = null;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 1 },
        cameraFar: { value: 300 },
        palette: { value: PALETTE },
        paletteMix: { value: 0 },
        dither: { value: 0.06 },
        outline: { value: 1 },
        // Calibrado comparando con el render clásico en la plaza y en la
        // llanura: mismos tonos que el original, con las sombras algo abiertas
        // para que los oscuros no se fundan al reducir colores.
        exposure: { value: 1.05 },
        gamma: { value: 0.88 },
        saturation: { value: 1.12 },
        levels: { value: 7 },
      },
      depthTest: false,
      depthWrite: false,
    });
    // Un triángulo que cubre toda la pantalla: más barato que un cuadrado.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setPixelSize(n) {
    this.pixelSize = Math.max(1, Math.round(n));
    this.setSize(this._w || window.innerWidth, this._h || window.innerHeight);
  }

  setSize(w, h) {
    this._w = w;
    this._h = h;
    const lw = Math.max(1, Math.floor(w / this.pixelSize));
    const lh = Math.max(1, Math.floor(h / this.pixelSize));
    if (this.target) this.target.dispose();
    this.target = new THREE.WebGLRenderTarget(lw, lh, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      // Media precisión: el tono ACES necesita valores por encima de 1.
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(lw, lh),
    });
    this.material.uniforms.tColor.value = this.target.texture;
    this.material.uniforms.tDepth.value = this.target.depthTexture;
    this.material.uniforms.resolution.value.set(lw, lh);
  }

  setOptions({ outline, paletteMix, dither, exposure, gamma, saturation, levels } = {}) {
    const u = this.material.uniforms;
    if (levels !== undefined) u.levels.value = levels;
    if (saturation !== undefined) u.saturation.value = saturation;
    if (exposure !== undefined) u.exposure.value = exposure;
    if (gamma !== undefined) u.gamma.value = gamma;
    if (outline !== undefined) u.outline.value = outline ? 1 : 0;
    if (paletteMix !== undefined) u.paletteMix.value = paletteMix;
    if (dither !== undefined) u.dither.value = dither;
  }

  render(scene, camera) {
    if (!this.target) this.setSize(window.innerWidth, window.innerHeight);
    const r = this.renderer;
    const u = this.material.uniforms;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;

    // 1) El mundo, a baja resolución y sin la interfaz.
    camera.layers.set(0);
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);

    // 2) A pantalla, con paleta, tramado y contorno.
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);

    // 3) Nombres, barras y números, a resolución completa y encima.
    // Ojo: si el fondo de la escena es un color, Three LIMPIA la pantalla al
    // renderizar aunque autoClear esté apagado, y borraría el pixel art recién
    // pintado. Se quita el fondo solo durante esta pasada.
    const autoClear = r.autoClear;
    const fondo = scene.background;
    r.autoClear = false;
    scene.background = null;
    camera.layers.set(OVERLAY_LAYER);
    r.render(scene, camera);
    scene.background = fondo;
    r.autoClear = autoClear;

    // La cámara vuelve a verlo todo, por si alguien la usa fuera de aquí.
    camera.layers.enableAll();
  }

  dispose() {
    this.target?.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}

// Marca un objeto como interfaz del mundo: se pinta nítido, por encima del
// pixel art. Se aplica a los sprites de nombres, barras y números.
export function asOverlay(obj) {
  obj.layers.set(OVERLAY_LAYER);
  return obj;
}

// ---- Texto sobre el mundo ----
// Fuente píxel de la interfaz. Se carga desde index.html; si aún no ha llegado,
// el navegador cae en la monoespaciada, que tampoco desentona.
export const PIXEL_FONT = '"Pixelify Sans", "Courier New", monospace';

export function isPixelMode() {
  return typeof document !== 'undefined' && document.body.classList.contains('pixel');
}

// Dibuja un texto de etiqueta (nombre, número de daño, marcador). En estilo
// píxel lleva fuente píxel y un CONTORNO DURO negro, como los textos de los
// juegos de 16 bits; la sombra difusa de antes se veía borrosa junto al pixel
// art. Fuera del estilo píxel dibuja exactamente lo de siempre.
export function drawLabel(ctx, text, x, y, { size, color, glow = 'black', blur = 6, serif = 'Georgia' }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isPixelMode()) {
    ctx.font = `700 ${Math.round(size * 0.92)}px ${PIXEL_FONT}`;
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(4, Math.round(size / 6));
    ctx.strokeStyle = '#0b0710';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return;
  }
  ctx.font = `bold ${size}px ${serif}`;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
