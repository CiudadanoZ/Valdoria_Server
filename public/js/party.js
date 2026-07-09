// Grupos de caza: invitación al hacer clic sobre otro jugador, panel de
// miembros en el HUD y avisos. El botín compartido lo reparte el servidor.
import { sendPartyInvite, sendPartyAccept, sendPartyLeave } from './network.js';
import { showDialog, hideDialog, toast } from './ui.js';

let members = []; // [{id, name}]
let myId = null;

export function initParty(selfId) {
  myId = selfId;
  document.getElementById('party-leave').addEventListener('click', () => {
    sendPartyLeave();
  });
}

export function inParty() {
  return members.length > 1;
}

// Clic sobre otro jugador -> ofrecer invitación
export function offerInvite(remote) {
  if (members.some((m) => m.id === remote.id)) {
    toast(`${remote.name} ya está en tu grupo`);
    return;
  }
  showDialog(remote.name, '¿Quieres invitarle a tu grupo de caza? Los miembros comparten el botín y el crédito de las misiones al cazar juntos.', [
    { label: '🤝 Invitar al grupo', fn: () => { sendPartyInvite(remote.id); hideDialog(); } },
    { label: 'Cancelar', fn: hideDialog },
  ]);
}

// Invitación recibida de otro jugador
export function onInvite({ fromId, fromName }) {
  showDialog(fromName, `${fromName} te invita a su grupo de caza. Compartiréis botín y crédito de misiones.`, [
    { label: '🤝 Aceptar', fn: () => { sendPartyAccept(fromId); hideDialog(); } },
    { label: 'Rechazar', fn: hideDialog },
  ]);
}

export function onPartyUpdate({ members: newMembers }) {
  const joined = newMembers.filter((m) => !members.some((o) => o.id === m.id) && m.id !== myId);
  members = newMembers;
  for (const j of joined) toast(`${j.name} se ha unido al grupo`);
  render();
}

export function onPartyLeft() {
  if (members.length > 0) toast('Has salido del grupo');
  members = [];
  render();
}

// Si un miembro se desconecta, el servidor manda party_update; esto cubre el HUD.
export function onPlayerLeave(id) {
  if (members.some((m) => m.id === id)) {
    members = members.filter((m) => m.id !== id);
    render();
  }
}

function render() {
  const hud = document.getElementById('party-hud');
  const list = document.getElementById('party-members');
  if (members.length <= 1) {
    hud.classList.add('hidden');
    return;
  }
  hud.classList.remove('hidden');
  list.innerHTML = members
    .map((m) => `<div class="party-member">${m.id === myId ? '⭐' : '🛡'} ${m.name}${m.id === myId ? ' (tú)' : ''}</div>`)
    .join('');
}
