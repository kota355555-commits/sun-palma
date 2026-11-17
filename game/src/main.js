// Sun Palma — boot and the one loop, rewritten for the revision pass: the
// weather owns the clock, the police director runs roadblocks and PIT moves,
// jobs can be replayed from the pause menu, and the player carries four
// weapons and three kinds of car. Screens: title, play, paused, busted,
// wasted. ?shot=cover|city|chase|mission stages a scene.
import * as THREE from 'three';
import { CITY, COLORS, PLAYER, MISSIONS, PICKUPS, SAVE_KEY } from './config.js';
import { mulberry32, pick } from './random.js';
import { buildWorld, clampToCity } from './world.js';
import { createCar, driveCar, collideCarBuildings, collideCars } from './vehicles.js';
import { createTraffic, stepTraffic } from './traffic.js';
import { createPolice, stepPolice, clearPolice, starsFromHeat, activeRoadblocks } from './police.js';
import { createMissions, currentMission, missionTarget, missionObjectiveText, beginMission, stepMissions, updateBeacon, selectMission, retryMission, missionBoard } from './missions.js';
import { createCombat, shoot, stepCombat, reload, addSmoke, currentWeapon, weaponAmmo, setWeapon, cycleWeapon } from './combat.js';
import { createHud, feedMessage, updateHud, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_PAUSE, ACTION_INTERACT, ACTION_RELOAD, ACTION_MUTE, ACTION_WEAPON, ACTION_RETRY } from './input.js';
import { createWeather, stepWeather, roadGrip, nightFactor, weatherLabel, skyAt, sunAngle } from './weather.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const rng = mulberry32(seed * 31 + 7);

// --- renderer, scene, lights ---
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.skyDay);
scene.fog = new THREE.Fog(COLORS.skyDay, 180, 520);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

function buildLights() {
  const sun = new THREE.DirectionalLight(COLORS.sunDay, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3d4a2e, 1.1);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambient);
  return { sun, hemi, ambient };
}
const { sun, hemi } = buildLights();

const world = buildWorld(scene, seed);
const weather = createWeather(scene);
const traffic = createTraffic(scene, seed);
const police = createPolice(scene);
const missions = createMissions(scene);
const hud = createHud();
const audio = createAudio();
const input = createInput(renderer.domElement);
const combat = createCombat(scene, camera);

// --- the player figure, built from a limb table so the walk cycle can swing them ---
function buildHeroFigure() {
  const jacket = new THREE.MeshLambertMaterial({ color: 0xe07b39 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const g = new THREE.Group();
  const parts = [
    { geo: [0.62, 0.8, 0.36], mat: jacket, at: [0, 1.08, 0], shadow: true },
    { geo: [0.36, 0.36, 0.34], mat: skin, at: [0, 1.68, 0] },
    { geo: [0.4, 0.14, 0.38], mat: dark, at: [0, 1.88, 0] },
    { geo: [0.22, 0.72, 0.24], mat: pants, at: [-0.15, 0.36, 0], limb: 'legL' },
    { geo: [0.22, 0.72, 0.24], mat: pants, at: [0.15, 0.36, 0], limb: 'legR' },
    { geo: [0.15, 0.62, 0.17], mat: jacket, at: [-0.4, 1.08, 0], limb: 'armL' },
    { geo: [0.15, 0.62, 0.17], mat: jacket, at: [0.4, 1.08, 0], limb: 'armR' },
  ];
  const limbs = {};
  for (const p of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...p.geo), p.mat);
    mesh.position.set(...p.at);
    if (p.shadow) mesh.castShadow = true;
    if (p.limb) limbs[p.limb] = mesh;
    g.add(mesh);
  }
  g.userData = { ...limbs, phase: 0 };
  return g;
}

const playerFigure = buildHeroFigure();
scene.add(playerFigure);

// --- game state ---
const game = {
  screen: 'title',
  timeOfDay: 12.0,
  money: 0,
  health: PLAYER.maxHealth,
  heat: 0,
  stars: 0,
  timeSinceCrime: 99,
  player: { x: 0, z: 54, heading: Math.PI, yaw: Math.PI, pitch: -0.12, speed: 0 },
  playerCar: null,
  missions,
  frozen: false,
  shotCamera: null,
  saveTimer: 0,
};

function feed(text) { feedMessage(hud, text); }
game.feed = feed;
game.audio = audio;
game.weather = weather;

// cash pickups: green spinning coins with a soft glow
function makePickupMesh() {
  const mesh = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.18, 20),
    new THREE.MeshBasicMaterial({ color: 0x37e05e }),
  );
  coin.rotation.x = Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x37e05e, transparent: true, opacity: 0.18 }),
  );
  mesh.add(coin, glow);
  return mesh;
}
const pickups = PICKUPS.map((p) => {
  const mesh = makePickupMesh();
  mesh.position.set(p.x, 1.2, p.z);
  scene.add(mesh);
  return { ...p, mesh, taken: false, spin: Math.random() * 6 };
});

// --- save / load ---
function serializeSave() {
  return {
    money: game.money,
    health: game.health,
    heat: game.heat,
    mission: missions.index,
    stage: missions.stage,
    completed: missions.completed,
    unlocked: missions.unlocked,
    weapon: combat.weaponIndex,
    x: game.player.x,
    z: game.player.z,
    timeOfDay: game.timeOfDay,
  };
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(serializeSave()));
  } catch { /* storage off: progress lasts this visit only */ }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function applySave(save) {
  game.money = save.money ?? 0;
  game.health = save.health ?? PLAYER.maxHealth;
  game.heat = save.heat ?? 0;
  missions.index = save.mission ?? 0;
  missions.stage = save.stage ?? 0;
  missions.completed = save.completed ?? [];
  missions.unlocked = save.unlocked ?? missions.index + 1;
  if (typeof save.weapon === 'number') setWeapon(combat, save.weapon);
  game.player.x = save.x ?? 0;
  game.player.z = save.z ?? 54;
  game.timeOfDay = save.timeOfDay ?? 12;
  weather.timeOfDay = game.timeOfDay;
}

// --- camera + lighting ---
const lookPoint = new THREE.Vector3();
function updateCamera(dt) {
  if (game.shotCamera === 'high') {
    camera.position.set(game.player.x + 24, 52, game.player.z + 24);
    camera.lookAt(game.player.x, 0, game.player.z);
    return;
  }
  if (game.shotCamera === 'side') {
    camera.position.set(game.player.x + 16, 5, game.player.z - 10);
    camera.lookAt(game.player.x - 4, 2, game.player.z + 6);
    return;
  }
  const yaw = game.player.yaw;
  const inCar = !!game.playerCar;
  const dist = inCar ? 11 : 7.5;
  const height = inCar ? 4.6 : 3.4;
  const px = inCar ? game.playerCar.x : game.player.x;
  const pz = inCar ? game.playerCar.z : game.player.z;
  const want = {
    x: px - Math.sin(yaw) * dist,
    y: height,
    z: pz - Math.cos(yaw) * dist,
  };
  const k = 1 - Math.exp(-8 * dt);
  camera.position.x += (want.x - camera.position.x) * k;
  camera.position.y += (want.y - camera.position.y) * k;
  camera.position.z += (want.z - camera.position.z) * k;
  lookPoint.set(px + Math.sin(yaw) * 4, 1.8, pz + Math.cos(yaw) * 4);
  camera.lookAt(lookPoint);
}

// Lighting comes from the weather module: the sky table, the sun angle and
// the night factor all live there, so day, dusk, night and storm share one
// source of truth.
function updateLighting() {
  const sky = skyAt(game.timeOfDay);
  scene.background.copy(sky.sky);
  scene.fog.color.copy(scene.background);
  scene.fog.far = sky.fogFar;
  sun.color.copy(sky.sun);
  sun.intensity = sky.sunI;
  hemi.intensity = sky.hemiI;
  const ang = sunAngle(game.timeOfDay);
  sun.position.set(Math.cos(ang) * 220, Math.sin(ang) * 260 + 40, 120);
  sun.target.position.set(0, 0, 0);
  // streetlights and wet roads follow the night factor and the rain
  world.setNightLights(sky.night);
  world.setWetRoads(weather.rain);
}

// --- car enter / exit ---
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  const all = [...traffic.cars, ...traffic.parked, ...police.cars];
  for (const car of all) {
    const d = Math.hypot(car.x - game.player.x, car.z - game.player.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function detachCar(car) {
  // a stolen car leaves whatever list it was on
  for (const list of [traffic.cars, traffic.parked]) {
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
  }
}

function enterCar(car) {
  if (car.police) {
    feed('You cannot steal a police cruiser.');
    return;
  }
  if (!car.parked) {
    // carjacking a moving car: the driver bails and the heat rises
    game.heat += 40;
    game.timeSinceCrime = 0;
    feed('Carjacked! The PD has been called — wanted level up.');
    audio.crash();
  } else {
    // each kind gets its own line: the truck is a battering ram, the coupe is a rocket
    if (car.kind === 'truck') feed('You took the box truck. Slow, but nothing stops it.');
    else if (car.kind === 'sport') feed('You took the coupe. Fast — try not to wrap it around a palm.');
    else feed('You took the car. Drive safe… or don’t.');
  }
  detachCar(car);
  car.parked = false;
  car.speed = 0;
  game.playerCar = car;
  game.player.x = car.x;
  game.player.z = car.z;
  game.player.yaw = car.heading;
  playerFigure.visible = false;
}

function exitCar() {
  const car = game.playerCar;
  if (!car) return;
  car.speed = 0;
  car.parked = true;
  traffic.parked.push(car);
  game.playerCar = null;
  game.player.x = car.x + Math.cos(car.heading) * 2.4;
  game.player.z = car.z - Math.sin(car.heading) * 2.4;
  playerFigure.visible = true;
}

game.enterCar = enterCar;
game.spawnPlayerCar = (x, z, heading, kind = 'sedan') => {
  const car = createCar({ x, z, heading, color: pick(rng, [0xd23b2e, 0x2e6fd2, 0xf2c230]), parked: true, kind });
  scene.add(car.group);
  return car;
};
// Stage a roadblock ahead of the player for the chase screenshot: two
// cruisers parked across the street the player is driving down.
game.spawnRoadblockForShot = () => {
  const heading = game.playerCar ? game.playerCar.heading : game.player.yaw;
  const px = game.playerCar ? game.playerCar.x : game.player.x;
  const pz = game.playerCar ? game.playerCar.z : game.player.z;
  const ahead = 55;
  const cx = px + Math.sin(heading) * ahead;
  const cz = pz + Math.cos(heading) * ahead;
  for (const side of [-1, 1]) {
    const car = createCar({
      x: cx + Math.cos(heading) * side * 4.5,
      z: cz - Math.sin(heading) * side * 4.5,
      heading: heading + Math.PI, color: 0x1a1d24, police: true, kind: 'cruiser',
    });
    car.role = 'block';
    car.hold = 999;
    scene.add(car.group);
    police.cars.push(car);
  }
};
game.placePlayer = (x, z, heading) => {
  game.player.x = x;
  game.player.z = z;
  game.player.heading = heading;
  game.player.yaw = heading;
};
game.spawnPoliceForShot = (n) => {
  for (let i = 0; i < n; i++) {
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    const car = createCar({
      x: px + (rng() - 0.5) * 40 - Math.sin(game.player.yaw) * (14 + i * 9),
      z: pz + (rng() - 0.5) * 40 - Math.cos(game.player.yaw) * (14 + i * 9),
      heading: game.player.yaw, color: 0x1a1d24, police: true, kind: 'cruiser',
    });
    car.speed = 20 + i * 3;
    scene.add(car.group);
    police.cars.push(car);
  }
};

// --- damage / busted / wasted ---
function damagePlayer(amount) {
  if (game.screen !== 'play') return;
  game.health -= amount;
  if (game.health <= 0) {
    game.health = 0;
    game.money = Math.max(0, game.money - 200);
    audio.crash();
    showOverlay('wasted');
    game.screen = 'wasted';
  }
}

function damageCar(amount) {
  const car = game.playerCar;
  if (!car) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.speed = 0;
    feed('Your car is wrecked! Get out and run.');
    addSmoke(combat, car);
  }
}

function respawnAtHospital() {
  clearPolice(police, scene);
  if (game.playerCar) {
    scene.remove(game.playerCar.group);
    game.playerCar = null;
  }
  game.player.x = -70;
  game.player.z = 110;
  game.player.yaw = Math.PI / 2;
  game.player.heading = Math.PI / 2;
  game.health = PLAYER.maxHealth;
  game.heat = 0;
  playerFigure.visible = true;
  hideOverlays();
  game.screen = 'play';
  saveGame();
}

// --- overlays ---
const overlays = {
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  busted: document.getElementById('busted'),
  wasted: document.getElementById('wasted'),
};
function hideOverlays() {
  for (const o of Object.values(overlays)) o.classList.add('hidden');
}
function showOverlay(name) {
  hideOverlays();
  overlays[name].classList.remove('hidden');
  if (name === 'pause') buildMissionList();
}

// The job board on the pause screen: every job with its reward, a tick for
// the finished ones, and a click to replay any unlocked job.
function buildMissionList() {
  const list = document.getElementById('mission-list');
  if (!list) return;
  list.innerHTML = '';
  for (const job of missionBoard(missions)) {
    const row = document.createElement('div');
    row.className = 'job' + (job.current ? ' current' : '') + (job.locked ? ' locked' : '');
    const label = document.createElement('span');
    label.textContent = `${job.done ? '✓ ' : ''}${job.name}${job.current ? ' — current' : ''}${job.locked ? ' — locked' : ''}`;
    const reward = document.createElement('span');
    reward.className = 'reward';
    reward.textContent = `+$${job.reward}`;
    row.append(label, reward);
    if (!job.locked) {
      row.addEventListener('click', () => {
        selectMission(missions, job.index, game);
        hideOverlays();
        game.screen = 'play';
      });
    }
    list.appendChild(row);
  }
}

game.startPlaying = (fromShot) => {
  hideOverlays();
  hud.root.classList.remove('hidden');
  game.screen = 'play';
  if (!fromShot) {
    audio.ensure();
    audio.resume();
    const save = loadGame();
    if (save && save.mission > 0) feed(`Welcome back, Rico. Job ${save.mission + 1} is waiting.`);
    else feed('Welcome to Sun Palma. Steal a car and get to work.');
    const m = currentMission(missions);
    if (m && missions.index === 0) beginMission(missions, game);
  }
};

// Button wiring, table-driven: each button id maps to what it does.
const BUTTON_ACTIONS = {
  'start-btn': () => {
    audio.ensure();
    audio.click();
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    game.money = 0;
    game.health = PLAYER.maxHealth;
    game.heat = 0;
    missions.index = 0;
    missions.stage = 0;
    game.startPlaying(false);
  },
  'continue-btn': () => {
    audio.ensure();
    const save = loadGame();
    if (save) {
      applySave(save);
      beginMission(missions, game);
    }
    game.startPlaying(false);
  },
  'resume-btn': () => {
    hideOverlays();
    game.screen = 'play';
  },
  'restart-btn': () => {
    game.money = 0;
    game.health = PLAYER.maxHealth;
    game.heat = 0;
    missions.index = 0;
    missions.stage = 0;
    missions.allDone = false;
    game.player.x = 0;
    game.player.z = 54;
    clearPolice(police, scene);
    hideOverlays();
    game.screen = 'play';
    beginMission(missions, game);
  },
  'busted-btn': respawnAtHospital,
  'wasted-btn': respawnAtHospital,
};
for (const [id, fn] of Object.entries(BUTTON_ACTIONS)) {
  document.getElementById(id).addEventListener('click', fn);
}
if (loadGame()) document.getElementById('continue-btn').classList.remove('hidden');

// --- collision helpers ---
// Push a point out of every building box it overlaps, by the shortest push.
function collidePlayerBuildings(x, z, r) {
  for (const c of world.colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const ox = x - cx;
    const oz = z - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2) || 0.001;
    const push = r - d;
    x += (ox / d) * push;
    z += (oz / d) * push;
  }
  return { x, z };
}

// --- driving and walking, split out of the step so each reads on its own ---
function driveStep(dt, mv) {
  const car = game.playerCar;
  const throttle = mv.f > 0 ? 1 : mv.f < 0 ? -0.7 : 0;
  // wet roads: less grip, longer stops
  driveCar(car, { throttle, steer: -mv.s, brake: mv.brake }, dt, roadGrip(weather));
  const hitBuilding = collideCarBuildings(car, world.colliders);
  if (hitBuilding && Math.abs(car.speed) > 12) {
    audio.crash();
    damageCar(4);
  }
  for (const other of [...traffic.cars, ...police.cars]) {
    const impact = collideCars(car, other);
    if (impact > 8) {
      audio.crash();
      damageCar(impact * 0.4);
      if (other.police) game.heat += 10;
    }
  }
  // running over pedestrians
  for (const ped of traffic.peds) {
    if (ped.flee <= 0 && Math.hypot(ped.x - car.x, ped.z - car.z) < 2.2 && Math.abs(car.speed) > 5) {
      ped.flee = 3;
      game.heat += 60;
      game.timeSinceCrime = 0;
      feed('You hit a pedestrian! The heat is on.');
      audio.crash();
      car.speed *= 0.7;
    }
  }
  const clamped = clampToCity(car.x, car.z, world.ext);
  car.x = clamped.x;
  car.z = clamped.z;
  car.group.position.set(car.x, 0, car.z);
  if (Math.abs(car.speed) > 30 && police.cars.length > 0) {
    game.heat += 2 * dt;
    game.timeSinceCrime = 0;
  }
  game.player.x = car.x;
  game.player.z = car.z;
  game.player.heading = car.heading;
  audio.setEngine(Math.abs(car.speed) / 42, true);
}

function walkStep(dt, mv) {
  const speed = mv.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const sin = Math.sin(game.player.yaw);
  const cos = Math.cos(game.player.yaw);
  const fx = sin * mv.f + cos * mv.s;
  const fz = cos * mv.f - sin * mv.s;
  const len = Math.hypot(fx, fz);
  let nx = game.player.x;
  let nz = game.player.z;
  if (len > 0) {
    nx += (fx / len) * speed * dt;
    nz += (fz / len) * speed * dt;
    game.player.heading = Math.atan2(fx, fz);
    game.player.speed = speed;
  } else {
    game.player.speed = 0;
  }
  const fixed = collidePlayerBuildings(nx, nz, PLAYER.radius);
  const clamped = clampToCity(fixed.x, fixed.z, world.ext);
  game.player.x = clamped.x;
  game.player.z = clamped.z;
  // walk cycle: legs and arms swing with the stride
  const u = playerFigure.userData;
  if (len > 0) {
    u.phase += dt * speed * 1.6;
    const swing = Math.sin(u.phase) * 0.6;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
  } else {
    u.legL.rotation.x *= 0.8;
    u.legR.rotation.x *= 0.8;
    u.armL.rotation.x *= 0.8;
    u.armR.rotation.x *= 0.8;
  }
  playerFigure.position.set(game.player.x, 0, game.player.z);
  playerFigure.rotation.y = game.player.heading;
  audio.setEngine(0, false);
  if (input.takeClick()) fireWeapon();
}

// Fire the current weapon at the camera centre. Returns the hit, if any.
function fireWeapon() {
  const hit = shoot(combat, { x: game.player.x, z: game.player.z }, police.cars, world.colliders, (car) => {
    addSmoke(combat, car);
    if (car.dead) {
      feed('Cruiser disabled! +$100 in dropped evidence cash.');
      game.money += 100;
      car.dead = false;
      car.health = 60;
      car.smoke = 0;
      scene.remove(car.group);
      police.cars.splice(police.cars.indexOf(car), 1);
    }
  });
  if (!hit) return;
  audio.shotFor(hit.weapon ?? 'pistol');
  // firing a gun draws heat; swinging fists at thin air does not
  if (hit.type === 'police' || (hit.weapon && hit.weapon !== 'fists')) {
    game.heat += 25;
    game.timeSinceCrime = 0;
  }
}

// --- one fixed simulation step ---
function step(dt) {
  // the weather owns the clock now; the game mirrors it for the HUD
  stepWeather(weather, dt, { x: game.player.x, z: game.player.z });
  game.timeOfDay = weather.timeOfDay;
  game.timeSinceCrime += dt;
  updateLighting();
  audio.setRain(weather.rain);
  if (weather.thunderPending) {
    weather.thunderPending = false;
    audio.thunder();
  }

  const look = input.takeLook();
  game.player.yaw -= look.dx * 0.0032;
  game.player.pitch = THREE.MathUtils.clamp(game.player.pitch - look.dy * 0.0024, -0.55, 0.35);

  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    showOverlay('pause');
    game.screen = 'paused';
    return;
  }
  if (actions & ACTION_MUTE) {
    audio.ensure();
    audio.setMuted(!audio.isMuted());
    feed(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
  }
  if (actions & ACTION_RELOAD && !game.playerCar) {
    if (reload(combat)) feed('Reloading…');
  }
  // weapon swap (Q cycles, 1-4 pick directly) and job retry (T)
  if (actions & ACTION_WEAPON && !game.playerCar) {
    if (cycleWeapon(combat)) feed(`Weapon: ${currentWeapon(combat).name}.`);
  }
  const weaponKey = input.takeWeaponKey();
  if (weaponKey >= 0 && !game.playerCar) {
    if (setWeapon(combat, weaponKey)) feed(`Weapon: ${currentWeapon(combat).name}.`);
  }
  if (actions & ACTION_RETRY) {
    if (retryMission(missions, game)) feed('Job restarted from the beginning.');
  }
  if (actions & ACTION_INTERACT) {
    if (game.playerCar) exitCar();
    else {
      const car = nearestCar(4.2);
      if (car) enterCar(car);
    }
  }

  const mv = input.moveVector();
  const danger = game.playerCar ? Math.abs(game.playerCar.speed) > 12 : false;
  if (game.playerCar) driveStep(dt, mv);
  else walkStep(dt, mv);

  // traffic + police (the police step decays heat on the object it gets, so sync it back)
  // traffic slows in the rain along with the player
  stepTraffic(traffic, dt, { x: game.player.x, z: game.player.z }, danger, world.colliders, [...traffic.cars, ...police.cars, ...(game.playerCar ? [game.playerCar] : [])], 1 - weather.rain * 0.25);
  const policeState = {
    heat: game.heat,
    playerPos: { x: game.player.x, z: game.player.z },
    playerCar: game.playerCar,
    playerSpeed: game.playerCar ? Math.abs(game.playerCar.speed) : game.player.speed,
    timeSinceCrime: game.timeSinceCrime,
    damagePlayer,
    damageCar,
  };
  const outcome = stepPolice(police, scene, policeState, dt, world.colliders, rng);
  game.heat = Math.max(0, policeState.heat);
  if (outcome === 'busted') {
    game.money = Math.max(0, game.money - 150);
    game.heat = 0;
    showOverlay('busted');
    game.screen = 'busted';
    clearPolice(police, scene);
    return;
  }
  stepCombat(combat, dt);

  // missions
  const done = stepMissions(missions, game, dt);
  if (done === 'completed') {
    const m = missions.justCompleted;
    feed(`Job complete: ${m.title} — +$${m.reward}.`);
    audio.missionDone();
    audio.pickup();
    saveGame();
  }

  // pickups
  for (const p of pickups) {
    if (p.taken) continue;
    p.spin += dt;
    p.mesh.rotation.y = p.spin;
    p.mesh.position.y = 1.2 + Math.sin(p.spin * 2) * 0.15;
    const d = Math.hypot(p.x - game.player.x, p.z - game.player.z);
    if (d < 2.2) {
      p.taken = true;
      p.mesh.visible = false;
      game.money += p.amount;
      feed(`Cash drop +$${p.amount}.`);
      audio.pickup();
    }
  }

  // health regen out of trouble
  if (game.heat < 25 && game.health < PLAYER.maxHealth && game.health > 0) {
    game.health = Math.min(PLAYER.maxHealth, game.health + 1.2 * dt);
  }

  // audio: siren while wanted
  audio.setSiren(game.stars > 0);

  game.saveTimer += dt;
  if (game.saveTimer > 20) {
    game.saveTimer = 0;
    saveGame();
  }
}

// HUD state projection for hud.js / minimap.
function hudState() {
  const m = currentMission(missions);
  const target = missionTarget(missions);
  let dist = '';
  if (target) {
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    dist = `${target.label} — ${Math.round(Math.hypot(target.x - px, target.z - pz))}m`;
  }
  const weapon = currentWeapon(combat);
  return {
    money: game.money,
    health: game.health,
    stars: game.stars,
    timeOfDay: game.timeOfDay,
    weatherLabel: weatherLabel(weather),
    raining: weather.rain > 0.25,
    night: nightFactor(weather),
    missionName: m ? m.name : 'SUN PALMA — FREE ROAM',
    missionText: missionObjectiveText(missions),
    missionDist: dist,
    playerCar: game.playerCar,
    showAmmo: !game.playerCar && game.screen === 'play',
    ammo: weaponAmmo(combat),
    magSize: weapon.magSize,
    weaponName: weapon.name,
    reloading: combat.reloading > 0,
    player: game.player,
    policeCars: police.cars,
    roadblocks: activeRoadblocks(police),
    trafficCars: traffic.cars,
    pickups,
    missionTarget: target,
  };
}

// --- main loop ---
let last = performance.now();
let accumulator = 0;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  if (game.screen === 'title') {
    // slow orbit over the city as a living backdrop
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 190, 95, Math.cos(t * 0.05) * 190);
    camera.lookAt(0, 0, 0);
    stepTraffic(traffic, dt, { x: 0, z: 0 }, false, world.colliders, traffic.cars);
    updateLighting();
  } else if (game.screen === 'play' && !game.frozen) {
    accumulator += dt;
    let n = 0;
    while (accumulator >= STEP && n < 5) {
      step(STEP);
      accumulator -= STEP;
      n++;
      if (game.screen !== 'play') break;
    }
    updateCamera(dt);
  } else if (game.screen === 'paused') {
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      hideOverlays();
      game.screen = 'play';
    }
  }

  game.stars = starsFromHeat(game.heat);
  updateHud(hud, hudState());
  if (game.screen !== 'title') drawMinimap(hud, hudState());
  renderer.render(scene, camera);
  frames++;
  if (shotName && frames === 3) window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play') {
    showOverlay('pause');
    game.screen = 'paused';
  }
});

// --- shot staging ---
if (shotName) {
  const { camera: camMode, steps } = stageShot(shotName, game);
  game.shotCamera = camMode;
  // the player figure is positioned by step(), which never runs in shot mode
  playerFigure.position.set(game.player.x, 0, game.player.z);
  playerFigure.rotation.y = game.player.heading;
  playerFigure.visible = !game.playerCar;
  updateBeacon(missions);
  updateLighting();
  for (let i = 0; i < steps; i++) {
    stepTraffic(traffic, STEP, { x: game.player.x, z: game.player.z }, false, world.colliders, traffic.cars);
    stepPolice(police, scene, {
      heat: game.heat,
      playerPos: { x: game.player.x, z: game.player.z },
      playerCar: game.playerCar,
      playerSpeed: game.playerCar ? Math.abs(game.playerCar.speed) : 0,
      timeSinceCrime: 99,
      damagePlayer: () => {},
      damageCar: () => {},
    }, STEP, world.colliders, rng);
  }
  game.frozen = true;
  updateCamera(1);
  updateLighting();
  game.stars = starsFromHeat(game.heat);
  updateHud(hud, hudState());
  drawMinimap(hud, hudState());
  renderer.render(scene, camera);
  window.__shotReady = true;
}

updateLighting();
requestAnimationFrame(frame);
