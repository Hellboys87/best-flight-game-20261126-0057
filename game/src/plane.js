// Skyline Courier — the flight model.
//
// A small courier propeller plane: throttle sets the target speed,
// pitch trades speed for altitude, roll banks the plane and turns it.
// The model is deliberately forgiving: the fun is in threading rings
// and greasing landings, not in fighting the controls.

export const PLANE = {
  maxSpeed: 58, // m/s, full throttle in level flight
  cruiseSpeed: 34,
  stallSpeed: 13, // below this the nose drops
  climbRate: 0.42, // pitch authority, radians per second
  rollRate: 1.5, // roll authority, radians per second
  turnRate: 0.55, // heading change per radian of bank
  fuelBurn: 0.55, // percent of tank per second at full throttle
  fuelIdle: 0.08, // percent per second at idle
};

/** Fresh plane state, parked at the end of the main runway, ready to go. */
export function newPlaneState(world) {
  const r = world.runway;
  return {
    x: r.cx - (r.length / 2 - 60) * Math.sin(r.heading),
    z: r.cz - (r.length / 2 - 60) * Math.cos(r.heading),
    y: r.altitude + 1.5,
    heading: r.heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    onGround: true,
    verticalSpeed: 0,
  };
}

/**
 * Advance the plane one step.
 * `stick` is { pitch: -1..1 (up positive), roll: -1..1 (right positive),
 * throttle: -1..1 } and `dt` is seconds. Returns nothing; mutates `p`.
 */
export function stepPlane(p, stick, dt, world) {
  // Throttle: stick.throttle nudges it, clamped to [0, 1].
  p.throttle = clamp(p.throttle + stick.throttle * dt * 0.9, 0, 1);

  // Target speed follows throttle; a climb bleeds speed, a dive gains it.
  const climbPenalty = Math.sin(p.pitch) * 22;
  const targetSpeed = p.throttle * PLANE.maxSpeed - climbPenalty;
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 0.55);
  if (p.speed < 0) p.speed = 0;

  // Pitch: stick pulls the nose, with a gentle return toward level.
  p.pitch += stick.pitch * PLANE.climbRate * dt;
  p.pitch += (0 - p.pitch) * dt * 0.25;
  p.pitch = clamp(p.pitch, -0.55, 0.55);

  // Roll: stick banks, with a gentle return toward wings-level.
  p.roll += stick.roll * PLANE.rollRate * dt;
  p.roll += (0 - p.roll) * dt * 0.35;
  p.roll = clamp(p.roll, -1.1, 1.1);

  // A banked plane turns; the turn bites harder the faster you fly.
  const speedFactor = clamp(p.speed / PLANE.cruiseSpeed, 0.25, 1.4);
  p.heading += -p.roll * PLANE.turnRate * speedFactor * dt;

  // Stall: too slow and the nose drops no matter what the stick says.
  if (p.speed < PLANE.stallSpeed && !p.onGround) {
    p.pitch -= (PLANE.stallSpeed - p.speed) * 0.02 * dt * 10;
    p.pitch = Math.max(p.pitch, -0.5);
  }

  // Vertical speed comes from pitch and speed; the ground stops you.
  const ground = world.flatHeight(p.x, p.z);
  p.verticalSpeed = Math.sin(p.pitch) * p.speed;
  if (p.onGround) {
    // Rolling along the ground: the courier rotates on its own once it
    // is fast enough, so holding the throttle alone gets you airborne;
    // the pilot still flies the climb after that.
    if (p.speed > 28) {
      p.pitch = Math.min(0.14, p.pitch + 0.35 * dt);
    }
    // Lift off once fast enough and pitched up.
    if (p.speed > 24 && p.pitch > 0.06) {
      p.onGround = false;
      p.y = ground + 1.5;
    } else {
      p.y = ground + 1.5;
      p.verticalSpeed = 0;
    }
  } else {
    p.y += p.verticalSpeed * dt;
    if (p.y <= ground + 1.5) {
      p.y = ground + 1.5;
      p.onGround = true;
    }
  }

  // Move over the ground.
  const groundSpeed = Math.cos(p.pitch) * p.speed;
  p.x += Math.sin(p.heading) * groundSpeed * dt;
  p.z += Math.cos(p.heading) * groundSpeed * dt;

  // Fuel: throttle drinks it, idling sips it.
  const burn = PLANE.fuelIdle + (PLANE.fuelBurn - PLANE.fuelIdle) * p.throttle;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  if (p.fuel <= 0) p.throttle = Math.max(0, p.throttle - dt * 0.5);
}

/** Is the plane sitting on a landing surface, aligned with it? */
export function landingCheck(p, world) {
  const surfaces = [
    { ...world.runway, kind: 'runway' },
    ...world.strips.map((s) => ({ ...s, kind: 'strip' })),
  ];
  for (const s of surfaces) {
    const dx = p.x - s.cx;
    const dz = p.z - s.cz;
    // Along the strip is (sin h, cos h); across is (cos h, -sin h).
    const along = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
    const across = dx * Math.cos(s.heading) - dz * Math.sin(s.heading);
    if (Math.abs(along) < s.length / 2 && Math.abs(across) < s.width / 2 + 6) {
      const headingDiff = Math.abs(angleDiff(p.heading, s.heading));
      const aligned = headingDiff < 0.5 || headingDiff > Math.PI - 0.5;
      return { surface: s, aligned, along, across };
    }
  }
  return null;
}

/** Smallest signed difference between two headings, in radians. */
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += -Math.PI * 2;
  return d;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
