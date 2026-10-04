// Servidor del tráiler: sirve el juego (public/) y recibe la grabación.
//
// El tráiler se rueda con el motor del juego en public/trailer.html y el
// navegador lo graba él mismo (MediaRecorder). Este servidor le da un sitio
// donde dejar el vídeo y las capturas sin descargas manuales: los escribe en
// marketing/. No forma parte del servidor del juego ni se despliega.
//
//   node scripts/trailer-server.mjs        → http://localhost:3100/trailer.html
import express from 'express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'marketing');
mkdirSync(salida, { recursive: true });

const app = express();
app.use(express.static(join(raiz, 'public')));

// Cuerpo binario crudo: un vídeo de minuto y medio a 1080p ronda los 100 MB
// Cualquier tipo: el navegador manda 'video/mp4;codecs=...' y un filtro por
// tipo lo dejaba pasar sin cuerpo
app.post('/subir', express.raw({ type: () => true, limit: '600mb' }), (req, res) => {
  const nombre = basename(String(req.query.nombre || 'trailer.webm')).replace(/[^\w.-]/g, '_');
  const ruta = join(salida, nombre);
  writeFileSync(ruta, req.body);
  console.log(`Guardado ${ruta} (${(req.body.length / 1e6).toFixed(1)} MB)`);
  res.json({ ok: true, ruta, bytes: req.body.length });
});

const PORT = Number(process.env.PORT) || 3100;
app.listen(PORT, () => console.log(`Tráiler en http://localhost:${PORT}/trailer.html`));
