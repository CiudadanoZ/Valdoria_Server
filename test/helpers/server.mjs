// Arranca un servidor de Valdoria efímero para las pruebas: puerto propio y
// base de datos temporal desechable. NUNCA toca data/valdoria.db (la partida
// real): DB_FILE apunta a una carpeta temporal que se borra al terminar.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDb } from './seed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Cada suite usa su propio puerto para poder correr en paralelo.
let nextPort = 4100 + Math.floor(Math.random() * 400);

/**
 * Arranca un servidor de pruebas.
 * @param {object} opts
 * @param {object} [opts.env]   variables de entorno extra
 * @param {Array}  [opts.seed]  héroes a sembrar en la BD antes de arrancar
 *                              (el servidor la carga en memoria al iniciar,
 *                               así que hay que sembrar ANTES)
 */
export async function startServer({ env = {}, seed } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'valdoria-test-'));
  const dbFile = join(dir, 'test.db');
  if (seed?.length) await seedDb(dbFile, seed);
  const port = nextPort++;
  const proc = spawn(process.execPath, [join(ROOT, 'server', 'server.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DB_FILE: dbFile,
      BACKUPS: 'off',          // las pruebas no necesitan copias rotativas
      ADMIN_KEY: 'test-key',
      ADMIN_ACCOUNTS: 'jefazo', // cuenta admin determinista para las pruebas
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  proc.stdout.on('data', (d) => logs.push(String(d)));
  proc.stderr.on('data', (d) => logs.push(String(d)));

  // Esperar a que el puerto responda
  const deadline = Date.now() + 15000;
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(`El servidor murió al arrancar:\n${logs.join('')}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) break;
    } catch { /* aún no escucha */ }
    if (Date.now() > deadline) {
      proc.kill('SIGKILL');
      throw new Error(`El servidor no arrancó en 15 s:\n${logs.join('')}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    logs: () => logs.join(''),
    async stop() {
      // El servidor mantiene temporizadores vivos: hay que matarlo.
      proc.kill('SIGKILL');
      await new Promise((r) => proc.once('exit', r));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* da igual */ }
    },
  };
}
