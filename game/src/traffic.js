// Sun Palma — traffic cars that follow the road grid, and pedestrians who walk
// the sidewalks and flee from danger.
import * as THREE from 'three';
import { CITY, COLORS, STREETS } from './config.js';
import { mulberry32, pick, range } from './random.js';
import { createCar, driveCar, collideCarBuildings, collideCars } from './vehicles.js';
import { snapToRoad, onRoad, randomStreetPoint } from './world.js';

function makePedestrianModel(shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.62;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirt);
  armL.position.set(-0.36, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.36;
  g.add(torso, head, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, phase: Math.random() * 6 };
  return g;
}

export function createTraffic(scene, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const cars = [];
  const peds = [];
  const pedColors = [0xe8b48a, 0x7fa3a1, 0xd23b2e, 0x3aa655, 0xf2c230, 0x7a4fd0, 0xe8e8e8];

  // Parked cars inside the two parking lots (blocks (3,-2) and (-2,2)).
  const parked = [];
  const lotSpots = [
    { x: 178, z: -70 }, { x: 189, z: -70 }, { x: 200, z: -70 }, { x: 178, z: -92 }, { x: 189, z: -92 },
    { x: -90, z: 125 }, { x: -79, z: 125 }, { x: -68, z: 125 }, { x: -90, z: 145 }, { x: -79, z: 145 },
  ];
  for (const spot of lotSpots) {
    const car = createCar({ x: spot.x, z: spot.z, heading: (rng() < 0.5 ? 0 : Math.PI / 2), color: pick(rng, COLORS.carPalette), parked: true });
    scene.add(car.group);
    parked.push(car);
  }

  // Moving traffic cars: each follows a street, turns at random intersections.
  for (let i = 0; i < 14; i++) {
    const p = randomStreetPoint(rng, CITY.extent - 20);
    const alongX = Math.abs(p.x - Math.round(p.x / CITY.pitch) * CITY.pitch) < 1;
    const car = createCar({
      x: p.x, z: p.z,
      heading: alongX ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      color: pick(rng, COLORS.carPalette),
    });
    car.speed = range(rng, 6, 11);
    car.cruise = car.speed;
    car.nextTurn = range(rng, 4, 20);
    scene.add(car.group);
    cars.push(car);
  }

  // Pedestrians on sidewalks.
  for (let i = 0; i < 26; i++) {
    const p = randomStreetPoint(rng, CITY.extent - 10);
    const g = makePedestrianModel(pick(rng, pedColors));
    // nudge off the road onto the sidewalk
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

  return { cars, peds, parked };
}

function nearestIntersection(x, z) {
  // Distance along current heading to the next intersection.
  let best = Infinity;
  for (const s of STREETS) {
    const d = Math.abs(s - x);
    if (d > 0.1 && d < best) best = d;
    const d2 = Math.abs(s - z);
    if (d2 > 0.1 && d2 < best) best = d2;
  }
  return best;
}

// One traffic step: cars cruise their street, occasionally turn at intersections,
// brake for the car ahead; pedestrians stroll and flee from the player.
export function stepTraffic(traffic, dt, playerPos, dangerAt, colliders, allCars) {
  const { cars, peds } = traffic;

  for (const car of cars) {
    if (car.parked) continue;
    car.nextTurn -= dt;
    // slow for a car ahead on the same street
    let targetSpeed = car.cruise;
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
      car.speed += (car.cruise - car.speed) * Math.min(1, 2 * dt);
    }
    if (car.nextTurn <= 0 && nearestIntersection(car.x, car.z) < 8) {
      // turn left or right at the intersection
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
    collideCarBuildings(car, colliders);
  }

  for (const ped of peds) {
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
    // keep inside the city and off the road centre
    const clamped = Math.max(-CITY.extent, Math.min(CITY.extent, ped.x));
    ped.x = clamped;
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

  // car-car collisions among traffic (cheap: only traffic vs traffic + player car handled by caller)
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      collideCars(cars[i], cars[j]);
    }
  }
  void driveCar;
}

export { THREE };
