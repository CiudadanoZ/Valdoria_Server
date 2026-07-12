// Panel de gremio: fundar, invitar, gestionar miembros y lema. El estado real
// vive en el servidor; este módulo solo muestra lo que llega en guild_info y
// envía las acciones. pstate.guild indica si perteneces a un gremio.
import { pstate } from './pstate.js';
import {
  sendGuildCreate, sendGuildInvite, sendGuildLeave, sendGuildKick,
  sendGuildDisband, sendGuildMotd, sendGuildInfo,
} from './network.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

let currentInfo = null; // último guild_info recibido
let myName = '';

export function initGuild(name) {
  myName = name;
  $('guild-btn').addEventListener('click', toggleGuild);

  $('guild-create-btn').addEventListener('click', () => {
    const input = $('guild-name-input');
    const gname = input.value.trim();
    if (gname.length >= 3) { sendGuildCreate(gname); input.value = ''; }
  });
  $('guild-invite-btn').addEventListener('click', () => {
    const input = $('guild-invite-input');
    const target = input.value.trim();
    if (target) { sendGuildInvite(target); input.value = ''; }
  });
  $('guild-motd-btn').addEventListener('click', () => {
    sendGuildMotd($('guild-motd-input').value.trim().slice(0, 120));
  });
  $('guild-leave-btn').addEventListener('click', () => {
    ui.showDialog('Abandonar gremio', '¿Seguro que quieres abandonar el gremio?', [
      { label: 'Abandonar', fn: () => { sendGuildLeave(); ui.hideDialog(); } },
      { label: 'Cancelar', fn: ui.hideDialog },
    ]);
  });
  $('guild-disband-btn').addEventListener('click', () => {
    ui.showDialog('Disolver gremio', 'Esto eliminará el gremio para todos sus miembros. ¿Continuar?', [
      { label: 'Disolver', fn: () => { sendGuildDisband(); ui.hideDialog(); } },
      { label: 'Cancelar', fn: ui.hideDialog },
    ]);
  });
}

export function toggleGuild() {
  const panel = $('guild-panel');
  const wasHidden = panel.classList.contains('hidden');
  ui.togglePanel('guild-panel');
  if (wasHidden) sendGuildInfo(); // pedir datos frescos al abrir
  render();
}

export function closeGuild() {
  $('guild-panel').classList.add('hidden');
}

// Llega desde el servidor: guild === null (sin gremio) o el payload completo.
export function onGuildInfo(msg) {
  currentInfo = msg.guild || null;
  render();
}

// Invitación recibida de otro jugador.
export function onGuildInvite(msg, accept) {
  ui.showDialog('Invitación de gremio',
    `${msg.fromName} te invita a unirte al gremio «${msg.guild}».`, [
    { label: '🛡️ Unirse', fn: () => { accept(msg.guild); ui.hideDialog(); } },
    { label: 'Rechazar', fn: ui.hideDialog },
  ]);
}

function render() {
  const has = !!pstate.guild;
  $('guild-none').classList.toggle('hidden', has);
  $('guild-info').classList.toggle('hidden', !has);
  if (!has || !currentInfo) return;

  const info = currentInfo;
  const amLeader = info.leader === myName;
  $('guild-title').textContent = `🛡️ ${info.name}`;
  $('guild-motd').textContent = info.motd || 'Sin lema. El líder puede añadir uno.';
  $('guild-count').textContent = info.members.length;

  // Solo el líder ve invitar, editar lema y disolver.
  $('guild-invite-row').classList.toggle('hidden', !amLeader);
  $('guild-motd-edit').classList.toggle('hidden', !amLeader);
  $('guild-disband-btn').classList.toggle('hidden', !amLeader);
  if (amLeader) $('guild-motd-input').value = info.motd || '';

  const list = $('guild-members');
  list.innerHTML = '';
  // Líder primero, luego por nivel descendente.
  const sorted = [...info.members].sort((a, b) =>
    (b.leader - a.leader) || (b.level - a.level));
  for (const m of sorted) {
    const row = document.createElement('div');
    row.className = 'guild-member';
    const dot = m.online ? '🟢' : '⚫';
    const crown = m.leader ? '👑 ' : '';
    const label = document.createElement('span');
    label.innerHTML = `${dot} ${crown}<b>${m.name}</b> <span class="craft-stat">Nv. ${m.level}</span>`;
    row.appendChild(label);
    // El líder puede expulsar a otros.
    if (amLeader && m.name !== myName) {
      const kick = document.createElement('button');
      kick.className = 'guild-kick';
      kick.textContent = 'Expulsar';
      kick.addEventListener('click', () => sendGuildKick(m.name));
      row.appendChild(kick);
    }
    list.appendChild(row);
  }
}
