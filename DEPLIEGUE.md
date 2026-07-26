# Publicar la Ciudadela de Valdoria en Internet (gratis)

Hay dos formas, según si quieres que dependa de tu PC o no:

- **Opción A — Render (nube):** el juego vive en un servidor gratuito de Render.
  No necesitas tener el PC encendido. Ideal para un enlace que compartir.
- **Opción B — Cloudflare Tunnel (tu PC):** tu propio ordenador hace de
  servidor. Cero límites de tiempo, pero solo funciona con el PC encendido y el
  juego arrancado.

---

# Opción A — Render (nube, gratis)

Render clona tu repositorio de GitHub, instala y arranca el juego, y te da un
enlace `https://…` con **WSS** automático. El `render.yaml` del repo ya lo deja
todo configurado.

> ⚠️ **Aviso de datos efímeros.** El plan gratuito **no guarda disco**: la base
> de datos (cuentas, personajes, gremios) se **reinicia** en cada redespliegue y
> tras **~15 min de inactividad** (el servicio se duerme y el primer visitante
> espera ~50 s a que despierte). Es un **enlace de demo** perfecto para que
> alguien lo pruebe, no para guardar progreso. Para cuentas persistentes hay que
> migrar el almacenamiento a **Turso** (libSQL) — es el siguiente paso natural.

## Pasos

1. **Sube el repo a GitHub** (una sola vez). Crea un repositorio vacío en
   github.com y, desde la carpeta del proyecto:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/valdoria.git
   git push -u origin master
   ```
2. **Crea el servicio en Render.** Entra en [render.com](https://render.com)
   (puedes registrarte con tu cuenta de GitHub, sin tarjeta), pulsa
   **New → Blueprint**, elige tu repositorio y confirma. Render lee `render.yaml`
   y crea el servicio con todo configurado.
3. **Espera al primer build** (~2-3 min: instala dependencias y arranca). Cuando
   ponga *Live*, tu juego está en `https://ciudadela-valdoria.onrender.com`
   (o el nombre que Render asigne).
4. **Cada vez que hagas `git push`**, Render vuelve a desplegar solo.

La clave del panel `/admin` la genera Render (la ves en el panel del servicio,
en *Environment*).

---

# Opción B — Cloudflare Tunnel (tu PC)

Con **Cloudflare Tunnel** tu propio PC hace de servidor y tus amigos entran
desde cualquier sitio por un enlace `https://…` seguro. El **WSS** (WebSocket
cifrado) es automático: no tienes que tocar certificados ni abrir puertos del
router. Coste: **0 €**.

> Requisito: tu PC debe estar encendido y con el juego arrancado mientras
> alguien juegue. Cuando lo apagas, el enlace deja de funcionar.

---

## Paso 1 — Instalar `cloudflared` (una sola vez)

Abre PowerShell y ejecuta:

```powershell
winget install --id Cloudflare.cloudflared
```

Si no tienes `winget`, descarga `cloudflared-windows-amd64.exe` de
<https://github.com/cloudflare/cloudflared/releases>, renómbralo a
`cloudflared.exe` y colócalo en una carpeta del `PATH` (o en la carpeta
`scripts` de este proyecto).

Comprueba que quedó instalado:

```powershell
cloudflared --version
```

---

## Paso 2 — Arrancar el juego online

Tienes dos formas:

**A) Fácil:** doble clic en **`Jugar-online.bat`** (en la raíz del proyecto).

**B) Manual (dos terminales):**

```powershell
# Terminal 1 — el servidor del juego
npm start

# Terminal 2 — el túnel
cloudflared tunnel --url http://localhost:3000
```

En cualquiera de las dos, Cloudflare imprimirá un enlace parecido a:

```
https://palabras-al-azar.trycloudflare.com
```

**Ese es el enlace que compartes.** Tú y tus amigos lo abrís en el navegador,
creáis cuenta y a jugar. Como la página va por `https`, el juego usa `wss://`
automáticamente.

---

## Paso 3 — Ser administrador

Tu cuenta **OscarChan** ya es admin por defecto. Dentro del juego, escribe
`/help` en el chat para ver los comandos (`/say`, `/kick`, `/ban`, `/mute`,
`/who`…).

Para cambiar quién es admin, arranca el servidor con la variable
`ADMIN_ACCOUNTS` (nombres en minúsculas, separados por comas):

```powershell
$env:ADMIN_ACCOUNTS = "oscarchan,otroamigo"; npm start
```

---

## Copias de seguridad

El servidor **ya hace copias solo**: guarda `data/valdoria.db` en
`data/backups/` al arrancar y cada 15 minutos (conserva las 20 últimas). Si
quieres una copia manual, basta con copiar el archivo `data/valdoria.db` estando
el servidor parado.

Los reportes de fallo de los jugadores se acumulan en `data/bug-reports.log`
(una línea JSON por reporte).

---

## Detener

Cierra las dos ventanas (la del servidor y la del túnel), o pulsa `Ctrl + C` en
cada una.

---

## Cosas a tener en cuenta del túnel gratis

- El enlace `trycloudflare.com` **cambia cada vez** que reabres el túnel, y está
  pensado para pruebas (sin garantías de disponibilidad ni tráfico alto). Para
  una alpha con amigos es perfecto.
- Si quieres un **enlace fijo** (ej. `valdoria.tudominio.com`), necesitas un
  dominio añadido a Cloudflare (gratis salvo el coste del dominio, ~10 €/año) y
  un *túnel con nombre*. Pasos resumidos:
  ```powershell
  cloudflared tunnel login
  cloudflared tunnel create valdoria
  cloudflared tunnel route dns valdoria valdoria.tudominio.com
  cloudflared tunnel run --url http://localhost:3000 valdoria
  ```
- Si el día de mañana quieres que esté online **24/7 aunque apagues el PC**,
  mueve el proyecto a un servidor gratuito siempre encendido (p. ej. la capa
  *Always Free* de Oracle Cloud). Los datos son el mismo archivo
  `data/valdoria.db`: se copia y listo. Pídemelo y te preparo esa migración.

---

## Problemas frecuentes

- **Windows pregunta por el cortafuegos al arrancar `node`**: permite el acceso
  (solo en redes privadas). El túnel no necesita puertos abiertos, pero Node
  escucha en local.
- **"No encuentro cloudflared"**: repite el Paso 1 y reabre la terminal para que
  se actualice el `PATH`.
- **A un amigo no le carga**: asegúrate de que tu ventana del servidor sigue
  abierta y la del túnel muestra el enlace sin errores. Comparte el enlace
  `https://` completo (no `http://localhost`).
