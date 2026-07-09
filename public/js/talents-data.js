// Datos de progresión compartidos entre cliente y servidor (puros, sin DOM).
// El servidor es la autoridad: valida gastos de puntos y otorga experiencia.

export const MAX_LEVEL = 15;
export const HP_PER_LEVEL = 5;
export const xpForLevel = (level) => 100 + (level - 1) * 60;

// Nodos: max = rangos; req = puntos gastados necesarios para desbloquear el nodo;
// efecto: dmg/armor/hp/speed (fracción)/healMul (fracción)/cdr {skillId: seg}/unlock 'skillId'
export const TALENT_TREES = {
  guerrero: [
    { id: 'furia', name: 'Furia', icon: '🔥', max: 3, req: 0, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'piel_hierro', name: 'Piel de Hierro', icon: '🛡', max: 3, req: 0, armor: 1, desc: '+1 de armadura por rango' },
    { id: 'vigor', name: 'Vigor', icon: '❤️', max: 3, req: 2, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'maestria_golpe', name: 'Maestría: Golpe Poderoso', icon: '💥', max: 1, req: 2, cdr: { golpe: 2 }, desc: 'Golpe Poderoso: −2 s de enfriamiento' },
    { id: 'ejecucion', name: 'Ejecución', icon: '⚔️', max: 1, req: 4, unlock: 'ejecucion', desc: 'Desbloquea la habilidad Ejecución (tecla 4): 350% de daño al objetivo' },
  ],
  explorador: [
    { id: 'punteria', name: 'Puntería', icon: '🎯', max: 3, req: 0, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'pies_ligeros', name: 'Pies Ligeros', icon: '🥾', max: 2, req: 0, speed: 0.06, desc: '+6% de velocidad por rango' },
    { id: 'supervivencia', name: 'Supervivencia', icon: '❤️', max: 3, req: 2, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'maestria_certero', name: 'Maestría: Disparo Certero', icon: '🏹', max: 1, req: 2, cdr: { certero: 1.5 }, desc: 'Disparo Certero: −1,5 s de enfriamiento' },
    { id: 'descarga', name: 'Descarga Múltiple', icon: '🌠', max: 1, req: 4, unlock: 'descarga', desc: 'Desbloquea la habilidad Descarga Múltiple (tecla 4): 3 disparos del 70% de daño' },
  ],
  sacerdote: [
    { id: 'devocion', name: 'Devoción', icon: '🕊️', max: 3, req: 0, healMul: 0.15, desc: 'Curas +15% por rango' },
    { id: 'luz_interior', name: 'Luz Interior', icon: '❤️', max: 3, req: 0, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'castigo_mejorado', name: 'Castigo Mejorado', icon: '🌟', max: 3, req: 2, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'maestria_nova', name: 'Maestría: Nova Sagrada', icon: '💫', max: 1, req: 2, cdr: { nova: 4 }, desc: 'Nova Sagrada: −4 s de enfriamiento' },
    { id: 'escudo_fe', name: 'Escudo de Fe', icon: '🔆', max: 1, req: 4, unlock: 'escudo_fe', desc: 'Desbloquea la habilidad Escudo de Fe (tecla 4): +6 de armadura durante 6 s' },
  ],
};
