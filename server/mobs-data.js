// Datos de las criaturas del juego (tablas puras, sin lógica de servidor).
// La simulación (IA, muerte, botín) vive en server/server.js.

// Evento de mundo: cada cuánto reaparece el Coloso (segundos). Configurable.
export const EVENT_INTERVAL_S = Math.max(60, Number(process.env.EVENT_INTERVAL_S) || 900);
// Posición del jefe de mundo (claro al norte de la Ciudadela, lejos del refugio).
export const COLOSO_SPOT = [0, 150];

// Balance (alpha): la experiencia crece con la dificultad para que el contenido
// de las criptas y los jefes compensen el riesgo frente a farmear lobos.
export const MOB_TYPES = {
  lobo:    { name: 'Lobo Gris',       hp: 30,  dmgMin: 3,  dmgMax: 7,  speed: 5.8, aggro: 9,  range: 1.9, cd: 1.3, respawn: 20,  gold: [3, 7],   xp: 12,  drops: [['piel_lobo', 0.65], ['colmillo_lobo', 0.45]] },
  jabali:  { name: 'Jabalí Salvaje',  hp: 55,  dmgMin: 6,  dmgMax: 12, speed: 4.6, aggro: 7,  range: 2.0, cd: 1.6, respawn: 26,  gold: [8, 14],  xp: 20,  drops: [['carne_jabali', 0.85]] },
  alfa:    { name: 'Alfa Sombrío',    hp: 150, dmgMin: 10, dmgMax: 16, speed: 6.4, aggro: 13, range: 2.3, cd: 1.1, respawn: 75,  gold: [55, 80], xp: 100, drops: [['piel_lobo', 1], ['colmillo_lobo', 1], ['colmillo_alfa', 0.2], ['manto_alfa', 0.15]] },
  rata:    { name: 'Rata de Cripta',  hp: 25,  dmgMin: 4,  dmgMax: 8,  speed: 6.5, aggro: 8,  range: 1.6, cd: 1.1, respawn: 18,  gold: [2, 5],   xp: 10,  drops: [['hueso_antiguo', 0.3]] },
  esqueleto: { name: 'Esqueleto Guardián', hp: 70, dmgMin: 8, dmgMax: 14, speed: 4.6, aggro: 10, range: 2.0, cd: 1.4, respawn: 30, gold: [10, 18], xp: 26, drops: [['hueso_antiguo', 0.7], ['esencia_espectral', 0.35]] },
  guardian_oseo: { name: 'Guardián Óseo', hp: 180, dmgMin: 12, dmgMax: 18, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [45, 65], xp: 75, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.6], ['sello_oseo', 0.12]] },
  centinela_oseo: { name: 'Centinela Óseo', hp: 200, dmgMin: 13, dmgMax: 19, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [50, 70], xp: 80, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.7], ['sello_oseo', 0.12]] },
  ciervo:  { name: 'Ciervo del Lago',  hp: 35,  dmgMin: 1,  dmgMax: 3,  speed: 7.5, aggro: 0,  range: 1.6, cd: 1.5, respawn: 25,  gold: [1, 3],   xp: 8,   drops: [['carne_venado', 0.9]] },
  oso:     { name: 'Oso Pardo',        hp: 120, dmgMin: 10, dmgMax: 16, speed: 5.0, aggro: 8,  range: 2.2, cd: 1.5, respawn: 60,  gold: [20, 35], xp: 40,  drops: [['piel_oso', 0.8], ['carne_venado', 0.6]] },
  senor_cripta: { name: 'Señor de la Cripta', hp: 400, dmgMin: 14, dmgMax: 22, speed: 5.2, aggro: 14, range: 2.6, cd: 1.2, respawn: 120, gold: [150, 200], xp: 200, drops: [['reliquia_cripta', 1], ['esencia_espectral', 1], ['hueso_antiguo', 1], ['corona_cripta', 0.25], ['guadana_espectral', 0.2]] },
  // Ciénaga de los Ahogados (noroeste)
  sanguijuela: { name: 'Sanguijuela Gigante', hp: 28, dmgMin: 4, dmgMax: 8, speed: 6.2, aggro: 8, range: 1.7, cd: 1.2, respawn: 20, gold: [3, 8], xp: 14, drops: [['limo_curativo', 0.5], ['flor_cienaga', 0.35]] },
  ahogado: { name: 'Ahogado', hp: 90, dmgMin: 9, dmgMax: 15, speed: 4.2, aggro: 9, range: 2.0, cd: 1.5, respawn: 35, gold: [12, 22], xp: 34, drops: [['limo_curativo', 0.4], ['flor_cienaga', 0.3]] },
  chaman_cienaga: { name: 'Chamán de la Ciénaga', hp: 110, dmgMin: 11, dmgMax: 17, speed: 4.6, aggro: 11, range: 2.1, cd: 1.4, respawn: 45, gold: [18, 30], xp: 48, drops: [['flor_cienaga', 0.7], ['esencia_espectral', 0.3]] },
  rey_fango: { name: 'Rey del Fango', hp: 450, dmgMin: 15, dmgMax: 24, speed: 4.4, aggro: 14, range: 2.8, cd: 1.3, respawn: 130, gold: [170, 230], xp: 230, drops: [['flor_cienaga', 1], ['limo_curativo', 1], ['cetro_fango', 0.22], ['anillo_cienaga', 0.18]] },
  // Jefe de mundo (evento): aparece para todo el reino cada cierto tiempo.
  coloso: { name: 'Coloso de Valdoria', hp: 3000, dmgMin: 20, dmgMax: 32, speed: 3.6, aggro: 16, range: 3.2, cd: 1.4, respawn: EVENT_INTERVAL_S, gold: [300, 450], xp: 500, drops: [['corona_cripta', 0.5], ['guadana_espectral', 0.4], ['cetro_fango', 0.4], ['pocion_vida_mayor', 1], ['pocion_vida_mayor', 1]] },
};

export const SPAWNS = [
  ['lobo', 20, 62], ['lobo', 36, 55], ['lobo', -16, 68], ['lobo', 12, 84],
  ['lobo', 46, 76], ['lobo', -30, 58], ['lobo', 26, 100], ['lobo', 60, 45],
  ['jabali', -55, 42], ['jabali', -66, 22], ['jabali', -50, 66], ['jabali', -70, 52], ['jabali', -44, 88],
  ['alfa', 0, 113],
  ['rata', 500, -10], ['rata', 501, -18], ['rata', 510, -30], ['rata', 490, -42],
  ['esqueleto', 492, -28], ['esqueleto', 508, -35], ['esqueleto', 496, -42],
  ['esqueleto', 512, -28], ['esqueleto', 500, -33], ['esqueleto', 488, -36],
  ['esqueleto', 478, -35], ['esqueleto', 473, -34],
  ['esqueleto', 494, -70], ['esqueleto', 506, -70],
  ['senor_cripta', 500, -74],
  ['rata', 700, -7], ['rata', 699, -12],
  ['esqueleto', 694, -22], ['esqueleto', 706, -25], ['esqueleto', 700, -30],
  ['guardian_oseo', 700, -27],
  ['rata', 900, -6], ['rata', 898, -10],
  ['esqueleto', 905, -19], ['esqueleto', 895, -23],
  ['centinela_oseo', 900, -24],
  ['ciervo', 60, -50], ['ciervo', 72, -38], ['ciervo', 52, -68],
  ['ciervo', -58, -45], ['ciervo', -45, -62],
  ['oso', 0, -82], ['oso', -24, -94], ['oso', 28, -90],
  ['lobo', 88, 8], ['lobo', 82, -12],
  ['jabali', -85, 62],
  // Ciénaga de los Ahogados (noroeste, centro ~-95,-55)
  ['sanguijuela', -82, -42], ['sanguijuela', -90, -38], ['sanguijuela', -100, -48], ['sanguijuela', -78, -55], ['sanguijuela', -108, -62],
  ['ahogado', -88, -50], ['ahogado', -98, -58], ['ahogado', -85, -64], ['ahogado', -104, -50], ['ahogado', -95, -68],
  ['chaman_cienaga', -100, -70], ['chaman_cienaga', -110, -55],
  ['rey_fango', -102, -78],
];
