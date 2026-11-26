// Skyline Courier — seeded random numbers.
//
// Every random choice in the world (island shapes, cloud drift, ring
// placement) comes from this little generator, so the same seed always
// builds the same archipelago. The screenshots use seed 20261126.

/** A tiny mulberry32 generator: fast, deterministic, good enough for art. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max]. */
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** Pick one element of an array. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** A jagged blob outline: points around a centre with wobbly radii. */
export function blobOutline(rng, cx, cz, radius, points, wobble) {
  const outline = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (1 + Math.sin(angle * 3 + phase) * wobble + (rng() - 0.5) * wobble);
    outline.push({ x: cx + Math.cos(angle) * r, z: cz + Math.sin(angle) * r });
  }
  return outline;
}
