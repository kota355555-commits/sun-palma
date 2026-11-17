// Sun Palma — traffic and pedestrians, rewritten for the revision pass: cars
// cruise the road grid and turn at intersections, braking for the car ahead
// and slowing in the rain; pedestrians stroll the sidewalks and run from
// danger. A truck and a coupe join the flow so the streets show every kind.

import * as THREE from 'three';
import { CITY, COLORS, STREETS } from './config.js';
import { mulberry32, pick, range } from './random.js';
import { createCar, driveCar, collideCarBuildings, collideCars } from './vehicles.js';
import { snapToRoad, onRoad, randomStreetPoint } from './world.js';

// A pedestrian from a parts table: torso, head, legs and arms, with the
// limbs kept so the walk step can swing them.
function makePedestrianModel(shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const parts = [
    { geo: [0.55, 0.75, 0.32], mat: shirt, at: [0, 1.05, 0], shadow: true },
    { geo: [0.34, 0.34, 0.32], mat: skin, at: [0, 1.62, 0] },
    { geo: [0.2, 0.7, 0.22], mat: pants, at: [-0.14, 0.35, 0], limb: 'legL' },
    { geo: [0.2, 0.7, 0.22], mat: pants, at: [0.14, 0.35, 0], limb: 'legR' },
    { geo: [0.14, 0.6, 0.16], mat: shirt, at: [-0.36, 1.05, 0], limb: 'armL' },
    { geo: [0.14, 0.6, 0.16], mat: shirt, at: [0.36, 1.05, 0], limb: 'armR' },
  ];
  const limbs = {};
  for (const p of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.geo), p.mat);
    mesh.position.set(...p.at);
    if (p.shadow) mesh.castShadow = true;
    if (p.limb) limbs[p.limb] = mesh;
    g.add(mesh);
  }
  g.userData = { ...limbs, phase: Math.random() * 6 };
  return g;
}

export function createTraffic(scene, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const parked = spawnParkedCars(scene, rng);
  const cars = spawnMovingCars(scene, rng);
  const peds = spawnPedestrians(scene, rng);
  return { cars, peds, parked };
}

// The two parking lots (blocks (3,-2) and (-2,2)): ten parked cars, one box
// truck and one coupe among the sedans, so the player can steal a different
// drive without waiting for traffic.
function spawnParkedCars(scene, rng) {
  const parked = [];
  const lotSpots = [
    { x: 178, z: -70 }, { x: 189, z: -70 }, { x: 200, z: -70 }, { x: 178, z: -92 }, { x: 189, z: -92 },
    { x: -90, z: 125 }, { x: -79, z: 125 }, { x: -68, z: 125 }, { x: -90, z: 145 }, { x: -79, z: 145 },
  ];
  lotSpots.forEach((spot, si) => {
    const kind = si === 2 ? 'truck' : si === 7 ? 'sport' : 'sedan';
    const car = createCar({
      x: spot.x, z: spot.z,
      heading: rng() < 0.5 ? 0 : Math.PI / 2,
      color: pick(rng, COLORS.carPalette),
      parked: true,
      kind,
    });
    scene.add(car.group);
    parked.push(car);
  });
  return parked;
}

// Fourteen cars cruising the grid: each follows a street and turns at
// intersections, a truck and a coupe among the sedans.
function spawnMovingCars(scene, rng) {
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const p = randomStreetPoint(rng, CITY.extent - 20);
    const alongX = Math.abs(p.x - Math.round(p.x / CITY.pitch) * CITY.pitch) < 1;
    const kind = i === 3 ? 'truck' : i === 8 ? 'sport' : 'sedan';
    const car = createCar({
      x: p.x, z: p.z,
      heading: alongX ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      color: pick(rng, COLORS.carPalette),
      kind,
    });
    car.speed = kind === 'truck' ? range(rng, 5, 8) : kind === 'sport' ? range(rng, 8, 13) : range(rng, 6, 11);
    car.cruise = car.speed;
    car.nextTurn = range(rng, 4, 20);
    scene.add(car.group);
    cars.push(car);
  }
  return cars;
}

// Twenty-six pedestrians on the sidewalks, nudged off the road centre.
function spawnPedestrians(scene, rng) {
  const peds = [];
  const pedColors = [0xe8b48a, 0x7fa3a1, 0xd23b2e, 0x3aa655, 0xf2c230, 0x7a4fd0, 0xe8e8e8];
  for (let i = 0; i < 26; i++) {
    const p = randomStreetPoint(rng, CITY.extent - 10);
    const g = makePedestrianModel(pick(rng, pedColors));
    const onXStreet = Math.abs(p.x - Math.round(p.x / CITY.pitch) * CITY.pitch) < 1;
    const px = onXStreet ? p.x + (rng() < 0.5 ? 9 : -9) : p.x;
    const pz = onXStreet ? p.z : p.z + (rng() < 0.5 ? 9 : -9);
    g.position.set(px, 0, pz);
    scene.add(g);
    peds.push({
      group: g, x: px, z: pz,
      heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2),
      flee: 0, // seconds of fleeing
      walkPhase: rng() * 6,
      retarget: range(rng, 2, 8),
    });
  }
  return peds;
}

// Distance along the current heading to the next intersection.
function distanceToIntersection(x, z) {
  let best = Infinity;
  for (const s of STREETS) {
    const d = Math.abs(s - x);
    if (d > 0.1 && d < best) best = d;
    const d2 = Math.abs(s - z);
    if (d2 > 0.1 && d2 < best) best = d2;
  }
  return best;
}

// One traffic car: brake for the car ahead, turn at an intersection when its
// timer runs out, otherwise cruise its street.
function driveTrafficCar(car, dt, allCars, pace) {
  car.nextTurn -= dt;
  let targetSpeed = car.cruise * pace;
  for (const other of allCars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (ahead > 0 && ahead < 12 && side < 2.2) { targetSpeed = 0; break; }
  }
  if (targetSpeed === 0) {
    car.speed = Math.max(0, car.speed - 18 * dt);
  } else {
    car.speed += (car.cruise * pace - car.speed) * Math.min(1, 2 * dt);
  }
  if (car.nextTurn <= 0 && distanceToIntersection(car.x, car.z) < 8) {
    car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    const snapped = snapToRoad(car.x, car.z);
    car.x = snapped.x;
    car.z = snapped.z;
    car.nextTurn = range(Math.random, 6, 22);
  }
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  if (onRoad(nx, nz)) {
    car.x = nx;
    car.z = nz;
  } else {
    // wandered off the grid: snap back to the road
    const snapped = snapToRoad(car.x, car.z);
    car.x = snapped.x;
    car.z = snapped.z;
  }
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
}

// One pedestrian: stroll and change direction now and then, or sprint away
// from the player while fleeing.
function walkPedestrian(ped, dt, playerPos, dangerAt) {
  ped.retarget -= dt;
  const dx = ped.x - playerPos.x;
  const dz = ped.z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dangerAt && dist < 14) ped.flee = 2.5;
  if (ped.flee > 0) {
    ped.flee -= dt;
    ped.heading = Math.atan2(dx, dz);
    ped.speed = 5.5;
  } else {
    ped.speed += (1.6 - ped.speed) * Math.min(1, dt);
    if (ped.retarget <= 0) {
      ped.heading += (Math.random() - 0.5) * 1.6;
      ped.retarget = range(Math.random, 3, 9);
    }
  }
  ped.x += Math.sin(ped.heading) * ped.speed * dt;
  ped.z += Math.cos(ped.heading) * ped.speed * dt;
  ped.x = Math.max(-CITY.extent, Math.min(CITY.extent, ped.x));
  ped.z = Math.max(-CITY.extent, Math.min(CITY.extent + 40, ped.z));
  ped.group.position.set(ped.x, 0, ped.z);
  ped.group.rotation.y = ped.heading;
  ped.walkPhase += dt * ped.speed * 2.2;
  const swing = Math.sin(ped.walkPhase) * 0.55;
  ped.group.userData.legL.rotation.x = swing;
  ped.group.userData.legR.rotation.x = -swing;
  ped.group.userData.armL.rotation.x = -swing * 0.7;
  ped.group.userData.armR.rotation.x = swing * 0.7;
}

// One traffic step: cars cruise their street, pedestrians stroll and flee.
// pace (1 dry, lower in rain) slows every cruise speed down.
export function stepTraffic(traffic, dt, playerPos, dangerAt, colliders, allCars, pace = 1) {
  const { cars, peds } = traffic;

  for (const car of cars) {
    if (car.parked) continue;
    driveTrafficCar(car, dt, allCars, pace);
    collideCarBuildings(car, colliders);
  }

  for (const ped of peds) {
    walkPedestrian(ped, dt, playerPos, dangerAt);
  }

  // car-car collisions among traffic (only traffic vs traffic; the player car
  // is handled by the caller)
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      collideCars(cars[i], cars[j]);
    }
  }
  void driveCar;
}

export { THREE };
