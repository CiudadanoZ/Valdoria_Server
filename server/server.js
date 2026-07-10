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
  loadDb, authenticate, publicCharacters, createCharacter,
  deleteCharacter, getCharacter, saveCharacterState, touch,
  isAdminAccount, banAccount, unbanAccount, changePassword, getLeaderboards,
} from './db.js';
import {
  ensureState, bagCount, bagAdd, bagRemove, equipFromBag, unequipToBag,
  maxPlausibleHit, addXp, spendTalent, syncPayload,
  computeMaxHp, computeArmor, computeHealMul, regenPerSec, applyBlessing,
  onBountyKill, claimBounty, respecCost, respecTalents,
} from './state.js';
import { ITEMS } from '../public/js/items.js';
import { appendFileSync } from 'node:fs';
import {
  CRAFT_RECIPES, COOK_RECIPES, COOK_XP, FISHING_XP, FISHING_TABLE,
  SHOP_BUY_LIST, MIRA_HEAL_PRICE, MIRA_BLESSING_PRICES, QUEST_REWARDS,
} from '../public/js/recipes.js';

const PORT = process.env.PORT || 3000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUG_LOG = join(root, 'data', 'bug-reports.log');

const app = express();
app.use(express.static(join(root, 'public')));

// Con TLS_CERT y TLS_KEY definidos, el servidor sirve HTTPS y el WebSocket pasa
// a ser WSS automáticamente (necesario para jugar por Internet).
const useTls = process.env.TLS_CERT && process.env.TLS_KEY;
const httpServer = useTls
  ? createHttpsServer({ cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }, app)
  : createServer(app);
const wss = new WebSocketServer({ server: httpServer });

loadDb();

// ============================ REINOS ============================
const REALMS = [
  { id: 'valdoria', name: 'Valdoria', desc: 'El reino principal' },
  { id: 'penumbra', name: 'Penumbra', desc: 'Mundo alternativo para empezar de cero' },
];

// ============================ GEOGRAFÍA (validaciones) ============================
// Saltos legítimos de posición: portales de las criptas (dirección de uso)
const PORTAL_JUMPS = [
  { from: [-33, -12], to: [500, 4] },   // entrada cripta principal
  { from: [500, 9], to: [-29, -12] },   // salida cripta principal
  { from: [-72, 58], to: [700, 4] },    // entrada Cripta del Bosque
  { from: [700, 6.5], to: [-69, 55] },  // salida Cripta del Bosque
  { from: [74, 28], to: [900, 4] },     // entrada Cripta de la Colina
  { from: [900, 6.5], to: [71, 25] },   // salida Cripta de la Colina
];
const FOUNTAIN = [0, 14]; // reaparición al morir
const MAX_SPEED = 16;     // unidades/s (andar 7 × sprint 1,8 × talentos 1,12 + margen)

// Hierbas Lumina de la plaza (recolección validada por cercanía)
const HERB_SPOTS = [[12, 14], [-19, -6], [22, -4], [-8, -20], [-28, 14], [17, 24]];
const HERB_COOLDOWN_MS = 20000;

// Puntos de pesca del Lago de los Ciervos (onda en el agua + orilla desde la que se pesca)
const LAKE = [62, -52];
const FISHING_SPOTS = [Math.PI * 0.15, Math.PI * 0.75, Math.PI * 1.35].map((a) => ({
  shore: [LAKE[0] + Math.cos(a) * 18.5, LAKE[1] + Math.sin(a) * 18.5],
}));

// Dónde hay que estar para usar cada servicio (validación de cercanía)
const NPC_SPOTS = {
  lyra: [-16, 9.5],   // tienda
  bramm: [16.5, -14.5], // forja
  mira: [-3, -22],    // curación y bendiciones
};
const CAMPFIRE_SPOTS = [
  [-67 + Math.sin(0.6) * 4, 55 + Math.cos(0.6) * 4],   // campamento de Baldur
  [70 + Math.sin(-2.2) * 4, 21 + Math.cos(-2.2) * 4],  // campamento de Nyra
  [-14, -12],                                           // hoguera de la posada
];

function nearSpot(p, spot, radius = 8) {
  return dist(p.x, p.z, spot[0], spot[1]) <= radius;
}

// ============================ JUGADORES ============================
let nextId = 1;
// id -> { ws, account, character, charId, name, race, class, realm, x, z, rot,
//         partyId, moveBudget, lastMoveMs, herbCooldowns, fishingSpot, fishingTimer }
const players = new Map();

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function sendTo(id, obj) {
  const p = players.get(id);
  if (p) send(p.ws, obj);
}
function broadcast(realm, obj, exceptId = null) {
  const raw = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (p.realm === realm && id !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

// Sincroniza al cliente el estado autoritativo (bolsa, oro, progresión)
function sendSync(p) {
  send(p.ws, { type: 'state_sync', ...syncPayload(p.character.state) });
  touch();
}

function fail(p, reason) {
  send(p.ws, { type: 'rpc_fail', reason });
}

// ---- Vida autoritativa ----
function vitals(p) {
  return { hp: Math.round(p.hp), maxHp: computeMaxHp(p.character) };
}

function currentBuffArmor(p) {
  return p.buffUntil > Date.now() ? p.buffArmor : 0;
}

// Aplica daño de una criatura: reduce por armadura, detecta la muerte y
// reaparece al jugador junto a la fuente con el 60% de la vida.
function damagePlayer(p, id, rawDmg, mobName) {
  const reduced = Math.max(1, rawDmg - computeArmor(p.character, currentBuffArmor(p)));
  p.hp = Math.max(0, p.hp - reduced);
  p.lastCombatMs = Date.now();

  if (p.hp <= 0) {
    const maxHp = computeMaxHp(p.character);
    p.hp = Math.round(maxHp * 0.6);
    p.x = (Math.random() - 0.5) * 4;
    p.z = FOUNTAIN[1];
    p.moveBudget = 4;
    stopFishing(p);
    send(p.ws, { type: 'you_died', by: mobName, hp: Math.round(p.hp), maxHp, x: p.x, z: p.z });
    broadcast(p.realm, { type: 'player_state', id, x: p.x, z: p.z, rot: p.rot }, id);
  } else {
    send(p.ws, { type: 'player_hurt', dmg: reduced, mobName, ...vitals(p) });
  }
}

// Cura al jugador (pociones, habilidades, Mira, aliados)
function healPlayer(p, amount) {
  const maxHp = computeMaxHp(p.character);
  const healed = Math.min(maxHp - p.hp, amount);
  p.hp = Math.min(maxHp, p.hp + amount);
  return Math.max(0, Math.round(healed));
}

// Difunde a TODOS los jugadores dentro del mundo, sea cual sea su reino
function broadcastAll(obj) {
  const raw = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.realm && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

// Busca un jugador dentro del mundo por el nombre de su personaje (sin
// distinguir mayúsculas)
function findPlayerByName(name) {
  const lower = String(name || '').toLowerCase();
  for (const [pid, p] of players) {
    if (p.realm && p.name && p.name.toLowerCase() === lower) return [pid, p];
  }
  return [null, null];
}

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
    sysTo(p, p.admin ? `Comandos de administración:\n${ADMIN_HELP}` : 'No hay comandos disponibles para tu cuenta.');
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
      broadcastAll({ type: 'announce', text: arg });
      console.log(`[admin] ${p.name}: anuncio "${arg}"`);
      return;
    }
    case 'kick': {
      const [tid, target] = findPlayerByName(arg);
      if (!target) { sysTo(p, `No encuentro a "${arg}" en el mundo.`); return; }
      sysTo(p, `Has expulsado a ${target.name}.`);
      broadcast(target.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${target.name} ha sido expulsado por un administrador.` });
      send(target.ws, { type: 'kicked', reason: 'Un administrador te ha expulsado.' });
      setTimeout(() => target.ws.close(), 200);
      console.log(`[admin] ${p.name} expulsó a ${target.name}`);
      return;
    }
    case 'ban': {
      const [tid, target] = findPlayerByName(arg);
      if (!target) { sysTo(p, `No encuentro a "${arg}" en el mundo.`); return; }
      banAccount(target.account.name);
      sysTo(p, `Has vetado la cuenta de ${target.name} (${target.account.name}).`);
      broadcast(target.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${target.name} ha sido vetado del reino.` });
      send(target.ws, { type: 'kicked', reason: 'Tu cuenta ha sido vetada del reino.' });
      setTimeout(() => target.ws.close(), 200);
      console.log(`[admin] ${p.name} vetó la cuenta ${target.account.name}`);
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

// ============================ CRIATURAS ============================
// Balance (alpha): la experiencia crece con la dificultad para que el contenido
// de las criptas y los jefes compensen el riesgo frente a farmear lobos.
const MOB_TYPES = {
  lobo:    { name: 'Lobo Gris',       hp: 30,  dmgMin: 3,  dmgMax: 7,  speed: 5.8, aggro: 9,  range: 1.9, cd: 1.3, respawn: 20,  gold: [3, 7],   xp: 12,  drops: [['piel_lobo', 0.65], ['colmillo_lobo', 0.45]] },
  jabali:  { name: 'Jabalí Salvaje',  hp: 55,  dmgMin: 6,  dmgMax: 12, speed: 4.6, aggro: 7,  range: 2.0, cd: 1.6, respawn: 26,  gold: [8, 14],  xp: 20,  drops: [['carne_jabali', 0.85]] },
  alfa:    { name: 'Alfa Sombrío',    hp: 150, dmgMin: 10, dmgMax: 16, speed: 6.4, aggro: 13, range: 2.3, cd: 1.1, respawn: 75,  gold: [55, 80], xp: 100, drops: [['piel_lobo', 1], ['colmillo_lobo', 1], ['colmillo_alfa', 0.2], ['manto_alfa', 0.15]] },
  rata:    { name: 'Rata de Cripta',  hp: 25,  dmgMin: 4,  dmgMax: 8,  speed: 6.5, aggro: 8,  range: 1.6, cd: 1.1, respawn: 18,  gold: [2, 5],   xp: 10,  drops: [['hueso_antiguo', 0.3]] },
  esqueleto: { name: 'Esqueleto Guardián', hp: 70, dmgMin: 8, dmgMax: 14, speed: 4.6, aggro: 10, range: 2.0, cd: 1.4, respawn: 30, gold: [10, 18], xp: 26, drops: [['hueso_antiguo', 0.7], ['esencia_espectral', 0.35]] },
  guardian_oseo: { name: 'Guardián Óseo', hp: 180, dmgMin: 12, dmgMax: 18, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [45, 65], xp: 75, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.6], ['sello_oseo', 0.12]] },
  centinela_oseo: { name: 'Centinela Óseo', hp: 200, dmgMin: 13, dmgMax: 19, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [50, 70], xp: 80, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.7], ['sello_oseo', 0.12]] },
  ciervo:  { name: 'Ciervo del Lago',  hp: 35,  dmgMin: 1,  dmgMax: 3,  speed: 7.5, aggro: 0,  range: 1.6, cd: 1.5, respawn: 25,  gold: [1, 3],   xp: 8,   drops: [['carne_venado', 0.9]] },
  oso:     { name: 'Oso Pardo',        hp: 120, dmgMin: 10, dmgMax: 16, speed: 5.0, aggro: 8,  range: 2.2, cd: 1.5, respawn: 60,  gold: [20, 35], xp: 40,  drops: [['piel_oso', 0.8], ['carne_venado', 0.6]] },
  senor_cripta: { name: 'Señor de la Cripta', hp: 400, dmgMin: 14, dmgMax: 22, speed: 5.2, aggro: 14, range: 2.6, cd: 1.2, respawn: 120, gold: [150, 200], xp: 200, drops: [['reliquia_cripta', 1], ['esencia_espectral', 1], ['hueso_antiguo', 1], ['corona_cripta', 0.25], ['guadana_espectral', 0.2]] },
};

const SPAWNS = [
  ['lobo', 20, 62], ['lobo', 36, 55], ['lobo', -16, 68], ['lobo', 12, 84],
  ['lobo', 46, 76], ['lobo', -30, 58], ['lobo', 26, 100], ['lobo', 60, 45],
  ['jabali', -55, 42], ['jabali', -66, 22], ['jabali', -50, 66], ['jabali', -70, 52], ['jabali', -44, 88],
  ['alfa', 0, 113],
  ['rata', 500, -10], ['rata', 501, -18], ['rata', 510, -30], ['rata', 490, -42],
  ['esqueleto', 492, -28], ['esqueleto', 508, -35], ['esqueleto', 496, -42],
  ['esqueleto', 512, -28], ['esqueleto', 500, -33], ['esqueleto', 488, -36],
  ['esqueleto', 478, -35], ['esqueleto', 473, -34],
  ['esqueleto', 494, -70], ['esqueleto', 506, -70],
  ['senor_cripta', 500, -74],
  ['rata', 700, -7], ['rata', 699, -12],
  ['esqueleto', 694, -22], ['esqueleto', 706, -25], ['esqueleto', 700, -30],
  ['guardian_oseo', 700, -27],
  ['rata', 900, -6], ['rata', 898, -10],
  ['esqueleto', 905, -19], ['esqueleto', 895, -23],
  ['centinela_oseo', 900, -24],
  ['ciervo', 60, -50], ['ciervo', 72, -38], ['ciervo', 52, -68],
  ['ciervo', -58, -45], ['ciervo', -45, -62],
  ['oso', 0, -82], ['oso', -24, -94], ['oso', 28, -90],
  ['lobo', 88, 8], ['lobo', 82, -12],
  ['jabali', -85, 62],
];

const CITADEL_SAFE_RADIUS = 45;

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

  for (const pid of recipients) {
    const p = players.get(pid);
    if (!p?.character) continue;
    const st = p.character.state;

    const gold = m.def.gold[0] + Math.floor(Math.random() * (m.def.gold[1] - m.def.gold[0] + 1));
    st.inventory.gold += gold;

    const items = [];
    for (const [itemId, chance] of m.def.drops) {
      if (Math.random() < chance && bagAdd(st, itemId, 1)) items.push(itemId);
    }

    addXp(st, m.def.xp);
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

  for (const realm of REALMS) {
    const mobs = realmMobs.get(realm.id);
    const realmPlayers = [...players.entries()].filter(([, p]) => p.realm === realm.id);
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
              damagePlayer(target, m.targetId, dmg, m.def.name);
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

  // Regeneración de vida fuera de combate + sincronización acotada
  for (const [, p] of players) {
    if (!p.realm || !p.character) continue;
    const maxHp = computeMaxHp(p.character);
    if (p.hp > maxHp) p.hp = maxHp; // p. ej. si expira la Bendición de la Vida
    if (p.hp < maxHp && now - p.lastCombatMs > 5000) {
      p.hp = Math.min(maxHp, p.hp + regenPerSec(p.character) * TICK);
    }
    // Avisar al cliente como mucho 2 veces por segundo y solo si cambió
    if (Math.abs(p.hp - p.lastHpSent) >= 1 && now - p.lastHpSentMs > 500) {
      p.lastHpSent = p.hp;
      p.lastHpSentMs = now;
      send(p.ws, { type: 'hp_sync', hp: Math.round(p.hp), maxHp });
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
        p.lastCombatMs = 0;
        p.buffArmor = 0;
        p.buffUntil = 0;
        p.lastHpSent = p.hp;
        p.lastHpSentMs = 0;

        const others = [];
        for (const [oid, op] of players) {
          if (oid !== id && op.realm === realm.id) {
            others.push({ id: oid, name: op.name, race: op.race, class: op.class, x: op.x, z: op.z, rot: op.rot });
          }
        }
        send(ws, {
          type: 'welcome',
          id, spawn,
          realm: { id: realm.id, name: realm.name },
          character: { name: character.name, race: character.race, class: character.class, state },
          vitals: vitals(p),
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
        p.moveBudget = Math.min(20, p.moveBudget + ((now - p.lastMoveMs) / 1000) * MAX_SPEED);
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
        saveCharacterState(p.account, p.charId, {
          quests: (typeof msg.state === 'object' && msg.state?.quests) || undefined,
          hp: Math.round(p.hp),
          x: +p.x.toFixed(1),
          z: +p.z.toFixed(1),
        });
        break;
      }

      // ---- Combate ----
      case 'attack': {
        if (!p?.realm || !st) return;
        const now = Date.now();
        if (now - lastAttack < 600) return;
        lastAttack = now;
        const m = realmMobs.get(p.realm).get(Number(msg.mobId));
        if (!m || m.state === 'dead') return;
        if (dist(p.x, p.z, m.x, m.z) > 6) return;
        const dmg = Math.min(maxPlausibleHit(st), Math.max(1, Math.round(Number(msg.dmg) || 1)));
        m.hp -= dmg;
        m.damagers.add(id);
        if (m.state !== 'chase' && m.state !== 'return') {
          m.state = 'chase';
          m.targetId = id;
        }
        if (m.hp <= 0) killMob(p.realm, m, id);
        else broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg });
        break;
      }
      case 'skill_hits': {
        if (!p?.realm || !st) return;
        const now = Date.now();
        if (now - lastSkill < 1500) return;
        lastSkill = now;
        const hits = Array.isArray(msg.hits) ? msg.hits.slice(0, 8) : [];
        const mobsHere = realmMobs.get(p.realm);
        const maxSkillHit = Math.round(maxPlausibleHit(st) * 3.6);
        for (const h of hits) {
          const m = mobsHere.get(Number(h.mobId));
          if (!m || m.state === 'dead') continue;
          if (dist(p.x, p.z, m.x, m.z) > 18) continue;
          const dmg = Math.min(maxSkillHit, Math.max(1, Math.round(Number(h.dmg) || 1)));
          m.hp -= dmg;
          m.damagers.add(id);
          if (m.state !== 'chase' && m.state !== 'return') {
            m.state = 'chase';
            m.targetId = id;
          }
          if (m.hp <= 0) killMob(p.realm, m, id);
          else broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg });
        }
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
        const SKILL_HEALS = { palabra: 40, nova: 15 };
        const base = SKILL_HEALS[msg.skillId];
        if (!base || p.class !== 'sacerdote') return;
        const now = Date.now();
        if (now - lastHeal < 1200) return;
        lastHeal = now;
        const healed = healPlayer(p, Math.round(base * computeHealMul(p.character)));
        send(ws, { type: 'skill_heal_ok', skillId: msg.skillId, heal: healed, ...vitals(p) });
        break;
      }

      // Mejora temporal de armadura (Grito de Guerra / Escudo de Fe)
      case 'skill_buff': {
        if (!st) return;
        const BUFF_SKILLS = {
          grito: { armor: 5, dur: 8, cls: 'guerrero' },
          escudo_fe: { armor: 6, dur: 6, cls: 'sacerdote' },
        };
        const buff = BUFF_SKILLS[msg.skillId];
        if (!buff || p.class !== buff.cls) return;
        const now = Date.now();
        if (now - (p.lastBuffMs || 0) < 5000) return;
        p.lastBuffMs = now;
        p.buffArmor = buff.armor;
        p.buffUntil = now + buff.dur * 1000;
        break;
      }

      // ---- Bolsa y equipo ----
      case 'use_item': {
        if (!st) return;
        const item = ITEMS[msg.itemId];
        if (!item?.heal) return;
        if (p.hp >= computeMaxHp(p.character)) { fail(p, 'Ya tienes la vida al máximo'); return; }
        if (!bagRemove(st, item.id, 1)) { fail(p, 'No llevas ese objeto'); return; }
        const healed = healPlayer(p, Math.round(item.heal * computeHealMul(p.character)));
        sendSync(p);
        send(ws, { type: 'item_used', itemId: item.id, heal: healed, ...vitals(p) });
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
        const item = ITEMS[msg.itemId];
        if (!item?.sell) return;
        if (!bagRemove(st, item.id, 1)) return;
        st.inventory.gold += item.sell;
        sendSync(p);
        send(ws, { type: 'rpc_ok', kind: 'sell', itemId: item.id, gold: item.sell });
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

      // ---- Cobrar un encargo diario del Tablón ----
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
    }
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (!p) return;
    stopFishing(p);
    leaveParty(id, false);
    if (p.realm && p.charId) {
      saveCharacterState(p.account, p.charId, { x: +p.x.toFixed(1), z: +p.z.toFixed(1), hp: Math.round(p.hp) });
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
});
