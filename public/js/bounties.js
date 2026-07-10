// Encargos diarios repetibles del Tablón de la Ciudadela (datos compartidos
// cliente/servidor). Cada día se sortean 3 encargos de esta lista; al
// completarlos se cobra en el Tablón y se pueden volver a hacer al día siguiente.

// pool: [id, tipoDeCriatura, cantidad, oro, exp, título]
export const BOUNTY_POOL = [
  { id: 'lobos',      mob: 'lobo',          need: 8,  gold: 40,  xp: 60,  title: 'Manada creciente', desc: 'Los lobos acosan el camino del sur.' },
  { id: 'jabalies',   mob: 'jabali',        need: 5,  gold: 45,  xp: 70,  title: 'Colmillos en el bosque', desc: 'Los jabalíes arrasan las lindes del oeste.' },
  { id: 'ciervos',    mob: 'ciervo',        need: 6,  gold: 30,  xp: 45,  title: 'Caza mayor', desc: 'La posada necesita carne de venado.' },
  { id: 'osos',       mob: 'oso',           need: 3,  gold: 60,  xp: 90,  title: 'Amos de las ruinas', desc: 'Los osos del norte se han vuelto audaces.' },
  { id: 'ratas',      mob: 'rata',          need: 8,  gold: 35,  xp: 50,  title: 'Plaga en las criptas', desc: 'Las ratas se multiplican bajo tierra.' },
  { id: 'esqueletos', mob: 'esqueleto',     need: 6,  gold: 70,  xp: 110, title: 'Guardia inquieta', desc: 'Los esqueletos guardianes no descansan.' },
  { id: 'alfa',       mob: 'alfa',          need: 1,  gold: 80,  xp: 120, title: 'Cabeza de la manada', desc: 'El Alfa Sombrío ha vuelto a merodear.' },
  { id: 'guardian',   mob: 'guardian_oseo', need: 1,  gold: 90,  xp: 130, title: 'Centinela del bosque', desc: 'El Guardián Óseo bloquea la Cripta del Bosque.' },
];

export const BOUNTY_COUNT = 3; // encargos activos por día

// Sorteo determinista del día: mismos 3 encargos para todo el reino ese día.
// dayNumber = días transcurridos desde época (UTC).
export function todayNumber() {
  return Math.floor(Date.now() / 86400000);
}

// Baraja determinista por semilla (día) y toma los primeros BOUNTY_COUNT.
export function dailyBounties(day = todayNumber()) {
  const pool = BOUNTY_POOL.map((b, i) => ({ b, sort: hash(day * 100 + i) }));
  pool.sort((a, z) => a.sort - z.sort);
  return pool.slice(0, BOUNTY_COUNT).map((x) => x.b);
}

function hash(n) {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
