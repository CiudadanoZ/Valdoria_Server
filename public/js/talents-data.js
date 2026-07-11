// Datos de progresión compartidos entre cliente y servidor (puros, sin DOM).
// El servidor es la autoridad: valida gastos de puntos y otorga experiencia.

export const MAX_LEVEL = 15;
export const HP_PER_LEVEL = 5;
export const xpForLevel = (level) => 100 + (level - 1) * 60;

// Cada clase tiene DOS ramas de talentos. Los puntos son comunes, así que a
// nivel bajo eliges una rama y a nivel alto puedes tocar las dos.
// Nodos: max = rangos; req = puntos gastados en el árbol para desbloquear;
// branch = nombre de la rama (para agrupar en la interfaz);
// efecto: dmg / armor / hp / speed (fracción) / healMul (fracción) /
//         cdr {skillId: seg} / unlock 'skillId'
export const TALENT_TREES = {
  guerrero: [
    // Rama ofensiva
    { id: 'furia', branch: '🔥 Furia', name: 'Furia', icon: '🔥', max: 3, req: 0, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'maestria_golpe', branch: '🔥 Furia', name: 'Maestría: Golpe Poderoso', icon: '💥', max: 1, req: 2, cdr: { golpe: 2 }, desc: 'Golpe Poderoso: −2 s de enfriamiento' },
    { id: 'sed_sangre', branch: '🔥 Furia', name: 'Sed de Sangre', icon: '🩸', max: 3, req: 2, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'ejecucion', branch: '🔥 Furia', name: 'Ejecución', icon: '⚔️', max: 1, req: 4, unlock: 'ejecucion', desc: 'Desbloquea Ejecución (tecla 4): 350% de daño al objetivo' },
    // Rama defensiva
    { id: 'piel_hierro', branch: '🛡 Baluarte', name: 'Piel de Hierro', icon: '🛡', max: 3, req: 0, armor: 1, desc: '+1 de armadura por rango' },
    { id: 'vigor', branch: '🛡 Baluarte', name: 'Vigor', icon: '❤️', max: 3, req: 0, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'maestria_torbellino', branch: '🛡 Baluarte', name: 'Maestría: Torbellino', icon: '🌀', max: 1, req: 2, cdr: { torbellino: 3 }, desc: 'Torbellino: −3 s de enfriamiento' },
    { id: 'inquebrantable', branch: '🛡 Baluarte', name: 'Inquebrantable', icon: '⛰️', max: 2, req: 4, armor: 1, hp: 10, desc: '+1 armadura y +10 vida por rango' },
    { id: 'bastion', branch: '🛡 Baluarte', name: 'Bastión', icon: '🏰', max: 1, req: 6, unlock: 'bastion', desc: 'Desbloquea Bastión (tecla 5): +10 de armadura durante 8 s' },
  ],
  explorador: [
    // Rama de precisión
    { id: 'punteria', branch: '🎯 Precisión', name: 'Puntería', icon: '🎯', max: 3, req: 0, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'maestria_certero', branch: '🎯 Precisión', name: 'Maestría: Disparo Certero', icon: '🏹', max: 1, req: 2, cdr: { certero: 1.5 }, desc: 'Disparo Certero: −1,5 s de enfriamiento' },
    { id: 'tiro_mortal', branch: '🎯 Precisión', name: 'Tiro Mortal', icon: '🎯', max: 3, req: 2, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'descarga', branch: '🎯 Precisión', name: 'Descarga Múltiple', icon: '🌠', max: 1, req: 4, unlock: 'descarga', desc: 'Desbloquea Descarga Múltiple (tecla 4): 3 disparos del 70%' },
    // Rama de cazador
    { id: 'pies_ligeros', branch: '🥾 Cazador', name: 'Pies Ligeros', icon: '🥾', max: 3, req: 0, speed: 0.06, desc: '+6% de velocidad por rango' },
    { id: 'supervivencia', branch: '🥾 Cazador', name: 'Supervivencia', icon: '❤️', max: 3, req: 0, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'maestria_dagas', branch: '🥾 Cazador', name: 'Maestría: Lluvia de Dagas', icon: '🔪', max: 1, req: 2, cdr: { dagas: 3 }, desc: 'Lluvia de Dagas: −3 s de enfriamiento' },
    { id: 'instinto', branch: '🥾 Cazador', name: 'Instinto Salvaje', icon: '🐾', max: 2, req: 4, speed: 0.05, hp: 10, desc: '+5% velocidad y +10 vida por rango' },
    { id: 'andanada', branch: '🥾 Cazador', name: 'Andanada', icon: '☄️', max: 1, req: 6, unlock: 'andanada', desc: 'Desbloquea Andanada (tecla 5): 160% de daño a los enemigos a 7 m' },
  ],
  sacerdote: [
    // Rama de fe (curación)
    { id: 'devocion', branch: '🕊️ Fe', name: 'Devoción', icon: '🕊️', max: 3, req: 0, healMul: 0.15, desc: 'Curas +15% por rango' },
    { id: 'luz_interior', branch: '🕊️ Fe', name: 'Luz Interior', icon: '❤️', max: 3, req: 0, hp: 10, desc: '+10 de vida máxima por rango' },
    { id: 'maestria_nova', branch: '🕊️ Fe', name: 'Maestría: Nova Sagrada', icon: '💫', max: 1, req: 2, cdr: { nova: 4 }, desc: 'Nova Sagrada: −4 s de enfriamiento' },
    { id: 'escudo_fe', branch: '🕊️ Fe', name: 'Escudo de Fe', icon: '🔆', max: 1, req: 4, unlock: 'escudo_fe', desc: 'Desbloquea Escudo de Fe (tecla 4): +6 de armadura durante 6 s' },
    // Rama de cruzado (daño sagrado)
    { id: 'castigo_mejorado', branch: '🌟 Cruzado', name: 'Castigo Mejorado', icon: '🌟', max: 3, req: 0, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'fervor', branch: '🌟 Cruzado', name: 'Fervor', icon: '🔥', max: 3, req: 2, dmg: 1, desc: '+1 de daño por rango' },
    { id: 'maestria_castigo', branch: '🌟 Cruzado', name: 'Maestría: Castigo', icon: '⭐', max: 1, req: 2, cdr: { castigo: 1.5 }, desc: 'Castigo: −1,5 s de enfriamiento' },
    { id: 'ira_sagrada', branch: '🌟 Cruzado', name: 'Ira Sagrada', icon: '☀️', max: 2, req: 4, dmg: 1, hp: 10, desc: '+1 daño y +10 vida por rango' },
    { id: 'juicio', branch: '🌟 Cruzado', name: 'Juicio', icon: '⚡', max: 1, req: 6, unlock: 'juicio', desc: 'Desbloquea Juicio (tecla 5): 300% de daño sagrado a 12 m' },
  ],
};
