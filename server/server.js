// Servidor de la Ciudadela de Valdoria — AUTORITATIVO
// - Cuentas con contraseña y personajes persistidos en disco (server/db.js)
// - El servidor es dueño de: oro, bolsa, equipo, experiencia, niveles, talentos,
//   recompensas de misiones, tienda, forja, cocina, pesca y recolección.
//   El cliente solo muestra el estado que recibe (state_sync).
// - Movimiento validado por velocidad (con lista blanca de portales y fuente)
// - Dos reinos con simulación de criaturas independiente a 10 Hz
import express from 'express';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDb, flushAndClose, authenticate, publicCharacters, createCharacter,
  deleteCharacter, getCharacter, saveCharacterState, touch,
  isAdminAccount, banAccount, unbanAccount, changePassword, getLeaderboards,
  getDepthsBoard, getAccountsSummary, findCharacterByName,
  listAuctions, auctionsBySeller, getAuction, addAuction, removeAuction, countAuctionsBySeller,
  getGuild, guildExists, createGuild, deleteGuild, guildAddMember, guildRemoveMember,
  setGuildMotd, setGuildLeader, isCleanName,
} from './db.js';
import { WAYSTONES, waystoneById, MOUNTS } from '../public/js/world-data.js';
import {
  ensureState, bagCount, bagAdd, bagRemove, bagAddEntry, bagTakeAt,
  equipFromBag, unequipToBag,
  maxPlausibleHit, addXp, spendTalent, spendEcho, syncPayload,
  computeMaxHp, computeArmor, computeHealMul, regenPerSec, applyBlessing,
  onBountyKill, claimBounty, acceptBounty, respecCost, respecTalents,
  computeMaxResource, resourceDef, startingResource,
  affixSpeed, goldMultiplier, powerValue,
  offenseOf, attackSpeedOf, defenseOf,
} from './state.js';
import {
  rollGear, displayName, tierFromXp, sellValueOf, POWERS,
  retemper, reforge, forgeCost,
} from '../public/js/affixes.js';
import {
  DEPTHS_ENTRY, STAIRS_SPOT, HATCH_SPOT, HATCH_RANGE, MAX_DEPTH,
  buildDepthMobs, depthRealmId, isDepthRealm, guardianFor, ensureDepths, recordDepth,
} from './depths.js';
import { skillById } from '../public/js/skills-data.js';
import { xpForLevel } from '../public/js/talents-data.js';
import {
  applyArmor, resolveHit, resolveIncoming, attackCooldownMs,
} from '../public/js/combat-data.js';
import { EVENT_INTERVAL_S, COLOSO_SPOT, MOB_TYPES, SPAWNS } from './mobs-data.js';
import {
  REALMS, PORTAL_JUMPS, FOUNTAIN, MAX_SPEED, HERB_SPOTS, HERB_COOLDOWN_MS,
  LAKE, FISHING_SPOTS, NPC_SPOTS, CAMPFIRE_SPOTS, BOARD_SPOT, CITADEL_SAFE_RADIUS,
} from './world-map.js';
import { players, send, sendTo, broadcast, broadcastAll, sendSync, fail } from './hub.js';
import { broadcastGuild, guildInfoPayload, pushGuildInfo, clearMemberGuild } from './guild.js';
import { ITEMS } from '../public/js/items.js';
import { appendFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  CRAFT_RECIPES, COOK_RECIPES, COOK_XP, FISHING_XP, FISHING_TABLE,
  SHOP_BUY_LIST, MIRA_HEAL_PRICE, MIRA_BLESSING_PRICES, MIRA_CLEANSE_PRICE, QUEST_REWARDS,
} from '../public/js/recipes.js';

const PORT = process.env.PORT || 3000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUG_LOG = join(root, 'data', 'bug-reports.log');

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use(express.static(join(root, 'public')));

// Clave del panel de administración web (/admin). Si no se define ADMIN_KEY,
// se genera una al azar y se imprime al arrancar.
const ADMIN_KEY = process.env.ADMIN_KEY || randomBytes(6).toString('hex');
const BUG_LOG_PATH = join(root, 'data', 'bug-reports.log');

// Página del panel (no está en public/, se sirve explícitamente)
app.get('/admin', (req, res) => res.sendFile(join(root, 'server', 'admin.html')));

function checkAdminKey(req, res) {
  const key = req.get('x-admin-key') || req.query.key;
  if (key !== ADMIN_KEY) { res.status(401).json({ error: 'Clave incorrecta' }); return false; }
  return true;
}

// Estado general para el panel
app.get('/admin/api/overview', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const online = [];
  for (const [id, p] of players) {
    if (!p.realm) continue;
    online.push({
      id, name: p.name, account: p.account?.name, realm: p.realm,
      admin: !!p.admin, muted: !!p.muted,
      x: +p.x.toFixed(0), z: +p.z.toFixed(0), hp: Math.round(p.hp || 0),
    });
  }
  let bugs = [];
  try {
    if (existsSync(BUG_LOG_PATH)) {
      bugs = readFileSync(BUG_LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
        .slice(-50).reverse().map((l) => { try { return JSON.parse(l); } catch { return { text: l }; } });
    }
  } catch { /* nada */ }
  res.json({
    online,
    accounts: getAccountsSummary(),
    bugs,
    leaderboards: getLeaderboards(10),
    serverTime: new Date().toISOString(),
  });
});

// Acciones del panel: kick, ban, unban, announce
app.post('/admin/api/command', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { action, target, text } = req.body || {};
  switch (action) {
    case 'announce': {
      const msg = String(text || '').slice(0, 200).trim();
      if (!msg) return res.json({ ok: false, message: 'Mensaje vacío' });
      doAnnounce(msg, 'panel-web');
      return res.json({ ok: true, message: 'Anuncio enviado' });
    }
    case 'kick': {
      const r = doKick(String(target || ''), 'panel-web');
      return res.json({ ok: r.ok, message: r.ok ? `Expulsado ${r.name}` : r.reason });
    }
    case 'ban': {
      const r = doBan(String(target || ''), 'panel-web');
      return res.json({ ok: r.ok, message: r.ok ? `Vetada la cuenta de ${r.name}` : r.reason });
    }
    case 'unban': {
      const ok = unbanAccount(String(target || ''));
      return res.json({ ok, message: ok ? `Veto levantado a "${target}"` : `"${target}" no estaba vetada` });
    }
    default:
      return res.json({ ok: false, message: 'Acción desconocida' });
  }
});

// Con TLS_CERT y TLS_KEY definidos, el servidor sirve HTTPS y el WebSocket pasa
// a ser WSS automáticamente (necesario para jugar por Internet).
const useTls = process.env.TLS_CERT && process.env.TLS_KEY;
const httpServer = useTls
  ? createHttpsServer({ cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }, app)
  : createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Carga la base de datos antes de seguir (top-level await: el resto del módulo
// asume el modelo ya en memoria).
await loadDb();

// Apagado ordenado: Render envía SIGTERM al dormir o redesplegar. Volcamos lo
// pendiente antes de salir para no perder progreso.
let shuttingDown = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Recibido ${sig}: guardando y cerrando...`);
    try { await flushAndClose(); } catch (err) { console.error('Error al cerrar:', err.message); }
    process.exit(0);
  });
}

// (disposición del mundo movida a ./world-map.js)

function nearSpot(p, spot, radius = 8) {
  return dist(p.x, p.z, spot[0], spot[1]) <= radius;
}

// ============================ JUGADORES ============================
let nextId = 1;
// (players + primitivas de red movidos a ./hub.js)

// ---- Vida y recurso autoritativos ----
function vitals(p) {
  return {
    hp: Math.round(p.hp), maxHp: computeMaxHp(p.character),
    mp: Math.round(p.mp), maxMp: computeMaxResource(p.character),
  };
}

// Suma (o resta) recurso acotando al pozo. Devuelve el valor final.
function addResource(p, amount) {
  p.mp = Math.max(0, Math.min(computeMaxResource(p.character), p.mp + amount));
  return p.mp;
}

// Cobra el coste de una habilidad. Devuelve false (y avisa) si no alcanza.
function spendResource(p, skill) {
  // Ímpetu Inagotable abarata todo lo que lanzas.
  const descuento = powerValue(p.character.state, 'impetu');
  const cost = Math.round((skill.cost || 0) * (1 - descuento));
  if (p.mp < cost) { fail(p, resourceDef(p.character).empty); return false; }
  p.mp -= cost;
  return true;
}

function currentBuffArmor(p) {
  return p.buffUntil > Date.now() ? p.buffArmor : 0;
}

// ---- «Alma Debilitada»: penalización tras morir ----
// El multiplicador lo aplica el SERVIDOR a todo el daño que reparte el jugador;
// así un cliente manipulado no puede ignorar el castigo.
const WEAK_DUR_S = 90;
const WEAK_MUL = 0.7;
const WEAK_XP_LOSS = 0.10; // 10% de la EXP que cuesta el nivel actual

function weakMul(p) {
  return (p.weakUntil || 0) > Date.now() ? WEAK_MUL : 1;
}

function weakPayload(p) {
  const left = Math.max(0, (p.weakUntil || 0) - Date.now());
  return { weak: left > 0, weakLeft: Math.round(left / 1000), weakMul: WEAK_MUL };
}

// Aplica el castigo de la muerte: pierde parte de la EXP del nivel actual (sin
// bajar de nivel) y queda debilitado un rato. Devuelve la EXP perdida.
function applyDeathPenalty(p) {
  const st = p.character.state;
  const prog = st.progression;
  const lost = Math.min(prog.xp, Math.round(xpForLevel(prog.level) * WEAK_XP_LOSS));
  prog.xp -= lost;
  p.weakUntil = st.weakUntil = Date.now() + WEAK_DUR_S * 1000;
  touch();
  return lost;
}

// ---- Poderes legendarios ----
// Los aplica siempre el servidor. El cliente no sabe cuánto roba ni cuánto
// devuelve: solo ve el resultado, igual que con el resto del combate.

// Sed de Sangre: robas vida en proporción al daño que haces.
function applySed(p, dmg) {
  const frac = powerValue(p.character.state, 'sed');
  if (!frac) return;
  const cura = Math.max(1, Math.round(dmg * frac));
  healPlayer(p, cura);
}

// Verdugo: castiga el primer golpe sobre un enemigo que aún está intacto.
function applyVerdugo(p, m, dmg) {
  const frac = powerValue(p.character.state, 'verdugo');
  if (!frac || m.hp < m.def.hp) return dmg;
  return Math.round(dmg * (1 + frac));
}

// Eco Sangriento: cada baja te devuelve vida.
function applyEco(p) {
  const cura = powerValue(p.character.state, 'eco');
  if (cura) healPlayer(p, Math.round(cura));
}

// Espinas: devuelve parte del daño recibido a quien te golpeó.
function applyEspinas(p, m, reduced, realm) {
  const frac = powerValue(p.character.state, 'espinas');
  if (!frac || !m || m.state === 'dead') return;
  const vuelta = Math.max(1, Math.round(reduced * frac));
  m.hp -= vuelta;
  if (m.hp <= 0) killMob(realm, m, [...players].find(([, pp]) => pp === p)?.[0] ?? null);
  else broadcast(realm, { type: 'mob_hit', id: m.id, hp: m.hp, dmg: vuelta });
}

// Segundo Aliento: una red de seguridad al cruzar el cuarto de vida. Con
// enfriamiento propio, porque si no convertiría al héroe en inmortal.
function applySegundoAliento(p) {
  const cura = powerValue(p.character.state, 'aliento');
  if (!cura) return false;
  const now = Date.now();
  const cd = (POWERS.aliento.cooldown || 60) * 1000;
  if (p.hp > computeMaxHp(p.character) * 0.25) return false;
  if (now - (p.lastAlientoMs || 0) < cd) return false;
  p.lastAlientoMs = now;
  healPlayer(p, Math.round(cura));
  return true;
}

// Aplica daño de una criatura: reduce por armadura, detecta la muerte y
// reaparece al jugador junto a la fuente con el 60% de la vida.
function damagePlayer(p, id, rawDmg, mobName, atacante = null, realm = null) {
  dismount(p, id);
  // Armadura, luego reducción de daño, luego bloqueo (solo con escudo).
  const golpe = resolveIncoming(rawDmg, defenseOf(p.character, currentBuffArmor(p)));
  const reduced = golpe.dmg;
  p.hp = Math.max(0, p.hp - reduced);
  // Espinas devuelve el golpe; Segundo Aliento puede salvarte justo aquí, antes
  // de que se evalúe la muerte.
  if (atacante && realm) applyEspinas(p, atacante, reduced, realm);
  if (p.hp > 0) applySegundoAliento(p);
  p.lastCombatMs = Date.now();
  // Recibir daño también alimenta la furia del guerrero
  const gain = resourceDef(p.character).onHurt;
  if (gain) { addResource(p, gain); p.lastRageMs = Date.now(); }

  if (p.hp <= 0) {
    const maxHp = computeMaxHp(p.character);
    p.hp = Math.round(maxHp * 0.6);
    p.mp = startingResource(p.character); // la furia se pierde al caer
    p.x = (Math.random() - 0.5) * 4;
    p.z = FOUNTAIN[1];
    p.moveBudget = 4;
    stopFishing(p);
    const xpLost = applyDeathPenalty(p);
    sendSync(p); // la EXP perdida viaja en la progresión
    send(p.ws, {
      type: 'you_died', by: mobName, x: p.x, z: p.z, xpLost,
      ...vitals(p), ...weakPayload(p),
    });
    // Caer en Las Profundidades acaba el descenso: la marca es hasta dónde
    // llegaste VIVO, y por eso bajar un piso más siempre es una apuesta.
    if (isDepthRealm(p.realm)) {
      leaveDepths(p, id, `Caíste en el piso ${p.depth}. Las Profundidades te escupen a la superficie.`);
      return;
    }
    broadcast(p.realm, { type: 'player_state', id, x: p.x, z: p.z, rot: p.rot }, id);
  } else {
    send(p.ws, { type: 'player_hurt', dmg: reduced, mobName, blocked: golpe.blocked, ...vitals(p) });
  }
}

// Daño de un jugador a otro (JcJ). No hay pérdida de objetos: al morir,
// reaparece en la fuente y el atacante suma una baja de JcJ.
function damagePlayerByPlayer(attacker, target, targetId, rawDmg) {
  dismount(target, targetId);
  // En JcJ valen los mismos ejes: el atacante multiplica, el objetivo mitiga.
  const golpe = resolveHit(rawDmg, offenseOf(attacker.character.state));
  const reduced = resolveIncoming(golpe.dmg, defenseOf(target.character, currentBuffArmor(target))).dmg;
  target.hp = Math.max(0, target.hp - reduced);
  target.lastCombatMs = Date.now();
  const gain = resourceDef(target.character).onHurt;
  if (gain) { addResource(target, gain); target.lastRageMs = Date.now(); }

  if (target.hp <= 0) {
    const maxHp = computeMaxHp(target.character);
    target.hp = Math.round(maxHp * 0.6);
    target.mp = startingResource(target.character);
    target.x = (Math.random() - 0.5) * 4;
    target.z = FOUNTAIN[1];
    target.moveBudget = 4;
    stopFishing(target);
    cancelTrade(targetId); // morir cancela un comercio en curso
    if (attacker.character) {
      attacker.character.state.pvpKills = (attacker.character.state.pvpKills || 0) + 1;
      touch();
    }
    const xpLost = applyDeathPenalty(target);
    sendSync(target);
    send(target.ws, {
      type: 'you_died', by: attacker.name, x: target.x, z: target.z, xpLost,
      ...vitals(target), ...weakPayload(target),
    });
    broadcast(target.realm, { type: 'player_state', id: targetId, x: target.x, z: target.z, rot: target.rot }, targetId);
    broadcast(target.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `⚔ ${attacker.name} ha derrotado a ${target.name} en combate.` });
  } else {
    send(target.ws, { type: 'player_hurt', dmg: reduced, mobName: attacker.name, crit: golpe.crit, ...vitals(target) });
  }
}

// Bajar de la montura (al entrar en combate). Avisa al cliente y a la zona.
function dismount(p, id) {
  if (!p.riding) return;
  p.riding = null;
  send(p.ws, { type: 'mount_state', riding: null });
  broadcast(p.realm, { type: 'player_mount', id, mount: null }, id);
}

// Cura al jugador (pociones, habilidades, Mira, aliados)
function healPlayer(p, amount) {
  const maxHp = computeMaxHp(p.character);
  const healed = Math.min(maxHp - p.hp, amount);
  p.hp = Math.min(maxHp, p.hp + amount);
  return Math.max(0, Math.round(healed));
}

// (broadcastAll movido a ./hub.js)

// Busca un jugador dentro del mundo por el nombre de su personaje (sin
// distinguir mayúsculas)
function findPlayerByName(name) {
  const lower = String(name || '').toLowerCase();
  for (const [pid, p] of players) {
    if (p.realm && p.name && p.name.toLowerCase() === lower) return [pid, p];
  }
  return [null, null];
}

// (helpers de gremio movidos a ./guild.js)

// ---- Comandos de chat (/) ----
function sysTo(p, text) {
  send(p.ws, { type: 'chat', from: 'Ciudadela', system: true, text });
}

const ADMIN_HELP = [
  '/say <mensaje> — anuncio a todo el reino',
  '/kick <héroe> — expulsa a un jugador (puede volver)',
  '/ban <héroe> — expulsa y prohíbe la cuenta',
  '/unban <cuenta> — levanta el veto de una cuenta',
  '/mute <héroe> · /unmute <héroe> — silencia en el chat',
  '/who — lista de jugadores conectados',
].join('\n');

function handleCommand(p, text) {
  const parts = text.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  // Comandos para todos
  if (cmd === 'help') {
    const base = '/g <mensaje> — chat de tu gremio';
    sysTo(p, p.admin ? `Comandos:\n${base}\n${ADMIN_HELP}` : `Comandos:\n${base}`);
    return;
  }
  if (cmd === 'g') {
    const gname = p.character?.state.guild;
    if (!gname) { sysTo(p, 'No perteneces a ningún gremio.'); return; }
    if (p.muted) { sysTo(p, 'Estás silenciado.'); return; }
    if (!arg) { sysTo(p, 'Uso: /g <mensaje>'); return; }
    broadcastGuild(gname, { type: 'chat', from: `[Gremio] ${p.name}`, guild: true, text: arg.slice(0, 200) });
    return;
  }
  if (cmd === 'who') {
    const online = [...players.values()].filter((q) => q.realm).map((q) => `${q.name} (${q.realm}${q.admin ? ', admin' : ''})`);
    sysTo(p, `Conectados (${online.length}): ${online.join(', ')}`);
    return;
  }

  if (!p.admin) { sysTo(p, 'Comando desconocido. Escribe /help.'); return; }

  switch (cmd) {
    case 'say': {
      if (!arg) { sysTo(p, 'Uso: /say <mensaje>'); return; }
      doAnnounce(arg, p.name);
      return;
    }
    case 'kick': {
      const r = doKick(arg, p.name);
      sysTo(p, r.ok ? `Has expulsado a ${r.name}.` : r.reason);
      return;
    }
    case 'ban': {
      const r = doBan(arg, p.name);
      sysTo(p, r.ok ? `Has vetado la cuenta de ${r.name} (${r.account}).` : r.reason);
      return;
    }
    case 'unban': {
      if (!arg) { sysTo(p, 'Uso: /unban <nombre de cuenta>'); return; }
      sysTo(p, unbanAccount(arg) ? `Veto levantado para la cuenta "${arg}".` : `La cuenta "${arg}" no estaba vetada.`);
      return;
    }
    case 'mute': {
      const [tid, target] = findPlayerByName(arg);
      if (!target) { sysTo(p, `No encuentro a "${arg}" en el mundo.`); return; }
      target.muted = true;
      sysTo(p, `Has silenciado a ${target.name}.`);
      sysTo(target, 'Un administrador te ha silenciado en el chat.');
      return;
    }
    case 'unmute': {
      const [tid, target] = findPlayerByName(arg);
      if (!target) { sysTo(p, `No encuentro a "${arg}" en el mundo.`); return; }
      target.muted = false;
      sysTo(p, `Has devuelto la voz a ${target.name}.`);
      sysTo(target, 'Un administrador te ha devuelto la voz.');
      return;
    }
    default:
      sysTo(p, 'Comando desconocido. Escribe /help.');
  }
}

// Acciones de administración reutilizables (chat y panel web)
function doAnnounce(text, by = 'panel') {
  broadcastAll({ type: 'announce', text });
  console.log(`[admin] ${by}: anuncio "${text}"`);
}

function doKick(name, by = 'panel') {
  const [, target] = findPlayerByName(name);
  if (!target) return { ok: false, reason: `No encuentro a "${name}" en el mundo.` };
  broadcast(target.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${target.name} ha sido expulsado por un administrador.` });
  send(target.ws, { type: 'kicked', reason: 'Un administrador te ha expulsado.' });
  setTimeout(() => target.ws.close(), 200);
  console.log(`[admin] ${by} expulsó a ${target.name}`);
  return { ok: true, name: target.name };
}

function doBan(name, by = 'panel') {
  const [, target] = findPlayerByName(name);
  if (!target) return { ok: false, reason: `No encuentro a "${name}" en el mundo.` };
  banAccount(target.account.name);
  broadcast(target.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${target.name} ha sido vetado del reino.` });
  send(target.ws, { type: 'kicked', reason: 'Tu cuenta ha sido vetada del reino.' });
  setTimeout(() => target.ws.close(), 200);
  console.log(`[admin] ${by} vetó la cuenta ${target.account.name}`);
  return { ok: true, name: target.name, account: target.account.name };
}

function realmPopulation() {
  const counts = Object.fromEntries(REALMS.map((r) => [r.id, 0]));
  for (const p of players.values()) {
    if (p.realm) counts[p.realm]++;
  }
  return REALMS.map((r) => ({ ...r, players: counts[r.id] }));
}

function isCharacterOnline(accountName, charId) {
  for (const p of players.values()) {
    if (p.account?.name === accountName && p.charId === charId && p.realm) return true;
  }
  return false;
}

// ============================ GRUPOS ============================
let nextPartyId = 1;
const parties = new Map();

function partyMembersPayload(partyId) {
  const set = parties.get(partyId);
  if (!set) return [];
  return [...set].map((pid) => ({ id: pid, name: players.get(pid)?.name || '???' }));
}

function broadcastPartyUpdate(partyId) {
  const members = partyMembersPayload(partyId);
  for (const pid of parties.get(partyId) || []) {
    sendTo(pid, { type: 'party_update', members });
  }
}

function leaveParty(id, notifySelf = true) {
  const p = players.get(id);
  if (!p || !p.partyId) return;
  const partyId = p.partyId;
  const set = parties.get(partyId);
  p.partyId = null;
  if (notifySelf) sendTo(id, { type: 'party_left' });
  if (!set) return;
  set.delete(id);
  if (set.size <= 1) {
    for (const pid of set) {
      const rest = players.get(pid);
      if (rest) rest.partyId = null;
      sendTo(pid, { type: 'party_left' });
    }
    parties.delete(partyId);
  } else {
    broadcastPartyUpdate(partyId);
  }
}

// ============================ COMERCIO ENTRE JUGADORES ============================
// Cada jugador en comercio guarda p.tradeWith (id del socio) y p.tradeOffer
// { slots:[índice...], items:[{itemId,roll}...], gold, confirmed }. Se guardan
// las CASILLAS y no solo los ids: con afijos, dos objetos que se llaman igual
// no valen lo mismo, y el que enseñas tiene que ser el que entregas.
// El intercambio lo ejecuta el servidor de forma atómica (con reversión).
const TRADE_RANGE = 14;

function emptyOffer() { return { slots: [], items: [], gold: 0, confirmed: false }; }

function offerPayload(p) {
  return { items: (p.tradeOffer?.items || []).slice(), gold: p.tradeOffer?.gold || 0, confirmed: !!p.tradeOffer?.confirmed };
}

function sendTradeUpdate(a, b) {
  send(a.ws, { type: 'trade_update', mine: offerPayload(a), theirs: offerPayload(b) });
  send(b.ws, { type: 'trade_update', mine: offerPayload(b), theirs: offerPayload(a) });
}

function startTrade(aId, bId) {
  const a = players.get(aId), b = players.get(bId);
  if (!a || !b) return;
  a.tradeWith = bId; b.tradeWith = aId;
  a.tradeOffer = emptyOffer(); b.tradeOffer = emptyOffer();
  send(a.ws, { type: 'trade_open', partnerId: bId, partnerName: b.name });
  send(b.ws, { type: 'trade_open', partnerId: aId, partnerName: a.name });
}

function cancelTrade(id, reason = 'El comercio se ha cancelado.') {
  const p = players.get(id);
  if (!p || !p.tradeWith) return;
  const otherId = p.tradeWith;
  const other = players.get(otherId);
  p.tradeWith = null; p.tradeOffer = null;
  send(p.ws, { type: 'trade_closed', reason });
  if (other && other.tradeWith === id) {
    other.tradeWith = null; other.tradeOffer = null;
    send(other.ws, { type: 'trade_closed', reason });
  }
}

// ¿Sigue teniendo el jugador, en esas mismas casillas, lo que puso sobre la
// mesa? Se comprueba casilla a casilla porque entre la oferta y la confirmación
// pudo vender, equipar o subastar la pieza.
function offerIsValid(p) {
  const st = p.character.state;
  const offer = p.tradeOffer;
  if ((offer.gold || 0) > st.inventory.gold) return false;
  return offer.slots.every((idx, n) => {
    const slot = st.inventory.slots[idx];
    const shown = offer.items[n];
    if (!slot || !shown || slot.itemId !== shown.itemId) return false;
    return JSON.stringify(slot.roll || null) === JSON.stringify(shown.roll || null);
  });
}

function executeTrade(aId, bId) {
  const a = players.get(aId), b = players.get(bId);
  if (!a || !b) return;
  const sa = a.character.state, sb = b.character.state;

  if (!offerIsValid(a) || !offerIsValid(b)) {
    cancelTrade(aId, 'Uno de los dos ya no tiene lo que ofrecía.');
    return;
  }
  // Reversión: copias de seguridad de ambos inventarios
  const backupA = JSON.parse(JSON.stringify(sa.inventory));
  const backupB = JSON.parse(JSON.stringify(sb.inventory));

  // Retirar de cada uno las piezas EXACTAS que puso sobre la mesa
  const fromA = a.tradeOffer.slots.map((i) => bagTakeAt(sa, i, 1)).filter(Boolean);
  const fromB = b.tradeOffer.slots.map((i) => bagTakeAt(sb, i, 1)).filter(Boolean);
  sa.inventory.gold -= a.tradeOffer.gold;
  sb.inventory.gold -= b.tradeOffer.gold;

  // Entregar al otro, con su tirada (comprobando espacio en la bolsa)
  let ok = fromA.length === a.tradeOffer.slots.length && fromB.length === b.tradeOffer.slots.length;
  if (ok) for (const entry of fromA) { if (!bagAddEntry(sb, entry)) { ok = false; break; } }
  if (ok) for (const entry of fromB) { if (!bagAddEntry(sa, entry)) { ok = false; break; } }

  if (!ok) {
    sa.inventory = backupA; sb.inventory = backupB;
    cancelTrade(aId, 'Una de las bolsas está llena: comercio cancelado.');
    return;
  }
  sa.inventory.gold += b.tradeOffer.gold;
  sb.inventory.gold += a.tradeOffer.gold;

  a.tradeWith = null; a.tradeOffer = null;
  b.tradeWith = null; b.tradeOffer = null;
  sendSync(a); sendSync(b);
  send(a.ws, { type: 'trade_done' });
  send(b.ws, { type: 'trade_done' });
  console.log(`[comercio] ${a.name} <-> ${b.name}`);
}

// ============================ CRIATURAS ============================
// (datos de criaturas movidos a ./mobs-data.js)


let nextMobId = 1;
const realmMobs = new Map();
for (const realm of REALMS) {
  const mobs = new Map();
  for (const [type, x, z] of SPAWNS) {
    const def = MOB_TYPES[type];
    const id = nextMobId++;
    mobs.set(id, {
      id, type, def,
      x, z, rot: Math.random() * Math.PI * 2,
      homeX: x, homeZ: z,
      hp: def.hp,
      state: 'idle',
      wanderX: 0, wanderZ: 0,
      idleTime: 1 + Math.random() * 3,
      attackTimer: 0,
      targetId: null,
      deadUntil: 0,
      damagers: new Set(),
    });
  }
  // Jefe de mundo: un único Coloso por reino, gestionado como evento.
  // Empieza "muerto" y aparece por primera vez tras un intervalo.
  {
    const def = MOB_TYPES.coloso;
    const [cx, cz] = COLOSO_SPOT;
    const id = nextMobId++;
    mobs.set(id, {
      id, type: 'coloso', def,
      x: cx, z: cz, rot: 0,
      homeX: cx, homeZ: cz,
      hp: def.hp,
      state: 'dead',
      wanderX: 0, wanderZ: 0,
      idleTime: 2,
      attackTimer: 0,
      targetId: null,
      deadUntil: Date.now() + EVENT_INTERVAL_S * 1000,
      damagers: new Set(),
      isEvent: true,
    });
  }
  realmMobs.set(realm.id, mobs);
}

function mobSnapshotFull(realm) {
  return [...realmMobs.get(realm).values()].map((m) => ({
    id: m.id, type: m.type, x: +m.x.toFixed(2), z: +m.z.toFixed(2),
    hp: m.hp, dead: m.state === 'dead',
  }));
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

function isCryptMob(m) { return m.homeX > 400; }

// Lo "duro" que es un bicho, en la escala que usan los afijos. Sale de la
// experiencia que da, que es la medida de dureza que el juego ya tenía: así no
// hay que etiquetar veinte criaturas a mano ni se puede desincronizar.
function mobTier(m) {
  return tierFromXp(m.def.xp) + (m.depthBonus || 0);
}

// ============================ LAS PROFUNDIDADES ============================
// Cada héroe baja a su propia instancia. Nace al entrar, se rehace al descender
// un piso y el bucle de IA la desmonta en cuanto se queda vacía.

// Monta (o rehace) la instancia del héroe en el piso pedido y lo mete dentro.
function enterDepths(p, id, depth) {
  const realmId = depthRealmId(p.charId);
  const mobs = new Map();
  for (const m of buildDepthMobs(depth, () => nextMobId++)) mobs.set(m.id, m);
  realmMobs.set(realmId, mobs);

  const prev = p.realm;
  p.realm = realmId;
  p.depth = depth;
  p.stairsOpen = false;
  [p.x, p.z] = DEPTHS_ENTRY;
  p.moveBudget = 4;
  p.lastMoveMs = Date.now();
  stopFishing(p);
  dismount(p, id);
  // Que el mundo que deja atrás no siga viéndolo plantado en la plaza.
  if (prev && prev !== realmId) broadcast(prev, { type: 'player_leave', id }, id);

  send(p.ws, {
    type: 'depths_entered',
    depth,
    realm: realmId,
    x: p.x, z: p.z,
    guardian: MOB_TYPES[guardianFor(depth)].name,
    mobs: mobSnapshotFull(realmId),
    best: ensureDepths(p.character.state).best,
  });
}

// Devuelve al héroe a la Ciudadela y desmonta su instancia.
function leaveDepths(p, id, reason = 'Sales de Las Profundidades.') {
  if (!isDepthRealm(p.realm)) return;
  const realmId = p.realm;
  const depth = p.depth || 1;
  realmMobs.delete(realmId);

  p.realm = p.homeRealm || REALMS[0].id;
  p.depth = 0;
  p.stairsOpen = false;
  [p.x, p.z] = HATCH_SPOT;
  p.moveBudget = 4;
  p.lastMoveMs = Date.now();

  sendSync(p);
  send(p.ws, {
    type: 'depths_left', reason, depth,
    realm: p.realm, x: p.x, z: p.z,
    mobs: mobSnapshotFull(p.realm),
  });
  broadcast(p.realm, {
    type: 'player_join', id, name: p.name, race: p.race, class: p.class,
    x: p.x, z: p.z, rot: p.rot,
  }, id);
}

// ---- Muerte de un mob: oro/objetos/experiencia directos al estado del personaje ----
function killMob(realm, m, killerId) {
  m.state = 'dead';
  m.deadUntil = Date.now() + m.def.respawn * 1000;
  m.targetId = null;

  const recipients = new Set();
  for (const pid of m.damagers) {
    const p = players.get(pid);
    if (!p) continue;
    recipients.add(pid);
    if (p.partyId) {
      for (const member of parties.get(p.partyId) || []) {
        const mp = players.get(member);
        if (mp && mp.realm === realm) recipients.add(member);
      }
    }
  }
  m.damagers.clear();

  broadcast(realm, { type: 'mob_dead', id: m.id, by: killerId });

  if (m.isEvent) {
    const hero = players.get(killerId)?.name || 'un héroe';
    broadcast(realm, { type: 'announce', text: `🏆 ¡El ${m.def.name} ha caído por la mano de ${hero} y sus aliados! El botín se reparte entre los valientes.` });
  }

  // El guardián del umbral era lo único que cerraba la escalera al piso de abajo.
  if (m.isGuardian && isDepthRealm(realm)) {
    for (const [pid, p] of players) {
      if (p.realm !== realm) continue;
      p.stairsOpen = true;
      recordDepth(p.character.state, p.depth || 1);
      sendSync(p);
      send(p.ws, {
        type: 'depths_stairs_open',
        depth: p.depth,
        x: STAIRS_SPOT[0], z: STAIRS_SPOT[1],
        text: `El ${m.def.name} cae y la escalera al piso ${(p.depth || 1) + 1} se abre.`,
      });
      void pid;
    }
  }

  for (const pid of recipients) {
    const p = players.get(pid);
    if (!p?.character) continue;
    const st = p.character.state;

    const baseGold = m.def.gold[0] + Math.floor(Math.random() * (m.def.gold[1] - m.def.gold[0] + 1));
    const gold = Math.round(baseGold * goldMultiplier(st));
    st.inventory.gold += gold;

    // Lo que suelta se tira: el equipo sale con su grado y sus afijos según lo
    // duro que fuera el bicho, así que dos Filos Glaciales nunca son iguales.
    const tier = mobTier(m);
    const items = [];
    for (const [itemId, chance] of m.def.drops) {
      if (Math.random() >= chance) continue;
      const roll = rollGear(itemId, tier);
      if (!bagAdd(st, itemId, 1, roll)) continue;
      items.push(roll ? { itemId, roll } : itemId);
      // Un hallazgo de grado alto es un acontecimiento: que se entere el reino.
      if (roll && roll.grade >= 3) {
        broadcast(realm, {
          type: 'announce',
          text: `✦✦✦ ¡${p.name} ha encontrado ${displayName({ itemId, roll })}, una reliquia digna de las canciones!`,
        });
      }
    }

    addXp(st, m.def.xp);
    applyEco(p);   // Eco Sangriento: cada baja devuelve vida
    st.kills[m.type] = (st.kills[m.type] || 0) + 1;
    onBountyKill(st, m.type);

    sendSync(p);
    sendTo(pid, { type: 'loot', mobType: m.type, mobName: m.def.name, gold, items, xp: m.def.xp });
  }
}

// ---- Bucle de IA (10 Hz) por reino ----
const TICK = 0.1;
setInterval(() => {
  const now = Date.now();

  // Los reinos fijos más las instancias de Las Profundidades que estén vivas.
  for (const realmId of [...realmMobs.keys()]) {
    const realm = { id: realmId };
    const mobs = realmMobs.get(realmId);
    const realmPlayers = [...players.entries()].filter(([, p]) => p.realm === realmId);
    // Una instancia sin nadie dentro se desmonta: no tiene sentido simularla.
    if (isDepthRealm(realmId) && realmPlayers.length === 0) { realmMobs.delete(realmId); continue; }
    const changed = [];

    for (const m of mobs.values()) {
      if (m.state === 'dead') {
        if (now >= m.deadUntil) {
          m.hp = m.def.hp;
          m.x = m.homeX;
          m.z = m.homeZ;
          m.state = 'idle';
          m.idleTime = 2;
          broadcast(realm.id, { type: 'mob_spawn', id: m.id, x: m.x, z: m.z, hp: m.hp });
          if (m.isEvent) {
            broadcast(realm.id, { type: 'announce', text: `⚔️ ¡El ${m.def.name} ha despertado al sur de la Ciudadela! ¡Reunid a los héroes!` });
          }
        }
        continue;
      }

      const distHome = dist(m.x, m.z, m.homeX, m.homeZ);

      if (m.state !== 'return') {
        let best = null, bestD = m.def.aggro;
        for (const [pid, p] of realmPlayers) {
          const d = dist(m.x, m.z, p.x, p.z);
          if (d < bestD) { best = pid; bestD = d; }
        }
        if (best !== null) { m.targetId = best; m.state = 'chase'; }
      }

      if (m.state === 'chase') {
        const target = players.get(m.targetId);
        const lost = !target || target.realm !== realm.id
          || dist(m.x, m.z, target.x, target.z) > Math.max(m.def.aggro * 2.2, 14);
        if (lost || distHome > 26) {
          m.state = 'return';
          m.targetId = null;
        } else {
          const d = dist(m.x, m.z, target.x, target.z);
          if (d > m.def.range) {
            moveMobToward(m, target.x, target.z, m.def.speed);
          } else {
            m.rot = Math.atan2(target.x - m.x, target.z - m.z);
            m.attackTimer -= TICK;
            if (m.attackTimer <= 0) {
              m.attackTimer = m.def.cd;
              const dmg = Math.round(m.def.dmgMin + Math.random() * (m.def.dmgMax - m.def.dmgMin));
              damagePlayer(target, m.targetId, dmg, m.def.name, m, realm.id);
            }
          }
        }
      } else if (m.state === 'return') {
        moveMobToward(m, m.homeX, m.homeZ, m.def.speed * 1.3);
        if (distHome < 1) {
          m.state = 'idle';
          m.idleTime = 2;
          m.hp = m.def.hp;
          m.damagers.clear();
        }
      } else if (m.state === 'wander') {
        moveMobToward(m, m.wanderX, m.wanderZ, m.def.speed * 0.4);
        if (dist(m.x, m.z, m.wanderX, m.wanderZ) < 0.5) {
          m.state = 'idle';
          m.idleTime = 1.5 + Math.random() * 4;
        }
      } else {
        m.idleTime -= TICK;
        if (m.idleTime <= 0) {
          const a = Math.random() * Math.PI * 2;
          const d = 2 + Math.random() * (isCryptMob(m) ? 3 : 6);
          m.wanderX = m.homeX + Math.cos(a) * d;
          m.wanderZ = m.homeZ + Math.sin(a) * d;
          m.state = 'wander';
        }
      }

      changed.push([m.id, +m.x.toFixed(2), +m.z.toFixed(2), +m.rot.toFixed(2), m.hp, m.state === 'chase' ? 1 : 0]);
    }

    if (realmPlayers.length > 0 && changed.length > 0) {
      broadcast(realm.id, { type: 'mobs', m: changed });
    }
  }

  // Regeneración de vida y recurso + sincronización acotada
  for (const [, p] of players) {
    if (!p.realm || !p.character) continue;
    const maxHp = computeMaxHp(p.character);
    if (p.hp > maxHp) p.hp = maxHp; // p. ej. si expira la Bendición de la Vida
    if (p.hp < maxHp && now - p.lastCombatMs > 5000) {
      p.hp = Math.min(maxHp, p.hp + regenPerSec(p.character) * TICK);
    }

    // Recurso: vigor/maná se regeneran siempre; la furia decae si dejas de
    // luchar (lastRageMs se refresca al golpear o al recibir daño).
    const rdef = resourceDef(p.character);
    const maxMp = computeMaxResource(p.character);
    if (p.mp > maxMp) p.mp = maxMp;
    if (rdef.regen > 0) {
      p.mp = Math.min(maxMp, p.mp + rdef.regen * TICK);
    } else if (now - (p.lastRageMs || 0) > 5000) {
      p.mp = Math.max(0, p.mp + rdef.regen * TICK);
    }

    // Avisar al cliente como mucho 2 veces por segundo y solo si cambió algo
    const hpMoved = Math.abs(p.hp - p.lastHpSent) >= 1;
    const mpMoved = Math.abs(p.mp - p.lastMpSent) >= 1;
    if ((hpMoved || mpMoved) && now - p.lastHpSentMs > 500) {
      p.lastHpSent = p.hp;
      p.lastMpSent = p.mp;
      p.lastHpSentMs = now;
      send(p.ws, { type: 'hp_sync', ...vitals(p) });
    }
  }
}, TICK * 1000);

function moveMobToward(m, tx, tz, speed) {
  const dx = tx - m.x, dz = tz - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  const step = Math.min(d, speed * TICK);
  const nx = m.x + (dx / d) * step;
  const nz = m.z + (dz / d) * step;
  if (!isCryptMob(m) && Math.hypot(nx, nz) < CITADEL_SAFE_RADIUS) return;
  m.x = nx;
  m.z = nz;
  m.rot = Math.atan2(dx, dz);
}

// ============================ PESCA (temporizador en el servidor) ============================
function stopFishing(p) {
  if (p.fishingTimer) clearTimeout(p.fishingTimer);
  p.fishingTimer = null;
  p.fishingSpot = null;
}

function scheduleCatch(id) {
  const p = players.get(id);
  if (!p || p.fishingSpot === null) return;
  p.fishingTimer = setTimeout(() => {
    const pp = players.get(id);
    if (!pp || pp.fishingSpot === null) return;
    const st = pp.character.state;
    const roll = Math.random();
    const itemId = FISHING_TABLE.find(([limit]) => roll < limit)[1];
    if (!bagAdd(st, itemId, 1)) {
      stopFishing(pp);
      fail(pp, 'Bolsa llena: se acabó la pesca');
      send(pp.ws, { type: 'fish_stop' });
      return;
    }
    addXp(st, FISHING_XP);
    sendSync(pp);
    send(pp.ws, { type: 'fish_catch', itemId });
    scheduleCatch(id);
  }, 2500 + Math.random() * 3000);
}

// ============================ CONEXIONES ============================
wss.on('connection', (ws) => {
  const id = nextId++;
  let lastAttack = 0;
  let lastSkill = 0;
  let lastHeal = 0;
  // Guardián anti-flood: como mucho 80 mensajes por segundo por conexión
  let floodCount = 0;
  let floodWindow = Date.now();

  ws.on('message', (raw) => {
    const nowFlood = Date.now();
    if (nowFlood - floodWindow > 1000) { floodWindow = nowFlood; floodCount = 0; }
    if (++floodCount > 80) { ws.terminate(); return; }

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = players.get(id);
    const st = p?.character?.state;

    switch (msg.type) {
      // ---- Lobby: cuenta y personajes ----
      case 'auth': {
        if (p) return;
        const result = authenticate(msg.account, msg.password);
        if (!result.ok) {
          send(ws, { type: 'auth_fail', reason: result.reason });
          return;
        }
        players.set(id, {
          ws, account: result.account, character: null, charId: null,
          name: null, race: null, class: null, realm: null,
          x: 0, z: 0, rot: 0, partyId: null,
          moveBudget: 4, lastMoveMs: Date.now(),
          herbCooldowns: {}, fishingSpot: null, fishingTimer: null,
          admin: isAdminAccount(result.account.name), muted: false,
        });
        send(ws, {
          type: 'auth_ok',
          admin: isAdminAccount(result.account.name),
          account: result.account.name,
          created: result.created,
          characters: publicCharacters(result.account),
          realms: realmPopulation(),
        });
        break;
      }
      case 'char_create': {
        if (!p || p.realm) return;
        const result = createCharacter(p.account, { name: msg.name, race: msg.race, class: msg.class });
        if (!result.ok) {
          send(ws, { type: 'char_fail', reason: result.reason });
          return;
        }
        send(ws, { type: 'char_list', characters: publicCharacters(p.account), createdId: result.character.id });
        break;
      }
      case 'char_delete': {
        if (!p || p.realm) return;
        if (isCharacterOnline(p.account.name, Number(msg.charId))) return;
        deleteCharacter(p.account, Number(msg.charId));
        send(ws, { type: 'char_list', characters: publicCharacters(p.account) });
        break;
      }
      case 'enter_world': {
        if (!p || p.realm) return;
        const character = getCharacter(p.account, Number(msg.charId));
        const realm = REALMS.find((r) => r.id === msg.realm);
        if (!character || !realm) {
          send(ws, { type: 'enter_fail', reason: 'Personaje o mundo no válido' });
          return;
        }
        if (isCharacterOnline(p.account.name, character.id)) {
          send(ws, { type: 'enter_fail', reason: 'Ese personaje ya está dentro del mundo' });
          return;
        }

        const state = ensureState(character);
        const spawn = (typeof state.x === 'number' && typeof state.z === 'number')
          ? { x: state.x, z: state.z }
          : { x: (Math.random() - 0.5) * 6, z: 14 + (Math.random() - 0.5) * 4 };

        p.character = character;
        p.charId = character.id;
        p.name = character.name;
        p.race = character.race;
        p.class = character.class;
        p.realm = realm.id;
        p.x = spawn.x;
        p.z = spawn.z;
        p.rot = Math.PI;
        p.moveBudget = 4;
        p.lastMoveMs = Date.now();
        // Vida autoritativa
        const maxHp0 = computeMaxHp(character);
        p.hp = Math.min(maxHp0, Math.max(1, Number(state.hp) || maxHp0));
        // Recurso de clase (el guerrero acumula furia luchando; el resto entra lleno)
        p.mp = startingResource(character);
        p.lastCombatMs = 0;
        p.buffArmor = 0;
        p.buffUntil = 0;
        p.weakUntil = Number(state.weakUntil) || 0; // «Alma Debilitada» persistida
        p.lastHpSent = p.hp;
        p.lastMpSent = p.mp;
        p.lastHpSentMs = 0;
        p.lastRageMs = 0;    // último instante en que se ganó furia
        p.pvp = false;       // JcJ desactivado por defecto
        p.tradeWith = null;  // id del socio de comercio (o null)
        p.lastPvpMs = 0;
        p.riding = null;     // montura activa en esta sesión (o null)

        const others = [];
        for (const [oid, op] of players) {
          if (oid !== id && op.realm === realm.id) {
            others.push({ id: oid, name: op.name, race: op.race, class: op.class, x: op.x, z: op.z, rot: op.rot, pvp: op.pvp, mount: op.riding });
          }
        }
        send(ws, {
          type: 'welcome',
          id, spawn,
          realm: { id: realm.id, name: realm.name },
          character: { name: character.name, race: character.race, class: character.class, state },
          vitals: { ...vitals(p), ...weakPayload(p) },
          players: others,
          mobs: mobSnapshotFull(realm.id),
        });
        broadcast(realm.id, { type: 'player_join', id, name: p.name, race: p.race, class: p.class, x: spawn.x, z: spawn.z, rot: Math.PI }, id);
        broadcast(realm.id, { type: 'chat', from: 'Ciudadela', system: true, text: `${p.name} ha entrado en ${realm.name}.` });
        if (p.admin) sysTo(p, 'Eres administrador. Escribe /help para ver tus comandos.');
        console.log(`[+] ${p.account.name}/${p.name} (#${id}) entró en ${realm.name}. Conectados: ${players.size}`);
        break;
      }

      // ---- Movimiento validado por velocidad ----
      case 'move': {
        if (!p?.realm) return;
        const nx = Number(msg.x) || 0;
        const nz = Number(msg.z) || 0;
        const now = Date.now();
        // La montura activa y los afijos del Viento aumentan el presupuesto
        const speedCap = MAX_SPEED * (1
          + (p.riding ? (MOUNTS[p.riding]?.speed || 0) : 0)
          + affixSpeed(p.character.state));
        p.moveBudget = Math.min(speedCap + 6, p.moveBudget + ((now - p.lastMoveMs) / 1000) * speedCap);
        p.lastMoveMs = now;

        const d = dist(p.x, p.z, nx, nz);
        const isPortalJump = PORTAL_JUMPS.some((j) =>
          dist(p.x, p.z, j.from[0], j.from[1]) < 8 && dist(nx, nz, j.to[0], j.to[1]) < 8);
        const isRespawn = dist(nx, nz, FOUNTAIN[0], FOUNTAIN[1]) < 9;

        if (d <= p.moveBudget + 0.01 || isPortalJump || isRespawn) {
          if (d <= p.moveBudget) p.moveBudget -= d;
          else p.moveBudget = 2;
          p.x = nx;
          p.z = nz;
          p.rot = Number(msg.rot) || 0;
          // Moverse interrumpe la pesca
          if (p.fishingSpot !== null && d > 1.5) {
            stopFishing(p);
            send(ws, { type: 'fish_stop' });
          }
          broadcast(p.realm, { type: 'player_state', id, x: p.x, z: p.z, rot: p.rot }, id);
        } else {
          // Demasiado rápido: corregir al cliente a la última posición válida
          send(ws, { type: 'pos_correct', x: p.x, z: p.z });
        }
        break;
      }

      case 'save_state': {
        if (!p?.realm || !p.charId) return;
        // El cliente solo reporta las banderas de diálogo de misiones; la vida
        // y la posición las impone el servidor
        // Dentro de la mazmorra se guarda la trampilla: las coordenadas de una
        // instancia no valen nada cuando esa instancia deja de existir.
        const pos = isDepthRealm(p.realm) ? HATCH_SPOT : [p.x, p.z];
        saveCharacterState(p.account, p.charId, {
          quests: (typeof msg.state === 'object' && msg.state?.quests) || undefined,
          hp: Math.round(p.hp),
          x: +pos[0].toFixed(1),
          z: +pos[1].toFixed(1),
        });
        break;
      }

      // ---- Combate ----
      case 'attack': {
        if (!p?.realm || !st) return;
        const now = Date.now();
        // El ritmo de golpe lo marca la velocidad de ataque del equipo, con un
        // pellizco de margen para no castigar la latencia.
        if (now - lastAttack < attackCooldownMs(attackSpeedOf(st)) - 60) return;
        lastAttack = now;
        dismount(p, id);
        const m = realmMobs.get(p.realm).get(Number(msg.mobId));
        if (!m || m.state === 'dead') return;
        if (dist(p.x, p.z, m.x, m.z) > 6) return;
        // El cliente declara el daño BASE; los multiplicadores (crítico y % de
        // daño) los resuelve el servidor. Si el crítico lo tirase el cliente,
        // uno manipulado criticaría siempre y el tope no lo notaría.
        const base = Math.round(Math.min(maxPlausibleHit(st), Math.max(1, Math.round(Number(msg.dmg) || 1))) * weakMul(p));
        const golpe = resolveHit(applyVerdugo(p, m, base), offenseOf(st));
        const dmg = golpe.dmg;
        // El golpe básico alimenta la furia del guerrero
        const gain = resourceDef(p.character).onAttack;
        if (gain) { addResource(p, gain); p.lastRageMs = now; }
        applySed(p, dmg);
        m.hp -= dmg;
        m.damagers.add(id);
        if (m.state !== 'chase' && m.state !== 'return') {
          m.state = 'chase';
          m.targetId = id;
        }
        if (m.hp <= 0) killMob(p.realm, m, id);
        else broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg, crit: golpe.crit });
        break;
      }
      case 'skill_hits': {
        if (!p?.realm || !st) return;
        const now = Date.now();
        if (now - lastSkill < 1500) return;
        // La habilidad debe existir y ser de tu clase (llega su id).
        const skill = skillById(p.class, msg.skillId);
        if (!skill || skill.type === 'buff' || skill.type === 'heal') return;
        if (!spendResource(p, skill)) return;
        lastSkill = now;
        dismount(p, id);
        const hits = Array.isArray(msg.hits) ? msg.hits.slice(0, 8) : [];
        const mobsHere = realmMobs.get(p.realm);
        const maxSkillHit = Math.round(maxPlausibleHit(st) * 3.6);
        for (const h of hits) {
          const m = mobsHere.get(Number(h.mobId));
          if (!m || m.state === 'dead') continue;
          if (dist(p.x, p.z, m.x, m.z) > 18) continue;
          const bruto = Math.round(Math.min(maxSkillHit, Math.max(1, Math.round(Number(h.dmg) || 1))) * weakMul(p));
          const golpe = resolveHit(applyVerdugo(p, m, bruto), offenseOf(st));
          const dmg = golpe.dmg;
          applySed(p, dmg);
          m.hp -= dmg;
          m.damagers.add(id);
          if (m.state !== 'chase' && m.state !== 'return') {
            m.state = 'chase';
            m.targetId = id;
          }
          if (m.hp <= 0) killMob(p.realm, m, id);
          else broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg, crit: golpe.crit });
        }
        // Habilidades de área que además curan (Nova Sagrada): la cura va aquí
        // para cobrar el recurso una sola vez por lanzamiento.
        if (skill.heal) {
          healPlayer(p, Math.round(skill.heal * computeHealMul(p.character)));
        }
        send(ws, { type: 'skill_used', skillId: skill.id, ...vitals(p) });
        break;
      }
      case 'heal_ally': {
        if (!p?.realm) return;
        const now = Date.now();
        if (now - lastHeal < 1200) return;
        lastHeal = now;
        const target = players.get(Number(msg.targetId));
        if (!target || target.realm !== p.realm || !target.character) return;
        if (dist(p.x, p.z, target.x, target.z) > 15) return;
        const amount = Math.min(100, Math.max(1, Math.round(Number(msg.amount) || 1)));
        const healed = healPlayer(target, amount);
        send(target.ws, { type: 'healed', amount: healed, from: p.name, ...vitals(target) });
        break;
      }

      // Curación de habilidad propia (Palabra Sagrada, Nova Sagrada)
      case 'skill_heal': {
        if (!st) return;
        // Solo habilidades de cura pura (las de área curan dentro de skill_hits)
        const skill = skillById(p.class, msg.skillId);
        if (!skill || skill.type !== 'heal' || !skill.heal) return;
        const now = Date.now();
        if (now - lastHeal < 1200) return;
        if (!spendResource(p, skill)) return;
        lastHeal = now;
        const healed = healPlayer(p, Math.round(skill.heal * computeHealMul(p.character)));
        send(ws, { type: 'skill_heal_ok', skillId: skill.id, heal: healed, ...vitals(p) });
        break;
      }

      // Mejora temporal de armadura (Grito de Guerra / Escudo de Fe)
      case 'skill_buff': {
        if (!st) return;
        // Cualquier mejora de tu clase: cobra el recurso. La armadura la aplica
        // el servidor; la velocidad es del cliente (ya cabe en MAX_SPEED).
        const skill = skillById(p.class, msg.skillId);
        if (!skill || skill.type !== 'buff' || !skill.buff) return;
        const now = Date.now();
        if (now - (p.lastBuffMs || 0) < 5000) return;
        if (!spendResource(p, skill)) return;
        p.lastBuffMs = now;
        if (skill.buff.armor) {
          p.buffArmor = skill.buff.armor;
          p.buffUntil = now + skill.buff.dur * 1000;
        }
        send(ws, { type: 'skill_used', skillId: skill.id, ...vitals(p) });
        break;
      }

      // ---- Bolsa y equipo ----
      case 'use_item': {
        if (!st) return;
        const item = ITEMS[msg.itemId];
        // Consumibles de vida (pociones, comida) y de recurso (el Tónico).
        if (!item?.heal && !item?.resource) return;
        if (!item.resource && p.hp >= computeMaxHp(p.character)) { fail(p, 'Ya tienes la vida al máximo'); return; }
        if (!item.heal && p.mp >= computeMaxResource(p.character)) {
          fail(p, `Ya tienes la ${resourceDef(p.character).name.toLowerCase()} al máximo`); return;
        }
        if (!bagRemove(st, item.id, 1)) { fail(p, 'No llevas ese objeto'); return; }
        const healed = item.heal ? healPlayer(p, Math.round(item.heal * computeHealMul(p.character))) : 0;
        const antes = p.mp;
        if (item.resource) addResource(p, item.resource);
        sendSync(p);
        send(ws, {
          type: 'item_used', itemId: item.id, heal: healed,
          resource: Math.round(p.mp - antes), resourceName: resourceDef(p.character).name,
          ...vitals(p),
        });
        break;
      }
      case 'equip': {
        if (!st) return;
        if (!equipFromBag(st, Number(msg.bagIndex))) return;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'equip' });
        break;
      }
      case 'unequip': {
        if (!st) return;
        if (!unequipToBag(st, String(msg.slot))) { fail(p, 'Bolsa llena: no puedes desequipar'); return; }
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'unequip' });
        break;
      }

      // ---- Las Profundidades ----
      case 'depths_enter': {
        if (!p?.realm || !st) return;
        if (isDepthRealm(p.realm)) { fail(p, 'Ya estás dentro'); return; }
        if (dist(p.x, p.z, HATCH_SPOT[0], HATCH_SPOT[1]) > HATCH_RANGE) {
          fail(p, 'Estás lejos de la trampilla de Las Profundidades'); return;
        }
        // Se puede empezar en cualquier piso ya conquistado esta semana, o en
        // el siguiente: obliga a ganarse la profundidad, pero no a repetir
        // veinte pisos cada vez que quieras jugar.
        const tope = ensureDepths(st).best + 1;
        const pedido = Math.max(1, Math.min(MAX_DEPTH, Math.round(Number(msg.depth) || 1)));
        if (pedido > tope) { fail(p, `Aún no has llegado tan hondo (máximo: ${tope})`); return; }
        p.homeRealm = p.realm;
        enterDepths(p, id, pedido);
        break;
      }
      case 'depths_descend': {
        if (!p || !isDepthRealm(p.realm)) return;
        if (!p.stairsOpen) { fail(p, 'El guardián del umbral aún vigila la escalera'); return; }
        if (dist(p.x, p.z, STAIRS_SPOT[0], STAIRS_SPOT[1]) > 8) { fail(p, 'Estás lejos de la escalera'); return; }
        enterDepths(p, id, (p.depth || 1) + 1);
        break;
      }
      case 'depths_leave': {
        if (!p || !isDepthRealm(p.realm)) return;
        leaveDepths(p, id);
        break;
      }
      case 'depths_info': {
        if (!p || !st) return;
        const d = ensureDepths(st);
        send(ws, { type: 'depths_info', best: d.best, record: d.record || 0, top: getDepthsBoard(10) });
        break;
      }

      // ---- Tienda de Lyra ----
      case 'shop_buy': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.lyra)) { fail(p, 'Estás demasiado lejos de Lyra'); return; }
        const item = ITEMS[msg.itemId];
        if (!item?.price || !SHOP_BUY_LIST.includes(item.id)) return;
        if (st.inventory.gold < item.price) { fail(p, 'No llevas suficiente oro'); return; }
        if (!bagAdd(st, item.id, 1)) { fail(p, 'Bolsa llena'); return; }
        st.inventory.gold -= item.price;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'buy', itemId: item.id });
        break;
      }
      case 'shop_sell': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.lyra)) { fail(p, 'Estás demasiado lejos de Lyra'); return; }

        // Con afijos, "vender una Espada de Acero" ya no basta: hay que decir
        // CUÁL, porque una puede valer el triple que la otra. Las piezas con
        // tirada se venden por su casilla; lo apilable sigue yendo por id.
        if (msg.bagIndex !== undefined) {
          const idx = Number(msg.bagIndex);
          const slot = st.inventory.slots[idx];
          if (!slot || !ITEMS[slot.itemId]?.sell) { fail(p, 'Lyra no compra eso'); return; }
          const gold = sellValueOf(slot);
          const taken = bagTakeAt(st, idx, 1);
          if (!taken) { fail(p, 'No llevas ese objeto'); return; }
          st.inventory.gold += gold;
          sendSync(p);
          send(ws, { type: 'rpc_ok', kind: 'sell', itemId: taken.itemId, gold });
          break;
        }

        const item = ITEMS[msg.itemId];
        if (!item?.sell) return;
        if (!bagRemove(st, item.id, 1)) return;
        st.inventory.gold += item.sell;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'sell', itemId: item.id, gold: item.sell });
        break;
      }

      // ---- Bramm retempla y reforja el equipo con afijos ----
      case 'forge_roll': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.bramm)) { fail(p, 'Estás demasiado lejos de la forja'); return; }
        const kind = msg.kind === 'reforge' ? 'reforge' : 'retemper';
        const idx = Number(msg.bagIndex);
        const slot = st.inventory.slots[idx];
        if (!slot?.roll) { fail(p, 'Bramm solo puede trabajar piezas con afijos'); return; }

        const coste = forgeCost(slot.roll, kind);
        if (bagCount(st, 'esquirla_abisal') < coste.shards) {
          fail(p, `Te faltan Esquirlas Abisales (necesitas ${coste.shards})`); return;
        }
        if (st.inventory.gold < coste.gold) { fail(p, 'No llevas suficiente oro'); return; }

        const nueva = kind === 'reforge'
          ? reforge(slot.itemId, slot.roll)
          : retemper(slot.roll);
        if (!nueva) { fail(p, 'Bramm no sabe trabajar esa pieza'); return; }

        bagRemove(st, 'esquirla_abisal', coste.shards);
        st.inventory.gold -= coste.gold;
        slot.roll = nueva;

        sendSync(p);
        send(ws, {
          type: 'forge_rolled', kind, bagIndex: idx,
          itemId: slot.itemId, roll: nueva, gold: coste.gold, shards: coste.shards,
        });
        break;
      }

      // ---- Forja de Bramm y cocina ----
      case 'craft': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.bramm)) { fail(p, 'Estás demasiado lejos de la forja'); return; }
        const recipe = CRAFT_RECIPES[Number(msg.recipe)];
        if (!recipe) return;
        if (st.inventory.gold < recipe.gold) { fail(p, 'No llevas suficiente oro'); return; }
        for (const [matId, n] of Object.entries(recipe.mats)) {
          if (bagCount(st, matId) < n) { fail(p, 'Te faltan materiales'); return; }
        }
        if (!bagAdd(st, recipe.result, 1)) { fail(p, 'Bolsa llena'); return; }
        for (const [matId, n] of Object.entries(recipe.mats)) bagRemove(st, matId, n);
        st.inventory.gold -= recipe.gold;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'craft', itemId: recipe.result });
        break;
      }
      case 'cook': {
        if (!st) return;
        if (!CAMPFIRE_SPOTS.some((spot) => nearSpot(p, spot))) { fail(p, 'Necesitas una hoguera cerca'); return; }
        const recipe = COOK_RECIPES[Number(msg.recipe)];
        if (!recipe) return;
        if (bagCount(st, recipe.from) < 1) { fail(p, 'No llevas ese ingrediente'); return; }
        if (!bagAdd(st, recipe.to, 1)) { fail(p, 'Bolsa llena'); return; }
        bagRemove(st, recipe.from, 1);
        addXp(st, COOK_XP);
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'cook', itemId: recipe.to });
        break;
      }

      // ---- Recolección de Hierbas Lumina ----
      case 'gather': {
        if (!st || !p.realm) return;
        const i = Number(msg.herb);
        const spot = HERB_SPOTS[i];
        if (!spot) return;
        if (dist(p.x, p.z, spot[0], spot[1]) > 4) return;
        const now = Date.now();
        if ((p.herbCooldowns[i] || 0) > now) return;
        p.herbCooldowns[i] = now + HERB_COOLDOWN_MS;
        if (!bagAdd(st, 'hierba_lumina', 1)) { fail(p, 'Bolsa llena'); return; }
        sendSync(p);
        send(ws, { type: 'gather_ok', herb: i });
        break;
      }

      // ---- Pesca ----
      case 'fish_start': {
        if (!st || !p.realm) return;
        const spot = FISHING_SPOTS[Number(msg.spot)];
        if (!spot) return;
        if (dist(p.x, p.z, spot.shore[0], spot.shore[1]) > 4) { fail(p, 'Acércate a la orilla'); return; }
        stopFishing(p);
        p.fishingSpot = Number(msg.spot);
        send(ws, { type: 'fish_start_ok' });
        scheduleCatch(id);
        break;
      }
      case 'fish_stop': {
        if (p) stopFishing(p);
        break;
      }

      // ---- Servicios de Mira ----
      case 'mira': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.mira)) { fail(p, 'Estás demasiado lejos de la Sacerdotisa'); return; }
        if (msg.service === 'heal') {
          if (st.inventory.gold < MIRA_HEAL_PRICE) { fail(p, 'No llevas suficiente oro'); return; }
          st.inventory.gold -= MIRA_HEAL_PRICE;
          p.hp = computeMaxHp(p.character);
          sendSync(p);
          send(ws, { type: 'mira_ok', service: 'heal', ...vitals(p) });
        } else if (msg.service === 'bless') {
          const price = MIRA_BLESSING_PRICES[msg.id];
          if (!price) return;
          if (st.inventory.gold < price) { fail(p, 'No llevas suficiente oro'); return; }
          st.inventory.gold -= price;
          applyBlessing(st, msg.id);
          sendSync(p);
          send(ws, { type: 'mira_ok', service: 'bless', id: msg.id });
        } else if (msg.service === 'cleanse') {
          if (weakMul(p) === 1) { fail(p, 'Tu alma ya está entera'); return; }
          if (st.inventory.gold < MIRA_CLEANSE_PRICE) { fail(p, 'No llevas suficiente oro'); return; }
          st.inventory.gold -= MIRA_CLEANSE_PRICE;
          p.weakUntil = st.weakUntil = 0;
          touch();
          sendSync(p);
          send(ws, { type: 'mira_ok', service: 'cleanse', ...weakPayload(p) });
        }
        break;
      }

      // ---- Talentos ----
      case 'talent_spend': {
        if (!st) return;
        const error = spendTalent(st, p.class, String(msg.nodeId));
        if (error) { fail(p, `Talento: ${error}`); return; }
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'talent', nodeId: msg.nodeId });
        break;
      }
      case 'echo_spend': {
        if (!st) return;
        const error = spendEcho(st, String(msg.stat));
        if (error) { fail(p, `Eco: ${error}`); return; }
        // La vida máxima puede haber subido: que se note al instante.
        p.hp = Math.min(computeMaxHp(p.character), p.hp);
        sendSync(p);
        send(ws, { type: 'echo_spent', stat: msg.stat, ...vitals(p) });
        break;
      }

      // ---- Cobrar un encargo diario del Tablón ----
      case 'bounty_accept': {
        if (!st) return;
        if (!nearSpot(p, BOARD_SPOT, 10)) { fail(p, 'Estás demasiado lejos del Tablón'); return; }
        const b = acceptBounty(st, String(msg.bountyId));
        if (!b) { fail(p, 'Ese encargo no se puede aceptar'); return; }
        sendSync(p);
        send(ws, { type: 'bounty_accepted', bountyId: b.id, title: b.title });
        break;
      }
      case 'bounty_claim': {
        if (!st) return;
        const reward = claimBounty(st, String(msg.bountyId));
        if (!reward) { fail(p, 'Ese encargo no está completado'); return; }
        st.inventory.gold += reward.gold;
        addXp(st, reward.xp);
        sendSync(p);
        send(ws, { type: 'bounty_ok', bountyId: msg.bountyId, gold: reward.gold, xp: reward.xp });
        break;
      }

      // ---- Reasignar talentos (respec) ----
      case 'talent_respec': {
        if (!st) return;
        const cost = respecCost(st);
        if (st.inventory.gold < cost) { fail(p, `Necesitas ${cost} de oro para reasignar`); return; }
        if (!respecTalents(st)) { fail(p, 'No tienes talentos que reasignar'); return; }
        st.inventory.gold -= cost;
        sendSync(p);
        send(ws, { type: 'respec_ok', cost });
        break;
      }

      // ---- Clasificaciones ----
      case 'leaderboard': {
        if (!p) return; // solo cuentas autenticadas
        send(ws, { type: 'leaderboard', boards: getLeaderboards(10) });
        break;
      }

      // ---- Cambio de contraseña ----
      case 'change_password': {
        if (!p) return;
        const result = changePassword(p.account, msg.oldPassword, msg.newPassword);
        send(ws, result.ok
          ? { type: 'password_ok' }
          : { type: 'password_fail', reason: result.reason });
        break;
      }

      // ---- Reporte de fallo ----
      case 'bug_report': {
        if (!p) return;
        const now = Date.now();
        if (now - (p.lastBug || 0) < 15000) { fail(p, 'Espera unos segundos antes de enviar otro reporte'); return; }
        p.lastBug = now;
        const text = String(msg.text || '').slice(0, 500).replace(/[\r\n]+/g, ' ').trim();
        if (!text) return;
        const entry = {
          ts: new Date().toISOString(),
          account: p.account.name,
          character: p.name || null,
          realm: p.realm || null,
          pos: p.realm ? { x: +p.x.toFixed(1), z: +p.z.toFixed(1) } : null,
          clientVersion: String(msg.version || '?').slice(0, 20),
          text,
        };
        try {
          appendFileSync(BUG_LOG, JSON.stringify(entry) + '\n');
          console.log(`[bug] ${entry.account}: ${text.slice(0, 80)}`);
        } catch (err) {
          console.error('No se pudo guardar el reporte:', err.message);
        }
        send(ws, { type: 'bug_ok' });
        break;
      }

      // ---- Recompensas de misiones ----
      case 'quest_claim': {
        if (!st) return;
        const questId = String(msg.questId);
        const reward = QUEST_REWARDS[questId];
        if (!reward) return;
        if (st.claimedQuests.includes(questId)) {
          send(ws, { type: 'claim_fail', questId, reason: 'Recompensa ya cobrada' });
          return;
        }
        // Requisitos de bajas acumuladas
        for (const [mobType, n] of Object.entries(reward.kills || {})) {
          if ((st.kills[mobType] || 0) < n) {
            send(ws, { type: 'claim_fail', questId, reason: 'Aún no has cazado lo necesario' });
            return;
          }
        }
        // Objetos que se entregan
        for (const [itemId, n] of Object.entries(reward.removes || {})) {
          if (bagCount(st, itemId) < n) {
            send(ws, { type: 'claim_fail', questId, reason: 'Te faltan los objetos requeridos' });
            return;
          }
        }
        for (const [itemId, n] of Object.entries(reward.removes || {})) bagRemove(st, itemId, n);
        st.inventory.gold += reward.gold || 0;
        for (const [itemId, n] of Object.entries(reward.items || {})) bagAdd(st, itemId, n);
        addXp(st, reward.xp || 0);
        st.claimedQuests.push(questId);
        sendSync(p);
        send(ws, { type: 'claim_ok', questId });
        break;
      }

      case 'chat': {
        if (!p?.realm) return;
        const text = String(msg.text || '').slice(0, 200).trim();
        if (!text) break;
        if (text.startsWith('/')) { handleCommand(p, text); break; }
        if (p.muted) { sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: 'Estás silenciado y no puedes hablar en el chat.' }); break; }
        broadcast(p.realm, { type: 'chat', from: p.name, text });
        break;
      }

      // ---- Grupos de caza ----
      case 'party_invite': {
        if (!p?.realm) return;
        const target = players.get(Number(msg.targetId));
        if (!target || target.realm !== p.realm) return;
        if (target.partyId) {
          sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: `${target.name} ya pertenece a un grupo.` });
          return;
        }
        send(target.ws, { type: 'party_invite', fromId: id, fromName: p.name });
        sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: `Invitación enviada a ${target.name}.` });
        break;
      }
      case 'party_accept': {
        if (!p?.realm || p.partyId) return;
        const inviter = players.get(Number(msg.fromId));
        if (!inviter || inviter.realm !== p.realm) return;
        let partyId = inviter.partyId;
        if (!partyId) {
          partyId = nextPartyId++;
          parties.set(partyId, new Set([Number(msg.fromId)]));
          inviter.partyId = partyId;
        }
        parties.get(partyId).add(id);
        p.partyId = partyId;
        broadcastPartyUpdate(partyId);
        break;
      }
      case 'party_leave': {
        leaveParty(id);
        break;
      }

      // ---- Gremios ----
      case 'guild_create': {
        if (!p?.realm || !st) return;
        if (st.guild) { fail(p, 'Ya perteneces a un gremio'); return; }
        const gname = String(msg.name || '').trim().slice(0, 24);
        if (gname.length < 3) { fail(p, 'El nombre necesita al menos 3 caracteres'); return; }
        if (!isCleanName(gname)) { fail(p, 'Ese nombre de gremio no está permitido'); return; }
        if (guildExists(gname)) { fail(p, 'Ya existe un gremio con ese nombre'); return; }
        const COST = 500;
        if (st.inventory.gold < COST) { fail(p, `Fundar un gremio cuesta ${COST} de oro`); return; }
        st.inventory.gold -= COST;
        createGuild(gname, p.name);
        st.guild = gname;
        sendSync(p);
        send(ws, { type: 'guild_info', guild: guildInfoPayload(gname) });
        sysTo(p, `Has fundado el gremio «${gname}».`);
        break;
      }
      case 'guild_invite': {
        if (!p?.realm || !st?.guild) { fail(p, 'No perteneces a ningún gremio'); return; }
        const [tid, target] = findPlayerByName(msg.targetName);
        if (!target || !target.character) { fail(p, 'Ese héroe no está conectado'); return; }
        if (target.character.state.guild) { fail(p, `${target.name} ya pertenece a un gremio`); return; }
        send(target.ws, { type: 'guild_invite', fromName: p.name, guild: st.guild });
        sysTo(p, `Invitación de gremio enviada a ${target.name}.`);
        break;
      }
      case 'guild_accept': {
        if (!p?.realm || !st) return;
        if (st.guild) return;
        const g = getGuild(msg.guild);
        if (!g) { fail(p, 'Ese gremio ya no existe'); return; }
        guildAddMember(g.name, p.name);
        st.guild = g.name;
        sendSync(p);
        broadcastGuild(g.name, { type: 'chat', from: 'Gremio', system: true, guild: true, text: `${p.name} se ha unido al gremio.` });
        pushGuildInfo(g.name);
        break;
      }
      case 'guild_leave': {
        if (!p?.realm || !st?.guild) return;
        const gname = st.guild;
        const g = getGuild(gname);
        st.guild = null;
        sendSync(p);
        send(ws, { type: 'guild_info', guild: null });
        if (g) {
          guildRemoveMember(gname, p.name);
          if (g.leader === p.name) {
            // El líder se va: pasa el mando o disuelve el gremio
            if (g.members.length > 0) {
              setGuildLeader(gname, g.members[0]);
              broadcastGuild(gname, { type: 'chat', from: 'Gremio', system: true, guild: true, text: `${p.name} ha dejado el gremio. Ahora lidera ${g.members[0]}.` });
              pushGuildInfo(gname);
            } else {
              deleteGuild(gname);
            }
          } else {
            broadcastGuild(gname, { type: 'chat', from: 'Gremio', system: true, guild: true, text: `${p.name} ha dejado el gremio.` });
            pushGuildInfo(gname);
          }
        }
        break;
      }
      case 'guild_kick': {
        if (!p?.realm || !st?.guild) return;
        const g = getGuild(st.guild);
        if (!g || g.leader !== p.name) { fail(p, 'Solo el líder puede expulsar'); return; }
        const targetName = String(msg.targetName || '');
        if (targetName === p.name || !g.members.includes(targetName)) return;
        guildRemoveMember(g.name, targetName);
        clearMemberGuild(targetName);
        broadcastGuild(g.name, { type: 'chat', from: 'Gremio', system: true, guild: true, text: `${targetName} ha sido expulsado del gremio.` });
        pushGuildInfo(g.name);
        break;
      }
      case 'guild_disband': {
        if (!p?.realm || !st?.guild) return;
        const g = getGuild(st.guild);
        if (!g || g.leader !== p.name) { fail(p, 'Solo el líder puede disolver el gremio'); return; }
        const gname = g.name;
        const members = [...g.members];
        broadcastGuild(gname, { type: 'chat', from: 'Gremio', system: true, guild: true, text: `El gremio «${gname}» ha sido disuelto.` });
        deleteGuild(gname);
        for (const m of members) clearMemberGuild(m);
        break;
      }
      case 'guild_motd': {
        if (!p?.realm || !st?.guild) return;
        const g = getGuild(st.guild);
        if (!g || g.leader !== p.name) { fail(p, 'Solo el líder puede cambiar el lema'); return; }
        setGuildMotd(g.name, msg.motd);
        pushGuildInfo(g.name);
        break;
      }
      case 'guild_info': {
        if (!p?.realm || !st) return;
        send(ws, { type: 'guild_info', guild: st.guild ? guildInfoPayload(st.guild) : null });
        break;
      }

      // ---- JcJ (combate entre jugadores) ----
      case 'pvp_toggle': {
        if (!p?.realm) return;
        p.pvp = !p.pvp;
        send(ws, { type: 'pvp_state', pvp: p.pvp });
        broadcast(p.realm, { type: 'player_flag', id, pvp: p.pvp }, id);
        break;
      }
      case 'pvp_attack': {
        if (!p?.realm || !st) return;
        const now = Date.now();
        if (now - p.lastPvpMs < 600) return;
        p.lastPvpMs = now;
        const target = players.get(Number(msg.targetId));
        if (!target || target.realm !== p.realm || !target.character) return;
        if (!p.pvp || !target.pvp) return;                       // ambos deben tener JcJ activo
        if (target.tradeWith || p.tradeWith) return;             // no atacar mientras se comercia
        // Zona segura: nadie recibe daño dentro de la Ciudadela
        if (Math.hypot(p.x, p.z) < CITADEL_SAFE_RADIUS || Math.hypot(target.x, target.z) < CITADEL_SAFE_RADIUS) {
          sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: 'No se puede luchar dentro de la Ciudadela.' });
          return;
        }
        if (dist(p.x, p.z, target.x, target.z) > 6) return;
        dismount(p, id);
        const dmg = Math.round(Math.min(maxPlausibleHit(st), Math.max(1, Math.round(Number(msg.dmg) || 1))) * weakMul(p));
        // El golpe también alimenta la furia del atacante
        const gainPvp = resourceDef(p.character).onAttack;
        if (gainPvp) { addResource(p, gainPvp); p.lastRageMs = now; }
        p.lastCombatMs = now;
        damagePlayerByPlayer(p, target, Number(msg.targetId), dmg);
        break;
      }

      // ---- Comercio entre jugadores ----
      case 'trade_request': {
        if (!p?.realm) return;
        const target = players.get(Number(msg.targetId));
        if (!target || target.realm !== p.realm) return;
        if (p.tradeWith || target.tradeWith) { sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: 'Uno de los dos ya está comerciando.' }); return; }
        if (dist(p.x, p.z, target.x, target.z) > TRADE_RANGE) { sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: `Acércate a ${target.name} para comerciar.` }); return; }
        send(target.ws, { type: 'trade_request', fromId: id, fromName: p.name });
        sendTo(id, { type: 'chat', from: 'Ciudadela', system: true, text: `Propuesta de comercio enviada a ${target.name}.` });
        break;
      }
      case 'trade_accept': {
        if (!p?.realm || p.tradeWith) return;
        const inviter = players.get(Number(msg.fromId));
        if (!inviter || inviter.realm !== p.realm || inviter.tradeWith) return;
        if (dist(p.x, p.z, inviter.x, inviter.z) > TRADE_RANGE) return;
        startTrade(Number(msg.fromId), id);
        break;
      }
      case 'trade_offer': {
        if (!p?.tradeWith || !st) return;
        const other = players.get(p.tradeWith);
        if (!other) { cancelTrade(id); return; }
        // Resolver los índices de bolsa a instancias concretas (máx. 12 objetos)
        const idxs = Array.isArray(msg.slots) ? msg.slots.slice(0, 12) : [];
        const slots = [];
        const items = [];
        for (const i of idxs) {
          const idx = Number(i);
          const slot = st.inventory.slots[idx];
          if (!slot || !ITEMS[slot.itemId] || slots.includes(idx)) continue;
          slots.push(idx);
          items.push(slot.roll ? { itemId: slot.itemId, roll: slot.roll } : { itemId: slot.itemId });
        }
        const gold = Math.max(0, Math.min(st.inventory.gold, Math.round(Number(msg.gold) || 0)));
        p.tradeOffer = { slots, items, gold, confirmed: false };
        other.tradeOffer.confirmed = false; // cualquier cambio anula la confirmación
        sendTradeUpdate(p, other);
        break;
      }
      case 'trade_confirm': {
        if (!p?.tradeWith) return;
        const other = players.get(p.tradeWith);
        if (!other) { cancelTrade(id); return; }
        p.tradeOffer.confirmed = true;
        if (other.tradeOffer.confirmed) executeTrade(id, p.tradeWith);
        else sendTradeUpdate(p, other);
        break;
      }
      case 'trade_cancel': {
        cancelTrade(id);
        break;
      }

      // ---- Viaje rápido (piedras rúnicas) ----
      case 'waystone_activate': {
        if (!p?.realm || !st) return;
        const w = waystoneById(msg.id);
        if (!w) return;
        if (dist(p.x, p.z, w.x, w.z) > 6) { fail(p, 'Acércate a la piedra rúnica'); return; }
        if (!st.waystones.includes(w.id)) { st.waystones.push(w.id); touch(); sendSync(p); }
        send(ws, { type: 'waystone_list', discovered: st.waystones, all: WAYSTONES });
        break;
      }
      case 'waystone_travel': {
        if (!p?.realm || !st) return;
        const dest = waystoneById(msg.id);
        if (!dest || !st.waystones.includes(dest.id)) return;
        // Debe partir desde junto a una piedra rúnica
        const nearAny = WAYSTONES.some((w) => dist(p.x, p.z, w.x, w.z) < 6);
        if (!nearAny) { fail(p, 'Debes estar junto a una piedra rúnica para viajar'); return; }
        dismount(p, id);
        p.x = dest.x; p.z = dest.z; p.moveBudget = 4;
        broadcast(p.realm, { type: 'player_state', id, x: p.x, z: p.z, rot: p.rot }, id);
        send(ws, { type: 'waystone_traveled', x: p.x, z: p.z, name: dest.name });
        break;
      }

      // ---- Monturas ----
      case 'mount_buy': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.establo)) { fail(p, 'Estás demasiado lejos del Establo'); return; }
        const mount = MOUNTS[msg.id];
        if (!mount) return;
        if (st.mounts.includes(mount.id)) { fail(p, 'Ya tienes esa montura'); return; }
        if (st.inventory.gold < mount.price) { fail(p, 'No llevas suficiente oro'); return; }
        st.inventory.gold -= mount.price;
        st.mounts.push(mount.id);
        st.mount = st.mount || mount.id; // primera compra: la deja seleccionada
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'mount_buy', itemId: null });
        break;
      }
      case 'mount_select': {
        if (!st) return;
        if (msg.id !== null && !st.mounts.includes(msg.id)) return;
        st.mount = msg.id;
        sendSync(p);
        break;
      }
      case 'mount_toggle': {
        if (!p?.realm || !st) return;
        if (p.riding) { dismount(p, id); break; }
        const mountId = st.mount || st.mounts[0];
        if (!mountId || !st.mounts.includes(mountId)) { fail(p, 'No tienes ninguna montura'); return; }
        p.riding = mountId;
        send(ws, { type: 'mount_state', riding: mountId });
        broadcast(p.realm, { type: 'player_mount', id, mount: mountId }, id);
        break;
      }

      // ---- Casa de subastas ----
      case 'auction_browse': {
        if (!st) return;
        send(ws, {
          type: 'auction_data',
          listings: listAuctions(100),
          mine: auctionsBySeller(p.account.name.toLowerCase()),
          auctionGold: st.auctionGold || 0,
        });
        break;
      }
      case 'auction_create': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.subastas)) { fail(p, 'Estás demasiado lejos del Subastador'); return; }
        const slot = st.inventory.slots[Number(msg.slot)];
        const price = Math.round(Number(msg.price) || 0);
        if (!slot || !ITEMS[slot.itemId]) { fail(p, 'Objeto no válido'); return; }
        if (ITEMS[slot.itemId].type === 'Objeto de misión') { fail(p, 'No puedes subastar objetos de misión'); return; }
        if (price < 1 || price > 1000000) { fail(p, 'Precio no válido'); return; }
        if (countAuctionsBySeller(p.account.name.toLowerCase()) >= 10) { fail(p, 'Máximo 10 subastas activas'); return; }
        // Se retira ESA pieza exacta, con su tirada, no "una que se llame igual".
        const taken = bagTakeAt(st, Number(msg.slot), 1);
        if (!taken) { fail(p, 'No tienes ese objeto'); return; }
        addAuction(p.account.name.toLowerCase(), p.name, taken.itemId, price, taken.roll || null);
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'auction_create', itemId: taken.itemId });
        break;
      }
      case 'auction_buy': {
        if (!st) return;
        const a = getAuction(Number(msg.id));
        if (!a) { fail(p, 'Esa subasta ya no existe'); return; }
        if (a.seller === p.account.name.toLowerCase()) { fail(p, 'No puedes comprar tu propia subasta'); return; }
        if (st.inventory.gold < a.price) { fail(p, 'No llevas suficiente oro'); return; }
        if (!bagAdd(st, a.item, 1, a.roll || null)) { fail(p, 'Bolsa llena'); return; }
        st.inventory.gold -= a.price;
        removeAuction(a.id);
        // Pagar al vendedor (menos 5% de comisión); si está conectado, sincronizar
        const cut = Math.floor(a.price * 0.05);
        const earnings = a.price - cut;
        const sellerRec = findCharacterByName(a.sellerName);
        if (sellerRec) {
          const ss = ensureState(sellerRec.character);
          ss.auctionGold = (ss.auctionGold || 0) + earnings;
          touch();
          for (const [, sp] of players) {
            if (sp.character === sellerRec.character) { sendSync(sp); sysTo(sp, `💰 Vendiste ${ITEMS[a.item]?.name || a.item} por ${earnings} de oro (recoge en el Subastador).`); }
          }
        }
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'auction_buy', itemId: a.item });
        break;
      }
      case 'auction_cancel': {
        if (!st) return;
        const a = getAuction(Number(msg.id));
        if (!a || a.seller !== p.account.name.toLowerCase()) return;
        if (!bagAdd(st, a.item, 1, a.roll || null)) { fail(p, 'Bolsa llena: haz sitio para recuperar el objeto'); return; }
        removeAuction(a.id);
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'auction_cancel', itemId: a.item });
        break;
      }
      case 'auction_collect': {
        if (!st) return;
        if (!nearSpot(p, NPC_SPOTS.subastas)) { fail(p, 'Estás demasiado lejos del Subastador'); return; }
        const g = st.auctionGold || 0;
        if (g <= 0) { fail(p, 'No tienes ganancias que recoger'); return; }
        st.inventory.gold += g;
        st.auctionGold = 0;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'auction_collect', gold: g });
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (!p) return;
    stopFishing(p);
    cancelTrade(id);
    leaveParty(id, false);
    if (p.realm && p.charId) {
      // Si se desconecta dentro de Las Profundidades no se puede guardar su
      // posición: son coordenadas de una instancia que ya no existirá. Vuelve
      // a la trampilla, en la Ciudadela.
      const salida = isDepthRealm(p.realm) ? HATCH_SPOT : [p.x, p.z];
      saveCharacterState(p.account, p.charId, {
        x: +salida[0].toFixed(1), z: +salida[1].toFixed(1), hp: Math.round(p.hp),
      });
      broadcast(p.realm, { type: 'player_leave', id }, id);
      broadcast(p.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${p.name} ha abandonado el mundo.` }, id);
      console.log(`[-] ${p.account.name}/${p.name} (#${id}) desconectado. Conectados: ${players.size - 1}`);
    }
    players.delete(id);
  });
});

httpServer.listen(PORT, () => {
  const proto = useTls ? 'https' : 'http';
  console.log(`Ciudadela de Valdoria en marcha: ${proto}://localhost:${PORT} ${useTls ? '(TLS/WSS activado)' : '(sin TLS: usa ws://, solo para red local)'}`);
  console.log(`Reinos: ${REALMS.map((r) => r.name).join(', ')} — ${SPAWNS.length} criaturas por reino (servidor autoritativo, vida incluida)`);
  console.log(`Panel de administración: ${proto}://localhost:${PORT}/admin  —  CLAVE: ${ADMIN_KEY}`);
});
