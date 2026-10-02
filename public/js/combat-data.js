// Constantes y fórmulas de combate compartidas por el cliente y el servidor.
// Tener las cifras en un solo sitio evita que la fórmula del cliente y el tope
// que valida el servidor se desincronicen (antes el daño estaba escrito a mano
// en tres puntos del cliente y el tope en otro).

// ---- Daño de ataque del jugador ----
// daño = flat + arma + bonos(bendición/raza/clase/talentos) + tirada(0..spread)
// La base plana es baja a propósito: el ARMA debe ser la fuente de poder, no el
// puño. Desarmado se pega flojo; cada arma se nota.
export const MELEE = {
  flat: 3,       // daño base sin arma
  spread: 4,     // tirada aleatoria del golpe (0..spread)
  bonusCap: 12,  // tope generoso de bonos, solo para validar en el servidor
  margin: 4,     // margen extra del validador
};

// Daño máximo verosímil de un golpe con un arma dada (para acotar lo que
// declare el cliente). El servidor no recalcula el daño: confía hasta este tope.
export function maxMeleeHit(weaponDmg) {
  return MELEE.flat + weaponDmg + MELEE.bonusCap + MELEE.spread + MELEE.margin;
}

// ---- Mitigación por armadura ----
// Reducción porcentual con retornos decrecientes: reduccion = arm/(arm+K).
// A diferencia del modelo sustractivo, SIEMPRE deja pasar algo (un jefe pega
// fuerte aunque vayas blindado) y SIEMPRE ayuda algo (nunca es inútil). Nunca
// invulnerabiliza.
export const ARMOR_K = 50;

// Fracción de daño evitada por una cantidad de armadura (0..1).
export function armorMitigation(armor) {
  return armor / (armor + ARMOR_K);
}

// Daño que realmente entra tras la armadura (mínimo 1).
export function applyArmor(rawDmg, armor) {
  return Math.max(1, Math.round(rawDmg * ARMOR_K / (armor + ARMOR_K)));
}

// ============================ EJES MULTIPLICATIVOS ============================
// Hasta aquí TODO en el juego era aditivo: +1 de daño, +9 de daño, +5 de vida.
// Con eso el héroe crece en línea recta mientras Las Profundidades crecen igual,
// y el resultado es que los pisos hondos no son difíciles: son largos. Dos
// minutos golpeando un saco.
//
// Lo que convierte a un juego así en un Diablo es que el poder se MULTIPLIQUE:
// crítico × daño crítico × velocidad × % de daño. Cuatro ejes al 50% cada uno
// no dan +200%, dan x5. Ahí es donde aparece la sensación de que el personaje
// ha crecido de verdad, y donde una build bien montada se nota frente a otra.

// Valores de partida de cualquier héroe.
export const BASE_CRIT = 0.05;      // 5% de probabilidad
export const BASE_CRIT_DMG = 0.5;   // un crítico pega un 50% más
export const ATTACK_MS = 600;       // enfriamiento del golpe básico sin bonos

// Topes: sin ellos, el crítico llega al 100% y la velocidad al infinito, y el
// combate deja de tener textura. Son generosos, pero existen.
export const CAP_CRIT = 0.75;
export const CAP_ATK_SPEED = 1.5;   // como mucho, dos veces y media más rápido

export const clampCrit = (c) => Math.max(0, Math.min(CAP_CRIT, c));
export const clampAtkSpeed = (s) => Math.max(0, Math.min(CAP_ATK_SPEED, s));

// Enfriamiento real del golpe básico según la velocidad de ataque acumulada.
export function attackCooldownMs(atkSpeed = 0) {
  return ATTACK_MS / (1 + clampAtkSpeed(atkSpeed));
}

// Multiplicador MEDIO de daño de un perfil ofensivo. Sirve para acotar en el
// servidor y para enseñar al jugador cuánto vale de verdad su equipo.
export function offenseMultiplier({ crit = 0, critDmg = 0, dmgMul = 0 } = {}) {
  const c = clampCrit(BASE_CRIT + crit);
  return (1 + dmgMul) * (1 + c * (BASE_CRIT_DMG + critDmg));
}

// Multiplicador MÁXIMO posible (crítico garantizado). Es el que usa el
// validador del servidor: si acotara por la media, recortaría los críticos
// legítimos y el jugador vería golpes que no cuadran.
export function maxOffenseMultiplier({ crit = 0, critDmg = 0, dmgMul = 0 } = {}) {
  void crit;
  return (1 + dmgMul) * (1 + BASE_CRIT_DMG + critDmg);
}

// Resuelve un golpe: decide si es crítico y devuelve el daño final.
// Lo tira SIEMPRE el servidor. Si lo tirara el cliente, un cliente manipulado
// criticaría el 100% de las veces y el tope no lo notaría.
export function resolveHit(rawDmg, offense = {}, rnd = Math.random) {
  const { crit = 0, critDmg = 0, dmgMul = 0 } = offense;
  const esCritico = rnd() < clampCrit(BASE_CRIT + crit);
  const mult = (1 + dmgMul) * (esCritico ? 1 + BASE_CRIT_DMG + critDmg : 1);
  return { dmg: Math.max(1, Math.round(rawDmg * mult)), crit: esCritico };
}

// ---- Defensa ----
// La armadura era la ÚNICA defensa del juego, y con el equipo legendario
// completo apenas llegaba al 32%. Estas dos vías se multiplican con ella, así
// que aguantar también se puede construir.

export const BLOCK_REDUCTION = 0.5;  // un bloqueo para la mitad del golpe
export const CAP_BLOCK = 0.6;
export const CAP_DR = 0.5;           // reducción plana, tope duro

export const clampBlock = (b) => Math.max(0, Math.min(CAP_BLOCK, b));
export const clampDr = (d) => Math.max(0, Math.min(CAP_DR, d));

// Resuelve el daño recibido: armadura, luego reducción, luego bloqueo.
// El bloqueo solo cuenta si llevas escudo — es la razón para renunciar a un
// arma a dos manos.
export function resolveIncoming(rawDmg, { armor = 0, dr = 0, block = 0, hasShield = false } = {}, rnd = Math.random) {
  const trasArmadura = applyArmor(rawDmg, armor);
  const trasReduccion = trasArmadura * (1 - clampDr(dr));
  const bloqueado = hasShield && rnd() < clampBlock(block);
  const final = trasReduccion * (bloqueado ? 1 - BLOCK_REDUCTION : 1);
  return { dmg: Math.max(1, Math.round(final)), blocked: bloqueado };
}
