// Skyline Courier — missions: three sorties with different goals.
//
// 1. Ring Run — thread 8 glowing rings over the islands, in order.
// 2. Island Hop — touch down gently at two island airstrips, then come home.
// 3. Precision Landing — put the courier down smooth on the main runway.
//
// A mission is a small state machine: setup, play, complete. Scoring
// rewards clean flying: rings pay 100, gentle touchdowns pay a bonus
// scaled by how soft the landing was, and a hard impact costs a life.

import { makeRng, range } from './random.js';
import { landingCheck, clamp } from './plane.js';

export const MISSION_DEFS = [
  {
    id: 'rings',
    title: 'Mission 1 — Ring Run',
    blurb: 'Thread all 8 rings over the islands. Smooth and steady wins.',
    timeLimit: 300,
  },
  {
    id: 'delivery',
    title: 'Mission 2 — Island Hop',
    blurb: 'Deliver mail to Turtleback Field and Palm Cay Strip, then land home.',
    timeLimit: 420,
  },
  {
    id: 'landing',
    title: 'Mission 3 — Precision Landing',
    blurb: 'One perfect landing on runway 27. Soft touchdown, on the centreline.',
    timeLimit: 240,
  },
];

/** Build a mission's live state from its definition and the world. */
export function createMission(index, world) {
  const def = MISSION_DEFS[index % MISSION_DEFS.length];
  const rng = makeRng(20261126 + index * 977);
  const mission = {
    index,
    id: def.id,
    title: def.title,
    blurb: def.blurb,
    timeLimit: def.timeLimit,
    rings: [],
    nextRing: 0,
    stops: [],
    nextStop: 0,
    objective: '',
    done: false,
    complete: false,
    // A landing only counts once the plane has actually flown: the
    // courier starts parked on the runway, which must not complete a
    // landing mission on its own. Rings are armed from the start.
    armed: def.id === 'rings',
  };

  if (def.id === 'rings') {
    // A slalom course arcing around the main island and out to sea.
    let x = -900;
    let z = -1600;
    let heading = 0.4;
    for (let i = 0; i < 8; i += 1) {
      heading += range(rng, -0.55, 0.55);
      const dist = range(rng, 700, 1100);
      x += Math.sin(heading) * dist;
      z += Math.cos(heading) * dist;
      mission.rings.push({
        x,
        y: range(rng, 130, 260),
        z,
        radius: 42,
        done: false,
      });
    }
    mission.objective = 'Fly through the rings in order';
  } else if (def.id === 'delivery') {
    mission.stops = world.strips.map((s) => ({
      name: s.name,
      island: s.island,
      cx: s.cx,
      cz: s.cz,
      done: false,
    }));
    mission.objective = `Land at ${mission.stops[0].name}`;
  } else {
    mission.objective = 'Land on runway 27 — gently, on the centreline';
  }
  updateObjective(mission);
  return mission;
}

export function updateObjective(mission) {
  if (mission.id === 'rings') {
    mission.objective = `Ring ${Math.min(mission.nextRing + 1, 8)} of 8`;
  } else if (mission.id === 'delivery') {
    if (mission.nextStop < mission.stops.length) {
      mission.objective = `Land at ${mission.stops[mission.nextStop].name}`;
    } else {
      mission.objective = 'All deliveries done — land at Harborlight Intl';
    }
  }
}

/**
 * Check ring passes and landings for this frame.
 * Returns an event object when something scored, else null.
 */
export function missionTick(mission, plane, world, dt) {
  if (mission.id === 'rings') {
    const ring = mission.rings[mission.nextRing];
    if (ring && !ring.done) {
      const d = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
      if (d < ring.radius * 0.95) {
        ring.done = true;
        mission.nextRing += 1;
        const last = mission.nextRing >= mission.rings.length;
        if (last) mission.complete = true;
        updateObjective(mission);
        return { type: 'ring', ring: mission.nextRing, last, score: 100 };
      }
    }
  }

  if ((mission.id === 'delivery' || mission.id === 'landing') && mission.armed && plane.onGround) {
    const hit = landingCheck(plane, world);
    if (hit) {
      if (mission.id === 'delivery') {
        if (mission.nextStop < mission.stops.length) {
          const stop = mission.stops[mission.nextStop];
          if (hit.surface.name === stop.name) {
            stop.done = true;
            mission.nextStop += 1;
            updateObjective(mission);
            return { type: 'delivery', name: stop.name, score: 150 };
          }
        } else if (hit.surface.kind === 'runway') {
          mission.complete = true;
          return { type: 'home', score: 200 };
        }
      } else if (hit.surface.kind === 'runway') {
        mission.complete = true;
        return { type: 'landing', score: 0 };
      }
    }
  }
  return null;
}

/**
 * Score a touchdown: a soft, slow, centred landing pays up to +250.
 * `verticalSpeed` is m/s downward (positive number), `across` is the
 * distance from the centreline in metres.
 */
export function landingBonus(verticalSpeed, across, speed) {
  const soft = clamp(1 - verticalSpeed / 6, 0, 1);
  const centred = clamp(1 - Math.abs(across) / 20, 0, 1);
  const slow = clamp(1 - Math.max(0, speed - 26) / 24, 0, 1);
  const quality = soft * 0.5 + centred * 0.3 + slow * 0.2;
  return {
    score: Math.round(quality * 250),
    quality,
    label: quality > 0.8 ? 'BUTTER SMOOTH!' : quality > 0.55 ? 'Nice landing' : 'A bit rough',
    // One-word touchdown verdict, graded on the same softness curve
    // that sets the score (unchanged): soft = BUTTER, firm = FIRM,
    // anything rougher = HARD. verticalSpeed echoes the input so the
    // HUD can report the touchdown rate without recomputing it.
    verdict: quality > 0.8 ? 'BUTTER' : quality > 0.55 ? 'FIRM' : 'HARD',
    verticalSpeed,
  };
}
