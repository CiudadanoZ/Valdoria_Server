// Ayudantes de gremio del lado servidor: difusión al gremio, construcción del
// panel y limpieza de pertenencia. Los manejadores de mensajes (guild_create,
// guild_invite…) siguen en server/server.js; esto es la lógica que comparten.
import { players, send, broadcast, sendSync } from './hub.js';
import { getGuild, findCharacterByName, touch } from './db.js';

// Difunde a todos los miembros conectados de un gremio (aunque estén en reinos
// distintos: el chat de gremio es global).
export function broadcastGuild(guildName, obj) {
  if (!guildName) return;
  const raw = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.realm && p.character?.state.guild === guildName && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

// Datos del gremio para el panel: nombre, líder, lema y miembros con nivel y
// estado de conexión.
export function guildInfoPayload(guildName) {
  const g = getGuild(guildName);
  if (!g) return null;
  const onlineNames = new Set();
  for (const p of players.values()) {
    if (p.realm && p.character?.state.guild === g.name) onlineNames.add(p.name);
  }
  const members = g.members.map((charName) => {
    const rec = findCharacterByName(charName);
    return {
      name: charName,
      level: rec?.character?.state?.progression?.level || 1,
      online: onlineNames.has(charName),
      leader: charName === g.leader,
    };
  });
  members.sort((a, b) => (b.online - a.online) || (b.level - a.level));
  return { name: g.name, leader: g.leader, motd: g.motd, members };
}

// Envía la info actualizada del gremio a todos sus miembros conectados.
export function pushGuildInfo(guildName) {
  const info = guildInfoPayload(guildName);
  if (info) broadcastGuild(guildName, { type: 'guild_info', guild: info });
}

// Quita a un personaje de su gremio (limpia st.guild, sincroniza si está online).
export function clearMemberGuild(charName) {
  const rec = findCharacterByName(charName);
  if (!rec) return;
  rec.character.state.guild = null;
  touch();
  for (const p of players.values()) {
    if (p.character === rec.character) { sendSync(p); send(p.ws, { type: 'guild_info', guild: null }); }
  }
}
