# Ciudadela de Valdoria — MMORPG 3D

MMORPG 3D con vista cenital estilo Diablo. **Cuentas con contraseña y personajes
persistidos en el servidor**: entra desde cualquier equipo, elige mundo y héroe
en el lobby, y continúa donde lo dejaste. Los jugadores aparecen en la plaza de
la Ciudadela de Valdoria, un asentamiento amurallado con NPCs, misiones,
comercio, forja e inventario. Fuera de la muralla, llanuras y bosque con
criaturas hostiles; bajo tierra, las Criptas. Las criaturas son **autoritativas
del servidor** y hay **grupos de caza** que comparten botín.

## Cómo jugar

```bash
npm install
npm start
```

Abre `http://localhost:3000`:
1. **Cuenta** — nombre + contraseña (se crea sola la primera vez; hash scrypt
   en `data/accounts.json`).
2. **Salón de los Héroes** — elige **mundo** (Valdoria o Penumbra, cada uno con
   sus propias criaturas y jugadores) y **personaje** (hasta 5 por cuenta), o
   forja uno nuevo.
3. **Crea tu héroe** — combina **raza** y **especialización**:

| Raza | Bonificación |
|---|---|
| 🧑 Humano | +10 de vida máxima |
| 🧝 Elfo | +1 de daño · regeneración +50% |
| 🪓 Enano | +2 de armadura |
| 👹 Orco | +3 de daño · −10 de vida máxima |

| Especialización | Bonificación |
|---|---|
| ⚔️ Guerrero | +2 de armadura · +10 de vida máxima |
| 🏹 Explorador | +1 de daño · ataque veloz (0,75 s) |
| ✨ Sacerdote | Regeneración doble · curas +40% |

Cada raza tiene su aspecto (orejas élficas, barba enana, colmillos orcos,
proporciones propias) y cada clase su color de túnica.

## Controles

| Acción | Control |
|---|---|
| Moverse | Clic izquierdo en el suelo |
| Atacar criatura | Clic sobre la criatura (persigue y golpea solo) |
| Hablar con NPC | Clic sobre el NPC |
| Invitar a un grupo de caza | Clic sobre otro jugador |
| Entrar/salir de la cripta | Clic sobre el portal |
| Recoger Hierba Lumina | Clic sobre la hierba brillante |
| Habilidades | Teclas `1`-`4` |
| Inventario | Tecla `I` |
| Talentos | Tecla `T` |
| Mapa grande | Tecla `M` (minimapa siempre visible arriba a la izquierda) |
| Pescar | Clic en las ondas del lago |
| Cocinar | Clic en una hoguera |
| Chat | `Enter` para escribir, `Enter` para enviar |
| Cerrar paneles | `Esc` |

## Contenido

### La Ciudadela
Plaza circular amurallada con torres, puerta sur, fuente central, posada, forja,
mercado, capilla y antorchas. Zona segura: las criaturas no entran.

### El exterior
Llanuras con hierba alta al este, bosque denso al oeste y sur, camino de tierra
hasta el círculo de piedras. **Lobos Grises**, **Jabalíes Salvajes** y el
**Alfa Sombrío** (jefe de la llanura). Al norte, el mundo sigue vivo:
- **Lago de los Ciervos** (noreste): ciervos pacíficos que solo se defienden si
  los cazas (sueltan carne de venado).
- **Ruinas del norte**: columnas de un templo olvidado, territorio de
  **Osos Pardos** (sueltan pieles de oso — Bramm cose capas con ellas).
- **Campamentos** junto a las criptas menores, con sus vigías y sus hogueras.

### Habilidades (teclas 1-4)
Barra central estilo Diablo/WoW con 3 habilidades base por especialización más
una cuarta desbloqueable por talentos, con enfriamiento, efectos y validación
en el servidor (multi-objetivo con límite de ritmo):
- **Guerrero**: 💥 Golpe Poderoso (250% al objetivo) · 🌀 Torbellino (150% en
  área) · 🛡️ Grito de Guerra (+5 armadura, 8 s) · ⚔️ *Ejecución* (350%).
- **Explorador**: 🎯 Disparo Certero (200% a 15 m) · 🔪 Lluvia de Dagas (100%
  en área) · 💨 Sprint (+80% velocidad, 4 s) · 🌠 *Descarga Múltiple* (3×70%).
- **Sacerdote**: ✨ Palabra Sagrada (cura 40, **también al aliado más cercano**)
  · 🌟 Castigo (180% a 12 m) · 💫 Nova Sagrada (120% en área y cura 15) ·
  🔆 *Escudo de Fe* (+6 armadura, 6 s).

### Niveles y talentos (tecla T)
Matar criaturas, completar misiones, pescar y cocinar da **experiencia** (barra
morada bajo la barra de habilidades). Cada nivel: **+5 de vida máxima y 1 punto
de talento** (máx. nivel 15). Cada clase tiene **dos ramas de talentos** (una
ofensiva y otra defensiva/alternativa), con pasivas por rangos, maestrías que
reducen enfriamientos y **dos habilidades definitivas** desbloqueables (teclas
4 y 5) — una por rama. Con puntos limitados, eliges tu camino; el botón
**Reasignar** (50 oro/nivel) permite rehacer tu build. Todo en el servidor.

### Pesca y cocina
En la orilla del **Lago de los Ciervos** brillan ondas de pesca: haz clic y tu
héroe lanza el sedal (moverse o combatir lo interrumpe; cada captura da 5 EXP).
Se pescan Peces Comunes, Grandes, el raro **Pez Dorado**... y alguna bota.
Haz clic en cualquier **hoguera** (campamentos de Baldur y Nyra, o la de la
posada en la plaza) para **cocinar**: el pescado y la carne cruda se asan en
platos que curan mucho más (hasta el **Festín Dorado**, +100 de vida).

### Las Criptas de Valdoria
Entrada por el arco de resplandor verde junto a la muralla oeste. Mazmorra
subterránea de luz espectral: vestíbulo, pasillos, cámara principal con pilares
y sarcófagos, osario lateral y la sala del trono. **Ratas de Cripta**,
**Esqueletos Guardianes** y el **Señor de la Cripta** (jefe final, 400 de vida —
mejor en grupo). Al morir, despiertas en la fuente de la Ciudadela.

Además hay dos **criptas menores** repartidas por el exterior, con buen botín
de huesos y esencias y sus propios vigías con misiones:
- **Cripta del Bosque** (llama violeta, oeste): el **Ermitaño Baldur** acampa
  junto a la entrada — *Ratas en la oscuridad* (4 ratas) y *El Guardián del
  Bosque* (abatir al **Guardián Óseo**, 180 de vida).
- **Cripta de la Colina** (llama de brasa, este): la **Cazadora Nyra** vigila
  desde su campamento — *Puntas de colmillo* (5 colmillos de lobo) y *El
  Centinela de la Colina* (abatir al **Centinela Óseo**, 200 de vida).

### La Ciénaga de los Ahogados (noroeste)
Un pantano de aguas muertas, árboles retorcidos y fuegos fatuos, más allá del
bosque oeste. Enemigos nuevos: **Sanguijuelas Gigantes**, **Ahogados** (no-muertos
del pantano), **Chamanes de la Ciénaga** y el jefe **Rey del Fango** (450 de
vida, suelta el Cetro del Rey del Fango o el Anillo de la Ciénaga). En una isla
vive la **Vidente Ysra**, que da una cadena de misiones: *Aguas turbias* (6
Ahogados) → *El fango que susurra* (5 Flores de Ciénaga) → *El Rey del Fango*.

### JcJ y comercio entre jugadores
Al hacer clic sobre otro jugador se abre un menú: **🤝 Grupo**, **💰 Comerciar**
y (si procede) **⚔ Atacar**.
- **JcJ opcional**: activa el combate con el botón `⚔ JcJ` (arriba a la derecha).
  Solo puedes atacar —y ser atacado por— jugadores que **también** lo tengan
  activo, y **nunca dentro de la Ciudadela** (zona segura). No se pierden objetos
  al morir; el atacante suma una baja en la clasificación **JcJ**. Los jugadores
  con JcJ activo llevan unas espadas rojas sobre la cabeza.
- **Comercio**: propón un trato (debéis estar cerca) y se abre una ventana con
  tu oferta y la del socio. Añade objetos de tu bolsa y oro; cualquier cambio
  anula las confirmaciones. Cuando **ambos confirmáis**, el servidor ejecuta el
  intercambio de forma **atómica** (con reversión si una bolsa está llena).

### Criaturas sincronizadas y grupos de caza
La IA de las criaturas corre en el servidor (acechar, perseguir, atacar, volver
a casa y curarse, reaparecer). El servidor valida los ataques y reparte el botín
a **todos los que participaron** en la caza. Haz clic sobre otro jugador para
invitarle a tu **grupo de caza**: los miembros comparten botín y crédito de
misiones aunque no lleguen a golpear. El panel del grupo aparece arriba a la
izquierda.

### Misiones
**Bienvenida** (Maestre Aldric): hablar con él → 3 Hierbas Lumina → conocer a
los 3 ciudadanos.
**El exterior** (Guardia Toran, tras la Bienvenida): 5 lobos → 4 pieles →
el Alfa Sombrío.
**La Cripta** (Maestre Aldric, tras el Exterior):
1. *Ecos bajo la muralla* — abate 6 Esqueletos Guardianes. → 80 oro, 2 Pociones Mayores.
2. *Esencias espectrales* — reúne 4 Esencias Espectrales. → 120 oro.
3. *El Señor de la Cripta* — abátelo y entrega la Reliquia. → 200 oro,
   Amuleto del Guardián.

### Comercio, forja y capilla
- **Lyra** (mercado): compra pociones, pan y la Espada de Acero; vende tu botín.
- **Bramm** (forja, opción "Forjar objetos"): convierte materiales + oro en equipo:
  Cuchillo de Colmillos (4 colmillos), Armadura de Pieles (5 pieles),
  Hoja del Cazador (6 colmillos + 2 pieles), Escudo de Hueso Antiguo (6 huesos)
  y la **Espada Espectral** (4 esencias + 6 huesos), la mejor arma del juego.
- **Sacerdotisa Mira** (capilla): **sana por completo** (15 oro) y otorga
  **bendiciones** de 10 minutos que se muestran junto al orbe de vida:
  Fuerza (+4 daño, 40 oro), Piedra (+3 armadura, 40 oro) y Vida (+25 vida
  máxima, 50 oro).

### Inventario y equipo
24 casillas de bolsa más **6 casillas de equipo** (arma, cabeza, torso, escudo,
espalda y accesorio). Clic en un objeto equipable de la bolsa para equiparlo
(intercambia con lo puesto); clic en la casilla de equipo para desequipar.
**Solo cuenta lo equipado** para el daño y la armadura; el panel muestra las
estadísticas en vivo.

### Minimapa y mapa del mundo
Minimapa circular arriba a la izquierda, centrado en ti (criaturas en rojo,
NPCs en dorado, portales, otros jugadores en azul). Con `M` se abre el **mapa
grande** de todo el mundo: nombres de NPCs y lugares, marcadores `!`/`?` de
misiones, rombos amarillos con los **objetivos de las misiones activas**
(dónde cazar, qué cripta visitar) y leyenda. Dentro de una cripta, ambos mapas
muestran el plano de sus salas.

### Persistencia
Todo el estado del personaje (inventario, equipo, oro, misiones, bendiciones,
vida y posición) se guarda **en el servidor**: al moverte de equipo o navegador
basta con entrar con tu cuenta. El cliente sincroniza cada pocos segundos y al
salir; el servidor guarda además tu última posición al desconectar.

### Sonido y ajustes
Música ambiental de fantasía oscura y efectos (golpes, nivel, botín, pesca,
cocina, portales...) generados **proceduralmente** con Web Audio API — sin
archivos externos. El botón `⚙` (o la tecla `O`, y también desde el lobby) abre
los **Ajustes**: volumen de música y de efectos, y sombras on/off para equipos
modestos. Las preferencias se guardan en el navegador.

### Encargos diarios (Tablón)
Junto a la fuente hay un **Tablón de Encargos**: haz clic para ver los 3
encargos del día (los mismos para todo el reino), cada uno de matar N de cierta
criatura a cambio de oro y experiencia. El progreso lo cuenta el servidor al
cazar; al completarlos se cobran en el Tablón y **se renuevan cada jornada**.
Son la fuente de progreso repetible una vez agotadas las cadenas de misiones.

### Botín legendario de jefes
Los jefes sueltan, con baja probabilidad, equipo **legendario** (brilla en
naranja) mucho mejor que el forjado: el **Alfa Sombrío** → Colmillo del Alfa
(arma) o Manto del Alfa; el **Señor de la Cripta** → Corona (+6 armadura) o
Guadaña Espectral (+26 daño, la mejor arma); los **Guardianes/Centinelas Óseos**
→ Sello del Guardián. Es la razón para repetir a los jefes.

### Clasificaciones
Botón 🏆 del lobby (o tecla `L` en el juego): top 10 de héroes del reino por
**nivel**, **oro** y **bajas**, calculado por el servidor sobre todas las
cuentas, con medallas e iconos de raza/clase.

### Reasignar talentos (respec)
En el panel de talentos (`T`), el botón **Reasignar** devuelve todos los puntos
gastados por 50 de oro por nivel, para probar builds distintas.

### Administración
Marca cuentas admin con la variable de entorno `ADMIN_ACCOUNTS` (nombres
separados por comas; por defecto `oscarchan`). Un admin dispone de comandos de
chat: `/say` (anuncio a todos los reinos), `/kick`, `/ban` y `/unban`, `/mute` y
`/unmute`, `/who` y `/help`. Los baneos se persisten en la base de datos y hay
un **filtro de nombres ofensivos** al crear cuentas y personajes (ampliable con
`BANNED_WORDS`).

**Panel de administración web** en `/admin`: protegido por una clave
(`ADMIN_KEY`; si no la defines, se genera una al azar y se imprime en la consola
al arrancar). Muestra jugadores conectados, cuentas, clasificaciones y reportes
de fallo, y permite expulsar, vetar/quitar veto y enviar anuncios — todo desde
el navegador, sin entrar al juego.

### Cuenta y soporte
Dentro del juego, el panel de Ajustes (`⚙`/`O`) permite **cambiar la contraseña**
(verificando la actual) y **reportar un fallo**: el texto se guarda en el
servidor (`data/bug-reports.log`) junto a tu posición, personaje y versión, para
ayudar a diagnosticar problemas durante la alpha.

## Arquitectura

```
server/server.js       Express + WebSocket. Autoritativo: cuentas y entrada al
                       mundo, dos reinos con simulación propia de 40 criaturas
                       a 10 Hz (IA, daño, muerte, reaparición), botín por
                       participación, grupos de caza, posiciones y chat.
server/db.js           Base de datos SQLite (data/valdoria.db): cuentas con
                       scrypt, personajes y su estado, baneos, filtro de nombres.
server/admin.html      Panel de administración web (/admin).
server/state.js        Estado autoritativo: bolsa, equipo, vida, armadura,
                       experiencia, talentos y sus cálculos.
public/js/main.js      Punto de entrada: conexión, lobby->juego, escena, cámara,
                       bucle, controles, combate, bonificaciones de raza/clase,
                       sincronización del estado con el servidor.
public/js/audio.js     Música y efectos procedurales (Web Audio API).
public/js/settings.js  Panel de ajustes (audio, sombras).
public/js/lobby.js     Lobby: cuenta, selección de mundo/personaje, creación.
public/js/races.js     Razas y especializaciones (bonificaciones y aspecto).
public/js/world.js     Ciudadela + bioma exterior + cripta (desplazada a x+500),
                       colisiones (muralla con puerta, salas de la cripta), portales.
public/js/entities.js  Personajes, jugador local, jugadores remotos (clicables).
public/js/enemies.js   Renderizado e interpolación de mobs del servidor; mallas
                       de bestias y esqueletos, barras de vida, daño flotante.
public/js/skills.js    Habilidades por clase: barra, enfriamientos, mejoras y efectos.
public/js/progression.js Niveles, experiencia y árbol de talentos por clase.
public/js/cooking.js   Cocina en las hogueras (crudo -> asado).
public/js/bounties.js  Sorteo diario de encargos (datos compartidos).
public/js/bountyboard.js Panel del Tablón de Encargos.
public/js/leaderboard.js Panel de clasificaciones (nivel/oro/bajas).
public/js/minimap.js   Minimapa y mapa grande (M): mundo, criptas, misiones.
public/js/party.js     Grupos de caza: invitaciones y panel de miembros.
public/js/trade.js     Comercio entre jugadores: panel de ofertas y bolsa.
public/js/npcs.js      NPCs y marcadores de misión (!/?).
public/js/quests.js    Tres cadenas de misiones, rastreador y servicios de Mira.
public/js/inventory.js Inventario, equipo (6 casillas), oro, daño/armadura.
public/js/blessings.js Bendiciones temporales de Mira y su HUD.
public/js/items.js     Catálogo de objetos (slot de equipo, daño, armadura).
public/js/shop.js      Tienda de Lyra. · crafting.js  Forja de Bramm.
public/js/network.js   Cliente WebSocket. · ui.js  Diálogos, chat, HUD.
```

**Servidor autoritativo**: el oro, la bolsa, el equipo, la experiencia, los
niveles, los talentos, las bendiciones, las recompensas de misiones **y la
propia vida** viven en el servidor. El daño de las criaturas, la reducción por
armadura, la muerte y reaparición, la regeneración y todas las curas (pociones,
habilidades, Mira, aliados) se calculan allí; el cliente solo muestra la vida
que le dicta el servidor (`hp_sync`, `you_died`...). Cada acción es un RPC
validado con requisitos y **cercanía** (no se comercia con Lyra desde la otra
punta del mapa). El movimiento se valida por velocidad (lista blanca para
portales y la reaparición) y el daño declarado se acota según el arma equipada
real. El cliente solo reporta las banderas de diálogo de misiones. Hay un
guardián anti-flood (80 mensajes/s por conexión).

**Base de datos**: SQLite (`data/valdoria.db`, modo WAL) mediante
`better-sqlite3`, con escritura diferida y migración automática desde el antiguo
`accounts.json`. Copias de seguridad rotativas al arrancar y cada 15 minutos
(20 copias en `data/backups/`).

**Despliegue y reconexión**: define `TLS_CERT` y `TLS_KEY` (rutas a los
certificados) y el servidor sirve HTTPS con el WebSocket en **WSS**
automáticamente — imprescindible para jugar por Internet. Si se pierde la
conexión en pleno juego, aparece un aviso de «Conexión perdida», el cliente
sondea el servidor y, al volver, **reentra solo** con el mismo personaje
(sesión por pestaña en `sessionStorage`).

## Despliegue

**Jugar por Internet gratis** (tu PC de servidor, WSS automático con Cloudflare
Tunnel): doble clic en `Jugar-online.bat` y comparte el enlace. Guía completa en
**[DEPLIEGUE.md](DEPLIEGUE.md)**.

```bash
# Red local (sin cifrado): http://<tu-ip>:3000
npm start

# Con certificados TLS propios (HTTPS + WSS gestionado por ti) y cuentas admin
TLS_CERT=/ruta/fullchain.pem TLS_KEY=/ruta/privkey.pem \
  ADMIN_ACCOUNTS=miAdmin PORT=443 npm start
```

Variables de entorno: `PORT`, `TLS_CERT`/`TLS_KEY` (activan WSS),
`ADMIN_ACCOUNTS` (admins, separados por comas), `ADMIN_KEY` (clave del panel
`/admin`) y `BANNED_WORDS` (palabras vetadas extra en los nombres). Detrás de un
proxy inverso o túnel (Cloudflare, nginx, Caddy) el TLS lo pone el proxy y basta
`npm start` sin `TLS_*` — el cliente elige `wss://` solo al servirse por
`https://`. **Nota**: el panel `/admin` queda accesible por Internet en un
despliegue con túnel; define un `ADMIN_KEY` robusto.

## Ideas para crecer

- Más pisos de la cripta principal, mazmorras instanciadas por grupo.
- Concurso de pesca semanal; recetas de cocina con varios ingredientes.
- Casa de subastas o mercado asíncrono entre jugadores.
- Monturas y velocidad de viaje; puntos de teletransporte.
