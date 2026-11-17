// Sun Palma — combat: a pistol with hitscan shots, tracers, muzzle flash, reload,
// and damage to police cars (which smoke as they take hits).
import * as THREE from 'three';

export function createCombat(scene, camera) {
  const raycaster = new THREE.Raycaster();
  const tracerGeo = new THREE.BufferGeometry();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  const flash = new THREE.PointLight(0xffc861, 0, 14, 2);
  scene.add(flash);
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
  return {
    scene, camera, raycaster, tracer, flash, smokeMat,
    ammo: 12, magSize: 12,
    reloading: 0,
    cooldown: 0,
    tracerTimer: 0,
    smokes: [],
  };
}

function rayAABB(origin, dir, box) {
  // Slab test; returns distance or Infinity.
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box['min' + axis.toUpperCase()];
    const hi = box['max' + axis.toUpperCase()];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Fire one hitscan shot from the camera centre. targets: police cars (with group).
// colliders: building AABBs (block the shot). Returns what was hit, if anything.
export function shoot(combat, playerPos, policeCars, colliders, onDamage) {
  if (combat.cooldown > 0 || combat.reloading > 0 || combat.ammo <= 0) return null;
  combat.ammo -= 1;
  combat.cooldown = 0.22;
  const origin = combat.camera.position.clone();
  const dir = new THREE.Vector3();
  combat.camera.getWorldDirection(dir);
  const muzzle = origin.clone().addScaledVector(dir, 1.2);
  muzzle.y -= 0.25;

  // nearest building block
  let blockDist = Infinity;
  for (const c of colliders) {
    const box = { minX: c.minX, maxX: c.maxX, minY: 0, maxY: 60, minZ: c.minZ, maxZ: c.maxZ };
    const t = rayAABB(origin, dir, box);
    if (t < blockDist) blockDist = t;
  }
  // nearest police car (sphere around its centre)
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
  const end = origin.clone().addScaledVector(dir, endDist);
  combat.tracer.geometry.setFromPoints([muzzle, end]);
  combat.tracer.visible = true;
  combat.tracerTimer = 0.07;
  combat.flash.position.copy(muzzle);
  combat.flash.intensity = 60;
  if (hitCar && hitDist < blockDist) {
    hitCar.health -= 20;
    hitCar.smoke = Math.min(1, hitCar.smoke + 0.35);
    onDamage?.(hitCar, end);
    if (hitCar.health <= 0) {
      hitCar.dead = true;
    }
    return { type: 'police', car: hitCar, point: end };
  }
  if (blockDist < 90) return { type: 'wall', point: end };
  return { type: 'miss', point: end };
}

export function stepCombat(combat, dt) {
  combat.cooldown = Math.max(0, combat.cooldown - dt);
  if (combat.reloading > 0) {
    combat.reloading -= dt;
    if (combat.reloading <= 0) combat.ammo = combat.magSize;
  }
  if (combat.tracerTimer > 0) {
    combat.tracerTimer -= dt;
    if (combat.tracerTimer <= 0) combat.tracer.visible = false;
  }
  combat.flash.intensity = Math.max(0, combat.flash.intensity - dt * 500);
  // smoke puffs on damaged police cars
  for (const s of combat.smokes) {
    s.position.y += dt * 2;
    s.material.opacity = Math.max(0, s.material.opacity - dt * 0.4);
    if (s.material.opacity <= 0) {
      combat.scene.remove(s);
      combat.smokes.splice(combat.smokes.indexOf(s), 1);
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
  if (combat.ammo < combat.magSize && combat.reloading <= 0) {
    combat.reloading = 1.1;
    return true;
  }
  return false;
}
