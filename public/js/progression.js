// Progresión del héroe: VISTA del estado autoritativo del servidor.
// La experiencia la otorga el servidor (caza, misiones, pesca, cocina) y los
// puntos de talento se gastan por RPC validado. Aquí solo se muestra y se
// detectan las subidas de nivel para celebrarlas.
import { TALENT_TREES, MAX_LEVEL, HP_PER_LEVEL, xpForLevel } from './talents-data.js';
import { sendTalentSpend } from './network.js';
import { play } from './audio.js';
import { toast } from './ui.js';

export { MAX_LEVEL, HP_PER_LEVEL, xpForLevel };

export const progression = {
  level: 1,
  xp: 0,
  points: 0,
  talents: {}, // nodeId -> rango
};

let tree = TALENT_TREES.guerrero;
let onProgressChange = null; // reconstruir barra de habilidades, refrescar vida máx...

export function initProgression(classId, { progressChanged }) {
  tree = TALENT_TREES[classId] || TALENT_TREES.guerrero;
  onProgressChange = progressChanged;

  document.getElementById('talents-open').addEventListener('click', toggleTalents);
  renderHud();
  renderPanel();
}

// Aplica la progresión que envía el servidor; celebra subidas de nivel.
export function applyProgression(data) {
  if (!data) { renderHud(); return; }
  const prevLevel = progression.level;
  progression.level = data.level || 1;
  progression.xp = data.xp || 0;
  progression.points = data.points || 0;
  progression.talents = data.talents || {};

  if (progression.level > prevLevel && prevLevel >= 1) {
    toast(`✦ ¡Nivel ${progression.level}! +1 punto de talento (tecla T) ✦`, 'quest');
    play('levelup');
  }
  renderHud();
  renderPanel();
  onProgressChange?.();
}

export function pointsSpent() {
  return Object.values(progression.talents).reduce((a, b) => a + b, 0);
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
    btn.addEventListener('click', () => sendTalentSpend(node.id));
    row.appendChild(btn);
    list.appendChild(row);
  }
}
