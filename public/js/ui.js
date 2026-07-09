// Interfaz: diálogos de NPC, notificaciones, chat, tooltips y HUD.

const $ = (id) => document.getElementById(id);

export function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.textContent = text;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---- Diálogo de NPC ----
export function showDialog(name, text, actions = []) {
  $('dialog-name').textContent = name;
  $('dialog-text').textContent = text;
  const box = $('dialog-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.textContent = a.label;
    btn.addEventListener('click', a.fn);
    box.appendChild(btn);
  }
  $('dialog-panel').classList.remove('hidden');
}

export function hideDialog() {
  $('dialog-panel').classList.add('hidden');
}

export function isDialogOpen() {
  return !$('dialog-panel').classList.contains('hidden');
}

// ---- Chat ----
export function addChatMessage({ from, text, system }) {
  const log = $('chat-log');
  const el = document.createElement('div');
  el.className = system ? 'msg system' : 'msg';
  if (system) {
    el.textContent = text;
  } else {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${from}: `;
    el.appendChild(who);
    el.appendChild(document.createTextNode(text));
  }
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// ---- HUD ----
export function setHP(hp, max = 100) {
  $('hp-fill').style.height = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
  $('hp-text').textContent = Math.round(hp);
}

export function setGold(amount) {
  $('gold-amount').textContent = amount;
  $('inv-gold').textContent = amount;
}

export function showInteractHint(text) {
  const el = $('interact-hint');
  el.textContent = text;
  el.classList.remove('hidden');
}

export function hideInteractHint() {
  $('interact-hint').classList.add('hidden');
}

// ---- Tooltip ----
export function showTooltip(html, x, y) {
  const tip = $('tooltip');
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(x + pad, window.innerWidth - rect.width - 8)}px`;
  tip.style.top = `${Math.min(y + pad, window.innerHeight - rect.height - 8)}px`;
}

export function hideTooltip() {
  $('tooltip').classList.add('hidden');
}

// ---- Paneles genéricos ----
export function togglePanel(id) {
  $(id).classList.toggle('hidden');
}

export function initPanelCloseButtons() {
  document.querySelectorAll('.close-btn').forEach((btn) => {
    btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden'));
  });
}
