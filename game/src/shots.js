// Sun Palma — the screenshot scenes behind ?shot=cover|city|chase|mission.
// Each one stages a real game state (position, car, wanted level, police, mission,
// time of day) from a fixed seed, so the same shot always frames the same scene.
import { MISSIONS } from './config.js';

// Presets: where the player is, what they drive, how hot the heat is, what time it is.
const PRESETS = {
  cover: {
    timeOfDay: 16.5, // golden afternoon
    inCar: true,
    carAt: { x: 0, z: 54, heading: Math.PI },
    carSpeed: 26,
    heat: 70, // 2 stars
    police: 2,
    mission: 0,
    camera: 'chase',
    steps: 40,
  },
  city: {
    timeOfDay: 12.0, // midday
    inCar: false,
    playerAt: { x: 54, z: 54, heading: Math.PI * 0.75 },
    heat: 0,
    police: 0,
    mission: 0,
    camera: 'high',
    steps: 60,
  },
  chase: {
    timeOfDay: 18.75, // dusk
    inCar: true,
    carAt: { x: -54, z: -54, heading: Math.PI / 2 },
    carSpeed: 34,
    heat: 140, // 3 stars
    police: 3,
    mission: 2,
    camera: 'chase',
    steps: 50,
  },
  mission: {
    timeOfDay: 9.0, // morning
    inCar: false,
    playerAt: { x: -162, z: 188, heading: 0 },
    heat: 0,
    police: 0,
    mission: 1,
    camera: 'chase',
    steps: 30,
  },
};

/**
 * Stage the named shot on the live game object (see main.js for its shape).
 * Returns the camera mode and how many fixed steps to run before the frame.
 */
export function stageShot(name, game) {
  const preset = PRESETS[name] || PRESETS.cover;
  const g = game;
  g.timeOfDay = preset.timeOfDay;
  g.heat = preset.heat;
  g.missions.index = preset.mission;
  g.missions.stage = 0;
  g.missions.allDone = false;
  if (preset.inCar) {
    g.enterCar(g.spawnPlayerCar(preset.carAt.x, preset.carAt.z, preset.carAt.heading));
    g.playerCar.speed = preset.carSpeed;
  } else {
    g.placePlayer(preset.playerAt.x, preset.playerAt.z, preset.playerAt.heading);
  }
  // police cruisers close behind / around the player
  g.spawnPoliceForShot(preset.police);
  // hide the title screen, show the HUD
  g.startPlaying(true);
  return { camera: preset.camera, steps: preset.steps };
}

export const SHOT_NAMES = Object.keys(PRESETS);
export { MISSIONS };
