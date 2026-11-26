// Skyline Courier — input: keyboard plus optional mouse steering.
//
// Arrow keys / WASD pitch and roll, Shift / Ctrl (or +/-) work the
// throttle, P pauses, M toggles mouse steering, R restarts, Enter
// confirms on menus. The game never needs the mouse to fly, but moving
// it steers gently once mouse steering is on.

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, lastMove: -10, steering: false };
  const pressed = new Set(); // edge-triggered keys, consumed by the game

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width - 0.5;
    mouse.y = (e.clientY - rect.top) / rect.height - 0.5;
    mouse.lastMove = performance.now() / 1000;
    mouse.active = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.active = false; });

  /** Read the current stick position: -1..1 on each axis. */
  function readStick(now) {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('w')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('s')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('a')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) roll += 1;

    // Mouse steering: pointer offset from centre banks and pitches.
    // It only counts while the mouse moved recently, so a parked mouse
    // never fights the keyboard.
    if (mouse.steering && mouse.active && now - mouse.lastMove < 2.5) {
      const mRoll = clamp(mouse.x * 2.4, -1, 1);
      const mPitch = clamp(-mouse.y * 2.4, -1, 1);
      if (Math.abs(mRoll) > 0.12) roll = mRoll;
      if (Math.abs(mPitch) > 0.12) pitch = mPitch;
    }

    let throttle = 0;
    if (keys.has('Shift') || keys.has('=') || keys.has('+')) throttle += 1;
    if (keys.has('Control') || keys.has('-') || keys.has('_')) throttle -= 1;
    return { pitch, roll, throttle };
  }

  function wasPressed(k) {
    if (pressed.has(k)) {
      pressed.delete(k);
      return true;
    }
    return false;
  }

  function clearPressed() {
    pressed.clear();
  }

  function toggleMouseSteering() {
    mouse.steering = !mouse.steering;
    return mouse.steering;
  }

  return { keys, mouse, readStick, wasPressed, clearPressed, toggleMouseSteering };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
