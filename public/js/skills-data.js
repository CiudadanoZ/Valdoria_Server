// Datos puros de habilidades y recursos, compartidos por el cliente y el
// servidor (sin THREE ni interfaz: este módulo lo importa server/server.js).
// El cliente los usa para dibujar la barra y lanzar; el servidor es quien
// valida el coste, la cura y las mejoras — nunca se fía de lo que llegue.

// ---- Recursos por clase ----
// El guerrero ACUMULA furia golpeando (empieza a 0 y decae fuera de combate);
// explorador y sacerdote parten con el pozo lleno y lo regeneran con el tiempo.
export const RESOURCES = {
  guerrero: {
    id: 'furia', name: 'Furia', color: '#d0452f',
    max: 100, startFull: false,
    regen: -4,    // por segundo (negativo: decae)
    onAttack: 8,  // al conectar un golpe básico
    onHurt: 6,    // al recibir daño
    empty: 'Necesitas más furia: golpea para acumularla',
  },
  explorador: {
    id: 'vigor', name: 'Vigor', color: '#57b85f',
    max: 100, startFull: true, regen: 10, onAttack: 0, onHurt: 0,
    empty: 'No te queda vigor',
  },
  sacerdote: {
    id: 'mana', name: 'Maná', color: '#4a7fd8',
    max: 120, startFull: true, regen: 5, onAttack: 0, onHurt: 0,
    empty: 'No te queda maná',
  },
};

export function resourceOf(classId) {
  return RESOURCES[classId] || RESOURCES.guerrero;
}

// ---- Habilidades ----
// cost = recurso que consume (validado en el servidor).
export const SKILLS = {
  guerrero: [
    {
      id: 'golpe', name: 'Golpe Poderoso', icon: '💥', cd: 6, cost: 25,
      desc: '250% de daño al objetivo. Cuerpo a cuerpo (3,5 m).',
      type: 'target', range: 3.5, dmgMul: 2.5, fx: 0xffaa33,
    },
    {
      id: 'bastion', name: 'Bastión', icon: '🏰', cd: 16, cost: 20,
      desc: '+10 de armadura durante 8 s.',
      type: 'buff', buff: { armor: 10, dur: 8 }, fx: 0xffe0a0,
      unlockable: true,
    },
    {
      id: 'torbellino', name: 'Torbellino', icon: '🌀', cd: 10, cost: 35,
      desc: 'Giras el acero: 150% de daño a los enemigos a 5 m.',
      type: 'aoe', radius: 5, dmgMul: 1.5, fx: 0xffcc55,
    },
    {
      id: 'grito', name: 'Grito de Guerra', icon: '🛡️', cd: 20, cost: 15,
      desc: '+5 de armadura durante 8 s.',
      type: 'buff', buff: { armor: 5, dur: 8 }, fx: 0xffd97a,
    },
    {
      id: 'ejecucion', name: 'Ejecución', icon: '⚔️', cd: 12, cost: 40,
      desc: '350% de daño al objetivo. Cuerpo a cuerpo (3,5 m).',
      type: 'target', range: 3.5, dmgMul: 3.5, fx: 0xff5533,
      unlockable: true,
    },
  ],
  explorador: [
    {
      id: 'certero', name: 'Disparo Certero', icon: '🎯', cd: 5, cost: 20,
      desc: 'Disparo a 15 m: 200% de daño.',
      type: 'target', range: 15, dmgMul: 2, projectile: true, fx: 0x9ee85a,
    },
    {
      id: 'dagas', name: 'Lluvia de Dagas', icon: '🔪', cd: 12, cost: 30,
      desc: '100% de daño a todos los enemigos a 6 m.',
      type: 'aoe', radius: 6, dmgMul: 1, fx: 0x9ee85a,
    },
    {
      id: 'sprint', name: 'Sprint', icon: '💨', cd: 15, cost: 15,
      desc: '+80% de velocidad durante 4 s.',
      type: 'buff', buff: { speed: 0.8, dur: 4 }, fx: 0xaaffcc,
    },
    {
      id: 'descarga', name: 'Descarga Múltiple', icon: '🌠', cd: 10, cost: 35,
      desc: '3 disparos seguidos del 70% de daño cada uno (15 m).',
      type: 'multi', range: 15, hits: 3, dmgMul: 0.7, projectile: true, fx: 0xc8ff8a,
      unlockable: true,
    },
    {
      id: 'andanada', name: 'Andanada', icon: '☄️', cd: 14, cost: 40,
      desc: 'Lluvia de flechas: 160% de daño a los enemigos a 7 m.',
      type: 'aoe', radius: 7, dmgMul: 1.6, fx: 0xc8ff8a,
      unlockable: true,
    },
  ],
  sacerdote: [
    {
      id: 'palabra', name: 'Palabra Sagrada', icon: '✨', cd: 8, cost: 30,
      desc: 'Restaura 40 de vida, a ti y al aliado más cercano (12 m).',
      type: 'heal', heal: 40, allyHeal: true, fx: 0x7fe8a8,
    },
    {
      id: 'castigo', name: 'Castigo', icon: '🌟', cd: 6, cost: 20,
      desc: 'Luz abrasadora a 12 m: 180% de daño.',
      type: 'target', range: 12, dmgMul: 1.8, projectile: true, fx: 0xffe98a,
    },
    {
      id: 'nova', name: 'Nova Sagrada', icon: '💫', cd: 14, cost: 40,
      desc: '120% de daño a 5 m y +15 de vida.',
      type: 'aoe', radius: 5, dmgMul: 1.2, heal: 15, fx: 0xd8c8ff,
    },
    {
      id: 'escudo_fe', name: 'Escudo de Fe', icon: '🔆', cd: 18, cost: 25,
      desc: '+6 de armadura durante 6 s.',
      type: 'buff', buff: { armor: 6, dur: 6 }, fx: 0xfff0b0,
      unlockable: true,
    },
    {
      id: 'juicio', name: 'Juicio', icon: '⚡', cd: 12, cost: 45,
      desc: 'Rayo de luz sagrada a 12 m: 300% de daño.',
      type: 'target', range: 12, dmgMul: 3, projectile: true, fx: 0xfff0b0,
      unlockable: true,
    },
  ],
};

// Busca una habilidad por clase e id (el servidor valida con esto).
export function skillById(classId, skillId) {
  return (SKILLS[classId] || []).find((s) => s.id === skillId) || null;
}
