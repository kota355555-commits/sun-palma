// Sun Palma — the screenshot scenes behind ?shot=cover|city|chase|mission.
// Each one stages a real game state (position, car, wanted level, police,
// mission, time of day, weather) from a fixed seed, so the same shot always
// frames the same scene. The chase shot now runs in a storm at night with a
// roadblock ahead, and the mission shot stages the fifth job's rainy getaway.

import { MISSIONS } from './config.js';

// Presets: where the player is, what they drive, how hot the heat is, what
// time it is, and whether the storm is in.
const PRESETS = {
  cover: {
    timeOfDay: 16.5, // golden afternoon
    rain: 0,
    inCar: true,
    carKind: 'sport',
    carAt: { x: 0, z: 54, heading: Math.PI },
    carSpeed: 30,
    heat: 70, // 2 stars
    police: 2,
    roadblock: false,
    mission: 0,
    camera: 'chase',
    steps: 40,
  },
  city: {
    timeOfDay: 12.0, // midday
    rain: 0,
    inCar: false,
    playerAt: { x: 54, z: 54, heading: Math.PI * 0.75 },
    heat: 0,
    police: 0,
    roadblock: false,
    mission: 0,
    camera: 'high',
    steps: 60,
  },
  chase: {
    timeOfDay: 21.25, // night, storm rolling in
    rain: 0.85,
    inCar: true,
    carKind: 'sedan',
    carAt: { x: -54, z: -54, heading: Math.PI / 2 },
    carSpeed: 34,
    heat: 230, // 4 stars
    police: 3,
    roadblock: true,
    mission: 4,
    camera: 'chase',
    steps: 50,
  },
  mission: {
    timeOfDay: 21.5, // the getaway, in the rain
    rain: 0.85,
    inCar: true,
    carKind: 'truck',
    carAt: { x: 189, z: -81, heading: Math.PI },
    carSpeed: 18,
    heat: 140, // 3 stars
    police: 2,
    roadblock: false,
    mission: 4,
    missionStage: 1,
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
  applyPreset(game, preset);
  return { camera: preset.camera, steps: preset.steps };
}

// Put the game into the preset's state: clock, weather, heat, job, car,
// police and roadblock, then hide the title screen and show the HUD.
function applyPreset(game, preset) {
  const g = game;
  g.timeOfDay = preset.timeOfDay;
  if (g.weather) {
    g.weather.timeOfDay = preset.timeOfDay;
    g.weather.rain = preset.rain;
    g.weather.rainTarget = preset.rain;
  }
  g.heat = preset.heat;
  g.missions.index = preset.mission;
  g.missions.stage = preset.missionStage ?? 0;
  g.missions.allDone = false;
  if (preset.inCar) {
    g.enterCar(g.spawnPlayerCar(preset.carAt.x, preset.carAt.z, preset.carAt.heading, preset.carKind ?? 'sedan'));
    g.playerCar.speed = preset.carSpeed;
  } else {
    g.placePlayer(preset.playerAt.x, preset.playerAt.z, preset.playerAt.heading);
  }
  // police cruisers close behind / around the player
  g.spawnPoliceForShot(preset.police);
  if (preset.roadblock) g.spawnRoadblockForShot();
  // hide the title screen, show the HUD
  g.startPlaying(true);
}

export const SHOT_NAMES = Object.keys(PRESETS);
export { MISSIONS };
