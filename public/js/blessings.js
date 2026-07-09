// Bendiciones de la Sacerdotisa Mira: mejoras temporales (10 minutos) que se
// muestran junto al orbe de vida con su tiempo restante.
import { inventory, addGold } from './inventory.js';
import { toast } from './ui.js';

const DURATION_MS = 10 * 60 * 1000;

export const BLESSINGS = {
  fuerza: { id: 'fuerza', name: 'Bendición de la Fuerza', icon: '⚡', price: 40, desc: '+4 de daño', dmg: 4 },
  piedra: { id: 'piedra', name: 'Bendición de la Piedra', icon: '🗿', price: 40, desc: '+3 de armadura', armor: 3 },
  vida:   { id: 'vida',   name: 'Bendición de la Vida',   icon: '💗', price: 50, desc: '+25 de vida máxima', maxHp: 25 },
};

// id -> instante de expiración (ms época); 0 = inactiva
const state = { fuerza: 0, piedra: 0, vida: 0 };

let onChanged = null;

export function initBlessings({ changed }) {
  onChanged = changed;
  setInterval(tick, 1000);
  render();
}

function isActive(id) {
  return state[id] > Date.now();
}

export function buyBlessing(id) {
  const b = BLESSINGS[id];
  if (!b) return false;
  if (inventory.gold < b.price) {
    toast('No llevas suficiente oro');
    return false;
  }
  addGold(-b.price);
  state[id] = Date.now() + DURATION_MS;
  toast(`${b.icon} ${b.name} — ${b.desc} durante 10 minutos`, 'quest');
  render();
  onChanged?.();
  return true;
}

// Bonificaciones activas
export function blessingDamage() { return isActive('fuerza') ? BLESSINGS.fuerza.dmg : 0; }
export function blessingArmor() { return isActive('piedra') ? BLESSINGS.piedra.armor : 0; }
export function blessingMaxHp() { return isActive('vida') ? BLESSINGS.vida.maxHp : 0; }

function tick() {
  for (const id of Object.keys(state)) {
    if (state[id] > 0 && state[id] <= Date.now()) {
      state[id] = 0;
      toast(`${BLESSINGS[id].icon} ${BLESSINGS[id].name} se ha desvanecido`);
      onChanged?.();
    }
  }
  render();
}

function render() {
  const hud = document.getElementById('blessings-hud');
  if (!hud) return;
  const chips = [];
  for (const [id, b] of Object.entries(BLESSINGS)) {
    if (!isActive(id)) continue;
    const remaining = Math.max(0, state[id] - Date.now());
    const mm = Math.floor(remaining / 60000);
    const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    chips.push(`<div class="blessing-chip" title="${b.name}: ${b.desc}">${b.icon} ${mm}:${ss}</div>`);
  }
  hud.innerHTML = chips.join('');
}

// ---- Guardado / carga ----
export function serializeBlessings() {
  return { ...state };
}

export function loadBlessings(data) {
  if (!data) return;
  for (const id of Object.keys(state)) {
    if (typeof data[id] === 'number') state[id] = data[id];
  }
  render();
}
