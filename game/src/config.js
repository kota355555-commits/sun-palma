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

export const CAR = {
  accel: 22,
  brake: 34,
  maxSpeed: 42, // ~150 km/h
  maxReverse: 10,
  turnRate: 1.9,
  grip: 6.5,
};

export const POLICE = {
  maxActive: 5,
  spawnDistance: 90,
  despawnDistance: 170,
  ramDamage: 8,
  chaseSpeed: 38,
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
    target: { x: 108, z: -54, label: 'Auto Shop' },
    needCar: true,
    reward: 300,
  },
  {
    id: 'package',
    name: 'MISSION 2 — THE PACKAGE',
    title: 'The Package',
    briefing: 'A package is waiting at the docks. Pick it up and deliver it to the park — no questions.',
    objective: 'Pick up the package at the docks, then deliver it to the park.',
    target: { x: -162, z: 216, label: 'Docks' },
    deliver: { x: -54, z: -108, label: 'Laguna Park' },
    reward: 500,
  },
  {
    id: 'pursuit',
    name: 'MISSION 3 — HOT PURSUIT',
    title: 'The PD is on you. Lose the heat and reach the hideout under the freeway.',
    objective: 'Escape the police and reach the hideout marker.',
    target: { x: 162, z: 162, label: 'Hideout' },
    wanted: 3,
    reward: 800,
  },
  {
    id: 'score',
    name: 'MISSION 4 — THE BIG SCORE',
    title: 'The Big Score',
    briefing: 'One last job: hit the Meridian Bank vault, grab the cash, and vanish before the whole city wakes up.',
    objective: 'Reach the bank, grab the cash, then escape to the hideout.',
    target: { x: 0, z: -162, label: 'Meridian Bank' },
    deliver: { x: 162, z: 162, label: 'Hideout' },
    wanted: 4,
    reward: 1500,
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
