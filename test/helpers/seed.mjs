// Siembra la base de datos temporal ANTES de arrancar el servidor.
// Sin esto, probar cualquier cosa que cueste oro (fundar un gremio: 500)
// obligaría a farmear jefes durante minutos. El formato es el mismo que escribe
// server/db.js; la contraseña se hashea igual (scrypt + sal).
import { createClient } from '@libsql/client';
import { scryptSync, randomBytes } from 'node:crypto';

const BAG_SLOTS = 24;

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString('hex');
}

/**
 * Crea cuentas con personajes ya listos (oro, nivel, objetos) en el fichero de
 * base de datos indicado (ruta local; se abre como `file:…`).
 * heroes: [{ account, password?, name, race?, class?, gold?, level?, items? }]
 */
export async function seedDb(dbFile, heroes) {
  const client = createClient({ url: 'file:' + dbFile.replace(/\\/g, '/') });
  await client.batch([
    'CREATE TABLE IF NOT EXISTS accounts (key TEXT PRIMARY KEY, data TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS guilds (key TEXT PRIMARY KEY, data TEXT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS auctions (
       id INTEGER PRIMARY KEY, seller TEXT NOT NULL, sellerName TEXT NOT NULL,
       item TEXT NOT NULL, price INTEGER NOT NULL, ts INTEGER NOT NULL
     )`,
  ], 'write');

  const upAcc = 'INSERT INTO accounts (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data';
  const upMeta = 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

  const stmts = [];
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
    stmts.push({ sql: upAcc, args: [h.account.toLowerCase(), JSON.stringify(account)] });
  }
  stmts.push({ sql: upMeta, args: ['nextCharId', String(nextCharId)] });

  await client.batch(stmts, 'write');
  client.close();
}
