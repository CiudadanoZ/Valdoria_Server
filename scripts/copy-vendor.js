// Copia three.module.js desde node_modules a public/vendor para servirlo sin bundler.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'vendor');
mkdirSync(dest, { recursive: true });
copyFileSync(
  join(root, 'node_modules', 'three', 'build', 'three.module.js'),
  join(dest, 'three.module.js')
);
console.log('Vendor copiado: three.module.js');
