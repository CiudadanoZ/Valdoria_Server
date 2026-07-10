// Ciudadela de Valdoria — punto de entrada del cliente.
// Flujo: lobby (cuenta -> mundo -> personaje) -> juego. El estado del personaje
// (inventario, equipo, misiones, bendiciones, vida, posición) vive en el
// servidor y se sincroniza continuamente.
import * as THREE from 'three';
import { buildWorld, animateWorld, isInCrypt } from './world.js';
import { LocalPlayer, RemotePlayers } from './entities.js';
import { RACES, CLASSES } from './races.js';
import { spawnNPCs, updateQuestMarkers } from './npcs.js';
import { Mobs, spawnFloatText } from './enemies.js';
import {
  connect, sendMove, sendChat, sendAttack, sendSaveState, sendSkillHits, sendHealAlly,
  sendGather, sendFishStart, sendFishStop, sendMira, sendSkillHeal, sendSkillBuff,
} from './network.js';
import { initSkills, refreshSkills, castSkill, updateSkills, skillSpeedMul } from './skills.js';
import { initMinimap, updateMinimap, toggleMap, closeMap } from './minimap.js';
import {
  initProgression, applyProgression, toggleTalents, setGoldForRespec,
  talentDmg, talentSpeedMul, talentCdr, isSkillUnlocked,
} from './progression.js';
import { openCooking, refreshCooking } from './cooking.js';
import { initLeaderboard, openLeaderboard, applyLeaderboard } from './leaderboard.js';
import { ITEMS } from './items.js';
import { initInventory, applyInventory, getWeaponDamage, getArmor, inventory } from './inventory.js';
import { initQuests, loadQuests, serializeQuests, getDialog, onHerbCollected, onEnemyKilled, onLootChanged, onClaimResult, setShopOpener, setForgeOpener, setMiraServices, renderTracker } from './quests.js';
import { initShop, openShop, refreshShop } from './shop.js';
import { initCrafting, openCrafting, refreshCrafting } from './crafting.js';
import { BLESSINGS, initBlessings, applyBlessings, blessingDamage } from './blessings.js';
import { initParty, offerInvite, onInvite, onPartyUpdate, onPartyLeft, onPlayerLeave as partyPlayerLeave } from './party.js';
import { initLobby, onAuthOk, onAuthFail, onCharList, onCharFail, onEnterFail, hideLobby, clearSession } from './lobby.js';
import { initSettings, closeSettings, togglePanel as toggleSettings, shadowsEnabled, enableAccountSettings, onPasswordResult, onReportResult } from './settings.js';
import { applyBounties, openBountyBoard } from './bountyboard.js';
import { play } from './audio.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- Estado global ----------
let scene, camera, renderer, clock;
let worldRefs, player, remotes, npcs, mobs;
let charName = '';
let myRace = RACES.humano;
let myClass = CLASSES.guerrero;
let inWorld = false;
// Vida: ESPEJO de lo que dicta el servidor (daño, curas, regeneración y muerte
// se calculan allí; aquí solo se muestra)
let hp = 100;
let maxHpVal = 110;
const maxHp = () => maxHpVal;
function setVitals(msg) {
  if (typeof msg.hp === 'number') hp = msg.hp;
  if (typeof msg.maxHp === 'number') maxHpVal = msg.maxHp;
  ui.setHP(hp, maxHpVal);
}
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- Combate ----------
let combatTarget = null;
let attackCooldown = 0;

// ---------- Sincronización del estado con el servidor ----------
let saveTimer = null;
function saveGame() {
  if (!inWorld) return;
  if (saveTimer) return;
  saveTimer = setTimeout(flushSave, 1500);
}
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!inWorld) return;
  // Solo se reportan las banderas de diálogo de las misiones: todo lo demás
  // (oro, bolsa, progresión, bendiciones, vida, posición) lo posee el servidor.
  sendSaveState({
    quests: serializeQuests(),
  });
}

// ---------- Conexión y lobby ----------
initLobby();
initSettings({ onShadows: (on) => { if (renderer) renderer.shadowMap.enabled = on; } });
initLeaderboard();
document.getElementById('leaderboard-btn-lobby')?.addEventListener('click', openLeaderboard);
connect({
  auth_ok(msg) { onAuthOk(msg); },
  auth_fail(msg) { onAuthFail(msg); },
  char_list(msg) { onCharList(msg); },
  char_fail(msg) { onCharFail(msg); },
  enter_fail(msg) { onEnterFail(msg); },
  welcome(msg) {
    hideLobby();
    $('hud').classList.remove('hidden');
    startGame(msg);
  },
  player_join(msg) { remotes?.add(msg); },
  player_state(msg) { remotes?.updateState(msg); },
  player_leave(msg) { remotes?.remove(msg.id); partyPlayerLeave(msg.id); },
  chat(msg) { ui.addChatMessage(msg); },
  // Anuncio de administrador: destacado en el chat y como aviso central
  announce(msg) {
    ui.addChatMessage({ from: '📢 Anuncio', text: msg.text });
    ui.toast(`📢 ${msg.text}`, 'quest');
    play('quest');
  },
  // El servidor te expulsó/vetó: no reconectar automáticamente
  kicked(msg) {
    kickedOut = true;
    clearSession();
    ui.addChatMessage({ system: true, text: msg.reason });
    ui.toast(`⚠ ${msg.reason}`, 'quest');
  },
  mobs(msg) { mobs?.onSnapshot(msg.m); },
  mob_hit(msg) { mobs?.onHit(msg); },
  mob_dead(msg) {
    mobs?.onDead(msg);
    if (combatTarget && combatTarget.id === msg.id) combatTarget = null;
  },
  mob_spawn(msg) { mobs?.onSpawn(msg); },
  // El servidor ya aplicó oro/objetos/EXP a tu personaje (llega con state_sync);
  // aquí solo se celebra y se avanza el estado de las misiones.
  loot(msg) {
    if (msg.gold) { ui.toast(`+${msg.gold} de oro`); play('gold'); }
    let legendary = false;
    for (const itemId of msg.items) {
      const item = ITEMS[itemId];
      if (!item) continue;
      if (item.rarity === 'legendary') {
        legendary = true;
        ui.toast(`✦ ¡LEGENDARIO! ${item.icon} ${item.name} ✦`, 'quest');
      } else {
        ui.toast(`Obtenido: ${item.icon} ${item.name}`);
      }
    }
    if (msg.items.length) play(legendary ? 'levelup' : 'loot');
    onEnemyKilled(msg.mobType);
    onLootChanged();
    saveGame();
  },
  // Estado autoritativo del personaje: bolsa, oro, progresión y bendiciones
  state_sync(msg) {
    applyInventory(msg.inventory);
    if (msg.inventory) setGoldForRespec(msg.inventory.gold || 0);
    applyProgression(msg.progression);
    applyBlessings(msg.blessings);
    applyBounties(msg.bounties);
    refreshShop();
    refreshCrafting();
    refreshCooking();
    renderTracker();
  },
  bounty_ok(msg) {
    ui.toast(`📜 Encargo cobrado: +${msg.gold} oro, +${msg.xp} EXP`, 'quest');
    play('quest');
  },
  respec_ok(msg) {
    ui.toast(`🔄 Talentos reasignados (−${msg.cost} oro). Vuelve a repartir tus puntos.`, 'quest');
    play('levelup');
  },
  leaderboard(msg) { applyLeaderboard(msg.boards); },
  password_ok() { onPasswordResult(true); },
  password_fail(msg) { onPasswordResult(false, msg.reason); },
  bug_ok() { onReportResult(); },
  // Vida dictada por el servidor
  hp_sync(msg) { setVitals(msg); },
  item_used(msg) {
    const item = ITEMS[msg.itemId];
    setVitals(msg);
    ui.toast(`${item?.icon || ''} +${msg.heal} de vida`);
    play('potion');
  },
  skill_heal_ok(msg) {
    setVitals(msg);
    if (msg.heal > 0) spawnFloatText(scene, `+${msg.heal}`, '#7fe8a8', player.mesh.position);
    play('heal');
  },
  you_died(msg) {
    ui.hideDialog();
    combatTarget = null;
    player.stop();
    player.mesh.position.set(msg.x, 0, msg.z);
    setVitals(msg);
    ui.toast(`☠ ${msg.by} te ha derribado. Despiertas junto a la fuente.`, 'quest');
    play('death');
    saveGame();
  },
  rpc_ok(msg) {
    const item = ITEMS[msg.itemId];
    if (msg.kind === 'buy' && item) { ui.toast(`Comprado: ${item.icon} ${item.name}`); play('buy'); }
    else if (msg.kind === 'sell') { ui.toast(`Vendido (+${msg.gold} de oro)`); play('gold'); }
    else if (msg.kind === 'craft' && item) { ui.toast(`🔨 Bramm forja: ${item.icon} ${item.name}`, 'quest'); play('craft'); }
    else if (msg.kind === 'cook' && item) { ui.toast(`🔥 Cocinado: ${item.icon} ${item.name}`); play('cook'); }
  },
  rpc_fail(msg) { ui.toast(msg.reason); play('error'); },
  claim_ok(msg) { onClaimResult(msg.questId, true); play('quest'); },
  claim_fail(msg) { onClaimResult(msg.questId, false, msg.reason); },
  gather_ok(msg) { onHerbGathered(msg.herb); play('loot'); },
  fish_start_ok() { ui.toast('🎣 Lanzas el sedal...'); },
  fish_catch(msg) {
    const item = ITEMS[msg.itemId];
    if (item) ui.toast(`🎣 ¡Picó! ${item.icon} ${item.name}`);
    spawnFloatText(scene, '🎣', '#9adcf0', player.mesh.position);
    play('fish');
  },
  fish_stop() { /* el servidor cortó la pesca (movimiento o bolsa llena) */ },
  mira_ok(msg) {
    if (msg.service === 'heal') {
      setVitals(msg);
      ui.toast('✙ Mira cierra tus heridas: vida al máximo', 'quest');
      play('heal');
    } else if (msg.service === 'bless') {
      const b = BLESSINGS[msg.id];
      if (b) ui.toast(`${b.icon} ${b.name} — ${b.desc} durante 10 minutos`, 'quest');
      play('buy');
    }
  },
  pos_correct(msg) {
    // El servidor rechazó un movimiento imposible: volver a la posición válida
    player.stop();
    combatTarget = null;
    player.mesh.position.set(msg.x, 0, msg.z);
  },
  player_hurt(msg) { onPlayerDamaged(msg); play('hit'); },
  healed(msg) {
    setVitals(msg);
    if (msg.amount > 0) {
      play('heal');
      spawnFloatText(scene, `+${msg.amount}`, '#7fe8a8', player.mesh.position);
      ui.toast(`✨ ${msg.from} te ha curado (+${msg.amount})`);
    }
  },
  party_invite(msg) { onInvite(msg); },
  party_update(msg) { onPartyUpdate(msg); },
  party_left() { onPartyLeft(); },
  disconnected() {
    if (kickedOut) return; // expulsado/vetado: no reconectar
    if (inWorld) {
      startReconnect();
    } else {
      onAuthFail({ reason: 'Sin conexión con el servidor. Recarga la página.' });
    }
  },
});

let kickedOut = false;

// ---------- Reconexión automática ----------
// Al caer la conexión en pleno juego: overlay + sondeo del servidor; en cuanto
// responde, la página se recarga y la sesión de la pestaña vuelve a entrar
// directamente con el mismo personaje.
let reconnecting = false;
function startReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  $('reconnect-overlay').classList.remove('hidden');
  const poll = setInterval(async () => {
    try {
      const res = await fetch('/', { cache: 'no-store' });
      if (res.ok) {
        clearInterval(poll);
        location.reload();
      }
    } catch { /* servidor aún caído: seguir esperando */ }
  }, 2000);
}

window.addEventListener('beforeunload', () => { if (inWorld) flushSave(); });

// ---------- Inicialización de la escena ----------
function startGame({ id, spawn, realm, character, vitals: initialVitals, players, mobs: mobList }) {
  charName = character.name;
  myRace = RACES[character.race] || RACES.humano;
  myClass = CLASSES[character.class] || CLASSES.guerrero;

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 1, 300);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = shadowsEnabled();
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  worldRefs = buildWorld(scene);
  npcs = spawnNPCs(scene);
  player = new LocalPlayer(scene, charName, spawn, character.race, character.class);
  remotes = new RemotePlayers(scene);
  for (const p of players) remotes.add(p);
  mobs = new Mobs(scene);
  mobs.init(mobList);

  initInventory();
  initQuests({ changed: saveGame });
  initShop();
  initCrafting();
  initBlessings();
  initParty(id);
  setShopOpener(openShop);
  setForgeOpener(openCrafting);
  setMiraServices({
    blessings: BLESSINGS,
    getHp: () => hp,
    getMaxHp: maxHp,
    requestHeal: () => sendMira('heal'),
    requestBless: (id) => sendMira('bless', id),
  });

  // Progresión: nivel, experiencia y talentos (autoritativos del servidor)
  initProgression(character.class, {
    progressChanged() {
      refreshSkills();
      ui.setHP(hp, maxHp());
    },
  });

  // Barra de habilidades de la especialización
  initSkills(character.class, {
    scene,
    getPlayerPos: () => player.mesh.position,
    getTarget: () => combatTarget,
    getBaseDamage: () => 5 + getWeaponDamage() + blessingDamage() + myRace.dmg + myClass.dmg + talentDmg() + 2,
    getMobsInRadius: (radius) =>
      [...mobs.map.values()]
        .filter((m) => !m.dead && m.mesh.position.distanceTo(player.mesh.position) <= radius)
        .slice(0, 8),
    sendSkillHits,
    isUnlocked: isSkillUnlocked,
    getCdr: talentCdr,
    // Curas y mejoras: las aplica el servidor y responde con la vida resultante
    castHeal: (skillId) => sendSkillHeal(skillId),
    castBuff: (skillId) => sendSkillBuff(skillId),
    healAlly(amount) {
      // Curar al aliado más cercano (12 m)
      let nearest = null, nearestDist = 12;
      for (const p of remotes.players.values()) {
        const d = p.mesh.position.distanceTo(player.mesh.position);
        if (d < nearestDist) { nearest = p; nearestDist = d; }
      }
      if (!nearest) return;
      sendHealAlly(nearest.id, amount);
      ui.toast(`✨ Curas a ${nearest.name}`);
    },
    swingArm() {
      player.mesh.getObjectByName('armR').rotation.x = -1.9;
    },
  });

  // Minimapa (M para ampliar)
  initMinimap({
    getPlayerPos: () => player.mesh.position,
    getPlayerRot: () => player.mesh.rotation.y,
    npcs,
    remotes,
    mobs,
    portals: worldRefs.portals,
  });

  // Hidratar el estado del personaje desde el servidor
  const st = character.state || {};
  applyInventory(st.inventory);
  setGoldForRespec(inventory.gold);
  loadQuests(st.quests);
  applyBlessings(st.blessings);
  applyProgression(st.progression);
  applyBounties(st.bounties);
  refreshSkills(); // por si hay habilidades desbloqueadas por talentos
  setVitals(initialVitals || {});
  renderTracker();
  ui.initPanelCloseButtons();
  enableAccountSettings(); // cambio de contraseña disponible dentro del juego
  inWorld = true;

  ui.addChatMessage({ system: true, text: `Bienvenido a ${realm.name}, ${charName} (${myRace.name} ${myClass.name}).` });

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  $('chat-input').addEventListener('keydown', onChatKey);

  // Guardado periódico de posición
  setInterval(() => { if (inWorld) flushSave(); }, 10000);

  // Gancho de depuración
  window.__debug = {
    screenPosOf(npcId) {
      const npc = npcs.find((n) => n.id === npcId);
      return npc ? project(npc.mesh.position, 1.2) : null;
    },
    herbScreenPos(i) {
      const h = worldRefs.herbs[i];
      return h && h.visible ? project(h.position, 0.5) : null;
    },
    mobScreenPos(id) {
      const m = mobs.byId(id);
      return m && !m.dead ? project(m.mesh.position, 1) : null;
    },
    mobInfo: () => [...mobs.map.values()].map((m) => ({ id: m.id, type: m.type, dead: m.dead, hp: m.hp, x: +m.mesh.position.x.toFixed(1), z: +m.mesh.position.z.toFixed(1) })),
    portalScreenPos(i) {
      const p = worldRefs.portals[i];
      return p ? project(p.mesh.position, 2) : null;
    },
    teleport(x, z) { player.stop(); combatTarget = null; player.mesh.position.set(x, 0, z); },
    playerPos: () => ({ x: +player.mesh.position.x.toFixed(1), z: +player.mesh.position.z.toFixed(1), hp: Math.round(hp), maxHp: maxHp(), race: myRace.id, clase: myClass.id }),
    openShop,
    openCrafting,
    flushSave,
  };
  function project(worldPos, yOffset) {
    const v = worldPos.clone();
    v.y = yOffset;
    v.project(camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  requestAnimationFrame(loop);
}

// ---------- Daño al jugador (ya reducido por armadura en el servidor) ----------
function onPlayerDamaged(msg) {
  if (!inWorld) return;
  setVitals(msg);
  spawnFloatText(scene, `-${msg.dmg}`, '#ff5040', player.mesh.position);
  const vignette = $('damage-vignette');
  vignette.classList.add('hit');
  setTimeout(() => vignette.classList.remove('hit'), 120);
}

// ---------- Controles ----------
function onPointerDown(e) {
  if (e.button !== 0) return;
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);

  // 1) ¿Clic sobre una criatura? -> entrar en combate
  const mobHits = raycaster.intersectObjects(mobs.aliveMeshes(), true);
  if (mobHits.length > 0) {
    const mob = mobs.findByObject(mobHits[0].object);
    if (mob && !mob.dead) { combatTarget = mob; player.marker.visible = false; return; }
  }

  // 2) ¿Clic sobre un NPC?
  const npcHits = raycaster.intersectObjects(npcs.map((n) => n.mesh), true);
  if (npcHits.length > 0) {
    const npcId = npcHits[0].object.userData.npcId;
    const npc = npcs.find((n) => n.id === npcId);
    if (npc) { approachNPC(npc); return; }
  }

  // 3) ¿Clic sobre una Hierba Lumina?
  const herbHits = raycaster.intersectObjects(worldRefs.herbs.filter((h) => h.visible), true);
  if (herbHits.length > 0) {
    let obj = herbHits[0].object;
    while (obj && !obj.userData.isHerb) obj = obj.parent;
    if (obj) { approachHerb(obj); return; }
  }

  // 4) ¿Clic sobre un portal (criptas)?
  const portalHits = raycaster.intersectObjects(worldRefs.portals.map((p) => p.mesh), true);
  if (portalHits.length > 0) {
    let obj = portalHits[0].object;
    const portal = worldRefs.portals.find((p) => p.mesh === obj || p.mesh === obj.parent);
    if (portal) { approachPortal(portal); return; }
  }

  // 4b) ¿Clic sobre un punto de pesca?
  const fishHits = raycaster.intersectObjects(worldRefs.fishingSpots, true);
  if (fishHits.length > 0) {
    let obj = fishHits[0].object;
    while (obj && !obj.userData.isFishing) obj = obj.parent;
    if (obj) { approachFishing(obj); return; }
  }

  // 4c) ¿Clic sobre una hoguera? -> cocinar
  const fireHits = raycaster.intersectObjects(worldRefs.campfires, true);
  if (fireHits.length > 0) {
    let obj = fireHits[0].object;
    while (obj && !obj.userData.isCampfire) obj = obj.parent;
    if (obj) { approachCampfire(obj); return; }
  }

  // 4d) ¿Clic sobre el Tablón de Encargos?
  const boardHits = raycaster.intersectObjects([worldRefs.board], true);
  if (boardHits.length > 0) {
    combatTarget = null;
    player.moveTo(worldRefs.board.position.clone(), () => { openBountyBoard(); play('click'); }, 3.0);
    return;
  }

  // 5) ¿Clic sobre otro jugador? -> invitación de grupo
  const remoteHits = raycaster.intersectObjects(remotes.meshes(), true);
  if (remoteHits.length > 0) {
    const remote = remotes.findByObject(remoteHits[0].object);
    if (remote) { offerInvite(remote); return; }
  }

  // 6) Clic en el suelo: moverse (y romper el combate y la pesca)
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, point)) {
    ui.hideDialog();
    combatTarget = null;
    stopFishing();
    player.moveTo(point);
  }
}

// ---------- Pesca (el temporizador y las capturas viven en el servidor) ----------
function approachFishing(spot) {
  combatTarget = null;
  player.moveTo(spot.userData.shore.clone(), () => {
    // Mirar al agua y pedir al servidor que lance el sedal
    const d = spot.position.clone().sub(player.mesh.position);
    player.mesh.rotation.y = Math.atan2(d.x, d.z);
    sendFishStart(worldRefs.fishingSpots.indexOf(spot));
  }, 1.2);
}

function stopFishing() {
  sendFishStop();
}

function approachCampfire(fire) {
  combatTarget = null;
  player.moveTo(fire.position.clone(), () => {
    openCooking();
  }, 2.4);
}

function approachNPC(npc) {
  combatTarget = null;
  const target = npc.mesh.position.clone();
  player.moveTo(target, () => {
    const d = npc.mesh.position.clone().sub(player.mesh.position);
    player.mesh.rotation.y = Math.atan2(d.x, d.z);
    const { text, actions } = getDialog(npc);
    ui.showDialog(`${npc.name} — ${npc.title}`, text, actions);
    updateQuestMarkers(npcs, 0);
    saveGame();
  }, 2.6);
}

function approachHerb(herb) {
  combatTarget = null;
  player.moveTo(herb.position.clone(), () => {
    if (!herb.visible) return;
    // El servidor valida la cercanía y otorga la hierba (responde gather_ok)
    sendGather(worldRefs.herbs.indexOf(herb));
  }, 1.4);
}

// El servidor confirmó la recolección: ocultar la hierba un rato y avanzar la misión
function onHerbGathered(i) {
  const herb = worldRefs.herbs[i];
  if (herb) {
    herb.visible = false;
    setTimeout(() => { herb.visible = true; }, 30000);
  }
  const item = ITEMS.hierba_lumina;
  ui.toast(`Obtenido: ${item.icon} ${item.name}`);
  onHerbCollected();
  saveGame();
}

function approachPortal(portal) {
  combatTarget = null;
  player.moveTo(portal.mesh.position.clone(), () => {
    player.stop();
    player.mesh.position.set(portal.to.x, 0, portal.to.z);
    ui.toast(portal.label, 'quest');
    play('portal');
    saveGame();
  }, 3.0);
}

function onKeyDown(e) {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === '1' || k === '2' || k === '3' || k === '4') { castSkill(Number(k) - 1); return; }
  if (k === 'i') ui.togglePanel('inventory-panel');
  else if (k === 'm') toggleMap();
  else if (k === 't') toggleTalents();
  else if (k === 'o') toggleSettings();
  else if (k === 'l') openLeaderboard();
  else if (k === 'escape') {
    ui.hideDialog();
    $('inventory-panel').classList.add('hidden');
    $('shop-panel').classList.add('hidden');
    $('crafting-panel').classList.add('hidden');
    $('talents-panel').classList.add('hidden');
    $('cooking-panel').classList.add('hidden');
    $('bounty-panel').classList.add('hidden');
    $('leaderboard-panel').classList.add('hidden');
    closeSettings();
    closeMap();
  }
  else if (k === 'enter') { e.preventDefault(); $('chat-input').focus(); }
}

function onChatKey(e) {
  if (e.key !== 'Enter') return;
  const input = $('chat-input');
  const text = input.value.trim();
  if (text) {
    sendChat(text);
    ui.addChatMessage({ from: charName, text });
  }
  input.value = '';
  input.blur();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- Combate del jugador ----------
function updateCombat(dt) {
  attackCooldown -= dt;
  if (!combatTarget) return;
  if (combatTarget.dead) { combatTarget = null; return; }

  const enemyPos = combatTarget.mesh.position;
  const dist = player.mesh.position.distanceTo(enemyPos);
  const range = 1.6 + combatTarget.info.scale * 0.8;

  if (dist > range) {
    player.target = enemyPos.clone();
    player.arriveDist = range * 0.85;
    player.onArrive = null;
    return;
  }

  player.stop();
  const d = enemyPos.clone().sub(player.mesh.position);
  player.mesh.rotation.y = Math.atan2(d.x, d.z);

  if (attackCooldown <= 0) {
    attackCooldown = myClass.attackInterval;
    const dmg = 5 + getWeaponDamage() + blessingDamage() + myRace.dmg + myClass.dmg + talentDmg() + Math.floor(Math.random() * 5);
    player.mesh.getObjectByName('armR').rotation.x = -1.7;
    play('attack');
    sendAttack(combatTarget.id, dmg);
  }
}

// ---------- Cámara cenital estilo Diablo ----------
const CAM_OFFSET = new THREE.Vector3(0, 26, 15);
function updateCamera() {
  const p = player.mesh.position;
  camera.position.set(p.x + CAM_OFFSET.x, CAM_OFFSET.y, p.z + CAM_OFFSET.z);
  camera.lookAt(p.x, 0, p.z);
}

// ---------- Transición de luz al entrar/salir de las criptas ----------
let cryptBlend = 0;
const FOG_SURFACE = new THREE.Color(0x1a1220);
const FOG_CRYPT = new THREE.Color(0x07090c);
function updateCryptLighting(dt) {
  const target = isInCrypt(player.mesh.position.x) ? 1 : 0;
  cryptBlend += (target - cryptBlend) * Math.min(1, dt * 3);
  const { sun, hemi, ambient } = worldRefs.lights;
  sun.intensity = 1.15 * (1 - cryptBlend) + 0.06 * cryptBlend;
  hemi.intensity = 0.5 * (1 - cryptBlend) + 0.08 * cryptBlend;
  ambient.intensity = 0.55 * (1 - cryptBlend) + 0.3 * cryptBlend;
  scene.fog.color.copy(FOG_SURFACE).lerp(FOG_CRYPT, cryptBlend);
  scene.fog.density = 0.008 + 0.02 * cryptBlend;
  scene.background.copy(scene.fog.color);
}

// ---------- Aviso de interacción por cercanía ----------
let hintShown = false;
function updateInteractHint() {
  let nearest = null, nearestDist = Infinity;
  for (const n of npcs) {
    const d = n.mesh.position.distanceTo(player.mesh.position);
    if (d < 4 && d < nearestDist) { nearest = n; nearestDist = d; }
  }
  for (const p of worldRefs.portals) {
    const d = p.mesh.position.distanceTo(player.mesh.position);
    if (d < 6 && d < nearestDist) { nearest = { name: null, portal: p }; nearestDist = d; }
  }
  if (nearest && !ui.isDialogOpen()) {
    ui.showInteractHint(nearest.portal ? `Haz clic en el portal: ${nearest.portal.label}` : `Haz clic en ${nearest.name} para hablar`);
    hintShown = true;
  } else if (hintShown) {
    ui.hideInteractHint();
    hintShown = false;
  }
}

// ---------- Bucle principal ----------
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  updateCombat(dt);
  player.speedMul = skillSpeedMul() * talentSpeedMul();
  player.update(dt);
  remotes.update(dt);
  mobs.update(dt);
  updateSkills(dt, time);
  updateMinimap();
  animateWorld(worldRefs, time);
  updateQuestMarkers(npcs, time);
  updateCamera();
  updateCryptLighting(dt);
  updateInteractHint();

  const p = player.mesh.position;
  sendMove(
    Math.round(p.x * 100) / 100,
    Math.round(p.z * 100) / 100,
    Math.round(player.mesh.rotation.y * 100) / 100
  );

  renderer.render(scene, camera);
}
