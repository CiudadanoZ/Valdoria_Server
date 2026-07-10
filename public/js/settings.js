// Panel de ajustes: volumen de música y efectos, sombras on/off, y (en el
// juego) cambio de contraseña y reporte de fallos.
import { initAudio, resumeAudio, setMusicVolume, setSfxVolume, getVolumes, play } from './audio.js';
import { sendChangePassword, sendBugReport } from './network.js';

const $ = (id) => document.getElementById(id);
const SHADOW_KEY = 'valdoria_shadows';
export const GAME_VERSION = 'alpha-0.12';

let onShadowsChange = null;

export function shadowsEnabled() {
  return localStorage.getItem(SHADOW_KEY) !== '0';
}

export function initSettings({ onShadows } = {}) {
  onShadowsChange = onShadows;

  const vols = getVolumes();
  const music = $('vol-music');
  const sfx = $('vol-sfx');
  const shadows = $('opt-shadows');

  music.value = Math.round(vols.music * 100);
  sfx.value = Math.round(vols.sfx * 100);
  shadows.checked = shadowsEnabled();
  $('vol-music-val').textContent = `${music.value}%`;
  $('vol-sfx-val').textContent = `${sfx.value}%`;

  music.addEventListener('input', () => {
    setMusicVolume(music.value / 100);
    $('vol-music-val').textContent = `${music.value}%`;
  });
  sfx.addEventListener('input', () => {
    setSfxVolume(sfx.value / 100);
    $('vol-sfx-val').textContent = `${sfx.value}%`;
  });
  sfx.addEventListener('change', () => play('click'));
  shadows.addEventListener('change', () => {
    localStorage.setItem(SHADOW_KEY, shadows.checked ? '1' : '0');
    onShadowsChange?.(shadows.checked);
  });

  $('settings-btn-lobby')?.addEventListener('click', () => togglePanel());
  $('settings-btn')?.addEventListener('click', () => togglePanel());

  // Cambio de contraseña
  $('pw-btn')?.addEventListener('click', () => {
    const oldPw = $('pw-old').value;
    const newPw = $('pw-new').value;
    if (!oldPw || !newPw) { setPwMsg('Rellena ambos campos', false); return; }
    if (newPw.length < 4) { setPwMsg('La nueva contraseña necesita al menos 4 caracteres', false); return; }
    setPwMsg('Enviando...', true);
    sendChangePassword(oldPw, newPw);
  });

  // Reporte de fallo
  $('report-btn')?.addEventListener('click', () => {
    $('settings-panel').classList.add('hidden');
    $('report-msg').textContent = '';
    $('report-text').value = '';
    $('report-panel').classList.remove('hidden');
    $('report-text').focus();
  });
  $('report-cancel')?.addEventListener('click', () => $('report-panel').classList.add('hidden'));
  $('report-send')?.addEventListener('click', () => {
    const text = $('report-text').value.trim();
    if (!text) { setReportMsg('Escribe una descripción', false); return; }
    sendBugReport(text, GAME_VERSION);
    setReportMsg('Enviando...', true);
  });

  // El audio necesita un gesto del usuario: arranca en el primer clic/tecla
  const wake = () => { initAudio(); resumeAudio(); };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

// Muestra la sección de cuenta (solo dentro del juego)
export function enableAccountSettings() {
  $('settings-account')?.classList.remove('hidden');
}

function setPwMsg(text, ok) {
  const el = $('pw-msg');
  el.textContent = text;
  el.className = `settings-msg ${ok ? 'ok' : 'err'}`;
}
function setReportMsg(text, ok) {
  const el = $('report-msg');
  el.textContent = text;
  el.className = `settings-msg ${ok ? 'ok' : 'err'}`;
}

// Respuestas del servidor (enrutadas desde main.js)
export function onPasswordResult(ok, reason) {
  if (ok) {
    setPwMsg('✓ Contraseña cambiada', true);
    $('pw-old').value = '';
    $('pw-new').value = '';
  } else {
    setPwMsg(reason || 'No se pudo cambiar la contraseña', false);
  }
}
export function onReportResult() {
  setReportMsg('✓ ¡Gracias! Reporte enviado.', true);
  setTimeout(() => $('report-panel').classList.add('hidden'), 1200);
}

export function togglePanel() {
  initAudio();
  $('settings-panel').classList.toggle('hidden');
}

export function closeSettings() {
  $('settings-panel').classList.add('hidden');
  $('report-panel').classList.add('hidden');
}
