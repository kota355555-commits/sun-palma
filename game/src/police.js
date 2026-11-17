// Sun Palma — the wanted system, rebuilt: heat and stars as before, but the
// pursuit is run by a director that hands each cruiser a job. Chasers hunt the
// player with intercept steering and a PIT move when they draw alongside;
// blockers park across the road ahead and form a roadblock at three stars and
// up; and when the player is slow and on foot, the PD closes in for the bust.

import * as THREE from 'three';
import { POLICE, WANTED_THRESHOLDS } from './config.js';
import { createCar, driveCar, collideCarBuildings } from './vehicles.js';
import { randomStreetPoint, snapToRoad } from './world.js';

export function starsFromHeat(heat) {
  let stars = 0;
  WANTED_THRESHOLDS.forEach((cut, i) => {
    if (heat >= cut) stars = i;
  });
  return stars;
}

export function createPolice(scene) {
  return {
    cars: [],
    spawnTimer: 0,
    bustTimer: 0,
    roadblockTimer: 8,
    roadblocks: [], // { cars: [cruiser, cruiser], until: seconds left }
    pitTimer: 0,
  };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Steer toward a point, with a little look-ahead so the cruiser cuts the
// corner instead of tailing the player's exact bumper.
function steerToward(car, tx, tz, dt, aggression) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const want = Math.atan2(dx, dz);
  const diff = wrapAngle(want - car.heading);
  const steer = THREE.MathUtils.clamp(diff * 1.8, -1, 1);
  driveCar(car, { throttle: 1, steer, brake: false }, dt);
  return Math.hypot(dx, dz);
}

// A cruiser stuck nose-first into a building backs out instead of pushing.
function unstuck(car, dt, colliders) {
  if (car.speed > 0.5) return;
  driveCar(car, { throttle: -0.7, steer: 0.6, brake: false }, dt * 0.6);
  collideCarBuildings(car, colliders);
}

// Flash the roof bar red/blue.
function flashBar(car, dt) {
  car.sirenPhase += dt * 10;
  const bar = car.group.userData.lightBar;
  if (!bar) return;
  const on = Math.sin(car.sirenPhase) > 0;
  bar.children[0].material.color.setHex(on ? 0xff2020 : 0x551010);
  bar.children[1].material.color.setHex(on ? 0x101055 : 0x2040ff);
}

// Park two cruisers across the road ahead of the player: one on the street
// line, one offset, both facing the oncoming player. They hold until the
// player gets close or the timer runs out, then rejoin the chase.
function layRoadblock(police, scene, state, rng) {
  const heading = state.playerCar ? state.playerCar.heading : state.playerPos.heading ?? 0;
  const px = state.playerCar ? state.playerCar.x : state.playerPos.x;
  const pz = state.playerCar ? state.playerCar.z : state.playerPos.z;
  const ahead = 46 + rng() * 22;
  const cx = px + Math.sin(heading) * ahead;
  const cz = pz + Math.cos(heading) * ahead;
  const snapped = snapToRoad(cx, cz);
  const blockers = [];
  for (const side of [-1, 1]) {
    const car = createCar({
      x: snapped.x + Math.cos(heading) * side * 4.5,
      z: snapped.z - Math.sin(heading) * side * 4.5,
      heading: heading + Math.PI,
      color: 0x1a1d24,
      police: true,
      kind: 'cruiser',
    });
    car.speed = 0;
    car.role = 'block';
    car.hold = 14;
    scene.add(car.group);
    police.cars.push(car);
    blockers.push(car);
  }
  police.roadblocks.push({ cars: blockers, until: 14 });
  police.roadblockTimer = 16 + rng() * 8;
}

// Bring one fresh cruiser in on a street near the player.
function spawnCruiser(police, scene, state, rng) {
  const p = randomStreetPoint(rng, 200);
  const car = createCar({
    x: state.playerPos.x + (p.x - state.playerPos.x) * 0.4 + (rng() - 0.5) * 60,
    z: state.playerPos.z + (p.z - state.playerPos.z) * 0.4 + (rng() - 0.5) * 60,
    heading: rng() * Math.PI * 2,
    color: 0x1a1d24,
    police: true,
    kind: 'cruiser',
  });
  car.speed = 12;
  car.role = 'chase';
  scene.add(car.group);
  police.cars.push(car);
}

// Busted check: a cruiser sitting on a slow player on foot for a while.
function checkBusted(police, state, stars, playerSpeed, dt) {
  if (stars === 0 || playerSpeed >= 2 || state.playerCar) {
    police.bustTimer = 0;
    return false;
  }
  let near = 0;
  for (const car of police.cars) {
    if (Math.hypot(car.x - state.playerPos.x, car.z - state.playerPos.z) < 4) near++;
  }
  if (near === 0) {
    police.bustTimer = 0;
    return false;
  }
  police.bustTimer += dt;
  return police.bustTimer > 2.5;
}

// Heat cools off only when nobody is near and no crime is fresh.
function coolHeat(police, state, dt) {
  let nearest = Infinity;
  for (const car of police.cars) {
    nearest = Math.min(nearest, Math.hypot(car.x - state.playerPos.x, car.z - state.playerPos.z));
  }
  if (state.heat > 0 && state.timeSinceCrime > 8 && nearest > 60) {
    state.heat = Math.max(0, state.heat - 6 * dt);
  }
}
function tryPit(police, car, state, dt) {
  if (!state.playerCar || police.pitTimer > 0) return false;
  const target = state.playerCar;
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 5.5 || Math.abs(target.speed) < 12) return false;
  // only when roughly alongside, not head-on or tailing
  const alongside = Math.abs(dx * Math.cos(target.heading) - dz * Math.sin(target.heading));
  if (alongside < 2.2 || alongside > 6) return false;
  police.pitTimer = 2.2;
  car.pitTarget = target;
  car.role = 'pit';
  return true;
}

function doPit(police, car, state, dt) {
  const target = car.pitTarget;
  if (!target) {
    car.role = 'chase';
    return;
  }
  // aim at the player's rear quarter, then lean in
  const rearX = target.x - Math.sin(target.heading) * 2.5;
  const rearZ = target.z - Math.cos(target.heading) * 2.5;
  steerToward(car, rearX, rearZ, dt, 1);
  const d = Math.hypot(target.x - car.x, target.z - car.z);
  if (d < 3.4) {
    const push = 9 * dt;
    const side = Math.sign((target.x - car.x) * Math.cos(target.heading) - (target.z - car.z) * Math.sin(target.heading)) || 1;
    target.x += Math.cos(target.heading) * side * push;
    target.z -= Math.sin(target.heading) * side * push;
    target.heading += side * 0.12 * dt * 10;
    target.speed *= 1 - 0.5 * dt;
    state.damageCar?.(3 * dt);
  }
  car.pitHold = (car.pitHold || 0) + dt;
  if (car.pitHold > 1.6) {
    car.role = 'chase';
    car.pitHold = 0;
    car.pitTarget = null;
  }
}

// One police step. Returns 'busted' when the PD sits on a slow, on-foot
// player long enough. state: { heat, playerPos, playerCar, playerSpeed,
// timeSinceCrime, damagePlayer, damageCar }.
export function stepPolice(police, scene, state, dt, colliders, rng) {
  const stars = starsFromHeat(state.heat);
  const want = stars === 0 ? 0 : Math.min(POLICE.maxActive, stars + 1);
  police.spawnTimer -= dt;
  police.pitTimer = Math.max(0, police.pitTimer - dt);

  // fresh cruisers arrive on a street near the player
  if (police.cars.length < want && police.spawnTimer <= 0) {
    spawnCruiser(police, scene, state, rng);
    police.spawnTimer = 2.5;
  }

  // roadblocks at three stars and up, on a timer
  police.roadblockTimer -= dt;
  if (stars >= 3 && police.roadblockTimer <= 0 && police.roadblocks.length < 1) {
    layRoadblock(police, scene, state, rng);
  }

  const target = state.playerCar
    ? { x: state.playerCar.x, z: state.playerCar.z }
    : state.playerPos;
  const playerSpeed = state.playerCar ? Math.abs(state.playerCar.speed) : state.playerSpeed;

  for (const car of [...police.cars]) {
    if (car.role === 'block') {
      car.hold -= dt;
      flashBar(car, dt);
      const near = Math.hypot(target.x - car.x, target.z - car.z);
      if (car.hold <= 0 || near < 12) {
        car.role = 'chase';
        car.hold = 0;
        police.roadblocks = police.roadblocks.filter((r) => !r.cars.includes(car));
      }
      continue;
    }
    if (car.role === 'pit') {
      doPit(police, car, state, dt);
      flashBar(car, dt);
      collideCarBuildings(car, colliders);
      continue;
    }

    // chase: aim at where the player will be, not where they are
    const lead = Math.min(1.2, playerSpeed * 0.06);
    const px = target.x + Math.sin(state.playerCar ? state.playerCar.heading : 0) * lead * 8;
    const pz = target.z + Math.cos(state.playerCar ? state.playerCar.heading : 0) * lead * 8;
    const dist = steerToward(car, px, pz, dt, 1);
    unstuck(car, dt, colliders);
    collideCarBuildings(car, colliders);
    flashBar(car, dt);

    // try a PIT when alongside a fast player car
    if (state.playerCar && dist < 7) tryPit(police, car, state, dt);

    // ramming: a cruiser on the bumper hurts
    if (dist < 3.2) {
      state.damagePlayer?.(POLICE.ramDamage * dt * 4, 'ram');
      if (state.playerCar) state.damageCar?.(6 * dt);
    }
    // cruisers give up and leave when the heat is gone
    if (stars === 0 && dist > POLICE.despawnDistance) {
      scene.remove(car.group);
      police.cars.splice(police.cars.indexOf(car), 1);
    }
  }

  // busted: a cruiser on top of a slow player on foot
  const busted = checkBusted(police, state, stars, playerSpeed, dt);

  coolHeat(police, state, dt);
  return busted ? 'busted' : null;
}

export function clearPolice(police, scene) {
  for (const car of police.cars) scene.remove(car.group);
  police.cars.length = 0;
  police.roadblocks.length = 0;
  police.bustTimer = 0;
  police.roadblockTimer = 8;
  police.pitTimer = 0;
}

// Roadblock cruisers still holding their line, for the HUD and minimap.
export function activeRoadblocks(police) {
  const out = [];
  for (const car of police.cars) {
    if (car.role === 'block') out.push({ x: car.x, z: car.z });
  }
  return out;
}
