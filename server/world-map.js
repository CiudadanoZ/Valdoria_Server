// Disposición del mundo: reinos, saltos de portal, puntos de NPC, hierbas,
// pesca y hogueras. Coordenadas puras; la validación de cercanía (nearSpot)
// y la lógica siguen en server/server.js.

// ============================ REINOS ============================
export const REALMS = [
  { id: 'valdoria', name: 'Valdoria', desc: 'El reino principal' },
  { id: 'penumbra', name: 'Penumbra', desc: 'Mundo alternativo para empezar de cero' },
];

// ============================ GEOGRAFÍA (validaciones) ============================
// Saltos legítimos de posición: portales de las criptas (dirección de uso)
export const PORTAL_JUMPS = [
  { from: [-33, -12], to: [500, 4] },   // entrada cripta principal
  { from: [500, 9], to: [-29, -12] },   // salida cripta principal
  { from: [-72, 58], to: [700, 4] },    // entrada Cripta del Bosque
  { from: [700, 6.5], to: [-69, 55] },  // salida Cripta del Bosque
  { from: [74, 28], to: [900, 4] },     // entrada Cripta de la Colina
  { from: [900, 6.5], to: [71, 25] },   // salida Cripta de la Colina
];
export const FOUNTAIN = [0, 14]; // reaparición al morir
export const MAX_SPEED = 16;     // unidades/s (andar 7 × sprint 1,8 × talentos 1,12 + margen)

// Hierbas Lumina de la plaza (recolección validada por cercanía)
export const HERB_SPOTS = [[12, 14], [-19, -6], [22, -4], [-8, -20], [-28, 14], [17, 24]];
export const HERB_COOLDOWN_MS = 20000;

// Puntos de pesca del Lago de los Ciervos (onda en el agua + orilla desde la que se pesca)
export const LAKE = [62, -52];
export const FISHING_SPOTS = [Math.PI * 0.15, Math.PI * 0.75, Math.PI * 1.35].map((a) => ({
  shore: [LAKE[0] + Math.cos(a) * 18.5, LAKE[1] + Math.sin(a) * 18.5],
}));

// Dónde hay que estar para usar cada servicio (validación de cercanía)
export const NPC_SPOTS = {
  lyra: [-16, 9.5],   // tienda
  bramm: [16.5, -14.5], // forja
  mira: [-3, -22],    // curación y bendiciones
  establo: [24, 8],   // Establero (monturas)
  subastas: [-24, 10], // Subastador (casa de subastas)
};
export const CAMPFIRE_SPOTS = [
  [-67 + Math.sin(0.6) * 4, 55 + Math.cos(0.6) * 4],   // campamento de Baldur
  [70 + Math.sin(-2.2) * 4, 21 + Math.cos(-2.2) * 4],  // campamento de Nyra
  [-14, -12],                                           // hoguera de la posada
];

// Radio de la zona segura de la Ciudadela (nadie recibe daño dentro).
export const CITADEL_SAFE_RADIUS = 45;
