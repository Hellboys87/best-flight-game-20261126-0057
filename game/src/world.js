// Skyline Courier — the world: a golden-hour coastal archipelago.
//
// The world is a flat sea with procedural islands, one little city with
// lit windows, a main runway, two grass island airstrips, mountains and
// drifting clouds. Everything is generated from one seed, so the map is
// the same every time the game loads.

import { makeRng, range, rangeInt, blobOutline } from './random.js';

export const WORLD_SEED = 20261126;
export const SEA_LEVEL = 0;

/** Island names the radio chatter and the mission cards use. */
const ISLAND_NAMES = [
  'Harborlight', 'Turtleback', 'Gull Rock', 'Palm Cay', 'Ember Isle',
  'Coral Hook', 'Lantern Bay', 'Driftwood', 'Seabreeze', 'Anchor Point',
];

/**
 * Build the whole world from a seed.
 * Returns islands, the city, the runway, the airstrips, mountains,
 * clouds and a terrainHeight(x, z) sampler used for landing and crashes.
 */
export function buildWorld(seed) {
  const rng = makeRng(seed);

  // --- islands ------------------------------------------------------------
  const islands = [];
  const main = {
    name: 'Harborlight',
    cx: 0,
    cz: 0,
    radius: 1500,
    peak: 95,
    outline: blobOutline(rng, 0, 0, 1500, 26, 0.16),
    beach: blobOutline(rng, 0, 0, 1560, 26, 0.14),
    hasCity: true,
  };
  islands.push(main);

  const placed = [[0, 0, 1500]];
  for (let i = 1; i < 9; i += 1) {
    let cx = 0;
    let cz = 0;
    let tries = 0;
    do {
      const angle = rng() * Math.PI * 2;
      const dist = range(rng, 2600, 5200);
      cx = Math.cos(angle) * dist;
      cz = Math.sin(angle) * dist;
      tries += 1;
    } while (
      tries < 40 &&
      placed.some(([px, pz, pr]) => Math.hypot(cx - px, cz - pz) < pr + 900)
    );
    const radius = range(rng, 380, 850);
    placed.push([cx, cz, radius]);
    islands.push({
      name: ISLAND_NAMES[i % ISLAND_NAMES.length],
      cx,
      cz,
      radius,
      peak: range(rng, 45, 130),
      outline: blobOutline(rng, cx, cz, radius, 18, 0.22),
      beach: blobOutline(rng, cx, cz, radius * 1.06, 18, 0.2),
      hasCity: false,
    });
  }

  // --- city on the main island -------------------------------------------
  const buildings = [];
  const cityCx = 320;
  const cityCz = 260;
  for (let i = 0; i < 46; i += 1) {
    const bx = cityCx + range(rng, -420, 420);
    const bz = cityCz + range(rng, -300, 300);
    // Keep the runway clear: no buildings near the strip (it runs
    // east-west through x 120 ± 310 at z -620).
    if (Math.abs(bx - 120) < 360 && Math.abs(bz + 620) < 70) continue;
    buildings.push({
      x: bx,
      z: bz,
      w: range(rng, 26, 60),
      d: range(rng, 26, 60),
      h: range(rng, 22, 95),
      lit: rng() < 0.75,
      warm: rng() < 0.7,
    });
  }

  // --- main runway: east-west strip on the main island --------------------
  // Heading 270 degrees, so it is runway 27: the courier takes off
  // westward, into the sunset.
  const runway = {
    name: 'Harborlight Intl',
    cx: 120,
    cz: -620,
    heading: Math.PI * 1.5,
    length: 620,
    width: 46,
    altitude: 12,
  };

  // --- island airstrips for the delivery mission --------------------------
  const strips = [
    {
      name: 'Turtleback Field',
      island: islands[1].name,
      cx: islands[1].cx,
      cz: islands[1].cz,
      heading: rng() * Math.PI,
      length: 300,
      width: 30,
      altitude: 10,
    },
    {
      name: 'Palm Cay Strip',
      island: islands[3].name,
      cx: islands[3].cx,
      cz: islands[3].cz,
      heading: rng() * Math.PI,
      length: 300,
      width: 30,
      altitude: 10,
    },
  ];

  // --- mountains ringing the horizon --------------------------------------
  const mountains = [];
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + range(rng, -0.12, 0.12);
    const dist = range(rng, 7500, 9500);
    mountains.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      w: range(rng, 1400, 2600),
      h: range(rng, 500, 1100),
      snow: rng() < 0.4,
    });
  }

  // --- clouds --------------------------------------------------------------
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: range(rng, -6000, 6000),
      z: range(rng, -6000, 6000),
      y: range(rng, 380, 720),
      r: range(rng, 120, 320),
      drift: range(rng, 2, 6),
      puffs: rangeInt(rng, 3, 6),
    });
  }

  // --- terrain height ------------------------------------------------------
  // Smooth hill per island: 0 at the shoreline, peak at the centre.
  function terrainHeight(x, z) {
    let h = 0;
    for (const island of islands) {
      const d = Math.hypot(x - island.cx, z - island.cz);
      if (d < island.radius) {
        const t = 1 - d / island.radius;
        h = Math.max(h, island.peak * t * t * 0.9 + 6 * t);
      }
    }
    return h;
  }

  // Flatten the ground under the runway and the strips so landings are fair.
  // Along a surface is (sin h, cos h); across is (cos h, -sin h).
  function flatHeight(x, z) {
    const rdx = x - runway.cx;
    const rdz = z - runway.cz;
    const rAlong = rdx * Math.sin(runway.heading) + rdz * Math.cos(runway.heading);
    const rAcross = rdx * Math.cos(runway.heading) - rdz * Math.sin(runway.heading);
    if (Math.abs(rAlong) < runway.length / 2 + 40 && Math.abs(rAcross) < runway.width / 2 + 90) {
      return runway.altitude;
    }
    for (const strip of strips) {
      const dx = x - strip.cx;
      const dz = z - strip.cz;
      const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
      const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
      if (Math.abs(along) < strip.length / 2 + 30 && Math.abs(across) < strip.width / 2 + 60) {
        return strip.altitude;
      }
    }
    return terrainHeight(x, z);
  }

  return {
    seed,
    islands,
    buildings,
    city: { x: cityCx, z: cityCz },
    runway,
    strips,
    mountains,
    clouds,
    terrainHeight,
    flatHeight,
  };
}

/** Sun direction for the golden-hour light (low, warm, from the west). */
export const SUN = { azimuth: Math.PI * 0.78, elevation: 0.16 };
