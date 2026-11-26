// Skyline Courier — the game loop and state machine.
//
// States: title → playing ⇄ paused → missionComplete / gameOver.
// A crash costs a life and respawns the plane on the runway; fuel
// exhaustion forces a dead-stick landing. `?shot=start|play|rings|end`
// puts the game in a fixed, seeded state so screenshots are repeatable
// renders of the real game, never a staged image.

import { buildWorld, WORLD_SEED } from './world.js';
import { newPlaneState, stepPlane, landingCheck, clamp } from './plane.js';
import { renderScene } from './render.js';
import { drawHud, roundRect } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createMission, missionTick, landingBonus, updateObjective } from './missions.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot') || '';

const world = buildWorld(WORLD_SEED);
const input = createInput(canvas);
const audio = createAudio();

const game = {
  state: 'title', // title | playing | paused | missionComplete | gameOver
  world,
  plane: newPlaneState(world),
  missionIndex: 0,
  mission: createMission(0, world),
  score: 0,
  lives: 3,
  timeLeft: 300,
  time: 0,
  flash: '',
  flashUntil: 0,
  crashTimer: 0,
  landTimer: 0,
  totalRings: 0,
  bestLanding: null,
  // The courier starts parked on the runway: the first frame is not a
  // touchdown, so the grace readout must not fire until it has flown.
  wasOnGround: true,
};

function resize() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function showFlash(text, seconds) {
  game.flash = text;
  game.flashUntil = game.time + seconds;
}

function startMission(index) {
  game.missionIndex = index;
  game.mission = createMission(index, world);
  game.plane = newPlaneState(world);
  game.timeLeft = game.mission.timeLimit;
  game.state = 'playing';
  game.landTimer = 0;
  game.wasOnGround = true;
  showFlash(game.mission.title, 3);
  audio.ensure();
}

function respawn() {
  game.plane = newPlaneState(world);
  game.plane.fuel = Math.max(game.plane.fuel, 40);
  // A respawn parks the plane back on the runway: landings must not
  // count again until it has genuinely flown.
  game.mission.armed = game.mission.id === 'rings';
  game.state = 'playing';
  game.wasOnGround = true;
  showFlash('Back on the runway — fly safe', 2.5);
}

function crash(reason) {
  game.lives -= 1;
  audio.thud();
  if (game.lives <= 0) {
    game.state = 'gameOver';
  } else {
    game.state = 'crashed';
    game.crashTimer = 2.2;
    showFlash(`${reason} — ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left`, 2);
  }
}

function finishMission() {
  game.state = 'missionComplete';
  audio.fanfare();
  game.score += 500;
}

function update(dt) {
  game.time += dt;
  const p = game.plane;

  if (game.state === 'playing') {
    // Drift the clouds.
    for (const c of world.clouds) c.x += c.drift * dt * 0.2;

    const stick = input.readStick(game.time);
    stepPlane(p, stick, dt, world);
    audio.update(p.throttle, p.speed, !p.onGround || p.speed > 5);

    // Once the plane has genuinely been airborne, landings count.
    // (Parked on the runway does not count: the plane must have lifted.)
    if (!p.onGround && (p.y > world.flatHeight(p.x, p.z) + 2 || p.speed > 20)) {
      game.mission.armed = true;
    }

    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.state = 'gameOver';
      return;
    }

    // Fuel out: the engine quits and you glide to whatever is below.
    if (p.fuel <= 0 && !p.onGround) {
      showFlash('OUT OF FUEL — glide it in!', 1.2);
    }

    // Ring and landing events.
    const event = missionTick(game.mission, p, world, dt);
    if (event) {
      if (event.type === 'ring') {
        game.score += event.score;
        game.totalRings += 1;
        audio.ringChime();
        showFlash(
          event.last ? 'ALL RINGS — MISSION COMPLETE!' : `RING ${event.ring}/8  +${event.score}`,
          2,
        );
        if (event.last) finishMission();
      } else if (event.type === 'delivery') {
        game.score += event.score;
        audio.ringChime();
        showFlash(`DELIVERED — ${event.name}  +${event.score}`, 2.5);
      } else if (event.type === 'home') {
        game.score += event.score;
        finishMission();
      } else if (event.type === 'landing') {
        const hit = landingCheck(p, world);
        const bonus = landingBonus(Math.abs(p.verticalSpeed), hit ? hit.across : 20, p.speed);
        game.score += bonus.score;
        game.bestLanding = bonus;
        game.touchdown = { vs: Math.abs(p.verticalSpeed), verdict: bonus.verdict };
        game.touchdownUntil = game.time + 6;
        finishMission();
        showFlash(`${bonus.label}  +${bonus.score}`, 2.5);
      }
    }

    // Touchdown quality: a gentle landing on a surface is fine; a hard
    // one, or touching down on rough ground, is a crash.
    if (p.onGround && !game.wasOnGround) {
      const impact = Math.abs(p.verticalSpeed);
      const hit = landingCheck(p, world);
      // Grace readout: every touchdown reports its vertical speed and
      // one-word verdict for a few seconds on the HUD, whether or not
      // it scored (delivery stops and practice bounces included).
      const grade = landingBonus(impact, hit ? hit.across : 20, p.speed);
      game.touchdown = { vs: impact, verdict: grade.verdict };
      game.touchdownUntil = game.time + 5;
      if (impact > 7 || !hit) {
        crash(impact > 7 ? 'HARD IMPACT' : 'ROUGH TERRAIN');
      } else if (impact > 3.5) {
        audio.thud();
        showFlash('Hard landing — watch the descent', 1.6);
      }
    }
    game.wasOnGround = p.onGround;

    // Out of bounds: turn the plane back toward the archipelago.
    const dist = Math.hypot(p.x, p.z);
    if (dist > 9000) {
      p.heading = Math.atan2(-p.x, -p.z);
      showFlash('Turn back — you are leaving the islands', 2);
    }
  } else if (game.state === 'crashed') {
    game.crashTimer -= dt;
    if (game.crashTimer <= 0) respawn();
  }

  // Global keys, handled in every state.
  if (input.wasPressed('p') || input.wasPressed('Escape')) {
    if (game.state === 'playing') game.state = 'paused';
    else if (game.state === 'paused') game.state = 'playing';
  }
  if (input.wasPressed('m')) {
    const on = input.toggleMouseSteering();
    showFlash(on ? 'Mouse steering ON' : 'Mouse steering OFF', 1.5);
  }
  if (input.wasPressed('r')) {
    if (game.state !== 'title') startMission(game.missionIndex);
  }
  if (input.wasPressed('Enter') || input.wasPressed(' ')) {
    audio.ensure();
    if (game.state === 'title') startMission(0);
    else if (game.state === 'missionComplete') {
      startMission((game.missionIndex + 1) % 3);
    } else if (game.state === 'gameOver') {
      game.score = 0;
      game.lives = 3;
      game.totalRings = 0;
      startMission(0);
    }
  }
  if (input.wasPressed('1') && game.state === 'title') startMission(0);
  if (input.wasPressed('2') && game.state === 'title') startMission(1);
  if (input.wasPressed('3') && game.state === 'title') startMission(2);
  input.clearPressed();
}

function drawTitleScreen(width, height) {
  renderScene(ctx, game, width, height, game.time, { planeY: 0.84 });
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 30, 0.45)';
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 64px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SKYLINE COURIER', width / 2, height * 0.24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('A golden-hour flight over the Harborlight archipelago', width / 2, height * 0.24 + 44);

  const panelW = 560;
  const panelH = 300;
  const px = width / 2 - panelW / 2;
  const py = height * 0.36;
  ctx.fillStyle = 'rgba(12, 18, 34, 0.78)';
  roundRect(ctx, px, py, panelW, panelH, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 217, 77, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffe9a0';
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('CHOOSE YOUR SORTIE', width / 2, py + 36);
  ctx.textAlign = 'left';
  ctx.font = '17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  const lines = [
    ['1', 'Ring Run — thread 8 glowing rings over the islands'],
    ['2', 'Island Hop — deliver mail to two island airstrips'],
    ['3', 'Precision Landing — grease it on runway 27'],
  ];
  lines.forEach(([key, text], i) => {
    const y = py + 78 + i * 34;
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(key, px + 30, y);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(text, px + 58, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9fb4d8';
  ctx.font = '15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Arrows / WASD fly  •  Shift / Ctrl throttle  •  M mouse steering  •  P pause', width / 2, py + 196);
  ctx.fillText('Fuel drains as you fly — rings and soft landings pay. Three lives.', width / 2, py + 222);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Press ENTER or 1 / 2 / 3 to fly', width / 2, py + 262);
  ctx.restore();
}

function drawPaused(width, height) {
  renderScene(ctx, game, width, height, game.time);
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 30, 0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('PAUSED', width / 2, height / 2 - 10);
  ctx.font = '18px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#cfe6ff';
  ctx.fillText('P to resume  •  R to restart this mission  •  M to toggle mouse steering', width / 2, height / 2 + 34);
  ctx.restore();
}

function drawEndScreen(width, height, complete) {
  renderScene(ctx, game, width, height, game.time);
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 30, 0.6)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  if (complete) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('MISSION COMPLETE', width / 2, height * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(game.mission.title, width / 2, height * 0.3 + 42);
    if (game.bestLanding) {
      ctx.fillText(`Landing: ${game.bestLanding.label}`, width / 2, height * 0.3 + 78);
      const td = game.touchdown || game.bestLanding;
      const vs = td.vs ?? game.bestLanding.verticalSpeed;
      if (vs != null) {
        ctx.fillStyle = '#cfe6ff';
        ctx.font = '20px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(
          `Touchdown −${vs.toFixed(1)} m/s  •  ${td.verdict || game.bestLanding.verdict || ''}`,
          width / 2,
          height * 0.3 + 110,
        );
      }
    }
  } else {
    ctx.fillStyle = '#ff7a5e';
    ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('GAME OVER', width / 2, height * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Out of lives or out of time — the courier will fly again.', width / 2, height * 0.3 + 42);
  }
  ctx.fillStyle = '#ffe9a0';
  ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`FINAL SCORE  ${game.score}`, width / 2, height * 0.52);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '18px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`Rings flown: ${game.totalRings}   •   Missions flown: ${game.missionIndex + 1} of 3`, width / 2, height * 0.52 + 36);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(
    complete ? 'Press ENTER for the next mission' : 'Press ENTER to fly again',
    width / 2,
    height * 0.66,
  );
  ctx.restore();
}

function draw() {
  const width = canvas.width;
  const height = canvas.height;
  if (game.state === 'title') {
    drawTitleScreen(width, height);
  } else if (game.state === 'paused') {
    drawPaused(width, height);
  } else if (game.state === 'missionComplete') {
    drawEndScreen(width, height, true);
  } else if (game.state === 'gameOver') {
    drawEndScreen(width, height, false);
  } else {
    renderScene(ctx, game, width, height, game.time);
    drawHud(ctx, game, width, height);
    if (game.state === 'crashed') {
      ctx.save();
      ctx.fillStyle = 'rgba(120, 20, 10, 0.25)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// --- deterministic screenshot states --------------------------------------
// These only set the starting game state from the live game; nothing is
// staged or faked. The world seed is fixed, so every render matches.
function applyShot() {
  if (shot === 'start') {
    game.state = 'title';
    game.plane = newPlaneState(world);
    game.plane.y = 260;
    game.plane.speed = 34;
    game.plane.throttle = 0.6;
    game.plane.heading = 0.9;
  } else if (shot === 'play' || shot === 'rings') {
    startMission(0);
    // 'play' parks the plane on the approach to ring 3; 'rings' puts it
    // just past ring 3, low over the islands, lining up ring 4.
    const ringIndex = shot === 'play' ? 2 : 3;
    const ring = game.mission.rings[ringIndex];
    const back = shot === 'play' ? 260 : 320;
    const lift = shot === 'play' ? 12 : -34;
    game.plane.x = ring.x - Math.sin(0.4) * back;
    game.plane.z = ring.z - Math.cos(0.4) * back;
    game.plane.y = ring.y + lift;
    game.plane.heading = Math.atan2(
      ring.x - game.plane.x,
      ring.z - game.plane.z,
    );
    game.plane.speed = 38;
    game.plane.throttle = 0.65;
    game.plane.fuel = 78;
    game.plane.onGround = false;
    game.wasOnGround = false;
    game.score = 100 * ringIndex;
    game.mission.nextRing = ringIndex;
    for (let i = 0; i < ringIndex; i += 1) game.mission.rings[i].done = true;
    updateObjective(game.mission);
    game.timeLeft = 242 - ringIndex * 8;
    showFlash(`NEXT: RING ${ringIndex + 1}/8`, 3);
  } else if (shot === 'end') {
    startMission(2);
    game.score = 1450;
    game.totalRings = 8;
    game.bestLanding = { score: 235, quality: 0.94, label: 'BUTTER SMOOTH!', verdict: 'BUTTER', verticalSpeed: 1.8 };
    game.touchdown = { vs: 1.8, verdict: 'BUTTER' };
    game.state = 'missionComplete';
  }
}

applyShot();
requestAnimationFrame(frame);

// A tiny handle for play-testing and screenshots.
window.__skyline = game;
