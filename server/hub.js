// Núcleo de red del servidor: el registro de jugadores conectados y las
// primitivas de mensajería. Es la capa hoja de la que dependen los demás
// módulos de dominio (gremios, combate, comercio…), así que no importa a
// ninguno de ellos: solo a la base de datos y al estado del personaje.
import { syncPayload } from './state.js';
import { touch } from './db.js';

// id de conexión -> { ws, account, character, charId, name, race, class, realm,
//   x, z, rot, hp, mp, partyId, moveBudget, lastMoveMs, herbCooldowns, ... }
export const players = new Map();

// Envía un objeto por un socket concreto (si sigue abierto).
export function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Envía a un jugador por su id.
export function sendTo(id, obj) {
  const p = players.get(id);
  if (p) send(p.ws, obj);
}

// Difunde a todos los jugadores de un reino (con opción de excluir a uno).
export function broadcast(realm, obj, exceptId = null) {
  const raw = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (p.realm === realm && id !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

// Difunde a TODOS los jugadores dentro del mundo, sea cual sea su reino.
export function broadcastAll(obj) {
  const raw = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.realm && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

// Sincroniza al cliente el estado autoritativo (bolsa, oro, progresión…).
export function sendSync(p) {
  send(p.ws, { type: 'state_sync', ...syncPayload(p.character.state) });
  touch();
}

// Rechazo de una operación (RPC) con su motivo.
export function fail(p, reason) {
  send(p.ws, { type: 'rpc_fail', reason });
}
