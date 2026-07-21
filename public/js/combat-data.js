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
