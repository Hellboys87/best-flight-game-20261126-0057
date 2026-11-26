// Skyline Courier — the renderer.
//
// A hand-written pseudo-3D chase view on Canvas 2D: the sky and sea are
// gradients around a horizon line, and every island, building, ring and
// cloud is a real 3D point projected through the camera behind the plane.
// No image assets at all — the whole golden-hour look is drawn code.

import { clamp } from './plane.js';

/** Build a projection helper for this frame's camera. */
export function makeCamera(plane, width, height) {
  // Camera sits behind and above the plane, looking along its heading.
  const back = 26;
  const up = 7;
  const cx = plane.x - Math.sin(plane.heading) * back;
  const cz = plane.z - Math.cos(plane.heading) * back;
  const cy = plane.y + up;
  const focal = height * 1.05;
  const lookPitch = plane.pitch * 0.55;

  const sinH = Math.sin(plane.heading);
  const cosH = Math.cos(plane.heading);
  const sinP = Math.sin(lookPitch);
  const cosP = Math.cos(lookPitch);

  // Camera basis: forward, right, up (all in world space).
  const fwd = { x: sinH * cosP, y: sinP, z: cosH * cosP };
  const right = { x: cosH, y: 0, z: -sinH };
  const upv = {
    x: -sinH * sinP,
    y: cosP,
    z: -cosH * sinP,
  };

  /** Project a world point to screen space; null when behind the camera. */
  function project(px, py, pz) {
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    const zc = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (zc < 2) return null;
    const xc = dx * right.x + dy * right.y + dz * right.z;
    const yc = dx * upv.x + dy * upv.y + dz * upv.z;
    return {
      x: width / 2 + (focal * xc) / zc,
      y: height / 2 - (focal * yc) / zc,
      z: zc,
      scale: focal / zc,
    };
  }

  // Where the horizon sits on screen for this camera pitch.
  const horizonY = height / 2 + focal * Math.tan(lookPitch) * 0.35
    - focal * Math.sin(plane.pitch * 0.4) * 0.18;

  return { project, horizonY, focal, camX: cx, camY: cy, camZ: cz };
}

/** Paint the whole scene: sky, sun, sea, world, rings, plane. */
export function renderScene(ctx, game, width, height, time, opts = {}) {
  const { world, plane } = game;
  const cam = makeCamera(plane, width, height);

  drawSky(ctx, cam, width, height, time);
  drawSea(ctx, cam, width, height, time);
  drawMountains(ctx, cam, world);
  drawHaze(ctx, cam, width, height);
  drawIslands(ctx, cam, world);
  drawCity(ctx, cam, world);
  drawRunway(ctx, cam, world);
  drawStrips(ctx, cam, world);
  drawRings(ctx, cam, game);
  drawClouds(ctx, cam, world, time);
  drawPlaneSprite(ctx, plane, width, height, time, opts.planeY ?? 0.62);
}

function drawSky(ctx, cam, width, height, time) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.horizonY + 40);
  g.addColorStop(0, '#2b3a6e');
  g.addColorStop(0.45, '#7a5a8c');
  g.addColorStop(0.75, '#e08a52');
  g.addColorStop(1, '#ffc46b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, Math.max(0, cam.horizonY + 40));

  // Low sun, west, with a warm halo.
  const sunX = width * 0.72;
  const sunY = cam.horizonY - height * 0.06;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, height * 0.34);
  halo.addColorStop(0, 'rgba(255, 236, 170, 0.95)');
  halo.addColorStop(0.25, 'rgba(255, 190, 110, 0.55)');
  halo.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - height * 0.34, sunY - height * 0.34, height * 0.68, height * 0.68);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sunX, sunY, Math.max(14, height * 0.035), 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(ctx, cam, width, height, time) {
  const top = Math.max(0, cam.horizonY);
  const g = ctx.createLinearGradient(0, top, 0, height);
  g.addColorStop(0, '#e8955f');
  g.addColorStop(0.18, '#c96a5e');
  g.addColorStop(0.5, '#3d6f8e');
  g.addColorStop(1, '#1d4a6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, width, height - top);

  // Sun glitter: a shimmering path on the water toward the sun.
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffd98a';
  for (let i = 0; i < 26; i += 1) {
    const t = (i / 26 + time * 0.02) % 1;
    const y = top + t * (height - top);
    const wob = Math.sin(time * 1.7 + i * 2.3) * 26;
    const w = 14 + t * 130;
    ctx.fillRect(width * 0.72 - w / 2 + wob * t, y, w, 2.5);
  }
  ctx.restore();
}

function drawMountains(ctx, cam, world) {
  for (const m of world.mountains) {
    const base = cam.project(m.x, 0, m.z);
    const peak = cam.project(m.x, m.h, m.z);
    if (!base || !peak) continue;
    const halfW = (m.w / 2) * base.scale;
    if (halfW < 4) continue;
    const shade = clamp(1 - base.z / 12000, 0.25, 1);
    // Two facets: the sun (low, west) lights the left face warm, while
    // the right face falls into cool shadow. The ridge foot sits a
    // little right of centre so the lit face reads wider, as it would
    // with the sun off to the west.
    const ridgeX = base.x + halfW * 0.18;
    const lit = {
      r: Math.round(168 * shade + 40),
      g: Math.round(118 * shade + 30),
      b: Math.round(138 * shade + 40),
    };
    const shad = {
      r: Math.round(58 * shade + 26),
      g: Math.round(50 * shade + 22),
      b: Math.round(96 * shade + 34),
    };
    ctx.fillStyle = `rgba(${lit.r}, ${lit.g}, ${lit.b}, 0.92)`;
    ctx.beginPath();
    ctx.moveTo(base.x - halfW, base.y);
    ctx.lineTo(peak.x, peak.y);
    ctx.lineTo(ridgeX, base.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(${shad.r}, ${shad.g}, ${shad.b}, 0.92)`;
    ctx.beginPath();
    ctx.moveTo(ridgeX, base.y);
    ctx.lineTo(peak.x, peak.y);
    ctx.lineTo(base.x + halfW, base.y);
    ctx.closePath();
    ctx.fill();
    // Ridge highlight: a thin warm line down the lit edge of the peak.
    ctx.strokeStyle = `rgba(255, 214, 150, ${0.5 * shade})`;
    ctx.lineWidth = Math.max(1, halfW * 0.02);
    ctx.beginPath();
    ctx.moveTo(peak.x, peak.y);
    ctx.lineTo(base.x - halfW, base.y);
    ctx.stroke();
    if (m.snow) {
      ctx.fillStyle = 'rgba(255, 240, 220, 0.85)';
      ctx.beginPath();
      ctx.moveTo(peak.x - halfW * 0.22, peak.y + (base.y - peak.y) * 0.22);
      ctx.lineTo(peak.x, peak.y);
      ctx.lineTo(peak.x + halfW * 0.22, peak.y + (base.y - peak.y) * 0.22);
      ctx.lineTo(peak.x + halfW * 0.08, peak.y + (base.y - peak.y) * 0.3);
      ctx.lineTo(peak.x, peak.y + (base.y - peak.y) * 0.26);
      ctx.lineTo(peak.x - halfW * 0.08, peak.y + (base.y - peak.y) * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** A thin band of golden haze hugging the horizon, so distant peaks
 *  melt into the sky instead of ending in a hard line. */
function drawHaze(ctx, cam, width, height) {
  const band = height * 0.09;
  const top = cam.horizonY - band;
  const g = ctx.createLinearGradient(0, top, 0, cam.horizonY + band * 0.6);
  g.addColorStop(0, 'rgba(255, 196, 120, 0)');
  g.addColorStop(0.5, 'rgba(255, 196, 120, 0.22)');
  g.addColorStop(1, 'rgba(255, 196, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, width, band * 1.6);
}

function projectPolygon(ctx, cam, points, y) {
  const pts = [];
  for (const pt of points) {
    const s = cam.project(pt.x, y, pt.z);
    if (!s) return null;
    pts.push(s);
  }
  return pts;
}

function fillProjected(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

function drawIslands(ctx, cam, world) {
  // Far islands first so near ones paint over them.
  const sorted = [...world.islands].sort((a, b) => {
    const da = Math.hypot(a.cx - cam.camX, a.cz - cam.camZ);
    const db = Math.hypot(b.cx - cam.camX, b.cz - cam.camZ);
    return db - da;
  });
  for (const island of sorted) {
    const beach = projectPolygon(ctx, cam, island.beach, 1.5);
    if (beach) fillProjected(ctx, beach, '#e8c98f');
    const land = projectPolygon(ctx, cam, island.outline, island.peak * 0.12);
    if (land) fillProjected(ctx, land, '#4d7a45');
    // Hill shading: a darker green cap toward the peak.
    const cap = projectPolygon(ctx, cam, island.outline.map((pt) => ({
      x: island.cx + (pt.x - island.cx) * 0.45,
      z: island.cz + (pt.z - island.cz) * 0.45,
    })), island.peak * 0.55);
    if (cap) fillProjected(ctx, cap, '#3a6338');
  }
}

function drawCity(ctx, cam, world) {
  for (const b of world.buildings) {
    const base = cam.project(b.x, 8, b.z);
    if (!base || base.z < 30) continue;
    const w = b.w * base.scale;
    const h = b.h * base.scale;
    if (w < 1.5 || h < 2) continue;
    const shade = clamp(1.15 - base.z / 9000, 0.45, 1);
    ctx.fillStyle = `rgba(${Math.round(74 * shade)}, ${Math.round(66 * shade)}, ${Math.round(96 * shade)}, 1)`;
    ctx.fillRect(base.x - w / 2, base.y - h, w, h);
    // Lit windows: warm dots on the shaded face.
    if (b.lit) {
      ctx.fillStyle = b.warm ? '#ffd27a' : '#bfe3ff';
      const cols = Math.max(1, Math.floor(w / 7));
      const rows = Math.max(1, Math.floor(h / 9));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (((r * 7 + c * 3 + b.w) % 5) < 2) {
            ctx.fillRect(base.x - w / 2 + 2 + c * 7, base.y - h + 3 + r * 9, 2.5, 3.5);
          }
        }
      }
    }
  }
}

function runwayCorners(s) {
  // The strip's long axis is the takeoff direction (sin h, cos h);
  // its short axis is the perpendicular (cos h, -sin h).
  const dx = Math.sin(s.heading);
  const dz = Math.cos(s.heading);
  const px = Math.cos(s.heading);
  const pz = -Math.sin(s.heading);
  const hl = s.length / 2;
  const hw = s.width / 2;
  return [
    { x: s.cx - dx * hl - px * hw, z: s.cz - dz * hl - pz * hw },
    { x: s.cx + dx * hl - px * hw, z: s.cz + dz * hl - pz * hw },
    { x: s.cx + dx * hl + px * hw, z: s.cz + dz * hl + pz * hw },
    { x: s.cx - dx * hl + px * hw, z: s.cz - dz * hl + pz * hw },
  ];
}

function drawRunway(ctx, cam, world) {
  const r = world.runway;
  const poly = projectPolygon(ctx, cam, runwayCorners(r), r.altitude + 0.4);
  if (!poly) return;
  fillProjected(ctx, poly, '#3c3f46');
  // Centreline dashes.
  ctx.fillStyle = '#f5f0dc';
  const dashes = 9;
  for (let i = 0; i < dashes; i += 1) {
    const t0 = -0.44 + (i / dashes) * 0.88;
    const t1 = t0 + 0.88 / dashes / 2;
    const p0 = {
      x: r.cx + Math.sin(r.heading) * t0 * r.length,
      z: r.cz + Math.cos(r.heading) * t0 * r.length,
    };
    const p1 = {
      x: r.cx + Math.sin(r.heading) * t1 * r.length,
      z: r.cz + Math.cos(r.heading) * t1 * r.length,
    };
    const a = cam.project(p0.x + Math.cos(r.heading) * 1.6, r.altitude + 0.6, p0.z - Math.sin(r.heading) * 1.6);
    const b = cam.project(p1.x + Math.cos(r.heading) * 1.6, r.altitude + 0.6, p1.z - Math.sin(r.heading) * 1.6);
    const c = cam.project(p1.x - Math.cos(r.heading) * 1.6, r.altitude + 0.6, p1.z + Math.sin(r.heading) * 1.6);
    const d = cam.project(p0.x - Math.cos(r.heading) * 1.6, r.altitude + 0.6, p0.z + Math.sin(r.heading) * 1.6);
    if (a && b && c && d) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Threshold chevrons at both ends.
  const near = cam.project(r.cx, r.altitude + 1, r.cz);
  if (near) {
    ctx.fillStyle = '#ffcf5e';
    ctx.font = `bold ${Math.max(11, Math.min(20, near.scale * 2.2))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('27', near.x, near.y - 6);
  }
}

function drawStrips(ctx, cam, world) {
  for (const s of world.strips) {
    const poly = projectPolygon(ctx, cam, runwayCorners(s), s.altitude + 0.4);
    if (poly) fillProjected(ctx, poly, '#8a7a52');
    const marker = cam.project(s.cx, s.altitude + 2, s.cz);
    if (marker && marker.z < 4000) {
      ctx.fillStyle = '#fff2b0';
      ctx.font = `bold ${Math.max(11, Math.min(18, marker.scale * 2))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(s.name.toUpperCase(), marker.x, marker.y - 8);
    }
  }
}

function drawRings(ctx, cam, game) {
  const rings = game.mission.rings;
  if (!rings || rings.length === 0) return;
  const next = game.mission.nextRing;
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i];
    if (ring.done) continue;
    const isNext = i === next;
    const centre = cam.project(ring.x, ring.y, ring.z);
    if (!centre) continue;
    const radiusPx = ring.radius * centre.scale;
    if (radiusPx < 3) continue;
    const pulse = isNext ? 1 + Math.sin(game.time * 5) * 0.08 : 1;
    ctx.save();
    ctx.globalAlpha = isNext ? 0.95 : 0.45;
    ctx.strokeStyle = isNext ? '#ffd94d' : '#9fd8ff';
    ctx.lineWidth = isNext ? Math.max(3, radiusPx * 0.09) : Math.max(2, radiusPx * 0.05);
    ctx.shadowColor = isNext ? '#ffae00' : '#66c2ff';
    ctx.shadowBlur = isNext ? 22 : 8;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radiusPx * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (isNext && radiusPx > 26) {
      ctx.fillStyle = '#ffe9a0';
      ctx.font = `bold ${Math.max(12, Math.min(22, radiusPx * 0.28))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}/${rings.length}`, centre.x, centre.y - radiusPx - 10);
    }
  }
}

function drawClouds(ctx, cam, world, time) {
  const sorted = [...world.clouds].sort((a, b) => {
    const da = Math.hypot(a.x - cam.camX, a.z - cam.camZ);
    const db = Math.hypot(b.x - cam.camX, b.z - cam.camZ);
    return db - da;
  });
  for (const c of sorted) {
    const driftX = c.x + time * c.drift;
    const p = cam.project(driftX, c.y, c.z);
    if (!p) continue;
    const r = c.r * p.scale;
    if (r < 2) continue;
    ctx.fillStyle = 'rgba(255, 226, 196, 0.85)';
    for (let k = 0; k < c.puffs; k += 1) {
      const off = (k - c.puffs / 2) * r * 0.55;
      ctx.beginPath();
      ctx.ellipse(p.x + off, p.y - Math.abs(off) * 0.12, r * 0.62, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The courier plane itself, drawn from behind, banking with the roll. */
function drawPlaneSprite(ctx, plane, width, height, time, fracY = 0.62) {
  const cx = width / 2;
  const cy = height * fracY;
  const size = Math.min(width, height) * 0.085;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll * 0.9);
  ctx.scale(1, 1);

  // Prop blur disc at the nose (we see the tail, so the prop is a hint
  // of motion above the fuselage line).
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.62, size * 0.16, size * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wings.
  ctx.fillStyle = '#e8b64c';
  ctx.beginPath();
  ctx.moveTo(-size * 1.55, size * 0.1);
  ctx.lineTo(-size * 0.28, -size * 0.18);
  ctx.lineTo(-size * 0.28, size * 0.28);
  ctx.lineTo(-size * 1.55, size * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 1.55, size * 0.1);
  ctx.lineTo(size * 0.28, -size * 0.18);
  ctx.lineTo(size * 0.28, size * 0.28);
  ctx.lineTo(size * 1.55, size * 0.42);
  ctx.closePath();
  ctx.fill();
  // Wing stripes.
  ctx.fillStyle = '#c94f3d';
  ctx.fillRect(-size * 1.5, size * 0.18, size * 0.28, size * 0.09);
  ctx.fillRect(size * 1.22, size * 0.18, size * 0.28, size * 0.09);

  // Fuselage: a warm cream body with a red tail band.
  ctx.fillStyle = '#f6ead2';
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.72);
  ctx.quadraticCurveTo(size * 0.34, -size * 0.5, size * 0.3, size * 0.1);
  ctx.quadraticCurveTo(size * 0.26, size * 0.72, 0, size * 0.86);
  ctx.quadraticCurveTo(-size * 0.26, size * 0.72, -size * 0.3, size * 0.1);
  ctx.quadraticCurveTo(-size * 0.34, -size * 0.5, 0, -size * 0.72);
  ctx.fill();
  ctx.fillStyle = '#c94f3d';
  ctx.fillRect(-size * 0.3, size * 0.42, size * 0.6, size * 0.16);

  // Tailplane.
  ctx.fillStyle = '#e8b64c';
  ctx.beginPath();
  ctx.moveTo(-size * 0.62, size * 0.62);
  ctx.lineTo(0, size * 0.34);
  ctx.lineTo(size * 0.62, size * 0.62);
  ctx.lineTo(size * 0.5, size * 0.86);
  ctx.lineTo(-size * 0.5, size * 0.86);
  ctx.closePath();
  ctx.fill();

  // Tail fin with the courier's sun mark.
  ctx.fillStyle = '#c94f3d';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.86);
  ctx.lineTo(-size * 0.22, size * 1.28);
  ctx.lineTo(size * 0.22, size * 1.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.arc(0, size * 1.08, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Navigation lights, blinking.
  if (Math.floor(time * 1.4) % 2 === 0) {
    ctx.fillStyle = '#ff5a4d';
    ctx.beginPath();
    ctx.arc(-size * 1.55, size * 0.26, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4dff88';
    ctx.beginPath();
    ctx.arc(size * 1.55, size * 0.26, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
