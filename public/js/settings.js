// Panel de ajustes: volumen de música y efectos, y sombras on/off.
// Accesible desde el lobby (botón ⚙) y desde el juego (botón ⚙ o tecla O).
import { initAudio, resumeAudio, setMusicVolume, setSfxVolume, getVolumes, play } from './audio.js';

const $ = (id) => document.getElementById(id);
const SHADOW_KEY = 'valdoria_shadows';

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

  // Botones para abrir el panel (lobby y juego)
  $('settings-btn-lobby')?.addEventListener('click', () => togglePanel());
  $('settings-btn')?.addEventListener('click', () => togglePanel());

  // El audio necesita un gesto del usuario: arranca en el primer clic/tecla
  const wake = () => { initAudio(); resumeAudio(); };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

export function togglePanel() {
  initAudio(); // por si aún no arrancó
  $('settings-panel').classList.toggle('hidden');
}

export function closeSettings() {
  $('settings-panel').classList.add('hidden');
}
