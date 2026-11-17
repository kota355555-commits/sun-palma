// Sun Palma — the HUD: DOM panels (cash, health, stars, clock, objective, speed,
// ammo, message feed) and the Canvas 2D minimap.
import { CITY, STREETS } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  return {
    root: el('hud'),
    cash: el('cash'),
    healthbar: el('healthbar'),
    healthtext: el('healthtext'),
    stars: el('stars'),
    clock: el('clock'),
    missionName: el('mission-name'),
    missionText: el('mission-text'),
    missionDist: el('mission-dist'),
    speedo: el('speedo'),
    speed: el('speed'),
    ammo: el('ammo'),
    ammoCount: el('ammo-count'),
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

export function updateHud(hud, state) {
  hud.cash.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
  const hp = Math.max(0, Math.round(state.health));
  hud.healthbar.style.width = `${hp}%`;
  hud.healthbar.style.background = hp > 50
    ? 'linear-gradient(90deg, #37e05e, #a4ff6a)'
    : hp > 25 ? 'linear-gradient(90deg, #e0a437, #ffd23e)' : 'linear-gradient(90deg, #e03737, #ff7a5c)';
  hud.healthtext.textContent = `Health ${hp}`;
  const stars = state.stars;
  let html = '';
  for (let i = 0; i < 5; i++) html += stars > i ? '★' : '<span class="off">★</span>';
  hud.stars.innerHTML = html;
  const h = Math.floor(state.timeOfDay);
  const m = Math.floor((state.timeOfDay - h) * 60);
  hud.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    hud.ammoCount.textContent = state.reloading ? 'Reloading…' : `${state.ammo} / ${state.magSize}`;
    hud.crosshair.classList.remove('hidden');
  } else {
    hud.ammo.classList.add('hidden');
    hud.crosshair.classList.add('hidden');
  }
}

// Draw the minimap: water, roads, blocks, pickups, mission marker, police, player.
export function drawMinimap(hud, state) {
  const ctx = hud.mapCtx;
  const S = 200;
  const ext = CITY.extent + 70;
  const toMap = (x, z) => [(x / ext + 1) * S / 2, (z / ext + 1) * S / 2];
  ctx.clearRect(0, 0, S, S);
  // sea
  ctx.fillStyle = '#123a52';
  ctx.fillRect(0, 0, S, S);
  // land
  const [lx0, lz0] = toMap(-ext, -ext);
  const [lx1, lz1] = toMap(ext, ext);
  ctx.fillStyle = '#3d5a3a';
  ctx.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
  // roads
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth = 4;
  for (const s of STREETS) {
    const [ax] = toMap(s, 0);
    ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, S); ctx.stroke();
    const [, az] = toMap(0, s);
    ctx.beginPath(); ctx.moveTo(0, az); ctx.lineTo(S, az); ctx.stroke();
  }
  // pickups
  ctx.fillStyle = '#37e05e';
  for (const p of state.pickups) {
    if (p.taken) continue;
    const [x, y] = toMap(p.x, p.z);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  // mission marker
  if (state.missionTarget) {
    const [x, y] = toMap(state.missionTarget.x, state.missionTarget.z);
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // police
  ctx.fillStyle = '#ff4040';
  for (const car of state.policeCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // traffic (faint)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const car of state.trafficCars) {
    const [x, y] = toMap(car.x, car.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // player arrow
  const [px, py] = toMap(state.player.x, state.player.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // north tick
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('N', 6, 14);
}
