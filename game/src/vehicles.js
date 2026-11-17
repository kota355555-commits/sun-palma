// Sun Palma — vehicles: boxy low-poly cars (body, cabin, wheels, lights) and the
// arcade driving model shared by the player car, traffic and police.
import * as THREE from 'three';
import { COLORS, VEHICLE_KINDS } from './config.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

// Body shapes per kind: the truck is a cab plus a tall cargo box on six
// wheels, the coupe is low and wide with a spoiler, everything else is the
// familiar sedan box.
const BODY_SPECS = {
  sedan: { body: [2.0, 0.62, 4.4], cabin: [1.7, 0.55, 2.2], cabinZ: -0.2, hoodZ: 1.5, wheelZ: 1.45, lift: 0 },
  truck: { body: [2.2, 0.7, 6.6], cabin: [2.0, 0.8, 1.4], cabinZ: 2.1, hoodZ: 2.9, wheelZ: 2.4, lift: 0.15 },
  sport: { body: [2.1, 0.5, 4.0], cabin: [1.6, 0.42, 1.8], cabinZ: -0.3, hoodZ: 1.4, wheelZ: 1.35, lift: -0.08 },
  cruiser: { body: [2.0, 0.62, 4.4], cabin: [1.7, 0.55, 2.2], cabinZ: -0.2, hoodZ: 1.5, wheelZ: 1.45, lift: 0 },
};

export function makeCarModel(color, { police = false, kind = 'sedan' } = {}) {
  const spec = BODY_SPECS[kind] ?? BODY_SPECS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(...spec.body), paint);
  body.position.y = 0.55 + spec.lift;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(...spec.cabin), glass);
  cabin.position.set(0, 1.1 + spec.lift, spec.cabinZ);
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.0), paint);
  hood.position.set(0, 0.9 + spec.lift, spec.hoodZ);
  group.add(hood);

  if (kind === 'truck') {
    // tall cargo box over the rear axles
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.7, 3.4),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    cargo.position.set(0, 1.55, -1.2);
    cargo.castShadow = true;
    group.add(cargo);
  }
  if (kind === 'sport') {
    // rear spoiler
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), paint);
    wing.position.set(0, 1.05, -1.9);
    group.add(wing);
  }

  const wheels = buildWheels(group, spec, kind);

  // lights: headlights and tail lights from one spec table
  buildLamps(group);

  if (police) {
    // white doors + light bar
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.set(0, 0.6, -0.1);
    group.add(stripe);
    const bar = new THREE.Group();
    const barColors = [0xff2020, 0x2040ff];
    barColors.forEach((color, i) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color }));
      lamp.position.x = i === 0 ? -0.35 : 0.35;
      bar.add(lamp);
    });
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }

  group.userData.wheels = wheels;
  return group;
}

// Wheels: four on a sedan, coupe or cruiser; six on a truck (a middle axle
// under the cargo box).
function buildWheels(group, spec, kind) {
  const wheels = [];
  const axles = kind === 'truck'
    ? [[-0.95, 2.4], [0.95, 2.4], [-0.95, 0], [0.95, 0], [-0.95, -2.4], [0.95, -2.4]]
    : [[-0.95, spec.wheelZ], [0.95, spec.wheelZ], [-0.95, -spec.wheelZ], [0.95, -spec.wheelZ]];
  for (const [wx, wz] of axles) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  return wheels;
}

// Headlights up front, tail lights at the back, from one small table.
function buildLamps(group) {
  const lampSpecs = [
    { z: 2.22, color: 0xfff6c9, h: 0.18 },
    { z: -2.22, color: 0xff2e2e, h: 0.16 },
  ];
  for (const spec of lampSpecs) {
    const mat = new THREE.MeshBasicMaterial({ color: spec.color });
    for (const hx of [-0.65, 0.65]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, spec.h, 0.1), mat);
      lamp.position.set(hx, 0.62, spec.z);
      group.add(lamp);
    }
  }
}

// A car in the world: position, heading, speed and arcade physics. The kind
// picks its tuning (see VEHICLE_KINDS): a truck is slow and heavy, a coupe is
// quick and fragile, a cruiser is the PD's tuned interceptor.
export function createCar({ x = 0, z = 0, heading = 0, color = 0xd23b2e, police = false, parked = false, kind = 'sedan' } = {}) {
  const tune = VEHICLE_KINDS[kind] ?? VEHICLE_KINDS.sedan;
  const group = makeCarModel(color, { police, kind });
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    group, x, z, heading,
    speed: 0,
    police, parked,
    kind,
    tune,
    health: tune.health,
    maxHealth: tune.health,
    mass: tune.mass,
    color,
    smoke: 0,
    sirenPhase: 0,
  };
}

// Arcade driving step, tuned per vehicle kind. input: {throttle (-1..1),
// steer (-1..1), brake (bool)}. gripFactor (1 dry, ~0.72 in the rain) scales
// acceleration and steering. Returns the distance travelled.
export function driveCar(car, input, dt, gripFactor = 1) {
  const tune = car.tune ?? VEHICLE_KINDS.sedan;
  const grip = THREE.MathUtils.clamp(gripFactor, 0.4, 1);
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * tune.accel * 1.6 * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  } else if (input.throttle !== 0) {
    const rate = input.throttle > 0 ? tune.accel : tune.accel * 0.8;
    car.speed += input.throttle * rate * grip * dt;
    if (car.speed > tune.maxSpeed) car.speed = tune.maxSpeed;
    if (car.speed < -tune.maxReverse) car.speed = -tune.maxReverse;
  } else {
    // rolling drag
    car.speed -= car.speed * 1.4 * dt;
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  const spd = Math.abs(car.speed);
  const steerAuthority = spd < 0.5 ? 0 : Math.min(1, spd / 8);
  car.heading += input.steer * tune.turnRate * grip * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
  const dx = Math.sin(car.heading) * car.speed * dt;
  const dz = Math.cos(car.heading) * car.speed * dt;
  car.x += dx;
  car.z += dz;
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  poseCarModel(car, input, dt, spd, steerAuthority);
  return Math.abs(car.speed) * dt;
}

// Wheels spin with the road, the front pair steers, the body leans into the
// turn and squats under throttle.
function poseCarModel(car, input, dt, spd, steerAuthority) {
  const wheels = car.group.userData.wheels;
  const spin = (car.speed * dt) / 0.42;
  for (const w of wheels) w.rotation.x += spin;
  const steerAngle = input.steer * 0.45 * steerAuthority;
  wheels[0].rotation.y = steerAngle;
  wheels[1].rotation.y = steerAngle;
  car.group.rotation.z = -input.steer * Math.min(0.06, spd * 0.002);
  car.group.rotation.x = THREE.MathUtils.clamp(-input.throttle * 0.02, -0.03, 0.03);
}

// Car (a boxy footprint) vs building AABB: push the car out along the
// shallowest overlap axis and kill speed on impact. Returns true on a hit.
export function collideCarBuildings(car, colliders) {
  const r = 1.6;
  let hit = false;
  for (const c of colliders) {
    const overlapX = Math.min(car.x + r, c.maxX) - Math.max(car.x - r, c.minX);
    if (overlapX <= 0) continue;
    const overlapZ = Math.min(car.z + r, c.maxZ) - Math.max(car.z - r, c.minZ);
    if (overlapZ <= 0) continue;
    const midX = (c.minX + c.maxX) / 2;
    const midZ = (c.minZ + c.maxZ) / 2;
    if (overlapX < overlapZ) {
      car.x += car.x < midX ? -overlapX : overlapX;
    } else {
      car.z += car.z < midZ ? -overlapZ : overlapZ;
    }
    car.speed *= 0.45;
    hit = true;
  }
  if (hit) {
    car.group.position.set(car.x, 0, car.z);
  }
  return hit;
}

// Circle vs circle (car vs car). Heavier cars shove lighter ones further;
// returns the impact speed.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = 3.4;
  if (d >= min || d === 0) return 0;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  const ma = a.mass ?? 1;
  const mb = b.mass ?? 1;
  const total = ma + mb;
  a.x -= nx * push * (2 * mb / total);
  a.z -= nz * push * (2 * mb / total);
  b.x += nx * push * (2 * ma / total);
  b.z += nz * push * (2 * ma / total);
  const impact = Math.abs(a.speed - b.speed);
  a.speed *= 0.6;
  b.speed *= 0.6;
  a.group.position.set(a.x, 0, a.z);
  b.group.position.set(b.x, 0, b.z);
  return impact;
}

export { COLORS };
