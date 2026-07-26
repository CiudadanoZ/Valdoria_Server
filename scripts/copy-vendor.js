// Copia three.module.js desde node_modules a public/vendor para servirlo sin
// bundler. Es idempotente y NUNCA rompe el build: el fichero ya va versionado
// en el repo, así que si no encuentra el de node_modules (o falla la copia),
// simplemente deja el versionado en su sitio en vez de tumbar el despliegue.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'vendor', 'three.module.js');
const src = join(root, 'node_modules', 'three', 'build', 'three.module.js');

try {
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log('Vendor copiado: three.module.js');
  } else if (existsSync(dest)) {
    console.log('Vendor ya presente (three.module.js versionado): se omite la copia.');
  } else {
    console.warn('Aviso: three.module.js no está ni en node_modules ni en public/vendor.');
  }
} catch (err) {
  console.warn(`Aviso: no se pudo copiar el vendor (${err.message}). Se usará el versionado si existe.`);
}
