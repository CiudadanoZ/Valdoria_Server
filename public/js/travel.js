// Viaje rápido: panel de piedras rúnicas. Al activar una piedra, el servidor
// envía la lista; puedes viajar a cualquiera que hayas descubierto.
import { sendWaystoneTravel } from './network.js';
import { play } from './audio.js';

let data = { discovered: [], all: [] };

export function openTravel(msg) {
  data = msg;
  render();
  document.getElementById('travel-panel').classList.remove('hidden');
}

export function closeTravel() {
  document.getElementById('travel-panel').classList.add('hidden');
}

function render() {
  const list = document.getElementById('travel-list');
  list.innerHTML = '';
  for (const w of data.all) {
    const found = data.discovered.includes(w.id);
    const row = document.createElement('div');
    row.className = 'travel-row' + (found ? '' : ' locked');
    row.innerHTML = `<span>${found ? '🗺️' : '🔒'} ${w.name}</span>`;
    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = found ? 'Viajar' : 'Sin descubrir';
    btn.disabled = !found;
    btn.addEventListener('click', () => { sendWaystoneTravel(w.id); play('portal'); closeTravel(); });
    row.appendChild(btn);
    list.appendChild(row);
  }
}
