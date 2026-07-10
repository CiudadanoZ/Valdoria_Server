// Bendiciones de la Sacerdotisa Mira: ESPEJO del estado del servidor.
// El servidor cobra, activa y aplica sus efectos (armadura y vida máxima);
// aquí solo se muestran los chips con la cuenta atrás y se conserva el bono
// de daño de la Bendición de la Fuerza para el daño que declara el cliente.

export const BLESSINGS = {
  fuerza: { id: 'fuerza', name: 'Bendición de la Fuerza', icon: '⚡', price: 40, desc: '+4 de daño', dmg: 4 },
  piedra: { id: 'piedra', name: 'Bendición de la Piedra', icon: '🗿', price: 40, desc: '+3 de armadura', armor: 3 },
  vida:   { id: 'vida',   name: 'Bendición de la Vida',   icon: '💗', price: 50, desc: '+25 de vida máxima', maxHp: 25 },
};

// id -> instante de expiración (ms época), tal y como lo envía el servidor
let state = { fuerza: 0, piedra: 0, vida: 0 };

export function initBlessings() {
  setInterval(render, 1000);
  render();
}

// Estado que llega en cada state_sync
export function applyBlessings(data) {
  if (!data) return;
  state = { fuerza: 0, piedra: 0, vida: 0, ...data };
  render();
}

function isActive(id) {
  return (state[id] || 0) > Date.now();
}

// Bono de daño de la Fuerza (el cliente lo suma al daño que declara;
// el servidor lo acota igualmente)
export function blessingDamage() { return isActive('fuerza') ? BLESSINGS.fuerza.dmg : 0; }

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
