// Habilidades por especialización: barra central estilo Diablo/WoW (teclas 1-5),
// con enfriamientos, coste de recurso, mejoras temporales y efectos visuales.
// Los datos viven en skills-data.js (compartidos con el servidor); el daño, la
// cura y el cobro del recurso los valida el servidor.
import * as THREE from 'three';
import { play } from './audio.js';
import { toast, showTooltip, hideTooltip } from './ui.js';
import { SKILLS, resourceOf } from './skills-data.js';

export { SKILLS };

let myClassId = 'guerrero';
let mySkills = [];
let deps = null;
let cooldowns = [];                // segundos restantes por casilla
const buffs = { armor: 0, speed: 0 }; // instantes de expiración (s de reloj)
let buffValues = { armor: 0, speed: 0 };
let clockTime = 0;

// deps: { scene, getPlayerPos, getTarget, getBaseDamage, getMobsInRadius(r),
//         sendSkillHits(hits), healSelf(n), healAlly(n), swingArm(),
//         isUnlocked(skillId), getCdr(skillId) }
export function initSkills(classId, dependencies) {
  myClassId = classId;
  deps = dependencies;
  refreshSkills();
}

// Reconstruye la barra: habilidades base + las desbloqueadas por talentos.
export function refreshSkills() {
  const all = SKILLS[myClassId] || SKILLS.guerrero;
  const res = resourceOf(myClassId);
  mySkills = all.filter((s) => !s.unlockable || deps.isUnlocked?.(s.id));
  cooldowns = mySkills.map(() => 0);

  const bar = document.getElementById('skill-bar');
  bar.innerHTML = '';
  mySkills.forEach((skill, i) => {
    const slot = document.createElement('div');
    slot.className = 'skill-slot';
    slot.dataset.index = i;
    slot.innerHTML =
      `<span class="skill-icon">${skill.icon}</span>` +
      `<span class="skill-key">${i + 1}</span>` +
      `<div class="skill-cd hidden"></div>`;
    slot.addEventListener('click', () => castSkill(i));
    slot.addEventListener('mousemove', (e) => showTooltip(
      `<div class="t-name">${skill.icon} ${skill.name}</div>` +
      `<div class="t-type">Enfriamiento: ${effectiveCd(skill)} s · Tecla ${i + 1}</div>` +
      `<div class="t-cost">${skill.cost} de ${res.name}</div>` +
      `<div class="t-desc">${skill.desc}</div>`,
      e.clientX, e.clientY
    ));
    slot.addEventListener('mouseleave', hideTooltip);
    bar.appendChild(slot);
  });
  bar.classList.remove('hidden');
}

function effectiveCd(skill) {
  return Math.max(1, skill.cd - (deps.getCdr?.(skill.id) || 0));
}

export function castSkill(i) {
  const skill = mySkills[i];
  if (!skill || !deps) return;
  if (cooldowns[i] > 0) return;
  // Aviso local; el servidor es quien cobra de verdad y puede rechazar.
  if ((skill.cost || 0) > (deps.getResource?.() ?? Infinity)) {
    toast(resourceOf(myClassId).empty);
    return;
  }

  const playerPos = deps.getPlayerPos();

  if (skill.type === 'target') {
    const target = deps.getTarget();
    if (!target || target.dead) { toast('Selecciona un objetivo (clic sobre la criatura)'); return; }
    const d = playerPos.distanceTo(target.mesh.position);
    if (d > skill.range) { toast('Demasiado lejos'); return; }
    const dmg = Math.round(deps.getBaseDamage() * skill.dmgMul);
    deps.sendSkillHits(skill.id, [{ mobId: target.id, dmg }]);
    if (skill.projectile) {
      spawnProjectile(playerPos, target.mesh.position, skill.fx);
    } else {
      spawnRing(target.mesh.position, skill.fx, 1.4);
    }
  } else if (skill.type === 'multi') {
    const target = deps.getTarget();
    if (!target || target.dead) { toast('Selecciona un objetivo (clic sobre la criatura)'); return; }
    const d = playerPos.distanceTo(target.mesh.position);
    if (d > skill.range) { toast('Demasiado lejos'); return; }
    const dmg = Math.round(deps.getBaseDamage() * skill.dmgMul);
    deps.sendSkillHits(skill.id, Array.from({ length: skill.hits }, () => ({ mobId: target.id, dmg })));
    for (let n = 0; n < skill.hits; n++) {
      setTimeout(() => spawnProjectile(deps.getPlayerPos(), target.mesh.position, skill.fx), n * 110);
    }
  } else if (skill.type === 'aoe') {
    const targets = deps.getMobsInRadius(skill.radius);
    if (targets.length === 0 && !skill.heal) { toast('No hay enemigos cerca'); return; }
    const dmg = Math.round(deps.getBaseDamage() * skill.dmgMul);
    // Un único mensaje por lanzamiento: el servidor cobra una vez y aplica el
    // daño y, si la habilidad cura (Nova), también la cura. Puede ir sin
    // objetivos si cura.
    deps.sendSkillHits(skill.id, targets.map((t) => ({ mobId: t.id, dmg })));
    spawnRing(playerPos, skill.fx, skill.radius);
  } else if (skill.type === 'heal') {
    deps.castHeal(skill.id); // la cura la aplica el servidor
    if (skill.allyHeal) deps.healAlly?.(skill.heal);
    spawnRing(playerPos, skill.fx, 2.2);
  } else if (skill.type === 'buff') {
    // El servidor cobra el recurso y aplica la armadura; aquí solo queda el
    // estado local para el brillo de la casilla y la velocidad.
    deps.castBuff?.(skill.id);
    if (skill.buff.armor) {
      buffs.armor = clockTime + skill.buff.dur;
      buffValues.armor = skill.buff.armor;
    }
    if (skill.buff.speed) { buffs.speed = clockTime + skill.buff.dur; buffValues.speed = skill.buff.speed; }
    toast(`${skill.icon} ${skill.name} — ${skill.desc}`);
    spawnRing(playerPos, skill.fx, 2.2);
  }

  deps.swingArm?.();
  play(skill.type === 'heal' ? 'heal' : 'skill');
  cooldowns[i] = effectiveCd(skill);
}

// Bonificaciones activas por habilidad
export function skillArmorBonus() { return buffs.armor > clockTime ? buffValues.armor : 0; }
export function skillSpeedMul() { return buffs.speed > clockTime ? 1 + buffValues.speed : 1; }

// ---- Efectos visuales ----
const effects = [];

function spawnRing(pos, color, maxRadius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.6, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.12, pos.z);
  deps.scene.add(ring);
  effects.push({ kind: 'ring', mesh: ring, life: 0.45, maxLife: 0.45, maxScale: maxRadius / 0.6 });
}

function spawnProjectile(from, to, color) {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  );
  orb.position.set(from.x, 1.4, from.z);
  deps.scene.add(orb);
  effects.push({
    kind: 'projectile', mesh: orb, life: 0.18, maxLife: 0.18,
    from: from.clone().setY(1.4), to: to.clone().setY(1.2),
  });
}

// ---- Actualización por frame ----
export function updateSkills(dt, time) {
  clockTime = time;

  for (let i = 0; i < mySkills.length; i++) {
    if (cooldowns[i] > 0) cooldowns[i] = Math.max(0, cooldowns[i] - dt);
  }
  renderBar();

  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.life -= dt;
    const t = 1 - fx.life / fx.maxLife;
    if (fx.kind === 'ring') {
      fx.mesh.scale.setScalar(1 + t * (fx.maxScale - 1));
      fx.mesh.material.opacity = 0.9 * (1 - t);
    } else {
      fx.mesh.position.lerpVectors(fx.from, fx.to, Math.min(1, t));
    }
    if (fx.life <= 0) {
      deps.scene.remove(fx.mesh);
      fx.mesh.geometry.dispose();
      fx.mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
}

function renderBar() {
  const bar = document.getElementById('skill-bar');
  if (!bar) return;
  mySkills.forEach((skill, i) => {
    const slot = bar.children[i];
    if (!slot) return;
    const cdEl = slot.querySelector('.skill-cd');
    if (cooldowns[i] > 0) {
      cdEl.classList.remove('hidden');
      const text = cooldowns[i] >= 1 ? Math.ceil(cooldowns[i]) : cooldowns[i].toFixed(1);
      if (cdEl.textContent !== String(text)) cdEl.textContent = text;
    } else {
      cdEl.classList.add('hidden');
    }
    // Resplandor mientras la mejora de esta habilidad está activa
    const buffed = skill.type === 'buff' &&
      ((skill.buff.armor && buffs.armor > clockTime) || (skill.buff.speed && buffs.speed > clockTime));
    slot.classList.toggle('buff-active', !!buffed);
    // Atenuada si no llega el recurso para lanzarla
    slot.classList.toggle('no-resource', (skill.cost || 0) > (deps.getResource?.() ?? Infinity));
  });
}
