// Encargos del Tablón de la Ciudadela (datos compartidos cliente/servidor).
// Hay dos tandas: 3 encargos DIARIOS que se renuevan cada día y 2 contratos
// SEMANALES, más largos y mejor pagados. Ambos hay que ACEPTARLOS en el tablón
// para que empiecen a contar, y luego se cobran allí mismo.

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
  { id: 'ahogados',   mob: 'ahogado',       need: 5,  gold: 55,  xp: 85,  title: 'Los que el agua devolvió', desc: 'Los Ahogados vagan por la ciénaga del noroeste.' },
  { id: 'sanguijuelas', mob: 'sanguijuela', need: 8,  gold: 45,  xp: 60,  title: 'Sanguijuelas', desc: 'Las sanguijuelas infestan las charcas del pantano.' },
  { id: 'chamanes',   mob: 'chaman_cienaga', need: 2, gold: 70,  xp: 105, title: 'Brujos del limo', desc: 'Los chamanes alimentan la podredumbre de la ciénaga.' },
];

export const BOUNTY_COUNT = 3; // encargos diarios activos

// ---- Contratos semanales ----
// Objetivos mucho más ambiciosos (jefes y cacerías largas) que duran toda la
// semana y pagan en consecuencia. Dan una meta a medio plazo entre lo diario y
// las cadenas de misiones.
export const WEEKLY_POOL = [
  { id: 'w_cripta',   mob: 'senor_cripta',   need: 2,  gold: 420, xp: 620, title: 'Silencio en las criptas', desc: 'El Señor de la Cripta debe caer dos veces esta semana.' },
  { id: 'w_fango',    mob: 'rey_fango',      need: 1,  gold: 380, xp: 540, title: 'La corona de limo', desc: 'Acaba con el Rey del Fango en el corazón de la ciénaga.' },
  { id: 'w_jarl',     mob: 'jarl_cumbres',   need: 1,  gold: 480, xp: 720, title: 'El señor del hielo', desc: 'Derriba al Jarl en lo alto de las Cumbres Heladas.' },
  { id: 'w_coloso',   mob: 'coloso',         need: 1,  gold: 650, xp: 950, title: 'Gesta contra el Coloso', desc: 'Participa en la caída del jefe de mundo.' },
  { id: 'w_escarcha', mob: 'lobo_escarcha',  need: 20, gold: 320, xp: 460, title: 'Cacería blanca', desc: 'Merma la manada de las Cumbres: 20 Lobos de Escarcha.' },
  { id: 'w_ahogados', mob: 'ahogado',        need: 20, gold: 300, xp: 430, title: 'Purga del pantano', desc: 'Devuelve la paz a la ciénaga: 20 Ahogados.' },
  { id: 'w_esquel',   mob: 'esqueleto',      need: 25, gold: 310, xp: 450, title: 'Guardia eterna', desc: 'Reduce a polvo 25 Esqueletos Guardianes.' },
  { id: 'w_trolls',   mob: 'troll_hielo',    need: 6,  gold: 400, xp: 580, title: 'Gigantes de escarcha', desc: 'Abate 6 Trolls de Hielo en las Cumbres.' },
  { id: 'w_osos',     mob: 'oso',            need: 12, gold: 260, xp: 390, title: 'Los amos del norte', desc: 'Doce Osos Pardos rondan las ruinas.' },
];

export const WEEKLY_COUNT = 2; // contratos semanales activos

// Sorteo determinista del día: mismos encargos para todo el reino ese día.
// dayNumber = días transcurridos desde época (UTC).
// BOUNTY_DAY fija el día a mano. Existe para los tests: sin él, que hubiera o no
// un encargo de lobos dependía del calendario, y un mismo test pasaba un día y
// fallaba al siguiente. En el navegador no hay `process`, así que no afecta.
const DIA_FIJO = typeof process !== 'undefined' && process.env?.BOUNTY_DAY
  ? Number(process.env.BOUNTY_DAY)
  : null;

export function todayNumber() {
  return DIA_FIJO ?? Math.floor(Date.now() / 86400000);
}

// Número de semana (lunes como día de reinicio: la época cayó en jueves).
export function thisWeekNumber() {
  return Math.floor((todayNumber() + 3) / 7);
}

// Baraja determinista por semilla y toma los primeros n.
function pick(pool, seed, n) {
  const mezcla = pool.map((b, i) => ({ b, sort: hash(seed * 100 + i) }));
  mezcla.sort((a, z) => a.sort - z.sort);
  return mezcla.slice(0, n).map((x) => x.b);
}

export function dailyBounties(day = todayNumber()) {
  return pick(BOUNTY_POOL, day, BOUNTY_COUNT);
}

export function weeklyBounties(week = thisWeekNumber()) {
  // Semilla desplazada para que no coincida con el sorteo diario
  return pick(WEEKLY_POOL, week + 7777, WEEKLY_COUNT);
}

function hash(n) {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
