// Base de datos de cuentas y personajes sobre libSQL (@libsql/client).
// El mismo cliente sirve para un fichero local (desarrollo y pruebas, url
// `file:…`) y para Turso en la nube (url `libsql://…` + token). Contraseñas con
// hash scrypt + sal.
//
// Diseño: TODO el modelo vive en memoria y es la verdad en caliente. La base de
// datos solo se toca al ARRANCAR (loadDb) y en el VOLCADO diferido (flush). Por
// eso solo esas dos operaciones son asíncronas; el resto de funciones mutan
// memoria y siguen siendo síncronas.
import { createClient } from '@libsql/client';
import { readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const OLD_JSON = join(DATA_DIR, 'accounts.json');

// Fichero local por defecto (o el que fijen las pruebas con DB_FILE).
const LOCAL_FILE = process.env.DB_FILE || join(DATA_DIR, 'valdoria.db');
// URL de la base de datos: Turso (DATABASE_URL) o el fichero local.
const DB_URL = process.env.DATABASE_URL || ('file:' + LOCAL_FILE.replace(/\\/g, '/'));
const IS_LOCAL = DB_URL.startsWith('file:');

const VALID_RACES = ['humano', 'elfo', 'enano', 'orco'];
const VALID_CLASSES = ['guerrero', 'explorador', 'sacerdote'];
const MAX_CHARACTERS = 5;

// Cuentas administradoras (variable de entorno, en minúsculas).
const ADMIN_ACCOUNTS = new Set(
  (process.env.ADMIN_ACCOUNTS || 'oscarchan').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
);

// Filtro básico de nombres ofensivos (subcadenas prohibidas). Ampliable por env.
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

// ---- Modelo en memoria (la verdad en caliente) ----
let accounts = {};   // clave (nombre en minúsculas) -> { name, salt, passHash, characters:[] }
let guilds = {};     // clave (nombre en minúsculas) -> { name, leader, members:[], motd, createdAt }
let auctions = {};   // id -> { id, seller, sellerName, item, price, ts }
let nextCharId = 1;
let nextAuctionId = 1;
let bannedAccounts = new Set();
let client = null;

export async function loadDb() {
  if (IS_LOCAL) mkdirSync(dirname(LOCAL_FILE), { recursive: true });
  client = createClient({ url: DB_URL, authToken: process.env.TURSO_AUTH_TOKEN });

  await client.batch([
    'CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, data TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS guilds (key TEXT PRIMARY KEY, data TEXT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS auctions (
       id INTEGER PRIMARY KEY, seller TEXT NOT NULL, sellerName TEXT NOT NULL,
       item TEXT NOT NULL, price INTEGER NOT NULL, ts INTEGER NOT NULL
     )`,
  ], 'write');

  // Cargar el modelo en memoria
  for (const row of (await client.execute('SELECT key, data FROM accounts')).rows) {
    try { accounts[row.key] = JSON.parse(row.data); } catch { /* fila corrupta */ }
  }
  for (const row of (await client.execute('SELECT key, data FROM guilds')).rows) {
    try { guilds[row.key] = JSON.parse(row.data); } catch { /* fila corrupta */ }
  }
  for (const r of (await client.execute('SELECT id, seller, sellerName, item, price, ts FROM auctions')).rows) {
    auctions[Number(r.id)] = {
      id: Number(r.id), seller: r.seller, sellerName: r.sellerName,
      item: r.item, price: Number(r.price), ts: Number(r.ts),
    };
  }
  const meta = {};
  for (const row of (await client.execute('SELECT key, value FROM meta')).rows) meta[row.key] = row.value;
  nextCharId = meta.nextCharId ? Number(meta.nextCharId) : 1;
  const maxAuctionId = Object.keys(auctions).reduce((m, id) => Math.max(m, Number(id)), 0);
  nextAuctionId = meta.nextAuctionId ? Number(meta.nextAuctionId) : maxAuctionId + 1;
  if (meta.bans) { try { bannedAccounts = new Set(JSON.parse(meta.bans)); } catch { /* nada */ } }

  // Migración desde el antiguo accounts.json (una sola vez), solo con el fichero
  // local por defecto: una base de pruebas o Turso nacen vacías.
  if (IS_LOCAL && !process.env.DB_FILE && Object.keys(accounts).length === 0 && existsSync(OLD_JSON)) {
    try {
      const old = JSON.parse(readFileSync(OLD_JSON, 'utf8'));
      accounts = old.accounts || {};
      nextCharId = old.nextCharId || 1;
      await queueFlush();
      renameSync(OLD_JSON, OLD_JSON.replace('.json', '.migrated.json'));
      console.log(`Migradas ${Object.keys(accounts).length} cuentas de accounts.json a la base de datos`);
    } catch (err) {
      console.error('No se pudo migrar accounts.json:', err.message);
    }
  }

  const total = Object.values(accounts).reduce((n, a) => n + a.characters.length, 0);
  const dest = IS_LOCAL ? 'fichero local' : 'Turso (nube)';
  console.log(`Base de datos cargada (${dest}): ${Object.keys(accounts).length} cuentas, ${total} personajes`);
}

// ---- Volcado diferido ----
// El modelo en memoria manda; se persiste en lotes, con las escrituras
// SERIALIZADAS por una cadena de promesas (Turso es remoto: dos volcados no
// deben solaparse). Cada volcado escribe el estado ACTUAL completo, así que
// coalescer varios en uno es inocuo.
let saveTimer = null;
let flushChain = Promise.resolve();

function stmt(sql, args) { return { sql, args }; }

// Borra las filas cuya clave ya no está en memoria (gremios disueltos, subastas
// retiradas). En un solo statement, apto para el lote.
function deleteOrphans(table, col, keys) {
  if (keys.length === 0) return stmt(`DELETE FROM ${table}`, []);
  const placeholders = keys.map(() => '?').join(',');
  return stmt(`DELETE FROM ${table} WHERE ${col} NOT IN (${placeholders})`, keys);
}

async function doFlush() {
  const batch = [];
  const upAcc = 'INSERT INTO accounts (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data';
  const upMeta = 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const upGuild = 'INSERT INTO guilds (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data';
  const upAuction = `INSERT INTO auctions (id, seller, sellerName, item, price, ts) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seller=excluded.seller, sellerName=excluded.sellerName, item=excluded.item, price=excluded.price, ts=excluded.ts`;

  for (const [key, account] of Object.entries(accounts)) batch.push(stmt(upAcc, [key, JSON.stringify(account)]));
  batch.push(stmt(upMeta, ['nextCharId', String(nextCharId)]));
  batch.push(stmt(upMeta, ['nextAuctionId', String(nextAuctionId)]));
  batch.push(stmt(upMeta, ['bans', JSON.stringify([...bannedAccounts])]));

  for (const [key, g] of Object.entries(guilds)) batch.push(stmt(upGuild, [key, JSON.stringify(g)]));
  batch.push(deleteOrphans('guilds', 'key', Object.keys(guilds)));

  for (const a of Object.values(auctions)) batch.push(stmt(upAuction, [a.id, a.seller, a.sellerName, a.item, a.price, a.ts]));
  batch.push(deleteOrphans('auctions', 'id', Object.keys(auctions).map(Number)));

  await client.batch(batch, 'write');
}

// Encola un volcado detrás del anterior y devuelve su promesa.
function queueFlush() {
  flushChain = flushChain.then(doFlush).catch((err) => console.error('Error volcando la base de datos:', err.message));
  return flushChain;
}

function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; queueFlush(); }, 500);
}

// Marca la base de datos como modificada (el servidor muta el estado en memoria).
export function touch() {
  saveSoon();
}

// Vuelca lo pendiente y espera a que termine. Se llama al apagar el servidor
// (SIGTERM en Render): sin esto, dormir o redesplegar perdería lo no guardado.
export async function flushAndClose() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await queueFlush();
  try { client?.close(); } catch { /* da igual */ }
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
// desconectados). Devuelve { account, character } o null.
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
export function topGuilds(n = 10) {
  return Object.values(guilds)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, n)
    .map((g) => ({ name: g.name, members: g.members.length, leader: g.leader }));
}

// ---- Casa de subastas (en memoria; se persiste en el volcado) ----
export function listAuctions(limit = 100) {
  return Object.values(auctions)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((a) => ({ id: a.id, seller: a.seller, sellerName: a.sellerName, item: a.item, roll: a.roll || null, price: a.price, ts: a.ts }));
}
export function auctionsBySeller(sellerKey) {
  return Object.values(auctions)
    .filter((a) => a.seller === sellerKey)
    .sort((a, b) => b.ts - a.ts)
    .map((a) => ({ id: a.id, sellerName: a.sellerName, item: a.item, roll: a.roll || null, price: a.price, ts: a.ts }));
}
export function getAuction(id) {
  return auctions[Number(id)] || null;
}
// roll: la tirada de afijos de la pieza puesta en venta. Viaja con la subasta,
// porque es justo lo que hace que valga lo que pide el vendedor.
export function addAuction(sellerKey, sellerName, item, price, roll = null) {
  const id = nextAuctionId++;
  auctions[id] = { id, seller: sellerKey, sellerName, item, roll, price: Math.round(price), ts: Date.now() };
  saveSoon();
  return id;
}
export function removeAuction(id) {
  const key = Number(id);
  if (!auctions[key]) return false;
  delete auctions[key];
  saveSoon();
  return true;
}
export function countAuctionsBySeller(sellerKey) {
  return Object.values(auctions).filter((a) => a.seller === sellerKey).length;
}

// Fusiona SOLO las claves permitidas. Las banderas de misión vienen del cliente;
// la vida y la posición las inyecta el servidor. Oro, inventario, equipo,
// progresión y bendiciones se mutan solo por RPCs.
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
