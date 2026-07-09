// Habilidades por especialización: barra central estilo Diablo/WoW (teclas 1-3),
// con enfriamientos, mejoras temporales y efectos visuales sencillos.
// El daño lo valida el servidor a través del mensaje skill_hits.
import * as THREE from 'three';
import { toast, showTooltip, hideTooltip } from './ui.js';

export const SKILLS = {
  guerrero: [
    {
      id: 'golpe', name: 'Golpe Poderoso', icon: '💥', cd: 6,
      desc: '250% de daño al objetivo. Cuerpo a cuerpo (3,5 m).',
      type: 'target', range: 3.5, dmgMul: 2.5, fx: 0xffaa33,
    },
    {
      id: 'torbellino', name: 'Torbellino', icon: '🌀', cd: 10,
      desc: 'Giras el acero: 150% de daño a los enemigos a 5 m.',
      type: 'aoe', radius: 5, dmgMul: 1.5, fx: 0xffcc55,
    },
    {
      id: 'grito', name: 'Grito de Guerra', icon: '🛡️', cd: 20,
      desc: '+5 de armadura durante 8 s.',
      type: 'buff', buff: { armor: 5, dur: 8 }, fx: 0xffd97a,
    },
    {
      id: 'ejecucion', name: 'Ejecución', icon: '⚔️', cd: 12,
      desc: '350% de daño al objetivo. Cuerpo a cuerpo (3,5 m).',
      type: 'target', range: 3.5, dmgMul: 3.5, fx: 0xff5533,
      unlockable: true,
    },
  ],
  explorador: [
    {
      id: 'certero', name: 'Disparo Certero', icon: '🎯', cd: 5,
      desc: 'Disparo a 15 m: 200% de daño.',
      type: 'target', range: 15, dmgMul: 2, projectile: true, fx: 0x9ee85a,
    },
    {
      id: 'dagas', name: 'Lluvia de Dagas', icon: '🔪', cd: 12,
      desc: '100% de daño a todos los enemigos a 6 m.',
      type: 'aoe', radius: 6, dmgMul: 1, fx: 0x9ee85a,
    },
    {
      id: 'sprint', name: 'Sprint', icon: '💨', cd: 15,
      desc: '+80% de velocidad durante 4 s.',
      type: 'buff', buff: { speed: 0.8, dur: 4 }, fx: 0xaaffcc,
    },
    {
      id: 'descarga', name: 'Descarga Múltiple', icon: '🌠', cd: 10,
      desc: '3 disparos seguidos del 70% de daño cada uno (15 m).',
      type: 'multi', range: 15, hits: 3, dmgMul: 0.7, projectile: true, fx: 0xc8ff8a,
      unlockable: true,
    },
  ],
  sacerdote: [
    {
      id: 'palabra', name: 'Palabra Sagrada', icon: '✨', cd: 8,
      desc: 'Restaura 40 de vida, a ti y al aliado más cercano (12 m).',
      type: 'heal', heal: 40, allyHeal: true, fx: 0x7fe8a8,
    },
    {
      id: 'castigo', name: 'Castigo', icon: '🌟', cd: 6,
      desc: 'Luz abrasadora a 12 m: 180% de daño.',
      type: 'target', range: 12, dmgMul: 1.8, projectile: true, fx: 0xffe98a,
    },
    {
      id: 'nova', name: 'Nova Sagrada', icon: '💫', cd: 14,
      desc: '120% de daño a 5 m y +15 de vida.',
      type: 'aoe', radius: 5, dmgMul: 1.2, heal: 15, fx: 0xd8c8ff,
    },
    {
      id: 'escudo_fe', name: 'Escudo de Fe', icon: '🔆', cd: 18,
      desc: '+6 de armadura durante 6 s.',
      type: 'buff', buff: { armor: 6, dur: 6 }, fx: 0xfff0b0,
      unlockable: true,
    },
  ],
};

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

  const playerPos = deps.getPlayerPos();

  if (skill.type === 'target') {
    const target = deps.getTarget();
    if (!target || target.dead) { toast('Selecciona un objetivo (clic sobre la criatura)'); return; }
    const d = playerPos.distanceTo(target.mesh.position);
    if (d > skill.range) { toast('Demasiado lejos'); return; }
    const dmg = Math.round(deps.getBaseDamage() * skill.dmgMul);
    deps.sendSkillHits([{ mobId: target.id, dmg }]);
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
    deps.sendSkillHits(Array.from({ length: skill.hits }, () => ({ mobId: target.id, dmg })));
    for (let n = 0; n < skill.hits; n++) {
      setTimeout(() => spawnProjectile(deps.getPlayerPos(), target.mesh.position, skill.fx), n * 110);
    }
  } else if (skill.type === 'aoe') {
    const targets = deps.getMobsInRadius(skill.radius);
    if (targets.length === 0 && !skill.heal) { toast('No hay enemigos cerca'); return; }
    const dmg = Math.round(deps.getBaseDamage() * skill.dmgMul);
    if (targets.length > 0) {
      deps.sendSkillHits(targets.map((t) => ({ mobId: t.id, dmg })));
    }
    if (skill.heal) deps.healSelf(skill.heal);
    spawnRing(playerPos, skill.fx, skill.radius);
  } else if (skill.type === 'heal') {
    deps.healSelf(skill.heal);
    if (skill.allyHeal) deps.healAlly?.(skill.heal);
    spawnRing(playerPos, skill.fx, 2.2);
  } else if (skill.type === 'buff') {
    if (skill.buff.armor) { buffs.armor = clockTime + skill.buff.dur; buffValues.armor = skill.buff.armor; }
    if (skill.buff.speed) { buffs.speed = clockTime + skill.buff.dur; buffValues.speed = skill.buff.speed; }
    toast(`${skill.icon} ${skill.name} — ${skill.desc}`);
    spawnRing(playerPos, skill.fx, 2.2);
  }

  deps.swingArm?.();
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
  });
}
