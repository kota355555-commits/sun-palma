// Sun Palma — deterministic seeded random (mulberry32) so the city, traffic and
// screenshot scenes are the same on every load for a given seed.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Clamp a value into [low, high].
export function clamp(v, low, high) {
  return v < low ? low : v > high ? high : v;
}

// Linear interpolation between a and b.
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// True with probability p (0..1) on this call.
export function chance(rng, p) {
  return rng() < p;
}

export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
