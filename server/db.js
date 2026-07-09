// Base de datos de cuentas y personajes: un JSON en disco (data/accounts.json)
// con escritura diferida. Las contraseñas se guardan con hash scrypt + sal.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DB_FILE = join(DATA_DIR, 'accounts.json');

const VALID_RACES = ['humano', 'elfo', 'enano', 'orco'];
const VALID_CLASSES = ['guerrero', 'explorador', 'sacerdote'];
const MAX_CHARACTERS = 5;

// accounts: clave = nombre en minúsculas -> { name, salt, passHash, characters: [] }
let accounts = {};
let nextCharId = 1;

export function loadDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(readFileSync(DB_FILE, 'utf8'));
      accounts = data.accounts || {};
      nextCharId = data.nextCharId || 1;
      const total = Object.values(accounts).reduce((n, a) => n + a.characters.length, 0);
      console.log(`Base de datos cargada: ${Object.keys(accounts).length} cuentas, ${total} personajes`);
    } catch (err) {
      console.error('No se pudo leer accounts.json, empezando vacío:', err.message);
      accounts = {};
    }
  }
  // Copia de seguridad al arrancar y luego cada 15 minutos
  backupNow();
  setInterval(backupNow, 15 * 60 * 1000);
}

// ---- Copias de seguridad rotativas (se conservan las 20 últimas) ----
const BACKUP_DIR = join(DATA_DIR, 'backups');
const MAX_BACKUPS = 20;

function backupNow() {
  if (!existsSync(DB_FILE)) return;
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    copyFileSync(DB_FILE, join(BACKUP_DIR, `accounts-${stamp}.json`));
    const backups = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('accounts-')).sort();
    while (backups.length > MAX_BACKUPS) {
      unlinkSync(join(BACKUP_DIR, backups.shift()));
    }
  } catch (err) {
    console.error('Error creando copia de seguridad:', err.message);
  }
}

let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Escritura atómica: primero a un temporal, luego renombrar
      const tmp = DB_FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify({ accounts, nextCharId }, null, 1));
      renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('Error guardando la base de datos:', err.message);
    }
  }, 500);
}

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString('hex');
}

// Inicia sesión; si la cuenta no existe, la crea con esa contraseña.
export function authenticate(name, password) {
  const clean = String(name || '').trim().slice(0, 20);
  if (clean.length < 3) return { ok: false, reason: 'El nombre de cuenta necesita al menos 3 caracteres' };
  if (String(password || '').length < 4) return { ok: false, reason: 'La contraseña necesita al menos 4 caracteres' };

  const key = clean.toLowerCase();
  let account = accounts[key];
  let created = false;

  if (!account) {
    const salt = randomBytes(16).toString('hex');
    account = { name: clean, salt, passHash: hashPassword(password, salt), characters: [] };
    accounts[key] = account;
    created = true;
    saveSoon();
  } else {
    const attempt = Buffer.from(hashPassword(password, account.salt), 'hex');
    const stored = Buffer.from(account.passHash, 'hex');
    if (attempt.length !== stored.length || !timingSafeEqual(attempt, stored)) {
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
      blessings: null,
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

export function getCharacter(account, charId) {
  return account.characters.find((c) => c.id === charId) || null;
}

// Marca la base de datos como modificada (el servidor muta character.state
// directamente en las operaciones autoritativas).
export function touch() {
  saveSoon();
}

// Fusiona SOLO las claves que el cliente tiene permitido reportar (vida,
// banderas de misión y bendiciones). El oro, inventario, equipo y progresión
// son autoritativos del servidor y se ignoran si el cliente los envía.
const CLIENT_STATE_KEYS = ['hp', 'quests', 'blessings', 'x', 'z'];

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
