// Sun Palma — combat, rebuilt: four weapons instead of one pistol. Fists are
// always with you; the pistol, the shotgun and the SMG are picked up in the
// city (press 1/2/3 or Q to swap). Each weapon has its own damage, range,
// magazine and feel: the shotgun throws a spread of pellets, the SMG sprays
// fast and light, and every shot still traces, flashes and smokes the same way.

import * as THREE from 'three';
import { WEAPONS } from './config.js';

export function createCombat(scene, camera) {
  const tracerGeo = new THREE.BufferGeometry();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffc861, 0, 14, 2);
  scene.add(flash);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
  // one ammo count per gun; fists never run out
  const ammoByWeapon = {};
  for (const w of WEAPONS) ammoByWeapon[w.id] = w.magSize;
  return {
    scene, camera, tracer, flash, smokeMat,
    weapons: WEAPONS,
    weaponIndex: 1, // start with the pistol
    ammoByWeapon,
    reloading: 0,
    cooldown: 0,
    meleeCooldown: 0,
    tracerTimer: 0,
    smokes: [],
  };
}

export function currentWeapon(combat) {
  return combat.weapons[combat.weaponIndex];
}

export function weaponAmmo(combat) {
  const w = currentWeapon(combat);
  return w.magSize === 0 ? Infinity : combat.ammoByWeapon[w.id];
}

// Swap to a weapon by index (0 fists, 1 pistol, 2 shotgun, 3 SMG).
export function setWeapon(combat, index) {
  if (index < 0 || index >= combat.weapons.length) return false;
  if (index === combat.weaponIndex) return false;
  combat.weaponIndex = index;
  combat.reloading = 0;
  return true;
}

export function cycleWeapon(combat) {
  return setWeapon(combat, (combat.weaponIndex + 1) % combat.weapons.length);
}

// Slab test against one building box; returns the distance or Infinity.
function rayAABB(origin, dir, box) {
  let near = 0;
  let far = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box['min' + axis.toUpperCase()];
    const hi = box['max' + axis.toUpperCase()];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    const tNear = (lo - o) / d;
    const tFar = (hi - o) / d;
    near = Math.max(near, Math.min(tNear, tFar));
    far = Math.min(far, Math.max(tNear, tFar));
    if (near > far) return Infinity;
  }
  return near;
}

// Nearest building the ray would hit: walk every collider and keep the
// smallest slab distance.
function nearestBlocker(origin, dir, colliders) {
  let best = Infinity;
  for (const c of colliders) {
    const t = rayAABB(origin, dir, {
      minX: c.minX, maxX: c.maxX,
      minY: 0, maxY: 60,
      minZ: c.minZ, maxZ: c.maxZ,
    });
    if (t < best) best = t;
  }
  return best;
}

// One pellet's flight: buildings stop it, police cruisers take the damage.
// Returns the closest hit, if any.
function tracePellet(combat, origin, dir, policeCars, colliders) {
  const blockDist = nearestBlocker(origin, dir, colliders);
  let hitCar = null;
  let hitDist = Infinity;
  for (const car of policeCars) {
    const cx = car.x - origin.x;
    const cy = 1 - origin.y;
    const cz = car.z - origin.z;
    const along = cx * dir.x + cy * dir.y + cz * dir.z;
    if (along < 0 || along > 120) continue;
    const px = origin.x + dir.x * along;
    const py = origin.y + dir.y * along;
    const pz = origin.z + dir.z * along;
    const d = Math.hypot(px - car.x, py - 1, pz - car.z);
    if (d < 2.4 && along < hitDist) {
      hitDist = along;
      hitCar = car;
    }
  }
  const endDist = hitCar && hitDist < blockDist ? hitDist : Math.min(blockDist, 90);
  return { hitCar, hitDist, endDist, blockDist };
}

// Fire the current weapon from the camera centre. Fists swing at close range
// instead of shooting. Returns what was hit, if anything.
export function shoot(combat, playerPos, policeCars, colliders, onDamage) {
  const w = currentWeapon(combat);
  if (combat.cooldown > 0 || combat.reloading > 0) return null;
  if (w.magSize > 0 && combat.ammoByWeapon[w.id] <= 0) return null;

  // fists: a short swing, no ammo, no tracer
  if (w.id === 'fists') {
    combat.cooldown = w.cooldown;
    combat.meleeCooldown = 0.3;
    let best = null;
    let bestD = w.range;
    for (const car of policeCars) {
      const d = Math.hypot(car.x - playerPos.x, car.z - playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (best) {
      best.health -= w.damage;
      best.smoke = Math.min(1, best.smoke + 0.3);
      onDamage?.(best, new THREE.Vector3(best.x, 1, best.z));
      if (best.health <= 0) best.dead = true;
      return { type: 'police', car: best, weapon: w.id };
    }
    return { type: 'miss', weapon: w.id };
  }

  combat.ammoByWeapon[w.id] -= 1;
  combat.cooldown = w.cooldown;
  const origin = combat.camera.position.clone();
  const baseDir = new THREE.Vector3();
  combat.camera.getWorldDirection(baseDir);
  const muzzle = origin.clone().addScaledVector(baseDir, 1.2);
  muzzle.y -= 0.25;
  const result = firePellets(combat, origin, baseDir, w, policeCars, colliders, onDamage);
  combat.tracer.geometry.setFromPoints([muzzle, result.farEnd]);
  combat.tracer.visible = true;
  combat.tracerTimer = 0.07;
  combat.flash.position.copy(muzzle);
  combat.flash.intensity = w.id === 'shotgun' ? 110 : 60;
  return result.hit;
}

// Send every pellet downrange with its own spread jitter; returns the
// farthest tracer end and the best hit, if any pellet connected.
function firePellets(combat, origin, baseDir, w, policeCars, colliders, onDamage) {
  let anyHit = null;
  let farEnd = origin.clone().addScaledVector(baseDir, 90);
  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    // spread: jitter the direction a little per pellet
    dir.x += (Math.random() - 0.5) * 2 * w.spread;
    dir.y += (Math.random() - 0.5) * 2 * w.spread;
    dir.z += (Math.random() - 0.5) * 2 * w.spread;
    dir.normalize();
    const { hitCar, hitDist, endDist, blockDist } = tracePellet(combat, origin, dir, policeCars, colliders);
    const end = origin.clone().addScaledVector(dir, endDist);
    if (p === 0) farEnd = end;
    if (hitCar && hitDist < blockDist) {
      hitCar.health -= w.damage;
      hitCar.smoke = Math.min(1, hitCar.smoke + 0.35);
      onDamage?.(hitCar, end);
      if (hitCar.health <= 0) hitCar.dead = true;
      anyHit = { type: 'police', car: hitCar, point: end, weapon: w.id };
    } else if (!anyHit && blockDist < 90) {
      anyHit = { type: 'wall', point: end, weapon: w.id };
    }
  }
  return { hit: anyHit ?? { type: 'miss', point: farEnd, weapon: w.id }, farEnd };
}

export function stepCombat(combat, dt) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  combat.meleeCooldown = Math.max(0, combat.meleeCooldown - dt);
  if (combat.reloading > 0) {
    combat.reloading -= dt;
    if (combat.reloading <= 0) {
      const w = currentWeapon(combat);
      combat.ammoByWeapon[w.id] = w.magSize;
    }
  }
  if (combat.tracerTimer > 0) {
    combat.tracerTimer -= dt;
    if (combat.tracerTimer <= 0) combat.tracer.visible = false;
  }
  combat.flash.intensity = Math.max(0, combat.flash.intensity - dt * 500);
  // smoke puffs rise and fade out, oldest first
  for (let i = combat.smokes.length - 1; i >= 0; i--) {
    const s = combat.smokes[i];
    s.position.y += dt * 2;
    s.material.opacity = Math.max(0, s.material.opacity - dt * 0.4);
    if (s.material.opacity <= 0) {
      combat.scene.remove(s);
      combat.smokes.splice(i, 1);
    }
  }
}

export function addSmoke(combat, car) {
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), combat.smokeMat.clone());
  puff.position.set(car.x, 1.6, car.z);
  combat.scene.add(puff);
  combat.smokes.push(puff);
}

export function reload(combat) {
  const w = currentWeapon(combat);
  if (w.magSize === 0) return false;
  if (combat.ammoByWeapon[w.id] < w.magSize && combat.reloading <= 0) {
    combat.reloading = w.id === 'shotgun' ? 1.6 : 1.1;
    return true;
  }
  return false;
}
