// Progresión del héroe: experiencia, niveles y árbol de talentos por clase.
// Cada nivel otorga +5 de vida máxima y 1 punto de talento. Los talentos dan
// pasivas (daño, armadura, vida, velocidad, curas, enfriamientos) o desbloquean
// una cuarta habilidad activa (tecla 4).
import { toast } from './ui.js';

export const MAX_LEVEL = 15;
export const HP_PER_LEVEL = 5;
export const xpForLevel = (level) => 100 + (level - 1) * 60;

export const progression = {
  level: 1,
  xp: 0,
  points: 0,
  talents: {}, // nodeId -> rango
};

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

let tree = TALENT_TREES.guerrero;
let onChanged = null;
let onProgressChange = null; // reconstruir barra de habilidades, refrescar vida máx...

export function initProgression(classId, { changed, progressChanged }) {
  tree = TALENT_TREES[classId] || TALENT_TREES.guerrero;
  onChanged = changed;
  onProgressChange = progressChanged;

  document.getElementById('talents-open').addEventListener('click', toggleTalents);
  renderHud();
  renderPanel();
}

export function addXp(amount) {
  if (!amount || progression.level >= MAX_LEVEL) { renderHud(); return; }
  progression.xp += amount;
  let leveled = false;
  while (progression.level < MAX_LEVEL && progression.xp >= xpForLevel(progression.level)) {
    progression.xp -= xpForLevel(progression.level);
    progression.level++;
    progression.points++;
    leveled = true;
    toast(`✦ ¡Nivel ${progression.level}! +1 punto de talento (tecla T) ✦`, 'quest');
  }
  if (progression.level >= MAX_LEVEL) progression.xp = 0;
  renderHud();
  if (leveled) {
    renderPanel();
    onProgressChange?.();
  }
  onChanged?.();
}

export function pointsSpent() {
  return Object.values(progression.talents).reduce((a, b) => a + b, 0);
}

export function spendPoint(nodeId) {
  const node = tree.find((n) => n.id === nodeId);
  if (!node) return;
  const rank = progression.talents[nodeId] || 0;
  if (progression.points < 1) { toast('No tienes puntos de talento'); return; }
  if (rank >= node.max) return;
  if (pointsSpent() < node.req) { toast(`Necesitas ${node.req} puntos gastados en el árbol`); return; }
  progression.talents[nodeId] = rank + 1;
  progression.points--;
  toast(`${node.icon} ${node.name} (rango ${rank + 1})`);
  renderHud();
  renderPanel();
  onProgressChange?.();
  onChanged?.();
}

// ---- Bonificaciones acumuladas ----
function sumTalents(field) {
  return tree.reduce((sum, n) => sum + (n[field] || 0) * (progression.talents[n.id] || 0), 0);
}
export function talentDmg() { return sumTalents('dmg'); }
export function talentArmor() { return sumTalents('armor'); }
export function talentHp() { return sumTalents('hp') + (progression.level - 1) * HP_PER_LEVEL; }
export function talentSpeedMul() { return 1 + sumTalents('speed'); }
export function talentHealMul() { return 1 + sumTalents('healMul'); }
export function talentCdr(skillId) {
  return tree.reduce((sum, n) => {
    if (n.cdr && n.cdr[skillId] && (progression.talents[n.id] || 0) > 0) return sum + n.cdr[skillId];
    return sum;
  }, 0);
}
export function isSkillUnlocked(skillId) {
  return tree.some((n) => n.unlock === skillId && (progression.talents[n.id] || 0) > 0);
}

// ---- Interfaz ----
export function toggleTalents() {
  renderPanel();
  document.getElementById('talents-panel').classList.toggle('hidden');
}

function renderHud() {
  const need = xpForLevel(progression.level);
  const atCap = progression.level >= MAX_LEVEL;
  document.getElementById('xp-level').textContent = `Nv ${progression.level}`;
  document.getElementById('xp-text').textContent = atCap ? 'MAX' : `${progression.xp} / ${need} EXP`;
  document.getElementById('xp-fill').style.width = atCap ? '100%' : `${Math.min(100, (progression.xp / need) * 100)}%`;
  const btn = document.getElementById('talents-open');
  btn.classList.toggle('has-points', progression.points > 0);
  btn.textContent = progression.points > 0 ? `T · Talentos (${progression.points})` : 'T · Talentos';
}

function renderPanel() {
  const info = document.getElementById('talents-info');
  if (!info) return;
  info.textContent = `Nivel ${progression.level} · Puntos disponibles: ${progression.points} · Gastados: ${pointsSpent()}`;

  const list = document.getElementById('talents-list');
  list.innerHTML = '';
  for (const node of tree) {
    const rank = progression.talents[node.id] || 0;
    const locked = pointsSpent() < node.req;
    const maxed = rank >= node.max;

    const row = document.createElement('div');
    row.className = 'talent-row' + (locked ? ' locked' : '') + (maxed ? ' maxed' : '');
    row.innerHTML =
      `<span class="talent-icon">${node.icon}</span>` +
      `<span class="talent-info"><b>${node.name}</b> <span class="talent-rank">${rank}/${node.max}</span>` +
      `<br/><small>${node.desc}${node.req ? ` · Requiere ${node.req} puntos gastados` : ''}</small></span>`;

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = maxed ? 'Máximo' : 'Mejorar';
    btn.disabled = maxed || locked || progression.points < 1;
    btn.addEventListener('click', () => spendPoint(node.id));
    row.appendChild(btn);
    list.appendChild(row);
  }
}

// ---- Guardado / carga ----
export function serializeProgression() {
  const { level, xp, points, talents } = progression;
  return { level, xp, points, talents };
}

export function loadProgression(data) {
  if (!data) { renderHud(); return; }
  progression.level = data.level || 1;
  progression.xp = data.xp || 0;
  progression.points = data.points || 0;
  progression.talents = data.talents || {};
  renderHud();
  renderPanel();
}
