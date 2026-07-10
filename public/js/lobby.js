// Lobby: cuenta -> selección de mundo y personaje -> creación de héroe.
// Habla con el servidor a través de network.js; main.js le pasa los mensajes.
import { RACES, CLASSES } from './races.js';
import { sendAuth, sendCharCreate, sendCharDelete, sendEnterWorld } from './network.js';

const $ = (id) => document.getElementById(id);

let characters = [];
let realms = [];
let selectedChar = null;
let selectedRealm = null;
let selectedRace = 'humano';
let selectedClass = 'guerrero';
let pendingDeleteId = null;

// Sesión por pestaña para la reconexión automática (se borra al cerrar la
// pestaña o al pulsar "Cambiar de cuenta")
let lastAccount = '';
let lastPassword = '';
let autoSession = null;

function saveSession(charId, realm) {
  try {
    sessionStorage.setItem('valdoria_session', JSON.stringify({
      account: lastAccount, password: lastPassword, charId, realm,
    }));
  } catch { /* sin sessionStorage: sin reanudación */ }
}

export function clearSession() {
  try { sessionStorage.removeItem('valdoria_session'); } catch { /* nada */ }
  autoSession = null;
}

export function initLobby() {
  $('auth-btn').addEventListener('click', doAuth);
  $('password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doAuth(); });
  $('account-input').focus();

  $('logout-btn').addEventListener('click', () => { clearSession(); location.reload(); });

  // ¿Hay una sesión de esta pestaña? Volver al mundo sin pasar por el lobby
  try {
    autoSession = JSON.parse(sessionStorage.getItem('valdoria_session'));
  } catch { autoSession = null; }
  if (autoSession?.account && autoSession?.charId) {
    lastAccount = autoSession.account;
    lastPassword = autoSession.password;
    $('auth-btn').disabled = true;
    $('auth-btn').textContent = 'Reconectando...';
    sendAuth(autoSession.account, autoSession.password);
  }
  $('new-char-btn').addEventListener('click', () => {
    if (characters.length >= 5) { showError('select-error', 'Máximo 5 personajes por cuenta'); return; }
    showScreen('screen-create');
    $('char-name-input').value = '';
    renderCards();
    $('char-name-input').focus();
  });
  $('enter-btn').addEventListener('click', () => {
    if (selectedChar && selectedRealm) {
      $('enter-btn').disabled = true;
      $('enter-btn').textContent = 'Entrando...';
      saveSession(selectedChar, selectedRealm);
      sendEnterWorld(selectedChar, selectedRealm);
    }
  });
  $('create-btn').addEventListener('click', () => {
    sendCharCreate($('char-name-input').value, selectedRace, selectedClass);
  });
  $('create-back-btn').addEventListener('click', () => showScreen('screen-select'));
}

function doAuth() {
  hideErrors();
  lastAccount = $('account-input').value;
  lastPassword = $('password-input').value;
  $('auth-btn').disabled = true;
  $('auth-btn').textContent = 'Conectando...';
  sendAuth(lastAccount, lastPassword);
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.lobby-screen')) s.classList.add('hidden');
  $(id).classList.remove('hidden');
  hideErrors();
}

function showError(id, text) {
  const el = $(id);
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideErrors() {
  for (const id of ['auth-error', 'select-error', 'create-error']) $(id).classList.add('hidden');
}

// ---- Mensajes del servidor (enrutados desde main.js) ----
export function onAuthOk(msg) {
  characters = msg.characters;
  realms = msg.realms;
  selectedRealm = selectedRealm || realms[0]?.id;

  // Reanudación automática: entrar directamente con el personaje de la sesión
  if (autoSession && characters.some((c) => c.id === autoSession.charId)) {
    $('auth-btn').textContent = 'Volviendo al mundo...';
    sendEnterWorld(autoSession.charId, autoSession.realm);
    return;
  }
  if (autoSession) clearSession(); // el personaje ya no existe

  $('account-greeting').textContent = msg.created
    ? `Cuenta "${msg.account}" creada. ¡Bienvenido, aventurero!`
    : `Cuenta: ${msg.account}`;
  showScreen('screen-select');
  renderSelect();
}

export function onAuthFail(msg) {
  clearSession();
  $('auth-btn').disabled = false;
  $('auth-btn').textContent = 'Entrar';
  showError('auth-error', msg.reason);
}

export function onCharList(msg) {
  characters = msg.characters;
  if (msg.createdId) {
    selectedChar = msg.createdId;
    showScreen('screen-select');
  }
  if (!characters.some((c) => c.id === selectedChar)) selectedChar = null;
  renderSelect();
}

export function onCharFail(msg) {
  showError('create-error', msg.reason);
}

export function onEnterFail(msg) {
  clearSession();
  $('enter-btn').disabled = false;
  $('enter-btn').textContent = 'Entrar al mundo';
  $('auth-btn').disabled = false;
  $('auth-btn').textContent = 'Entrar';
  showScreen('screen-select');
  renderSelect();
  showError('select-error', msg.reason);
}

export function hideLobby() {
  $('login-screen').classList.add('hidden');
}

// ---- Renderizado ----
function renderSelect() {
  // Mundos
  const realmList = $('realm-list');
  realmList.innerHTML = '';
  for (const realm of realms) {
    const el = document.createElement('div');
    el.className = 'realm-card' + (realm.id === selectedRealm ? ' selected' : '');
    el.innerHTML =
      `<div class="realm-name">🌍 ${realm.name}</div>` +
      `<div class="realm-desc">${realm.desc} · ${realm.players} jugador${realm.players === 1 ? '' : 'es'}</div>`;
    el.addEventListener('click', () => { selectedRealm = realm.id; renderSelect(); });
    realmList.appendChild(el);
  }

  // Personajes
  $('char-count').textContent = `(${characters.length}/5)`;
  const charList = $('char-list');
  charList.innerHTML = '';
  if (characters.length === 0) {
    charList.innerHTML = '<p class="char-empty">Aún no tienes héroes. ¡Forja el primero!</p>';
    selectedChar = null;
  }
  for (const c of characters) {
    const race = RACES[c.race] || RACES.humano;
    const clazz = CLASSES[c.class] || CLASSES.guerrero;
    const el = document.createElement('div');
    el.className = 'char-card' + (c.id === selectedChar ? ' selected' : '');
    el.innerHTML =
      `<span class="char-icons">${race.icon}${clazz.icon}</span>` +
      `<span class="char-info"><b>${c.name}</b><br/><small>${race.name} ${clazz.name} · 🪙 ${c.gold}</small></span>` +
      `<button class="char-delete" title="Borrar personaje">${pendingDeleteId === c.id ? '¿Seguro?' : '✕'}</button>`;
    el.addEventListener('click', () => { selectedChar = c.id; pendingDeleteId = null; renderSelect(); });
    el.querySelector('.char-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (pendingDeleteId === c.id) {
        pendingDeleteId = null;
        sendCharDelete(c.id);
      } else {
        pendingDeleteId = c.id;
        renderSelect();
      }
    });
    charList.appendChild(el);
  }

  $('enter-btn').disabled = !(selectedChar && selectedRealm);
}

function renderCards() {
  const raceList = $('race-list');
  raceList.innerHTML = '';
  for (const race of Object.values(RACES)) {
    const el = document.createElement('div');
    el.className = 'pick-card' + (race.id === selectedRace ? ' selected' : '');
    el.innerHTML =
      `<div class="pick-icon">${race.icon}</div><div class="pick-name">${race.name}</div>` +
      `<div class="pick-bonus">${race.bonusText}</div><div class="pick-desc">${race.desc}</div>`;
    el.addEventListener('click', () => { selectedRace = race.id; renderCards(); });
    raceList.appendChild(el);
  }

  const classList = $('class-list');
  classList.innerHTML = '';
  for (const clazz of Object.values(CLASSES)) {
    const el = document.createElement('div');
    el.className = 'pick-card' + (clazz.id === selectedClass ? ' selected' : '');
    el.innerHTML =
      `<div class="pick-icon">${clazz.icon}</div><div class="pick-name">${clazz.name}</div>` +
      `<div class="pick-bonus">${clazz.bonusText}</div><div class="pick-desc">${clazz.desc}</div>`;
    el.addEventListener('click', () => { selectedClass = clazz.id; renderCards(); });
    classList.appendChild(el);
  }
}
