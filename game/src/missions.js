// Sun Palma — the story: four missions for Rico Vega, with a beacon marking the
// objective, two-stage jobs (pick up, then deliver) and cash rewards.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

export function createMissions(scene) {
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
  return {
    index: 0,
    stage: 0, // 0 = heading to target, 1 = heading to deliver
    beacon, ring,
    allDone: false,
    justCompleted: null,
  };
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

// Move the beacon + ring to the current mission target (also used by shot staging,
// where the per-frame step never runs).
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
export function beginMission(missions, state) {
  const m = currentMission(missions);
  if (!m) return;
  if (m.wanted) {
    const thresholds = [0, 25, 70, 140, 230, 340];
    state.heat = Math.max(state.heat, thresholds[m.wanted]);
  }
  state.feed?.(`${m.name} — ${m.briefing}`);
}

// One step: move the beacon to the current target, complete stages on arrival.
// Returns 'completed' when a whole mission finishes.
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
  // arrived
  if (m.needCar && !state.playerCar) {
    state.feed?.('You need a car for this job. Press E near one to take it.');
    return null;
  }
  if (missions.stage === 0 && m.deliver) {
    missions.stage = 1;
    if (m.id === 'score') {
      state.money += 500;
      state.heat = Math.max(state.heat, 230);
      state.feed?.('Vault cash grabbed (+$500). Now run — the whole PD is coming!');
      state.audio?.sirenBurst?.();
    } else {
      state.feed?.('Package collected. Deliver it to the marker.');
    }
    return null;
  }
  // mission complete
  state.money += m.reward;
  missions.justCompleted = m;
  missions.index += 1;
  missions.stage = 0;
  const next = currentMission(missions);
  if (next) {
    beginMission(missions, state);
  } else {
    missions.allDone = true;
    state.feed?.('All jobs done. Sun Palma is yours, Rico. Free roam — collect cash drops.');
  }
  return 'completed';
}
