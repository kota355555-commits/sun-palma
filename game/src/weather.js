// Sun Palma — sky, daylight and weather: a day/night cycle that moves the sun
// and the streetlights, plus a rain system that soaks the roads, dims the light
// and makes every car grip the asphalt a little less. Written for the revision
// pass; the lighting it drives replaces the old fixed stop table.

import * as THREE from 'three';
import { WEATHER } from './config.js';

// Hour -> sky. Each stop carries the sky colour, the sun colour and strength,
// the hemisphere fill and how far the fog reaches. Night is short here so the
// city stays readable; the lamps carry the mood instead.
const SKY_STOPS = [
  { hour: 0, sky: 0x0a1026, sun: 0x7e96d8, sunI: 0.22, hemiI: 0.32, fogFar: 430 },
  { hour: 5, sky: 0x1c2440, sun: 0x9aa8e8, sunI: 0.35, hemiI: 0.38, fogFar: 440 },
  { hour: 6.5, sky: 0xffab66, sun: 0xffc98a, sunI: 1.35, hemiI: 0.62, fogFar: 500 },
  { hour: 9, sky: 0x86bde6, sun: 0xfff2cc, sunI: 2.4, hemiI: 0.95, fogFar: 560 },
  { hour: 15, sky: 0x8ec4ec, sun: 0xfff2cc, sunI: 2.5, hemiI: 0.95, fogFar: 560 },
  { hour: 18, sky: 0xff9d5c, sun: 0xffb36b, sunI: 1.7, hemiI: 0.72, fogFar: 500 },
  { hour: 19.5, sky: 0x4a2b52, sun: 0xff8a5c, sunI: 0.8, hemiI: 0.5, fogFar: 460 },
  { hour: 21, sky: 0x0d1530, sun: 0x8fa8ff, sunI: 0.3, hemiI: 0.36, fogFar: 430 },
  { hour: 24, sky: 0x0a1026, sun: 0x7e96d8, sunI: 0.22, hemiI: 0.32, fogFar: 430 },
];

const _cA = new THREE.Color();
const _cB = new THREE.Color();

// Interpolate the sky table at any hour of the day.
export function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (h >= SKY_STOPS[i].hour && h <= SKY_STOPS[i + 1].hour) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, b.hour - a.hour);
  const t = (h - a.hour) / span;
  const sky = _cA.setHex(a.sky).clone().lerp(_cB.setHex(b.sky), t);
  const sun = _cA.setHex(a.sun).clone().lerp(_cB.setHex(b.sun), t);
  return {
    sky,
    sun,
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
    fogFar: a.fogFar + (b.fogFar - a.fogFar) * t,
    // 0 in full daylight, 1 in the small hours: drives lamps, headlights, HUD.
    night: THREE.MathUtils.clamp(1 - (a.sunI + (b.sunI - a.sunI) * t) / 2.5, 0, 1),
  };
}

// How much of the day has passed, as a sun angle: sunrise at 6, sunset at 18.
export function sunAngle(hour) {
  return ((hour - 6) / 12) * Math.PI;
}

function dropletTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(190, 215, 240, 0)');
  grad.addColorStop(0.5, 'rgba(190, 215, 240, 0.85)');
  grad.addColorStop(1, 'rgba(190, 215, 240, 0)');
  g.fillStyle = grad;
  g.fillRect(3, 0, 2, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const RAIN_COUNT = 1400;
const RAIN_BOX = 70; // rain falls in a box centred on the player
const RAIN_HEIGHT = 46;
const RAIN_SPEED = 52;

// Build the weather system: rain points, a lightning flash light, and the
// state (time of day, rain amount) the rest of the game reads.
export function createWeather(scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RAIN_BOX;
    positions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.PointsMaterial({
    size: 1.5,
    map: dropletTexture(),
    color: 0xaec6de,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, rainMat);
  points.visible = false;
  points.frustumCulled = false;
  scene.add(points);

  // Lightning: a brief sky-wide flash during heavy rain.
  const flash = new THREE.DirectionalLight(0xdfe8ff, 0);
  flash.position.set(80, 180, 40);
  scene.add(flash);

  const weather = {
    scene,
    points,
    rainMat,
    flash,
    timeOfDay: 12,
    rain: 0, // 0 = dry, 1 = downpour
    rainTarget: 0,
    flashTimer: 0,
    flashCooldown: 6,
    lightningAt: 0,
    thunderPending: false, // set when lightning strikes; the game plays the sound once
  };
  return weather;
}

// Set the clock directly (missions and screenshots use this).
export function setTimeOfDay(weather, hour) {
  weather.timeOfDay = ((hour % 24) + 24) % 24;
}

// Fade the rain toward a level instead of snapping it on.
export function setRain(weather, level) {
  weather.rainTarget = THREE.MathUtils.clamp(level, 0, WEATHER.rainMax);
}

// Advance the weather: the clock creeps, the rain fades toward its target,
// drops fall around the focus point, and heavy rain sometimes throws lightning.
export function stepWeather(weather, dt, focus) {
  weather.timeOfDay = (weather.timeOfDay + dt / 90) % 24;
  const diff = weather.rainTarget - weather.rain;
  weather.rain += THREE.MathUtils.clamp(diff, -dt * 0.5, dt * 0.5);
  if (weather.rain <= 0.02) {
    weather.points.visible = false;
    weather.rainMat.opacity = 0;
  } else {
    weather.points.visible = true;
    weather.rainMat.opacity = 0.55 * weather.rain;
    const pos = weather.points.geometry.attributes.position;
    const arr = pos.array;
    const fall = RAIN_SPEED * dt;
    for (let i = 0; i < RAIN_COUNT; i++) {
      let y = arr[i * 3 + 1] - fall * (0.8 + (i % 5) * 0.1);
      if (y < 0) {
        y = RAIN_HEIGHT;
        arr[i * 3] = focus.x + (Math.random() - 0.5) * RAIN_BOX;
        arr[i * 3 + 2] = focus.z + (Math.random() - 0.5) * RAIN_BOX;
      }
      arr[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
    weather.points.position.set(focus.x, 0, focus.z);
  }

  // Lightning only in a real storm, never more than once every few seconds.
  weather.flashCooldown -= dt;
  if (weather.rain > 0.6 && weather.flashCooldown <= 0 && Math.random() < dt * 0.25) {
    weather.lightningAt = 0.35;
    weather.thunderPending = true;
    weather.flashCooldown = 5 + Math.random() * 7;
  }
  if (weather.lightningAt > 0) {
    weather.lightningAt -= dt;
    weather.flash.intensity = weather.lightningAt > 0.2 ? 3.2 : 0.6;
  } else {
    weather.flash.intensity = 0;
  }
}

// Grip multiplier for driving: wet asphalt is slick, dry asphalt is not.
export function roadGrip(weather) {
  return WEATHER.dryGrip - (WEATHER.dryGrip - WEATHER.wetGrip) * weather.rain;
}

// How dark the world is right now (0 = noon, 1 = midnight), for lamps and HUD.
export function nightFactor(weather) {
  return skyAt(weather.timeOfDay).night;
}

// A short label for the HUD: time of day plus the weather in plain words.
export function weatherLabel(weather) {
  const h = Math.floor(weather.timeOfDay);
  const m = Math.floor((weather.timeOfDay - h) * 60);
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (weather.rain > 0.6) return `${clock} · STORM`;
  if (weather.rain > 0.25) return `${clock} · RAIN`;
  if (weather.timeOfDay < 5 || weather.timeOfDay >= 21) return `${clock} · NIGHT`;
  if (weather.timeOfDay < 7 || weather.timeOfDay >= 18) return `${clock} · DUSK`;
  return `${clock} · CLEAR`;
}
