// Skyline Courier — the HUD: lit instruments drawn over the chase view.
//
// Top bar: altitude, speed, heading compass tape, score and mission
// timer. Bottom corners: throttle bar and fuel gauge. Centre flashes
// carry the radio chatter ("RING 4/8 +100"). Everything is canvas, so
// it renders identically in every screenshot.

import { clamp } from './plane.js';

const FONT = 'bold 15px "Segoe UI", system-ui, sans-serif';
const FONT_BIG = 'bold 22px "Segoe UI", system-ui, sans-serif';

export function drawHud(ctx, game, width, height) {
  const { plane, mission, score, timeLeft, lives } = game;

  // --- top bar ------------------------------------------------------------
  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 34, 0.62)';
  ctx.fillRect(0, 0, width, 64);
  ctx.fillStyle = 'rgba(255, 214, 120, 0.5)';
  ctx.fillRect(0, 64, width, 2);

  ctx.textBaseline = 'middle';
  drawInstrument(ctx, 16, 14, 'ALT', `${Math.max(0, Math.round(plane.y * 3.28))} ft`);
  drawInstrument(ctx, 132, 14, 'SPD', `${Math.round(plane.speed * 1.94)} kt`);
  drawInstrument(ctx, 248, 14, 'FUEL', `${Math.max(0, Math.round(plane.fuel))}%`, plane.fuel < 25 ? '#ff7a5e' : '#ffe9a0');

  drawCompass(ctx, width / 2, 32, plane.heading, 300);

  // Right side: mission, score, timer, lives.
  ctx.textAlign = 'right';
  ctx.font = FONT;
  ctx.fillStyle = '#ffe9a0';
  ctx.fillText(mission.title.toUpperCase(), width - 16, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT_BIG;
  ctx.fillText(`SCORE ${score}`, width - 16, 38);
  ctx.font = FONT;
  ctx.fillStyle = timeLeft < 30 ? '#ff7a5e' : '#cfe6ff';
  ctx.fillText(`TIME ${formatTime(timeLeft)}`, width - 16, 56);
  drawLives(ctx, width - 16, 78, lives);
  ctx.restore();

  // --- throttle bar, bottom left ------------------------------------------
  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 34, 0.62)';
  roundRect(ctx, 16, height - 108, 34, 92, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  const th = clamp(plane.throttle, 0, 1);
  const barH = 76 * th;
  const barY = height - 100 + (76 - barH);
  roundRect(ctx, 24, barY, 18, barH, 4);
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', 33, height - 108 + 88);
  ctx.fillText(`${Math.round(th * 100)}%`, 33, height - 118);
  ctx.restore();

  // --- fuel gauge, bottom right -------------------------------------------
  ctx.save();
  const fw = 190;
  const fx = width - fw - 16;
  const fy = height - 52;
  ctx.fillStyle = 'rgba(12, 18, 34, 0.62)';
  roundRect(ctx, fx - 8, fy - 8, fw + 16, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', fx, fy + 8);
  ctx.fillStyle = plane.fuel < 25 ? '#ff7a5e' : '#4dff88';
  roundRect(ctx, fx + 52, fy, (fw - 60) * clamp(plane.fuel / 100, 0, 1), 16, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(fx + 52, fy, fw - 60, 16);
  ctx.restore();

  // --- mission objective line, under the top bar --------------------------
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(12, 18, 34, 0.55)';
  const label = mission.objective;
  const tw = ctx.measureText(label).width;
  roundRect(ctx, width / 2 - tw / 2 - 12, 74, tw + 24, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.fillText(label, width / 2, 88);
  ctx.restore();

  // --- centre flash messages ----------------------------------------------
  if (game.flash && game.flashUntil > game.time) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(12, 18, 34, 0.55)';
    const w = ctx.measureText(game.flash).width;
    roundRect(ctx, width / 2 - w / 2 - 16, height * 0.3 - 26, w + 32, 52, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(game.flash, width / 2, height * 0.3 + 2);
    ctx.restore();
  }

  // --- touchdown readout: vertical speed + one-word verdict ------------
  // Shown briefly after any touchdown, reusing the landing-bonus grade.
  if (game.touchdown && game.time < (game.touchdownUntil || 0)) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px "Segoe UI", system-ui, sans-serif';
    const td = game.touchdown;
    const text = `TOUCHDOWN  −${td.vs.toFixed(1)} m/s  •  ${td.verdict}`;
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(12, 18, 34, 0.66)';
    roundRect(ctx, width / 2 - w / 2 - 16, height - 96, w + 32, 40, 10);
    ctx.fill();
    ctx.fillStyle = td.verdict === 'BUTTER' ? '#ffd94d' : td.verdict === 'FIRM' ? '#ffe9a0' : '#ff7a5e';
    ctx.fillText(text, width / 2, height - 76);
    ctx.restore();
  }

  // --- low-fuel warning ----------------------------------------------------
  if (plane.fuel < 25 && plane.fuel > 0 && Math.floor(game.time * 2) % 2 === 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ff7a5e';
    ctx.fillText('LOW FUEL — FIND A RUNWAY', width / 2, height - 24);
    ctx.restore();
  }
}

function drawInstrument(ctx, x, y, label, value, color) {
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#9fb4d8';
  ctx.fillText(label, x, y + 6);
  ctx.font = FONT_BIG;
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(value, x, y + 30);
}

function drawCompass(ctx, cx, cy, heading, width) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(cx - width / 2, cy - 20, width, 40);
  ctx.strokeStyle = 'rgba(255, 233, 160, 0.6)';
  ctx.strokeRect(cx - width / 2, cy - 20, width, 40);
  const deg = ((heading * 180) / Math.PI) % 360;
  const points = [
    [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ];
  ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const [d, name] of points) {
    let diff = d - deg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    const x = cx + (diff / 60) * (width / 2);
    if (Math.abs(diff) > 60) continue;
    ctx.fillStyle = d === 0 ? '#ffd94d' : '#cfe6ff';
    ctx.fillText(name, x, cy - 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(Math.round(d)), x, cy + 10);
  }
  // Centre needle.
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx - 6, cy - 30);
  ctx.lineTo(cx + 6, cy - 30);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLives(ctx, x, y, lives) {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#9fb4d8';
  ctx.fillText('LIVES', x - lives * 26 - 8, y + 6);
  for (let i = 0; i < lives; i += 1) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(x - i * 26 - 10, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c94f3d';
    ctx.beginPath();
    ctx.arc(x - i * 26 - 10, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
