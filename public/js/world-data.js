// Datos del mundo compartidos entre cliente y servidor (puros, sin DOM):
// piedras rúnicas de viaje rápido y monturas.

// Piedras rúnicas (waystones): puntos de teletransporte repartidos por el mundo.
// 'ciudadela' está descubierta desde el principio (hogar).
export const WAYSTONES = [
  { id: 'ciudadela', name: 'Ciudadela de Valdoria', x: 6, z: 20 },
  { id: 'puerta_sur', name: 'Puerta Sur', x: 0, z: 52 },
  { id: 'bosque_oeste', name: 'Bosque del Oeste', x: -58, z: 40 },
  { id: 'colina_este', name: 'Colina del Este', x: 66, z: 20 },
  { id: 'lago', name: 'Lago de los Ciervos', x: 52, z: -44 },
  { id: 'ruinas', name: 'Ruinas del Norte', x: 0, z: -70 },
  { id: 'cienaga', name: 'Ciénaga de los Ahogados', x: -78, z: -44 },
];

export function waystoneById(id) {
  return WAYSTONES.find((w) => w.id === id) || null;
}

// Monturas: aumentan la velocidad de movimiento. Se compran en el Establo.
// speed = fracción de velocidad extra (0.6 = +60%).
export const MOUNTS = {
  corcel: { id: 'corcel', name: 'Corcel de Valdoria', icon: '🐴', price: 300, speed: 0.55, color: 0x8a6a4a, desc: 'Un caballo pardo, fiel y resistente. +55% de velocidad.' },
  huargo: { id: 'huargo', name: 'Lobo Huargo', icon: '🐺', price: 1200, speed: 0.75, color: 0x5a5a66, desc: 'Una bestia gris domada en la llanura. +75% de velocidad.' },
  espectro: { id: 'espectro', name: 'Corcel Espectral', icon: '💀', price: 3000, speed: 0.95, color: 0x9ad8c8, desc: 'Montura fantasmal de las criptas. Casi vuela: +95% de velocidad.' },
};
