// Recetas compartidas entre cliente y servidor (datos puros, sin DOM).
// El servidor las usa para VALIDAR y aplicar; el cliente solo para mostrarlas.

// Forja de Bramm: resultado + materiales + coste de mano de obra
export const CRAFT_RECIPES = [
  { result: 'cuchillo_colmillos', mats: { colmillo_lobo: 4 }, gold: 15 },
  { result: 'armadura_pieles', mats: { piel_lobo: 5 }, gold: 30 },
  { result: 'capa_oso', mats: { piel_oso: 3 }, gold: 40 },
  { result: 'hoja_cazador', mats: { colmillo_lobo: 6, piel_lobo: 2 }, gold: 60 },
  { result: 'escudo_hueso', mats: { hueso_antiguo: 6 }, gold: 40 },
  { result: 'espada_espectral', mats: { esencia_espectral: 4, hueso_antiguo: 6 }, gold: 100 },
];

// Cocina en las hogueras: crudo -> asado
export const COOK_RECIPES = [
  { from: 'pez_comun', to: 'pescado_asado' },
  { from: 'pez_grande', to: 'pescado_grande_asado' },
  { from: 'carne_venado', to: 'venado_asado' },
  { from: 'carne_jabali', to: 'jabali_asado' },
  { from: 'pez_dorado', to: 'festin_dorado' },
];

export const COOK_XP = 3;
export const FISHING_XP = 5;

// Qué vende Lyra
export const SHOP_BUY_LIST = ['pocion_vida', 'pocion_vida_mayor', 'pan_centeno', 'espada_acero'];

// Servicios de Mira
export const MIRA_HEAL_PRICE = 15;
export const MIRA_BLESSING_PRICES = { fuerza: 40, piedra: 40, vida: 50 };

// Recompensas de misiones (las otorga SIEMPRE el servidor, una sola vez).
// kills: requisito de bajas acumuladas · removes: objetos que se entregan
export const QUEST_REWARDS = {
  q1: { gold: 10, items: { pocion_vida: 2 }, xp: 50 },
  q2: { gold: 25, items: { espada_recluta: 1 }, xp: 80, removes: { hierba_lumina: 3 } },
  q3: { gold: 50, items: { casco_cuero: 1, anillo_valdoria: 1, pan_centeno: 3 }, xp: 120 },
  t1: { gold: 40, items: { pocion_vida: 3 }, xp: 120, kills: { lobo: 5 } },
  t2: { gold: 60, items: { escudo_roble: 1 }, xp: 140, removes: { piel_lobo: 4 } },
  t3: { gold: 100, items: { capa_exploradora: 1, pocion_vida_mayor: 2 }, xp: 220, kills: { alfa: 1 } },
  a1: { gold: 80, items: { pocion_vida_mayor: 2 }, xp: 180, kills: { esqueleto: 6 } },
  a2: { gold: 120, xp: 200, removes: { esencia_espectral: 4 } },
  a3: { gold: 200, items: { amuleto_guardian: 1 }, xp: 320, removes: { reliquia_cripta: 1 } },
  b1: { gold: 30, items: { pocion_vida: 2 }, xp: 100, kills: { rata: 4 } },
  b2: { gold: 90, items: { esencia_espectral: 2, pocion_vida_mayor: 1 }, xp: 180, kills: { guardian_oseo: 1 } },
  c1: { gold: 40, items: { pocion_vida: 2 }, xp: 100, removes: { colmillo_lobo: 5 } },
  c2: { gold: 90, items: { pocion_vida_mayor: 1, piel_oso: 2 }, xp: 180, kills: { centinela_oseo: 1 } },
};

// Pesca: capturas y probabilidades acumuladas
export const FISHING_TABLE = [
  [0.6, 'pez_comun'],
  [0.9, 'pez_grande'],
  [0.98, 'pez_dorado'],
  [1.01, 'bota_vieja'],
];
