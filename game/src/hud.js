// Sun Palma — the HUD, rebuilt: DOM panels for cash, health, wanted stars,
// the clock and the job, plus a weapon slot, a weather chip and a car-health
// bar, and a Canvas 2D minimap that now draws the route to the objective,
// roadblocks, the player's view cone and a day/night tint.

import { CITY, STREETS } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  return {
    root: el('hud'),
    cash: el('cash'),
    healthbar: el('healthbar'),
    healthtext: el('healthtext'),
    carHealth: el('car-health'),
    carHealthBar: el('car-healthbar'),
    stars: el('stars'),
    clock: el('clock'),
    weatherChip: el('weather-chip'),
    missionName: el('mission-name'),
    missionText: el('mission-text'),
    missionDist: el('mission-dist'),
    speedo: el('speedo'),
    speed: el('speed'),
    ammo: el('ammo'),
    ammoCount: el('ammo-count'),
    weaponName: el('weapon-name'),
    feed: el('feed'),
    crosshair: el('crosshair'),
    minimap: el('minimap'),
    mapCtx: el('minimap').getContext('2d'),
  };
}

export function feedMessage(hud, text) {
  const div = document.createElement('div');
  div.textContent = text;
  hud.feed.prepend(div);
  while (hud.feed.children.length > 4) hud.feed.removeChild(hud.feed.lastChild);
  window.setTimeout(() => { div.style.opacity = '0.25'; }, 6000);
}

function healthGradient(hp) {
  if (hp > 50) return 'linear-gradient(90deg, #37e05e, #a4ff6a)';
  if (hp > 25) return 'linear-gradient(90deg, #e0a437, #ffd23e)';
  return 'linear-gradient(90deg, #e03737, #ff7a5c)';
}

// The wanted stars: filled gold up to the current level, dim after that.
function paintStars(hud, stars) {
  let html = '';
  for (let i = 0; i < 5; i++) html += stars > i ? '★' : '<span class="off">★</span>';
  hud.stars.innerHTML = html;
}

// The weapon readout: name, ammo in the mag, and a Reloading note.
function paintAmmo(hud, state) {
  hud.weaponName.textContent = state.weaponName ?? 'Pistol';
  hud.ammoCount.textContent = state.reloading
    ? 'Reloading…'
    : state.ammo === Infinity ? '∞' : `${state.ammo} / ${state.magSize}`;
}

export function updateHud(hud, state) {
  hud.cash.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
  const hp = Math.max(0, Math.round(state.health));
  hud.healthbar.style.width = `${hp}%`;
  hud.healthbar.style.background = healthGradient(hp);
  hud.healthtext.textContent = `Health ${hp}`;

  // car health appears only while driving, and turns red as the car dies
  if (state.playerCar) {
    hud.carHealth.classList.remove('hidden');
    const ch = Math.max(0, Math.round((state.playerCar.health / state.playerCar.maxHealth) * 100));
    hud.carHealthBar.style.width = `${ch}%`;
    hud.carHealthBar.style.background = healthGradient(ch);
  } else {
    hud.carHealth.classList.add('hidden');
  }

  paintStars(hud, state.stars);

  const h = Math.floor(state.timeOfDay);
  const m = Math.floor((state.timeOfDay - h) * 60);
  hud.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (hud.weatherChip) hud.weatherChip.textContent = state.weatherLabel || '';

  hud.missionName.textContent = state.missionName;
  hud.missionText.textContent = state.missionText;
  hud.missionDist.textContent = state.missionDist;

  if (state.playerCar) {
    hud.speedo.classList.remove('hidden');
    hud.speed.textContent = String(Math.round(Math.abs(state.playerCar.speed) * 3.6));
  } else {
    hud.speedo.classList.add('hidden');
  }

  if (state.showAmmo) {
    hud.ammo.classList.remove('hidden');
    paintAmmo(hud, state);
    hud.crosshair.classList.remove('hidden');
  } else {
    hud.ammo.classList.add('hidden');
    hud.crosshair.classList.add('hidden');
  }
}

// Minimap layers, split so each reads on its own: the base (sea, land,
// roads), the markers (cash, route, police, roadblocks) and the player.
function paintMapBase(ctx, toMap, S, ext, state) {
  ctx.fillStyle = state.raining ? '#0e2f45' : '#123a52';
  ctx.fillRect(0, 0, S, S);
  const [lx0, lz0] = toMap(-ext, -ext);
  const [lx1, lz1] = toMap(ext, ext);
  ctx.fillStyle = state.raining ? '#33482f' : '#3d5a3a';
  ctx.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
  if (state.night > 0.5) {
    ctx.fillStyle = 'rgba(6, 8, 24, 0.35)';
    ctx.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
  }
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth = 4;
  for (const s of STREETS) {
    const [ax] = toMap(s, 0);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
    const [, az] = toMap(0, s);
    ctx.beginPath(); ctx.moveTo(0, az); ctx.lineTo(S, az); ctx.stroke();
  }
}

function paintMapMarkers(ctx, toMap, state, px, py) {
  ctx.fillStyle = '#37e05e';
  for (const p of state.pickups) {
    if (p.taken) continue;
    const [x, y] = toMap(p.x, p.z);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  const target = state.missionTarget;
  if (target) {
    const [tx, ty] = toMap(target.x, target.z);
    ctx.strokeStyle = 'rgba(255, 210, 62, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(tx, ty, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const r of state.roadblocks ?? []) {
    const [x, y] = toMap(r.x, r.z);
    ctx.fillStyle = '#ff2020';
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  }
  ctx.fillStyle = '#ff4040';
  for (const car of state.policeCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const car of state.trafficCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
}

function paintMapPlayer(ctx, toMap, state, px, py) {
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 26, state.player.heading - Math.PI / 2 - 0.45, state.player.heading - Math.PI / 2 + 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(state.player.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('N', 6, 14);
  if (state.raining) {
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = ((i * 37) % 200) + 4;
      const y = ((i * 53) % 200) + 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 8);
      ctx.stroke();
    }
  }
}

// Draw the minimap: sea, land, roads, cash drops, the dashed route to the
// objective, police, roadblocks, traffic, and the player arrow with its view
// cone. Rain tints the whole map cold and blue.
export function drawMinimap(hud, state) {
  const ctx = hud.mapCtx;
  const S = 200;
  const ext = CITY.extent + 70;
  const toMap = (x, z) => [(x / ext + 1) * S / 2, (z / ext + 1) * S / 2];
  ctx.clearRect(0, 0, S, S);
  paintMapBase(ctx, toMap, S, ext, state);
  const [px, py] = toMap(state.player.x, state.player.z);
  paintMapMarkers(ctx, toMap, state, px, py);
  paintMapPlayer(ctx, toMap, state, px, py);
}
