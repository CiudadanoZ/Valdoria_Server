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

// Golpes de habilidad (uno o varios objetivos en un solo lanzamiento).
// Va el id de la habilidad: el servidor cobra su coste una única vez.
export function sendSkillHits(skillId, hits) {
  send({ type: 'skill_hits', skillId, hits });
}

// Curación lanzada a un aliado
export function sendHealAlly(targetId, amount) {
  send({ type: 'heal_ally', targetId, amount });
}

// Curación de habilidad propia y mejoras de armadura (las aplica el servidor)
export function sendSkillHeal(skillId) {
  send({ type: 'skill_heal', skillId });
}
export function sendSkillBuff(skillId) {
  send({ type: 'skill_buff', skillId });
}

// ---- Operaciones autoritativas (el servidor valida y sincroniza) ----
export function sendUseItem(itemId) { send({ type: 'use_item', itemId }); }
export function sendEquip(bagIndex) { send({ type: 'equip', bagIndex }); }
export function sendUnequip(slot) { send({ type: 'unequip', slot }); }
export function sendShopBuy(itemId) { send({ type: 'shop_buy', itemId }); }
export function sendShopSell(itemId) { send({ type: 'shop_sell', itemId }); }
// Vender una pieza concreta de la bolsa (la que tiene afijos), no "una igual".
export function sendShopSellSlot(bagIndex) { send({ type: 'shop_sell', bagIndex }); }
export function sendCraft(recipe) { send({ type: 'craft', recipe }); }
export function sendCook(recipe) { send({ type: 'cook', recipe }); }
export function sendGather(herb) { send({ type: 'gather', herb }); }
export function sendFishStart(spot) { send({ type: 'fish_start', spot }); }
export function sendFishStop() { send({ type: 'fish_stop' }); }
export function sendMira(service, id) { send({ type: 'mira', service, id }); }
export function sendTalentSpend(nodeId) { send({ type: 'talent_spend', nodeId }); }
export function sendQuestClaim(questId) { send({ type: 'quest_claim', questId }); }
export function sendBountyAccept(bountyId) { send({ type: 'bounty_accept', bountyId }); }
export function sendBountyClaim(bountyId) { send({ type: 'bounty_claim', bountyId }); }
export function sendChangePassword(oldPassword, newPassword) { send({ type: 'change_password', oldPassword, newPassword }); }
export function sendBugReport(text, version) { send({ type: 'bug_report', text, version }); }
export function sendTalentRespec() { send({ type: 'talent_respec' }); }
export function sendLeaderboard() { send({ type: 'leaderboard' }); }

// ---- JcJ ----
export function sendPvpToggle() { send({ type: 'pvp_toggle' }); }
export function sendPvpAttack(targetId, dmg) { send({ type: 'pvp_attack', targetId, dmg }); }

// ---- Viaje rápido, monturas y subastas ----
export function sendWaystoneActivate(id) { send({ type: 'waystone_activate', id }); }
export function sendWaystoneTravel(id) { send({ type: 'waystone_travel', id }); }
export function sendMountBuy(id) { send({ type: 'mount_buy', id }); }
export function sendMountSelect(id) { send({ type: 'mount_select', id }); }
export function sendMountToggle() { send({ type: 'mount_toggle' }); }
export function sendAuctionBrowse() { send({ type: 'auction_browse' }); }
export function sendAuctionCreate(slot, price) { send({ type: 'auction_create', slot, price }); }
export function sendAuctionBuy(auctionId) { send({ type: 'auction_buy', id: auctionId }); }
export function sendAuctionCancel(auctionId) { send({ type: 'auction_cancel', id: auctionId }); }
export function sendAuctionCollect() { send({ type: 'auction_collect' }); }

// ---- Gremios ----
export function sendGuildCreate(name) { send({ type: 'guild_create', name }); }
export function sendGuildInvite(targetName) { send({ type: 'guild_invite', targetName }); }
export function sendGuildAccept(guild) { send({ type: 'guild_accept', guild }); }
export function sendGuildLeave() { send({ type: 'guild_leave' }); }
export function sendGuildKick(targetName) { send({ type: 'guild_kick', targetName }); }
export function sendGuildDisband() { send({ type: 'guild_disband' }); }
export function sendGuildMotd(motd) { send({ type: 'guild_motd', motd }); }
export function sendGuildInfo() { send({ type: 'guild_info' }); }

// ---- Comercio entre jugadores ----
export function sendTradeRequest(targetId) { send({ type: 'trade_request', targetId }); }
export function sendTradeAccept(fromId) { send({ type: 'trade_accept', fromId }); }
export function sendTradeOffer(slots, gold) { send({ type: 'trade_offer', slots, gold }); }
export function sendTradeConfirm() { send({ type: 'trade_confirm' }); }
export function sendTradeCancel() { send({ type: 'trade_cancel' }); }

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
