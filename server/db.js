// Base de datos de cuentas y personajes sobre SQLite (data/valdoria.db, modo WAL)
// con escritura diferida y copias de seguridad rotativas. Si existe el antiguo
// accounts.json, se migra automáticamente la primera vez.
// Las contraseñas se guardan con hash scrypt + sal.
import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_FILE = join(DATA_DIR, 'valdoria.db');
const OLD_JSON = join(DATA_DIR, 'accounts.json');

const VALID_RACES = ['humano', 'elfo', 'enano', 'orco'];
const VALID_CLASSES = ['guerrero', 'explorador', 'sacerdote'];
const MAX_CHARACTERS = 5;

// Cuentas administradoras (variable de entorno, en minúsculas). Por defecto,
// la cuenta del creador del reino.
const ADMIN_ACCOUNTS = new Set(
  (process.env.ADMIN_ACCOUNTS || 'oscarchan').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
);

// Filtro básico de nombres ofensivos (subcadenas prohibidas, sin distinción de
// mayúsculas). Ampliable por entorno con BANNED_WORDS.
const BANNED_WORDS = [
  'puta', 'puto', 'mierda', 'cabron', 'gilipollas', 'joder', 'coño', 'polla',
  'nazi', 'hitler', 'admin', 'moderador', 'gm', 'fuck', 'shit', 'nigger', 'bitch',
  ...(process.env.BANNED_WORDS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean),
];

export function isCleanName(name) {
  const lower = String(name || '').toLowerCase();
  return !BANNED_WORDS.some((w) => lower.includes(w));
}

export function isAdminAccount(name) {
  return ADMIN_ACCOUNTS.has(String(name || '').toLowerCase());
}

// Modelo en memoria: clave = nombre en minúsculas -> { name, salt, passHash, characters: [] }
let accounts = {};
let nextCharId = 1;
let bannedAccounts = new Set(); // claves de cuenta baneadas
let guilds = {}; // clave (nombre en minúsculas) -> { name, leader, members:[charName], motd, createdAt }
let db = null;

export function loadDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller TEXT NOT NULL, sellerName TEXT NOT NULL,
      item TEXT NOT NULL, price INTEGER NOT NULL, ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guilds (key TEXT PRIMARY KEY, data TEXT NOT NULL);
  `);

  // Cargar el modelo en memoria
  for (const row of db.prepare('SELECT key, data FROM accounts').all()) {
    try { accounts[row.key] = JSON.parse(row.data); } catch { /* fila corrupta: se omite */ }
  }
  const metaCharId = db.prepare('SELECT value FROM meta WHERE key = ?').get('nextCharId');
  nextCharId = metaCharId ? Number(metaCharId.value) : 1;

  const metaBans = db.prepare('SELECT value FROM meta WHERE key = ?').get('bans');
  if (metaBans) { try { bannedAccounts = new Set(JSON.parse(metaBans.value)); } catch { /* nada */ } }

  for (const row of db.prepare('SELECT key, data FROM guilds').all()) {
    try { guilds[row.key] = JSON.parse(row.data); } catch { /* fila corrupta */ }
  }

  // Migración desde el antiguo accounts.json (una sola vez)
  if (Object.keys(accounts).length === 0 && existsSync(OLD_JSON)) {
    try {
      const old = JSON.parse(readFileSync(OLD_JSON, 'utf8'));
      accounts = old.accounts || {};
      nextCharId = old.nextCharId || 1;
      flushNow();
      renameSync(OLD_JSON, OLD_JSON.replace('.json', '.migrated.json'));
      console.log(`Migradas ${Object.keys(accounts).length} cuentas de accounts.json a SQLite`);
    } catch (err) {
      console.error('No se pudo migrar accounts.json:', err.message);
    }
  }

  const total = Object.values(accounts).reduce((n, a) => n + a.characters.length, 0);
  console.log(`Base de datos SQLite cargada: ${Object.keys(accounts).length} cuentas, ${total} personajes`);

  backupNow();
  setInterval(backupNow, 15 * 60 * 1000);
}

// ---- Escritura diferida (el modelo en memoria es la verdad en caliente) ----
let saveTimer = null;

function flushNow() {
  const upsert = db.prepare('INSERT INTO accounts (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data');
  const setMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const upsertGuild = db.prepare('INSERT INTO guilds (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data');
  const knownGuilds = new Set(Object.keys(guilds));
  db.transaction(() => {
    for (const [key, account] of Object.entries(accounts)) {
      upsert.run(key, JSON.stringify(account));
    }
    setMeta.run('nextCharId', String(nextCharId));
    setMeta.run('bans', JSON.stringify([...bannedAccounts]));
    for (const [key, g] of Object.entries(guilds)) upsertGuild.run(key, JSON.stringify(g));
    // Borrar gremios disueltos
    for (const row of db.prepare('SELECT key FROM guilds').all()) {
      if (!knownGuilds.has(row.key)) db.prepare('DELETE FROM guilds WHERE key = ?').run(row.key);
    }
  })();
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { flushNow(); } catch (err) { console.error('Error guardando en SQLite:', err.message); }
  }, 500);
}

// ---- Copias de seguridad rotativas (se conservan las 20 últimas) ----
const BACKUP_DIR = join(DATA_DIR, 'backups');
const MAX_BACKUPS = 20;

async function backupNow() {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await db.backup(join(BACKUP_DIR, `valdoria-${stamp}.db`));
    const backups = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('valdoria-')).sort();
    while (backups.length > MAX_BACKUPS) {
      unlinkSync(join(BACKUP_DIR, backups.shift()));
    }
  } catch (err) {
    console.error('Error creando copia de seguridad:', err.message);
  }
}

// Marca la base de datos como modificada (el servidor muta character.state
// directamente en las operaciones autoritativas).
export function touch() {
  saveSoon();
}

// ---- Cuentas ----
function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString('hex');
}

function passwordMatches(account, password) {
  const attempt = Buffer.from(hashPassword(password, account.salt), 'hex');
  const stored = Buffer.from(account.passHash, 'hex');
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}

// Cambia la contraseña tras verificar la actual.
export function changePassword(account, oldPassword, newPassword) {
  if (!passwordMatches(account, oldPassword)) return { ok: false, reason: 'La contraseña actual es incorrecta' };
  if (String(newPassword || '').length < 4) return { ok: false, reason: 'La nueva contraseña necesita al menos 4 caracteres' };
  const salt = randomBytes(16).toString('hex');
  account.salt = salt;
  account.passHash = hashPassword(newPassword, salt);
  saveSoon();
  return { ok: true };
}

// Inicia sesión; si la cuenta no existe, la crea con esa contraseña.
export function authenticate(name, password) {
  const clean = String(name || '').trim().slice(0, 20);
  if (clean.length < 3) return { ok: false, reason: 'El nombre de cuenta necesita al menos 3 caracteres' };
  if (String(password || '').length < 4) return { ok: false, reason: 'La contraseña necesita al menos 4 caracteres' };

  const key = clean.toLowerCase();
  if (bannedAccounts.has(key)) return { ok: false, reason: 'Esta cuenta ha sido expulsada del reino' };

  let account = accounts[key];
  let created = false;

  if (!account) {
    if (!isCleanName(clean)) return { ok: false, reason: 'Ese nombre de cuenta no está permitido' };
    const salt = randomBytes(16).toString('hex');
    account = { name: clean, salt, passHash: hashPassword(password, salt), characters: [] };
    accounts[key] = account;
    created = true;
    saveSoon();
  } else {
    if (!passwordMatches(account, password)) {
      return { ok: false, reason: 'Contraseña incorrecta' };
    }
  }
  return { ok: true, account, created };
}

export function publicCharacters(account) {
  return account.characters.map((c) => ({
    id: c.id, name: c.name, race: c.race, class: c.class,
    gold: c.state?.inventory?.gold || 0,
    createdAt: c.createdAt,
  }));
}

function nameTaken(name) {
  const lower = name.toLowerCase();
  return Object.values(accounts).some((a) =>
    a.characters.some((c) => c.name.toLowerCase() === lower)
  );
}

export function createCharacter(account, { name, race, class: clazz }) {
  const clean = String(name || '').trim().slice(0, 16);
  if (clean.length < 3) return { ok: false, reason: 'El nombre necesita al menos 3 caracteres' };
  if (!isCleanName(clean)) return { ok: false, reason: 'Ese nombre no está permitido' };
  if (!VALID_RACES.includes(race)) return { ok: false, reason: 'Raza desconocida' };
  if (!VALID_CLASSES.includes(clazz)) return { ok: false, reason: 'Especialización desconocida' };
  if (account.characters.length >= MAX_CHARACTERS) return { ok: false, reason: `Máximo ${MAX_CHARACTERS} personajes por cuenta` };
  if (nameTaken(clean)) return { ok: false, reason: 'Ese nombre ya pertenece a otro héroe del reino' };

  const character = {
    id: nextCharId++,
    name: clean,
    race,
    class: clazz,
    createdAt: Date.now(),
    state: {
      hp: 100,
      x: null, z: null, // null = aparecer en la plaza
      inventory: {
        gold: 0,
        slots: [{ itemId: 'pan_centeno', count: 2 }, { itemId: 'pocion_vida', count: 1 }],
        equipment: {},
      },
      quests: null,    // null = misiones por defecto (bienvenida activa)
      blessings: {},
    },
  };
  account.characters.push(character);
  saveSoon();
  return { ok: true, character };
}

export function deleteCharacter(account, charId) {
  const idx = account.characters.findIndex((c) => c.id === charId);
  if (idx === -1) return false;
  account.characters.splice(idx, 1);
  saveSoon();
  return true;
}

// ---- Baneos (por clave de cuenta en minúsculas) ----
export function banAccount(accountName) {
  bannedAccounts.add(String(accountName || '').toLowerCase());
  saveSoon();
}

export function unbanAccount(accountName) {
  const removed = bannedAccounts.delete(String(accountName || '').toLowerCase());
  if (removed) saveSoon();
  return removed;
}

export function isBanned(accountName) {
  return bannedAccounts.has(String(accountName || '').toLowerCase());
}

// ---- Clasificaciones ----
// Recorre todos los personajes de todas las cuentas y devuelve el top N por
// nivel, oro y bajas totales. Excluye cuentas baneadas.
export function getLeaderboards(topN = 10) {
  const chars = [];
  for (const [key, account] of Object.entries(accounts)) {
    if (bannedAccounts.has(key)) continue;
    for (const c of account.characters) {
      const kills = Object.values(c.state?.kills || {}).reduce((a, b) => a + b, 0);
      chars.push({
        name: c.name,
        race: c.race,
        class: c.class,
        level: c.state?.progression?.level || 1,
        xp: c.state?.progression?.xp || 0,
        gold: c.state?.inventory?.gold || 0,
        kills,
        pvp: c.state?.pvpKills || 0,
      });
    }
  }
  const top = (metric, tiebreak) => [...chars]
    .sort((a, b) => (b[metric] - a[metric]) || ((b[tiebreak] || 0) - (a[tiebreak] || 0)))
    .slice(0, topN)
    .map((c) => ({ name: c.name, race: c.race, class: c.class, level: c.level, gold: c.gold, kills: c.kills, pvp: c.pvp }));
  return {
    level: top('level', 'xp'),
    gold: top('gold', 'level'),
    kills: top('kills', 'level'),
    pvp: top('pvp', 'level'),
    guilds: topGuilds(topN),
  };
}

export function getCharacter(account, charId) {
  return account.characters.find((c) => c.id === charId) || null;
}

// Resumen de todas las cuentas para el panel de administración.
export function getAccountsSummary() {
  return Object.entries(accounts).map(([key, a]) => ({
    account: a.name,
    banned: bannedAccounts.has(key),
    admin: isAdminAccount(a.name),
    characters: a.characters.map((c) => ({
      name: c.name, race: c.race, class: c.class,
      level: c.state?.progression?.level || 1,
      gold: c.state?.inventory?.gold || 0,
    })),
  }));
}

// Busca un personaje por su nombre en cualquier cuenta (para pagar a vendedores
// que estén desconectados). Devuelve { account, character } o null.
export function findCharacterByName(name) {
  const lower = String(name || '').toLowerCase();
  for (const account of Object.values(accounts)) {
    const character = account.characters.find((c) => c.name.toLowerCase() === lower);
    if (character) return { account, character };
  }
  return null;
}

// ---- Gremios ----
export function getGuild(name) {
  return guilds[String(name || '').toLowerCase()] || null;
}
export function guildExists(name) {
  return !!guilds[String(name || '').toLowerCase()];
}
export function createGuild(name, leaderChar) {
  const key = name.toLowerCase();
  if (guilds[key]) return null;
  guilds[key] = { name, leader: leaderChar, members: [leaderChar], motd: '', createdAt: Date.now() };
  saveSoon();
  return guilds[key];
}
export function deleteGuild(name) {
  delete guilds[String(name || '').toLowerCase()];
  saveSoon();
}
export function guildAddMember(name, charName) {
  const g = getGuild(name);
  if (!g) return false;
  if (!g.members.includes(charName)) g.members.push(charName);
  saveSoon();
  return true;
}
export function guildRemoveMember(name, charName) {
  const g = getGuild(name);
  if (!g) return false;
  g.members = g.members.filter((m) => m !== charName);
  saveSoon();
  return true;
}
export function setGuildMotd(name, motd) {
  const g = getGuild(name);
  if (!g) return false;
  g.motd = String(motd || '').slice(0, 200);
  saveSoon();
  return true;
}
export function setGuildLeader(name, charName) {
  const g = getGuild(name);
  if (!g) return false;
  g.leader = charName;
  saveSoon();
  return true;
}
// Ranking de gremios por número de miembros (para clasificaciones).
export function topGuilds(n = 10) {
  return Object.values(guilds)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, n)
    .map((g) => ({ name: g.name, members: g.members.length, leader: g.leader }));
}

// ---- Casa de subastas ----
export function listAuctions(limit = 100) {
  return db.prepare('SELECT id, seller, sellerName, item, price, ts FROM auctions ORDER BY ts DESC LIMIT ?').all(limit);
}
export function auctionsBySeller(sellerKey) {
  return db.prepare('SELECT id, sellerName, item, price, ts FROM auctions WHERE seller = ? ORDER BY ts DESC').all(sellerKey);
}
export function getAuction(id) {
  return db.prepare('SELECT id, seller, sellerName, item, price, ts FROM auctions WHERE id = ?').get(Number(id));
}
export function addAuction(sellerKey, sellerName, item, price) {
  const info = db.prepare('INSERT INTO auctions (seller, sellerName, item, price, ts) VALUES (?, ?, ?, ?, ?)')
    .run(sellerKey, sellerName, item, Math.round(price), Date.now());
  return info.lastInsertRowid;
}
export function removeAuction(id) {
  return db.prepare('DELETE FROM auctions WHERE id = ?').run(Number(id)).changes > 0;
}
export function countAuctionsBySeller(sellerKey) {
  return db.prepare('SELECT COUNT(*) AS n FROM auctions WHERE seller = ?').get(sellerKey).n;
}

// Fusiona SOLO las claves permitidas. Las banderas de misión vienen del
// cliente; la vida y la posición las inyecta el propio servidor. El oro,
// inventario, equipo, progresión y bendiciones se mutan solo por RPCs.
const CLIENT_STATE_KEYS = ['hp', 'quests', 'x', 'z'];

export function saveCharacterState(account, charId, state) {
  const character = getCharacter(account, charId);
  if (!character || typeof state !== 'object' || state === null) return false;
  try {
    if (JSON.stringify(state).length > 20000) return false; // demasiado grande
  } catch { return false; }
  for (const key of CLIENT_STATE_KEYS) {
    if (state[key] === undefined) continue;
    if (key === 'hp') {
      character.state.hp = Math.max(0, Math.min(250, Math.round(Number(state.hp) || 0)));
    } else if ((key === 'x' || key === 'z') && typeof state[key] === 'number') {
      character.state[key] = state[key];
    } else if (typeof state[key] === 'object') {
      character.state[key] = state[key];
    }
  }
  saveSoon();
  return true;
}
