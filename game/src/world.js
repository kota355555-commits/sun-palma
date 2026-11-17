// Sun Palma — the city itself, rewritten for the revision pass: grid streets,
// buildings, palms, harbour and park, all built from boxes and one canvas
// window texture. The layout (blocks, parks, lots, landmarks) is the same
// city the missions navigate, but the construction is split into small
// builders so each part reads on its own. No external assets.

import * as THREE from 'three';
import { CITY, COLORS, STREETS } from './config.js';
import { mulberry32, range, pick } from './random.js';

// One shared window texture for every building: dark facade, lit and unlit
// windows in a staggered grid.
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#232838';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = Math.random() < 0.38;
      g.fillStyle = lit ? '#ffcf7d' : '#33415e';
      g.fillRect(9 + col * 19, 12 + row * 22, 12, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, seed = 1) {
  const rng = mulberry32(seed);
  const colliders = [];
  const landmarks = {};
  const ext = CITY.extent;
  const pitch = CITY.pitch;

  // --- ground, beach and sea ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ext * 2 + 320, ext * 2 + 320),
    new THREE.MeshLambertMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(ext * 2 + 320, 46),
    new THREE.MeshLambertMaterial({ color: COLORS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, ext + 23);
  scene.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(ext * 2 + 700, 420),
    new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, ext + 46 + 210);
  scene.add(water);

  // --- roads: asphalt strips plus one instanced mesh of centre dashes ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363d });
  const roadDry = new THREE.Color(0x33363d);
  const roadWet = new THREE.Color(0x1f2229); // wet asphalt goes darker
  for (const s of STREETS) {
    const north = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, ext * 2 + 40), roadMat);
    north.rotation.x = -Math.PI / 2;
    north.position.set(s, 0.1, 0);
    north.receiveShadow = true;
    scene.add(north);
    const east = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2 + 40, CITY.road), roadMat);
    east.rotation.x = -Math.PI / 2;
    east.position.set(0, 0.11, s);
    east.receiveShadow = true;
    scene.add(east);
  }
  const dashSpots = [];
  for (const s of STREETS) {
    for (let t = -ext; t <= ext; t += 12) {
      dashSpots.push([s, t, 0]);
      dashSpots.push([t, s, 1]);
    }
  }
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  {
    const m4 = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    const eul = new THREE.Euler();
    dashSpots.forEach(([x, z, rot], i) => {
      eul.set(0, rot ? Math.PI / 2 : 0, 0);
      q4.setFromEuler(eul);
      m4.compose(new THREE.Vector3(x, 0.14, z), q4, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(i, m4);
    });
  }
  scene.add(dashes);

  // --- blocks: sidewalk slabs, then parks, lots, landmarks or buildings ---
  const parkBlocks = new Set(['-1,-2', '2,1', '-3,3', '0,-3']);
  const lotBlocks = new Set(['3,-2', '-2,2']);
  const landmarkBlocks = new Set(['0,-4', '-2,1', '1,-1', '3,3']);
  const winTex = windowTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const boxMat = new THREE.MeshLambertMaterial({ map: winTex });
  const placements = [];
  const palmSpots = [];

  function addBuilding(x, z, w, d, h, color) {
    placements.push({ x, z, w, d, h, color });
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  for (let bx = -CITY.half; bx < CITY.half; bx++) {
    for (let bz = -CITY.half; bz < CITY.half; bz++) {
      const cx = (bx + 0.5) * pitch;
      const cz = (bz + 0.5) * pitch;
      const key = `${bx},${bz}`;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(CITY.block + 4, 0.3, CITY.block + 4),
        new THREE.MeshLambertMaterial({ color: COLORS.sidewalk }),
      );
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      scene.add(slab);

      if (landmarkBlocks.has(key)) {
        for (let i = 0; i < 2; i++) palmSpots.push([cx + range(rng, -18, 18), cz + (rng() < 0.5 ? -19 : 19)]);
        continue;
      }
      if (parkBlocks.has(key)) {
        const lawn = new THREE.Mesh(
          new THREE.BoxGeometry(CITY.block - 4, 0.5, CITY.block - 4),
          new THREE.MeshLambertMaterial({ color: 0x3f8f4f }),
        );
        lawn.position.set(cx, 0.4, cz);
        scene.add(lawn);
        for (let i = 0; i < 5; i++) palmSpots.push([cx + range(rng, -14, 14), cz + range(rng, -14, 14)]);
        continue;
      }
      if (lotBlocks.has(key)) {
        const lot = new THREE.Mesh(
          new THREE.BoxGeometry(CITY.block - 4, 0.4, CITY.block - 4),
          new THREE.MeshLambertMaterial({ color: 0x3a3d44 }),
        );
        lot.position.set(cx, 0.35, cz);
        scene.add(lot);
        continue;
      }
      // 1, 2 or 4 buildings per block, taller near the centre
      const count = pick(rng, [1, 2, 2, 4]);
      const spots = count === 1
        ? [[0, 0, 30, 30]]
        : count === 2
          ? [[-9, 0, 16, 30], [9, 0, 16, 30]]
          : [[-9, -9, 15, 15], [9, -9, 15, 15], [-9, 9, 15, 15], [9, 9, 15, 15]];
      const central = Math.abs(bx) + Math.abs(bz) <= 2;
      for (const [ox, oz, w, d] of spots) {
        const h = range(rng, 8, central ? 46 : 26);
        addBuilding(cx + ox, cz + oz, w, d, h, pick(rng, COLORS.buildingPalette));
      }
      for (let i = 0; i < 2; i++) palmSpots.push([cx + range(rng, -18, 18), cz + (rng() < 0.5 ? -19 : 19)]);
    }
  }

  // Landmark buildings (taller, distinct) near the mission spots.
  const landmarkDefs = [
    { name: 'bank', x: 27, z: -189, w: 26, h: 52, color: 0xcfd8e6 },
    { name: 'hospital', x: -81, z: 81, w: 24, h: 30, color: 0xf2f2ee },
    { name: 'autoshop', x: 81, z: -27, w: 20, h: 12, color: 0xd23b2e },
    { name: 'hideout', x: 189, z: 189, w: 18, h: 14, color: 0x3a3d44 },
    { name: 'docks', x: -189, z: 216, w: 22, h: 10, color: 0x8a6f4d },
  ];
  for (const lm of landmarkDefs) {
    addBuilding(lm.x, lm.z, lm.w, lm.w, lm.h, lm.color);
    landmarks[lm.name] = lm;
  }

  const inst = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    m.compose(new THREE.Vector3(p.x, 0.3, p.z), q, new THREE.Vector3(p.w, p.h, p.d));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.setHex(p.color));
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);

  // Rooftop neon signs on the tall towers.
  const signMats = [
    new THREE.MeshBasicMaterial({ color: 0xff4d6d }),
    new THREE.MeshBasicMaterial({ color: 0x35e0ff }),
  ];
  let signCount = 0;
  for (const p of placements) {
    if (p.h > 30 && signCount < 10) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.4), signMats[signCount % 2]);
      sign.position.set(p.x, p.h + 0.8, p.z - p.d / 2 - 0.2);
      scene.add(sign);
      signCount++;
    }
  }

  // --- palms: instanced trunks and crowns ---
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.SphereGeometry(3.4, 8, 6);
  crownGeo.scale(1, 0.45, 1);
  crownGeo.translate(0, 8.4, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4f });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    const sc = range(rng, 0.9, 1.3);
    m.compose(new THREE.Vector3(x, 0.3, z), q, new THREE.Vector3(sc, sc, sc));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  });
  scene.add(trunks);
  scene.add(crowns);

  // --- streetlights along every street ---
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
  poleGeo.translate(0, 3, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343c });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  headGeo.translate(0, 6.1, 0);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampDim = new THREE.Color(0x6b5f45); // heads barely glow by day
  const lampBright = new THREE.Color(0xffe9a8); // full warm glow at night
  const lightSpots = [];
  for (const s of STREETS) {
    for (let t = -ext; t <= ext; t += 54) {
      lightSpots.push([s + 8, t]);
      lightSpots.push([t, s - 8]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  lightSpots.forEach(([x, z], i) => {
    m.compose(new THREE.Vector3(x, 0.3, z), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
  });
  scene.add(poles);
  scene.add(heads);

  // --- harbour: pier, stacked containers, one crane ---
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(90, 1, 16),
    new THREE.MeshLambertMaterial({ color: 0x6b5d4f }),
  );
  pier.position.set(-162, 0.6, ext + 34);
  scene.add(pier);
  const contColors = [0xd23b2e, 0x2e6fd2, 0xf2c230, 0x3aa655];
  for (let i = 0; i < 8; i++) {
    const cont = new THREE.Mesh(
      new THREE.BoxGeometry(10, 3, 3.4),
      new THREE.MeshLambertMaterial({ color: contColors[i % 4] }),
    );
    cont.position.set(-196 + (i % 4) * 12, 2.2 + Math.floor(i / 4) * 3.2, ext + 26);
    cont.castShadow = true;
    scene.add(cont);
  }
  const crane = new THREE.Group();
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xe07b39 });
  const legA = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), craneMat);
  legA.position.set(-6, 13, 0);
  const legB = legA.clone();
  legB.position.x = 6;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(26, 2, 2), craneMat);
  beam.position.set(0, 26, 0);
  crane.add(legA, legB, beam);
  crane.position.set(-120, 0.5, ext + 20);
  scene.add(crane);

  // Night and weather dressing, driven by the weather module each frame:
  // streetlight heads brighten as the night factor rises, roads darken as
  // the rain soaks them.
  function setNightLights(factor) {
    headMat.color.copy(lampDim).lerp(lampBright, THREE.MathUtils.clamp(factor, 0, 1));
  }
  function setWetRoads(wet) {
    roadMat.color.copy(roadDry).lerp(roadWet, THREE.MathUtils.clamp(wet, 0, 1));
  }

  return { colliders, landmarks, ext, palmSpots, setNightLights, setWetRoads };
}

export function clampToCity(x, z, ext, margin = 4) {
  const lo = -ext - margin;
  const hi = ext + margin;
  return {
    x: THREE.MathUtils.clamp(x, lo, hi),
    z: THREE.MathUtils.clamp(z, lo, ext + 60),
  };
}

// Is the point on a road (within half a road width of a street line)?
export function onRoad(x, z) {
  const w = CITY.road / 2 + 0.5;
  return STREETS.some((s) => Math.abs(x - s) < w || Math.abs(z - s) < w);
}

// Nearest point on the road network (snaps one axis to the closest street).
export function snapToRoad(x, z) {
  const nearest = (v) => STREETS.reduce(
    (best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best),
    STREETS[0],
  );
  const bx = nearest(x);
  const bz = nearest(z);
  return Math.abs(bx - x) <= Math.abs(bz - z) ? { x: bx, z } : { x, z: bz };
}

export function randomStreetPoint(rng, ext) {
  const street = pick(rng, STREETS);
  const along = range(rng, -ext, ext);
  return rng() < 0.5 ? { x: street, z: along } : { x: along, z: street };
}
