// Sun Palma — the story, rebuilt: five jobs for Rico Vega, a beacon and ring
// marking the objective, two-stage jobs (pick up, then deliver), cash rewards,
// and now a job board: finished jobs can be replayed from the pause menu and
// any job can be retried after a failure, without restarting the whole day.

import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(scene) {
  const { beacon, ring } = makeBeacon(scene);
  return {
    index: 0,
    stage: 0, // 0 = heading to target, 1 = heading to the delivery point
    beacon,
    ring,
    allDone: false,
    justCompleted: null,
    completed: [], // ids of jobs finished this save
    unlocked: 1, // how many jobs the player may pick (grows as jobs finish)
  };
}

// The beacon (a tall yellow light pillar) and the ring on the ground that
// mark the current objective.
function makeBeacon(scene) {
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 20, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  return { beacon, ring };
}

export function currentMission(missions) {
  return MISSIONS[missions.index] ?? null;
}

export function missionTarget(missions) {
  const m = currentMission(missions);
  if (!m) return null;
  if (missions.stage === 1 && m.deliver) return m.deliver;
  return m.target;
}

export function missionObjectiveText(missions) {
  const m = currentMission(missions);
  if (!m) return 'Free roam — collect the green cash drops around the city.';
  if (missions.stage === 1 && m.deliver) return `Deliver to ${m.deliver.label}.`;
  return m.objective;
}

// Move the beacon and ring onto the current target. Also used by shot
// staging, where the per-frame step never runs.
export function updateBeacon(missions) {
  const m = currentMission(missions);
  if (!m) {
    missions.beacon.visible = false;
    missions.ring.visible = false;
    return;
  }
  const target = missionTarget(missions);
  missions.beacon.visible = true;
  missions.ring.visible = true;
  missions.beacon.position.set(target.x, 30, target.z);
  missions.ring.position.set(target.x, 0.35, target.z);
}

// Start the current job: set the heat it demands, set the weather it wants
// (the getaway runs in a storm at night), and tell the player the briefing.
export function beginMission(missions, state) {
  const m = currentMission(missions);
  if (!m) return;
  if (m.wanted) {
    const thresholds = [0, 25, 70, 140, 230, 340];
    state.heat = Math.max(state.heat, thresholds[m.wanted]);
  }
  if (m.weather && state.weather) {
    state.weather.rainTarget = m.weather.rain;
    state.weather.timeOfDay = m.weather.time;
  }
  state.feed?.(`${m.name} — ${m.briefing}`);
}

// Pick a job from the board. Only unlocked jobs may be picked; picking one
// resets it to its first stage and briefs the player again.
export function selectMission(missions, index, state) {
  if (index < 0 || index >= MISSIONS.length) return false;
  if (index >= missions.unlocked) {
    state.feed?.('That job is locked. Finish the current job first.');
    return false;
  }
  missions.index = index;
  missions.stage = 0;
  missions.allDone = false;
  beginMission(missions, state);
  return true;
}

// Retry the current job from its first stage (same job, fresh attempt).
export function retryMission(missions, state) {
  const m = currentMission(missions);
  if (!m) return false;
  missions.stage = 0;
  beginMission(missions, state);
  state.feed?.(`Retrying ${m.title}. ${m.objective}`);
  return true;
}

// The job board for the pause menu: every job, whether it is done, locked,
// or the one currently running.
export function missionBoard(missions) {
  return MISSIONS.map((m, i) => ({
    index: i,
    name: m.name,
    title: m.title,
    reward: m.reward,
    done: missions.completed.includes(m.id),
    locked: i >= missions.unlocked,
    current: i === missions.index,
  }));
}

// One step: keep the beacon on the target, complete stages on arrival.
// Returns 'completed' when a whole job finishes.
export function stepMissions(missions, state, dt) {
  const m = currentMission(missions);
  if (!m) {
    missions.beacon.visible = false;
    missions.ring.visible = false;
    return null;
  }
  const target = missionTarget(missions);
  updateBeacon(missions);
  missions.ring.rotation.z += dt * 1.5;
  const px = state.playerCar ? state.playerCar.x : state.player.x;
  const pz = state.playerCar ? state.playerCar.z : state.player.z;
  const dist = Math.hypot(target.x - px, target.z - pz);
  if (dist > 7) return null;
  return arriveAtTarget(missions, state, m);
}

// What happens when the player reaches the marker: stage advance, or the
// whole job pays out. Returns 'completed' only when the job finishes.
function arriveAtTarget(missions, state, m) {
  if (m.needCar && !state.playerCar) {
    state.feed?.('You need a car for this job. Press E near one to take it.');
    return null;
  }
  if (m.truckOnly && state.playerCar && state.playerCar.kind !== 'truck') {
    state.feed?.('This job needs the depot truck — that car will not do.');
    return null;
  }
  if (missions.stage === 0 && m.deliver) {
    missions.stage = 1;
    if (m.id === 'score') {
      state.money += 500;
      state.heat = Math.max(state.heat, 230);
      state.feed?.('Vault cash grabbed (+$500). Now run — the whole PD is coming!');
      state.audio?.sirenBurst?.();
    } else if (m.id === 'getaway') {
      state.feed?.('Truck secured. Now drive it to the marina boat — in this storm, the PD cannot keep up.');
      state.audio?.sirenBurst?.();
    } else {
      state.feed?.('Package collected. Deliver it to the marker.');
    }
    return null;
  }
  return finishMission(missions, state, m);
}

// Job complete: pay out, mark it done, unlock the next one.
function finishMission(missions, state, m) {
  state.money += m.reward;
  missions.justCompleted = m;
  if (!missions.completed.includes(m.id)) missions.completed.push(m.id);
  missions.index += 1;
  missions.stage = 0;
  missions.unlocked = Math.max(missions.unlocked, missions.index + 1);
  const next = currentMission(missions);
  if (next) {
    beginMission(missions, state);
  } else {
    missions.allDone = true;
    state.feed?.('All jobs done. Sun Palma is yours, Rico. Free roam — collect cash drops, or replay any job from the pause menu.');
  }
  return 'completed';
}
