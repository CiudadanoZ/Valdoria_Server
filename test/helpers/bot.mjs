// Cliente de pruebas: habla el mismo protocolo WebSocket que el navegador.
// Sustituye a los bots de usar y tirar que se reescribían en cada sesión.
import WebSocket from 'ws';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// El servidor valida el movimiento con un presupuesto de velocidad (MAX_SPEED
// 16 u/s). Pasos de 10 u cada 700 ms van holgados y nunca se rechazan.
const STEP = 10;
const STEP_MS = 700;

export class Bot {
  constructor(url, name) {
    this.url = url;
    this.name = name;
    this.msgs = [];
    this.pos = { x: 0, z: 14 };
    this.hp = 0; this.maxHp = 0;
    this.mp = 0; this.maxMp = 0;
    this.mobHits = [];   // daño de MIS golpes, en orden
    this.deadMobs = new Set();
    this.mobLive = new Map(); // id -> {x,z,hp} en vivo (las criaturas deambulan)
    this.announces = [];
    this.died = null;
    this.guild = null;
    this.weak = null;
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (raw) => this.#onMessage(JSON.parse(raw)));
    await new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
    return this;
  }

  #onMessage(m) {
    this.msgs.push(m);
    switch (m.type) {
      case 'welcome':
        this.id = m.id;
        this.pos = { ...m.spawn };
        this.charName = m.character.name;
        this.charState = m.character.state;
        this.mobs = m.mobs;
        this.#vitals(m.vitals);
        break;
      case 'pos_correct': this.pos = { x: m.x, z: m.z }; break;
      case 'state_sync': this.sync = m; break;
      case 'guild_info': this.guild = m.guild; break;
      case 'announce': this.announces.push(m.text); break;
      case 'mob_dead': this.deadMobs.add(m.id); break;
      // Instantánea compacta del reino: [id, x, z, rot, hp, persiguiendo]
      case 'mobs':
        for (const [id, x, z, , hp] of m.m) this.mobLive.set(id, { x, z, hp });
        break;
      case 'mob_spawn':
        this.mobLive.set(m.id, { x: m.x, z: m.z, hp: m.hp });
        this.deadMobs.delete(m.id);
        break;
      case 'you_died': this.died = m; this.pos = { x: m.x, z: m.z }; this.#vitals(m); break;
      case 'mob_hit': if (m.by === this.id) this.mobHits.push(m.dmg); break;
      case 'hp_sync': case 'skill_used': case 'skill_heal_ok':
      case 'player_hurt': case 'item_used': case 'mira_ok':
        this.#vitals(m); break;
    }
  }

  // Ojo: en el welcome estos datos vienen anidados en `vitals`; en el resto de
  // mensajes van al nivel superior. Por eso todo pasa por aquí.
  #vitals(v = {}) {
    if (typeof v.hp === 'number') this.hp = v.hp;
    if (typeof v.maxHp === 'number') this.maxHp = v.maxHp;
    if (typeof v.mp === 'number') this.mp = v.mp;
    if (typeof v.maxMp === 'number') this.maxMp = v.maxMp;
    if (typeof v.weakLeft === 'number') this.weak = { on: !!v.weak, left: v.weakLeft };
  }

  send(obj) { this.ws.send(JSON.stringify(obj)); }

  /** Último mensaje recibido de un tipo (o undefined). */
  last(type) { return [...this.msgs].reverse().find((m) => m.type === type); }

  /** Limpia el historial: útil para aislar lo que provoca la siguiente acción. */
  clear() { this.msgs.length = 0; return this; }

  /** Espera a que llegue un mensaje del tipo dado. Lanza si tarda demasiado. */
  async waitFor(type, timeout = 3000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = this.msgs.find((m) => m.type === type);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`[${this.name}] no llegó "${type}" en ${timeout} ms`);
      await wait(25);
    }
  }

  /** Espera a que una condición se cumpla (sondeo). */
  async until(fn, timeout = 5000, what = 'condición') {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (fn()) return true;
      if (Date.now() > deadline) throw new Error(`[${this.name}] no se cumplió ${what} en ${timeout} ms`);
      await wait(30);
    }
  }

  // ---- Lobby ----
  /** Entra al mundo creando cuenta y personaje si hace falta (BD limpia). */
  async login({ account, password = 'clave123', race = 'humano', clazz = 'guerrero', realm = 'valdoria', charName }) {
    this.clear();
    this.send({ type: 'auth', account, password });
    const ok = await this.waitFor('auth_ok');
    let chars = ok.characters;
    if (chars.length === 0) {
      this.clear();
      this.send({ type: 'char_create', name: charName || account, race, class: clazz });
      chars = (await this.waitFor('char_list')).characters;
    }
    this.clear();
    this.send({ type: 'enter_world', charId: chars[0].id, realm });
    await this.waitFor('welcome');
    return this;
  }

  // ---- Mundo ----
  /** Camina hasta (x,z) por pasos que el servidor siempre acepta. */
  async walkTo(x, z, maxSteps = 80) {
    for (let i = 0; i < maxSteps; i++) {
      const d = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (d < 1.2) return this;
      const s = Math.min(STEP, d);
      const nx = this.pos.x + (x - this.pos.x) / d * s;
      const nz = this.pos.z + (z - this.pos.z) / d * s;
      const before = this.msgs.length;
      this.send({ type: 'move', x: +nx.toFixed(1), z: +nz.toFixed(1), rot: 0 });
      await wait(STEP_MS);
      // Si el servidor corrigió, quedarse con SU posición (es la autoritativa)
      const corr = this.msgs.slice(before).reverse().find((m) => m.type === 'pos_correct');
      this.pos = corr ? { x: corr.x, z: corr.z } : { x: nx, z: nz };
    }
    return this;
  }

  /** Posición actual de una criatura (viva si la conocemos, si no la del welcome). */
  mobPos(id) {
    const live = this.mobLive.get(id);
    if (live) return live;
    const snap = (this.mobs || []).find((m) => m.id === id);
    return snap ? { x: snap.x, z: snap.z } : null;
  }

  /** Criaturas vivas de un tipo, de la más cercana a la más lejana. */
  liveMobs(type) {
    return (this.mobs || [])
      .filter((m) => !m.dead && !this.deadMobs.has(m.id) && (!type || m.type === type))
      .map((m) => ({ ...m, ...(this.mobPos(m.id) || {}) }))
      .map((m) => ({ ...m, d: Math.hypot(m.x - this.pos.x, m.z - this.pos.z) }))
      .sort((a, b) => a.d - b.d);
  }

  nearestMob(type) { return this.liveMobs(type)[0]; }

  /**
   * Se planta junto a una criatura y se queda a tiro del golpe básico (≤6).
   * Las criaturas deambulan y persiguen, así que se recalcula sobre la marcha:
   * caminar a la posición del welcome dejaba al bot fuera de alcance.
   */
  async engage(mobId, radio = 3) {
    for (let i = 0; i < 30; i++) {
      const p = this.mobPos(mobId);
      if (!p) return this;
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d <= radio) return this;
      const s = Math.min(STEP, d - radio + 0.5);
      const nx = this.pos.x + (p.x - this.pos.x) / d * s;
      const nz = this.pos.z + (p.z - this.pos.z) / d * s;
      const before = this.msgs.length;
      this.send({ type: 'move', x: +nx.toFixed(1), z: +nz.toFixed(1), rot: 0 });
      await wait(STEP_MS);
      const corr = this.msgs.slice(before).reverse().find((m) => m.type === 'pos_correct');
      this.pos = corr ? { x: corr.x, z: corr.z } : { x: nx, z: nz };
    }
    return this;
  }

  /** Golpe básico. El servidor limita a 1 cada 600 ms. */
  async attack(mobId, dmg = 1000) {
    this.send({ type: 'attack', mobId, dmg });
    await wait(650);
    return this;
  }

  /** Equipa un objeto de la bolsa por su id y espera la sincronización. */
  async equip(itemId) {
    const inv = this.sync?.inventory ?? this.charState.inventory;
    const idx = inv.slots.findIndex((s) => s?.itemId === itemId);
    if (idx === -1) throw new Error(`[${this.name}] no lleva ${itemId} en la bolsa`);
    this.clear();
    this.send({ type: 'equip', bagIndex: idx });
    await this.waitFor('state_sync');
    return this;
  }

  /** Activa el JcJ y espera la confirmación. */
  async enablePvp() {
    this.send({ type: 'pvp_toggle' });
    await this.waitFor('pvp_state');
    return this;
  }

  disconnect() { this.ws.close(); }
}

/** Atajo: crea, conecta y entra al mundo. */
export async function spawnBot(url, opts) {
  const bot = new Bot(url, opts.account);
  await bot.connect();
  await bot.login(opts);
  return bot;
}
