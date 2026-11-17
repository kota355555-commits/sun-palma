// Sun Palma — vehicles: boxy low-poly cars (body, cabin, wheels, lights) and the
// arcade driving model shared by the player car, traffic and police.
import * as THREE from 'three';
import { CAR, COLORS } from './config.js';

const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

export function makeCarModel(color, { police = false } = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 1.0), paint);
  hood.position.set(0, 0.9, 1.5);
  group.add(hood);

  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }

  // headlights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const hx of [-0.65, 0.65]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    hl.position.set(hx, 0.62, 2.22);
    group.add(hl);
  }
  // tail lights
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
  for (const hx of [-0.65, 0.65]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), tailMat);
    tl.position.set(hx, 0.62, -2.22);
    group.add(tl);
  }

  if (police) {
    // white doors + light bar
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.set(0, 0.6, -0.1);
    group.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.35;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.x = 0.35;
    bar.add(red, blue);
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }

  group.userData.wheels = wheels;
  return group;
}

// A car in the world: position, heading, speed and arcade physics.
export function createCar({ x = 0, z = 0, heading = 0, color = 0xd23b2e, police = false, parked = false } = {}) {
  const group = makeCarModel(color, { police });
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  return {
    group, x, z, heading,
    speed: 0,
    police, parked,
    health: police ? 60 : 100,
    color,
    smoke: 0,
    sirenPhase: 0,
  };
}

// Arcade driving step. input: {throttle (-1..1), steer (-1..1), brake (bool)}.
// Returns the distance travelled (for speedometer / heat).
export function driveCar(car, input, dt) {
  const maxF = CAR.maxSpeed;
  const maxR = CAR.maxReverse;
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * CAR.brake * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  } else if (input.throttle !== 0) {
    const target = input.throttle > 0 ? maxF : maxR;
    const rate = input.throttle > 0 ? CAR.accel : CAR.accel * 0.8;
    car.speed += input.throttle * rate * dt;
    if (car.speed > maxF) car.speed = maxF;
    if (car.speed < -maxR) car.speed = -maxR;
    void target;
  } else {
    // rolling drag
    car.speed -= car.speed * 1.4 * dt;
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  const spd = Math.abs(car.speed);
  const steerAuthority = spd < 0.5 ? 0 : Math.min(1, spd / 8);
  car.heading += input.steer * CAR.turnRate * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
  const dx = Math.sin(car.heading) * car.speed * dt;
  const dz = Math.cos(car.heading) * car.speed * dt;
  car.x += dx;
  car.z += dz;
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  // wheel spin + front steer visual
  const spin = (car.speed * dt) / 0.42;
  for (const w of car.group.userData.wheels) w.rotation.x += spin;
  const steerAngle = input.steer * 0.45 * steerAuthority;
  car.group.userData.wheels[0].rotation.y = steerAngle;
  car.group.userData.wheels[1].rotation.y = steerAngle;
  // body roll / pitch
  car.group.rotation.z = -input.steer * Math.min(0.06, spd * 0.002);
  car.group.rotation.x = THREE.MathUtils.clamp(-input.throttle * 0.02, -0.03, 0.03);
  return Math.abs(car.speed) * dt;
}

// Circle (car) vs building AABB: push the car out and kill speed on impact.
// Returns true when a collision happened.
export function collideCarBuildings(car, colliders) {
  const r = 1.6;
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(car.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(car.z, c.maxZ));
    const dx = car.x - cx;
    const dz = car.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (r - d);
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      car.speed *= 0.45;
      hit = true;
    }
  }
  if (hit) {
    car.group.position.set(car.x, 0, car.z);
  }
  return hit;
}

// Circle vs circle (car vs car). Pushes both apart; returns impact speed.
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = 3.4;
  if (d >= min || d === 0) return 0;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const impact = Math.abs(a.speed - b.speed);
  a.speed *= 0.6;
  b.speed *= 0.6;
  a.group.position.set(a.x, 0, a.z);
  b.group.position.set(b.x, 0, b.z);
  return impact;
}

export { COLORS };
