// Servidor de la Ciudadela de Valdoria
// - Cuentas con contraseña y personajes persistidos en disco (server/db.js)
// - Dos mundos (reinos) con simulación de criaturas independiente
// - Criaturas autoritativas: IA a 10 Hz, validación de ataques, botín compartido
// - Grupos de caza, posiciones y chat por reino
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDb, authenticate, publicCharacters, createCharacter,
  deleteCharacter, getCharacter, saveCharacterState,
} from './db.js';

const PORT = process.env.PORT || 3000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.use(express.static(join(root, 'public')));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

loadDb();

// ============================ REINOS ============================
const REALMS = [
  { id: 'valdoria', name: 'Valdoria', desc: 'El reino principal' },
  { id: 'penumbra', name: 'Penumbra', desc: 'Mundo alternativo para empezar de cero' },
];

// ============================ JUGADORES ============================
let nextId = 1;
// id -> { ws, account, charId, name, race, class, realm, x, z, rot, partyId }
// (realm === null hasta entrar al mundo)
const players = new Map();

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
function sendTo(id, obj) {
  const p = players.get(id);
  if (p) send(p.ws, obj);
}
// Difunde solo a los jugadores dentro de un reino
function broadcast(realm, obj, exceptId = null) {
  const raw = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (p.realm === realm && id !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
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
const parties = new Map(); // partyId -> Set(playerIds)

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
const MOB_TYPES = {
  lobo:    { name: 'Lobo Gris',       hp: 30,  dmgMin: 3,  dmgMax: 7,  speed: 5.8, aggro: 9,  range: 1.9, cd: 1.3, respawn: 20,  gold: [3, 7],   xp: 12,  drops: [['piel_lobo', 0.65], ['colmillo_lobo', 0.45]] },
  jabali:  { name: 'Jabalí Salvaje',  hp: 55,  dmgMin: 6,  dmgMax: 12, speed: 4.6, aggro: 7,  range: 2.0, cd: 1.6, respawn: 26,  gold: [8, 14],  xp: 18,  drops: [['carne_jabali', 0.85]] },
  alfa:    { name: 'Alfa Sombrío',    hp: 150, dmgMin: 10, dmgMax: 16, speed: 6.4, aggro: 13, range: 2.3, cd: 1.1, respawn: 75,  gold: [50, 70], xp: 80,  drops: [['piel_lobo', 1], ['colmillo_lobo', 1]] },
  rata:    { name: 'Rata de Cripta',  hp: 25,  dmgMin: 4,  dmgMax: 8,  speed: 6.5, aggro: 8,  range: 1.6, cd: 1.1, respawn: 18,  gold: [2, 5],   xp: 10,  drops: [['hueso_antiguo', 0.3]] },
  esqueleto: { name: 'Esqueleto Guardián', hp: 70, dmgMin: 8, dmgMax: 14, speed: 4.6, aggro: 10, range: 2.0, cd: 1.4, respawn: 30, gold: [10, 18], xp: 22, drops: [['hueso_antiguo', 0.7], ['esencia_espectral', 0.35]] },
  guardian_oseo: { name: 'Guardián Óseo', hp: 180, dmgMin: 12, dmgMax: 18, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [40, 60], xp: 60, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.6]] },
  centinela_oseo: { name: 'Centinela Óseo', hp: 200, dmgMin: 13, dmgMax: 19, speed: 4.8, aggro: 11, range: 2.2, cd: 1.3, respawn: 90, gold: [45, 65], xp: 65, drops: [['hueso_antiguo', 1], ['hueso_antiguo', 0.6], ['esencia_espectral', 0.7]] },
  // Fauna del exterior: los ciervos son pacíficos (aggro 0) pero se defienden a coces
  ciervo:  { name: 'Ciervo del Lago',  hp: 35,  dmgMin: 1,  dmgMax: 3,  speed: 7.5, aggro: 0,  range: 1.6, cd: 1.5, respawn: 25,  gold: [1, 3],   xp: 8,   drops: [['carne_venado', 0.9]] },
  oso:     { name: 'Oso Pardo',        hp: 120, dmgMin: 10, dmgMax: 16, speed: 5.0, aggro: 8,  range: 2.2, cd: 1.5, respawn: 60,  gold: [20, 35], xp: 30,  drops: [['piel_oso', 0.8], ['carne_venado', 0.6]] },
  senor_cripta: { name: 'Señor de la Cripta', hp: 400, dmgMin: 14, dmgMax: 22, speed: 5.2, aggro: 14, range: 2.6, cd: 1.2, respawn: 120, gold: [150, 200], xp: 150, drops: [['reliquia_cripta', 1], ['esencia_espectral', 1], ['hueso_antiguo', 1]] },
};

// [tipo, x, z] — exterior, cripta principal (x+500) y criptas menores (x+700, x+900)
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
  // Fauna del norte y el este: lago de los ciervos, ruinas con osos, lobos lejanos
  ['ciervo', 60, -50], ['ciervo', 72, -38], ['ciervo', 52, -68],
  ['ciervo', -58, -45], ['ciervo', -45, -62],
  ['oso', 0, -82], ['oso', -24, -94], ['oso', 28, -90],
  ['lobo', 88, 8], ['lobo', 82, -12],
  ['jabali', -85, 62],
];

const CITADEL_SAFE_RADIUS = 45;

// Cada reino tiene su propia población de criaturas
let nextMobId = 1;
const realmMobs = new Map(); // realmId -> Map(mobId -> mob)
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
    const gold = m.def.gold[0] + Math.floor(Math.random() * (m.def.gold[1] - m.def.gold[0] + 1));
    const items = [];
    for (const [itemId, chance] of m.def.drops) {
      if (Math.random() < chance) items.push(itemId);
    }
    sendTo(pid, { type: 'loot', mobType: m.type, mobName: m.def.name, gold, items, xp: m.def.xp });
  }
}

// ---- Bucle de IA (10 Hz) por reino ----
const TICK = 0.1;
setInterval(() => {
  const now = Date.now();

  for (const realm of REALMS) {
    const mobs = realmMobs.get(realm.id);
    // Jugadores presentes en este reino
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
              sendTo(m.targetId, { type: 'player_hurt', dmg, mobName: m.def.name, mobId: m.id });
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

// ============================ CONEXIONES ============================
wss.on('connection', (ws) => {
  const id = nextId++;
  let lastAttack = 0;
  let lastSkill = 0;
  let lastHeal = 0;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = players.get(id);

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
          ws, account: result.account, charId: null,
          name: null, race: null, class: null, realm: null,
          x: 0, z: 0, rot: 0, partyId: null,
        });
        send(ws, {
          type: 'auth_ok',
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

        const st = character.state || {};
        const spawn = (typeof st.x === 'number' && typeof st.z === 'number')
          ? { x: st.x, z: st.z }
          : { x: (Math.random() - 0.5) * 6, z: 14 + (Math.random() - 0.5) * 4 };

        p.charId = character.id;
        p.name = character.name;
        p.race = character.race;
        p.class = character.class;
        p.realm = realm.id;
        p.x = spawn.x;
        p.z = spawn.z;
        p.rot = Math.PI;

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
          character: { name: character.name, race: character.race, class: character.class, state: st },
          players: others,
          mobs: mobSnapshotFull(realm.id),
        });
        broadcast(realm.id, { type: 'player_join', id, name: p.name, race: p.race, class: p.class, x: spawn.x, z: spawn.z, rot: Math.PI }, id);
        broadcast(realm.id, { type: 'chat', from: 'Ciudadela', system: true, text: `${p.name} ha entrado en ${realm.name}.` });
        console.log(`[+] ${p.account.name}/${p.name} (#${id}) entró en ${realm.name}. Conectados: ${players.size}`);
        break;
      }

      // ---- Dentro del mundo ----
      case 'move': {
        if (!p?.realm) return;
        p.x = Number(msg.x) || 0;
        p.z = Number(msg.z) || 0;
        p.rot = Number(msg.rot) || 0;
        broadcast(p.realm, { type: 'player_state', id, x: p.x, z: p.z, rot: p.rot }, id);
        break;
      }
      case 'save_state': {
        if (!p?.realm || !p.charId) return;
        saveCharacterState(p.account, p.charId, msg.state);
        break;
      }
      case 'attack': {
        if (!p?.realm) return;
        const now = Date.now();
        if (now - lastAttack < 600) return;
        lastAttack = now;
        const m = realmMobs.get(p.realm).get(Number(msg.mobId));
        if (!m || m.state === 'dead') return;
        if (dist(p.x, p.z, m.x, m.z) > 6) return;
        const dmg = Math.min(40, Math.max(1, Math.round(Number(msg.dmg) || 1)));
        m.hp -= dmg;
        m.damagers.add(id);
        if (m.state !== 'chase' && m.state !== 'return') {
          m.state = 'chase';
          m.targetId = id;
        }
        if (m.hp <= 0) {
          killMob(p.realm, m, id);
        } else {
          broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg });
        }
        break;
      }
      // Golpes de habilidad: uno o varios objetivos en un solo lanzamiento
      // (las habilidades de área golpean hasta 8 criaturas a la vez)
      case 'skill_hits': {
        if (!p?.realm) return;
        const now = Date.now();
        if (now - lastSkill < 1500) return; // como mucho una habilidad cada 1,5 s
        lastSkill = now;
        const hits = Array.isArray(msg.hits) ? msg.hits.slice(0, 8) : [];
        const mobsHere = realmMobs.get(p.realm);
        for (const h of hits) {
          const m = mobsHere.get(Number(h.mobId));
          if (!m || m.state === 'dead') continue;
          if (dist(p.x, p.z, m.x, m.z) > 18) continue; // alcance máximo (habilidades a distancia)
          const dmg = Math.min(120, Math.max(1, Math.round(Number(h.dmg) || 1)));
          m.hp -= dmg;
          m.damagers.add(id);
          if (m.state !== 'chase' && m.state !== 'return') {
            m.state = 'chase';
            m.targetId = id;
          }
          if (m.hp <= 0) {
            killMob(p.realm, m, id);
          } else {
            broadcast(p.realm, { type: 'mob_hit', id: m.id, hp: m.hp, by: id, dmg });
          }
        }
        break;
      }
      // Curación lanzada a un aliado cercano (habilidad de sacerdote)
      case 'heal_ally': {
        if (!p?.realm) return;
        const now = Date.now();
        if (now - lastHeal < 1200) return;
        lastHeal = now;
        const target = players.get(Number(msg.targetId));
        if (!target || target.realm !== p.realm) return;
        if (dist(p.x, p.z, target.x, target.z) > 15) return;
        const amount = Math.min(100, Math.max(1, Math.round(Number(msg.amount) || 1)));
        send(target.ws, { type: 'healed', amount, from: p.name });
        break;
      }
      case 'chat': {
        if (!p?.realm) return;
        const text = String(msg.text || '').slice(0, 200).trim();
        if (text) broadcast(p.realm, { type: 'chat', from: p.name, text });
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
    leaveParty(id, false);
    if (p.realm && p.charId) {
      // Guardar la última posición conocida
      saveCharacterState(p.account, p.charId, { x: +p.x.toFixed(1), z: +p.z.toFixed(1) });
      broadcast(p.realm, { type: 'player_leave', id }, id);
      broadcast(p.realm, { type: 'chat', from: 'Ciudadela', system: true, text: `${p.name} ha abandonado el mundo.` }, id);
      console.log(`[-] ${p.account.name}/${p.name} (#${id}) desconectado. Conectados: ${players.size - 1}`);
    }
    players.delete(id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Ciudadela de Valdoria en marcha: http://localhost:${PORT}`);
  console.log(`Reinos: ${REALMS.map((r) => r.name).join(', ')} — ${SPAWNS.length} criaturas por reino`);
});
