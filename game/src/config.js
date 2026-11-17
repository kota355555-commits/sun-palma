// Sun Palma — shared constants: city layout, tuning and mission data.
// All names, places and characters are original.

export const CITY = {
  block: 40, // building block size (world units)
  road: 14, // road width
  half: 4, // streets from -4..4 each way (street lines at multiples of pitch)
  get pitch() { return this.block + this.road; },
  // Block centres sit half a pitch off the street lines: (k + 0.5) * pitch, k in -4..3,
  // so streets run between blocks, never through them.
  get extent() { return 3.5 * this.pitch + this.block / 2; }, // 209
};

export const STREETS = [];
for (let i = -CITY.half; i <= CITY.half; i++) STREETS.push(i * CITY.pitch);

// Street names for flavour (original names).
export const STREET_NAMES = [
  'Marina Blvd', 'Palma Ave', 'Solano St', 'Coral Row', 'Bayside Dr',
  'Cactus Ln', 'Harbor Way', 'Sunset Strip', 'Laguna St',
];

export const COLORS = {
  skyDay: 0x87bfe8,
  skyDusk: 0xff9a5c,
  skyNight: 0x0d1530,
  sunDay: 0xfff2cc,
  sunDusk: 0xffb36b,
  road: 0x2e3138,
  roadLine: 0xd8d8d8,
  sidewalk: 0x8d8578,
  ground: 0x4c7a4a,
  water: 0x1e6f8e,
  sand: 0xd9c28a,
  buildingPalette: [0xe8b48a, 0xd9a06b, 0xc98f5f, 0xb98a7a, 0x9fb4c7, 0x7fa3a1, 0xe0cfa8, 0xc77b58, 0x8fa8bf, 0xd8b25e],
  carPalette: [0xd23b2e, 0x2e6fd2, 0xf2c230, 0x3aa655, 0xe8e8e8, 0x22242a, 0x7a4fd0, 0xe07b39, 0x4fb3c7, 0xc7c7c7],
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.7,
  maxHealth: 100,
};

export const POLICE = {
  maxActive: 5,
  spawnDistance: 90,
  despawnDistance: 170,
  ramDamage: 8,
  chaseSpeed: 38,
};

// Vehicle kinds: each one drives differently. The sedan is the all-rounder, the
// box truck is slow and heavy but nearly unbreakable, the coupe is quick and
// twitchy, and the cruiser is the PD's tuned interceptor.
export const VEHICLE_KINDS = {
  sedan: { label: 'Sedan', accel: 22, maxSpeed: 42, maxReverse: 10, turnRate: 1.9, grip: 6.5, health: 100, mass: 1.0, length: 4.4, wheels: 4 },
  truck: { label: 'Box Truck', accel: 13, maxSpeed: 30, maxReverse: 8, turnRate: 1.15, grip: 5.0, health: 240, mass: 3.2, length: 6.6, wheels: 6 },
  sport: { label: 'Coupe', accel: 30, maxSpeed: 53, maxReverse: 11, turnRate: 2.45, grip: 8.0, health: 70, mass: 0.8, length: 4.0, wheels: 4 },
  cruiser: { label: 'PD Cruiser', accel: 25, maxSpeed: 45, maxReverse: 10, turnRate: 2.1, grip: 7.2, health: 60, mass: 1.1, length: 4.4, wheels: 4 },
};

// On-foot weapons. Fists are always available; the guns are found in the city.
export const WEAPONS = [
  { id: 'fists', name: 'Fists', damage: 16, range: 2.8, cooldown: 0.45, magSize: 0, pellets: 1, spread: 0, auto: false, sound: 'punch' },
  { id: 'pistol', name: 'Pistol', damage: 20, range: 90, cooldown: 0.22, magSize: 12, pellets: 1, spread: 0.004, auto: false, sound: 'pistol' },
  { id: 'shotgun', name: 'Shotgun', damage: 13, range: 42, cooldown: 0.85, magSize: 6, pellets: 6, spread: 0.085, auto: false, sound: 'shotgun' },
  { id: 'smg', name: 'SMG', damage: 9, range: 60, cooldown: 0.08, magSize: 30, pellets: 1, spread: 0.03, auto: true, sound: 'smg' },
];

// Weather: rain makes the roads slick (grip) and the city darker (lamps on).
export const WEATHER = {
  dryGrip: 1.0,
  wetGrip: 0.72,
  rainMax: 1.0,
  lampOnAt: 0.55, // night factor above this switches the streetlights on
};

// Heat points: stealing a car 40, hitting a pedestrian 60, shooting 25, speeding 2/s over 30.
// Wanted stars from heat: 0, 1 (25+), 2 (70+), 3 (140+), 4 (230+), 5 (340+).
export const WANTED_THRESHOLDS = [0, 25, 70, 140, 230, 340];

export const MISSIONS = [
  {
    id: 'wheels',
    name: 'MISSION 1 — WHEELS',
    title: 'Wheels',
    briefing: 'Rico needs wheels. Steal any car and bring it to the auto shop on Coral Row.',
    objective: 'Steal a car, then drive to the yellow marker.',
    target: {
      x: 108, z: -54,
      label: 'Auto Shop',
    },
    needCar: true,
    reward: 300,
  },
  {
    id: 'package',
    name: 'MISSION 2 — THE PACKAGE',
    title: 'The Package',
    briefing: 'A package is waiting at the docks. Pick it up and deliver it to the park — no questions.',
    objective: 'Pick up the package at the docks, then deliver it to the park.',
    target: {
      x: -162, z: 216,
      label: 'Docks',
    },
    deliver: {
      x: -54, z: -108,
      label: 'Laguna Park',
    },
    reward: 500,
  },
  {
    id: 'pursuit',
    name: 'MISSION 3 — HOT PURSUIT',
    title: 'The PD is on you. Lose the heat and reach the hideout under the freeway.',
    objective: 'Escape the police and reach the hideout marker.',
    target: {
      x: 162, z: 162,
      label: 'Hideout',
    },
    wanted: 3,
    reward: 800,
  },
  {
    id: 'score',
    name: 'MISSION 4 — THE BIG SCORE',
    title: 'The Big Score',
    briefing: 'One last job: hit the Meridian Bank vault, grab the cash, and vanish before the whole city wakes up.',
    objective: 'Reach the bank, grab the cash, then escape to the hideout.',
    target: {
      x: 0, z: -162,
      label: 'Meridian Bank',
    },
    deliver: {
      x: 162, z: 162,
      label: 'Hideout',
    },
    wanted: 4,
    reward: 1500,
  },
  {
    id: 'getaway',
    name: 'MISSION 5 — THE GETAWAY',
    title: 'The Getaway',
    briefing: 'The score is done, but the storm just rolled in. Take the depot truck through the rain and reach the marina boat before the PD locks the city down.',
    objective: 'Steal the depot truck, then drive it to the marina boat in the storm.',
    target: {
      x: 189, z: -81,
      label: 'Depot Truck',
    },
    deliver: {
      x: -162, z: 243,
      label: 'Marina Boat',
    },
    needCar: true,
    truckOnly: true,
    wanted: 3,
    weather: { rain: 0.85, time: 21.5 },
    reward: 2000,
  },
];

export const PICKUPS = [
  { x: 54, z: 54, amount: 50 },
  { x: -108, z: 0, amount: 75 },
  { x: 0, z: 108, amount: 50 },
  { x: -162, z: -162, amount: 100 },
  { x: 216, z: 0, amount: 75 },
  { x: 108, z: 162, amount: 50 },
];

export const SAVE_KEY = 'sun-palma-save-v1';
