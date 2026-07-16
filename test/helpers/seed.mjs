// Siembra la base de datos temporal ANTES de arrancar el servidor.
// Sin esto, probar cualquier cosa que cueste oro (fundar un gremio: 500)
// obligaría a farmear jefes durante minutos. El formato de la fila es el mismo
// que escribe server/db.js; la contraseña se hashea igual (scrypt + sal).
import Database from 'better-sqlite3';
import { scryptSync, randomBytes } from 'node:crypto';

const BAG_SLOTS = 24;

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString('hex');
}

/**
 * Crea cuentas con personajes ya listos (oro, nivel, objetos) en la BD indicada.
 * heroes: [{ account, password?, name, race?, class?, gold?, level?, items? }]
 */
export function seedDb(dbFile, heroes) {
  const db = new Database(dbFile);
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

  const upsert = db.prepare(
    'INSERT INTO accounts (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data');
  const setMeta = db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

  let nextCharId = 1;
  for (const h of heroes) {
    const salt = randomBytes(16).toString('hex');
    const slots = new Array(BAG_SLOTS).fill(null);
    (h.items || []).forEach((it, i) => { slots[i] = { itemId: it.itemId, count: it.count ?? 1 }; });

    const account = {
      name: h.account,
      salt,
      passHash: hashPassword(h.password || 'clave123', salt),
      characters: [{
        id: nextCharId++,
        name: h.name,
        race: h.race || 'humano',
        class: h.class || 'guerrero',
        createdAt: Date.now(),
        state: {
          hp: 100,
          x: null, z: null,
          inventory: { gold: h.gold ?? 0, slots, equipment: {} },
          progression: { level: h.level ?? 1, xp: h.xp ?? 0, points: 0, talents: {} },
          quests: null,
          blessings: {},
        },
      }],
    };
    upsert.run(h.account.toLowerCase(), JSON.stringify(account));
  }
  setMeta.run('nextCharId', String(nextCharId));
  db.close();
}
