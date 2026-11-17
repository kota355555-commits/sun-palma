// Sun Palma — the wanted system: heat from crimes, stars, Palma PD pursuit cars
// that chase, ram and try to box the player in, plus busted / evade outcomes.
import * as THREE from 'three';
import { POLICE, WANTED_THRESHOLDS } from './config.js';
import { createCar, driveCar, collideCarBuildings } from './vehicles.js';
import { randomStreetPoint } from './world.js';

export function starsFromHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i++) {
    if (heat >= WANTED_THRESHOLDS[i]) stars = i;
  }
  return stars;
}

export function createPolice(scene) {
  return { cars: [], spawnTimer: 0, sirenTimer: 0 };
}

// Steer a chaser toward a target point with simple pursuit + obstacle nudge.
function chaseStep(car, target, dt, colliders) {
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wantHeading = Math.atan2(dx, dz);
  let diff = wantHeading - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = THREE.MathUtils.clamp(diff * 1.6, -1, 1);
  const throttle = dist > 6 ? 1 : 0.4;
  driveCar(car, { throttle, steer, brake: false }, dt);
  // if stuck against a building, reverse out
  if (car.speed < 0.5 && dist > 10) {
    driveCar(car, { throttle: -0.6, steer: -steer, brake: false }, dt * 0.5);
  }
  collideCarBuildings(car, colliders);
  // light bar flash
  car.sirenPhase += dt * 10;
  const bar = car.group.userData.lightBar;
  if (bar) {
    bar.children[0].material.color.setHex(Math.sin(car.sirenPhase) > 0 ? 0xff2020 : 0x551010);
    bar.children[1].material.color.setHex(Math.sin(car.sirenPhase) > 0 ? 0x101055 : 0x2040ff);
  }
  return dist;
}

// One police step. Returns 'busted' when a cruiser sits on the player, else null.
// state: { heat, playerPos, playerCar, playerSpeed, time }
export function stepPolice(police, scene, state, dt, colliders, rng) {
  const stars = starsFromHeat(state.heat);
  const want = stars === 0 ? 0 : Math.min(POLICE.maxActive, stars + 1);
  police.spawnTimer -= dt;
  if (police.cars.length < want && police.spawnTimer <= 0) {
    // spawn on a street near the player, ahead of their travel
    const p = randomStreetPoint(rng, 200);
    const car = createCar({ x: state.playerPos.x + (p.x - state.playerPos.x) * 0.4 + (rng() - 0.5) * 60, z: state.playerPos.z + (p.z - state.playerPos.z) * 0.4 + (rng() - 0.5) * 60, heading: rng() * Math.PI * 2, color: 0x1a1d24, police: true });
    car.speed = 12;
    scene.add(car.group);
    police.cars.push(car);
    police.spawnTimer = 2.5;
  }
  let busted = false;
  const target = state.playerCar ? { x: state.playerCar.x, z: state.playerCar.z } : state.playerPos;
  for (const car of police.cars) {
    const dist = chaseStep(car, target, dt, colliders);
    // ramming the player
    if (dist < 3.2) {
      state.damagePlayer?.(POLICE.ramDamage * dt * 4, 'ram');
      if (state.playerCar) state.damageCar?.(6 * dt);
    }
    // despawn far away when the heat is gone
    if (stars === 0 && dist > POLICE.despawnDistance) {
      scene.remove(car.group);
      police.cars.splice(police.cars.indexOf(car), 1);
    }
  }
  // busted: a cruiser is on top of a slow player for a while
  if (stars > 0 && state.playerSpeed < 2 && !state.playerCar) {
    let near = 0;
    for (const car of police.cars) {
      if (Math.hypot(car.x - state.playerPos.x, car.z - state.playerPos.z) < 4) near++;
    }
    if (near >= 1) {
      police.bustTimer = (police.bustTimer || 0) + dt;
      if (police.bustTimer > 2.5) busted = true;
    } else {
      police.bustTimer = 0;
    }
  } else {
    police.bustTimer = 0;
  }
  // heat decay: no crime and no cruiser nearby
  let nearest = Infinity;
  for (const car of police.cars) {
    nearest = Math.min(nearest, Math.hypot(car.x - state.playerPos.x, car.z - state.playerPos.z));
  }
  if (state.heat > 0 && state.timeSinceCrime > 8 && nearest > 60) {
    state.heat = Math.max(0, state.heat - 6 * dt);
  }
  return busted ? 'busted' : null;
}

export function clearPolice(police, scene) {
  for (const car of police.cars) scene.remove(car.group);
  police.cars.length = 0;
  police.bustTimer = 0;
}
