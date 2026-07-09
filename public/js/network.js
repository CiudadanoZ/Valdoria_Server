// Cliente WebSocket: cuenta, personajes, mundo, criaturas, botín, grupos y chat.
// La conexión se abre al entrar en el lobby; los envíos previos a la apertura
// se encolan y se envían al conectar.

let ws = null;
let queue = [];
let lastSent = { x: null, z: null, rot: null };
let lastSendTime = 0;

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  } else {
    queue.push(obj);
  }
}

export function connect(handlers) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.addEventListener('open', () => {
    for (const obj of queue) ws.send(JSON.stringify(obj));
    queue = [];
    handlers.connected?.();
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handlers[msg.type]?.(msg);
  });

  ws.addEventListener('close', () => handlers.disconnected?.());
}

// ---- Lobby ----
export function sendAuth(account, password) {
  send({ type: 'auth', account, password });
}

export function sendCharCreate(name, race, clazz) {
  send({ type: 'char_create', name, race, class: clazz });
}

export function sendCharDelete(charId) {
  send({ type: 'char_delete', charId });
}

export function sendEnterWorld(charId, realm) {
  send({ type: 'enter_world', charId, realm });
}

// ---- Mundo ----
// Envía la posición como máximo 10 veces por segundo y solo si cambió.
export function sendMove(x, z, rot) {
  const now = performance.now();
  if (now - lastSendTime < 100) return;
  if (lastSent.x === x && lastSent.z === z && lastSent.rot === rot) return;
  lastSent = { x, z, rot };
  lastSendTime = now;
  send({ type: 'move', x, z, rot });
}

export function sendChat(text) {
  send({ type: 'chat', text });
}

export function sendAttack(mobId, dmg) {
  send({ type: 'attack', mobId, dmg });
}

// Golpes de habilidad (uno o varios objetivos en un solo lanzamiento)
export function sendSkillHits(hits) {
  send({ type: 'skill_hits', hits });
}

// Curación lanzada a un aliado
export function sendHealAlly(targetId, amount) {
  send({ type: 'heal_ally', targetId, amount });
}

// ---- Operaciones autoritativas (el servidor valida y sincroniza) ----
export function sendUseItem(itemId) { send({ type: 'use_item', itemId }); }
export function sendEquip(bagIndex) { send({ type: 'equip', bagIndex }); }
export function sendUnequip(slot) { send({ type: 'unequip', slot }); }
export function sendShopBuy(itemId) { send({ type: 'shop_buy', itemId }); }
export function sendShopSell(itemId) { send({ type: 'shop_sell', itemId }); }
export function sendCraft(recipe) { send({ type: 'craft', recipe }); }
export function sendCook(recipe) { send({ type: 'cook', recipe }); }
export function sendGather(herb) { send({ type: 'gather', herb }); }
export function sendFishStart(spot) { send({ type: 'fish_start', spot }); }
export function sendFishStop() { send({ type: 'fish_stop' }); }
export function sendMira(service, id) { send({ type: 'mira', service, id }); }
export function sendTalentSpend(nodeId) { send({ type: 'talent_spend', nodeId }); }
export function sendQuestClaim(questId) { send({ type: 'quest_claim', questId }); }

// Persiste el estado del personaje en el servidor
export function sendSaveState(state) {
  send({ type: 'save_state', state });
}

// ---- Grupos de caza ----
export function sendPartyInvite(targetId) {
  send({ type: 'party_invite', targetId });
}

export function sendPartyAccept(fromId) {
  send({ type: 'party_accept', fromId });
}

export function sendPartyLeave() {
  send({ type: 'party_leave' });
}
