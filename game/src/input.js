// Sun Palma — keyboard + mouse input. Held keys are read every frame; one-shot
// presses (pause, interact, reload, mute) are queued as flags and taken once.

export const ACTION_PAUSE = 1;
export const ACTION_INTERACT = 2;
export const ACTION_RELOAD = 4;
export const ACTION_MUTE = 8;
export const ACTION_WEAPON = 16; // Q: cycle to the next weapon
export const ACTION_RETRY = 32; // T: retry the current mission from stage one

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let lookDX = 0;
  let lookDY = 0;
  let clicked = false;
  let locked = false;
  let weaponKey = -1; // 0..3 when Digit1..Digit4 was pressed, else -1

  // one-shot keys, looked up by code instead of a chain of ifs
  const ACTION_KEYS = {
    KeyP: ACTION_PAUSE,
    Escape: ACTION_PAUSE,
    KeyE: ACTION_INTERACT,
    KeyR: ACTION_RELOAD,
    KeyM: ACTION_MUTE,
    KeyQ: ACTION_WEAPON,
    KeyT: ACTION_RETRY,
  };
  const WEAPON_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

  // named handlers, so each listener is one line to read
  const onKeyDown = (event) => {
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (ACTION_KEYS[event.code]) actions |= ACTION_KEYS[event.code];
    if (WEAPON_KEYS[event.code] !== undefined) weaponKey = WEAPON_KEYS[event.code];
  };
  const onKeyUp = (event) => keys.delete(event.code);
  const onBlur = () => keys.clear();
  const onCanvasClick = () => {
    if (!locked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
  };
  const onMouseMove = (event) => {
    if (locked) {
      lookDX += event.movementX;
      lookDY += event.movementY;
    }
  };
  const onMouseDown = (event) => {
    if (event.button === 0) clicked = true;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('click', onCanvasClick);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    keys,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeLook() {
      const dx = lookDX;
      const dy = lookDY;
      lookDX = 0;
      lookDY = 0;
      return { dx, dy };
    },
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    // one-shot weapon pick (Digit1..Digit4); -1 when nothing was pressed
    takeWeaponKey() {
      const w = weaponKey;
      weaponKey = -1;
      return w;
    },
    moveVector() {
      // forward and strafe from the held keys, in camera space
      const down = (...codes) => codes.some((c) => keys.has(c));
      const f = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
      const s = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
      return { f, s, run: down('ShiftLeft', 'ShiftRight'), brake: keys.has('Space') };
    },
    isLocked() { return locked; },
  };
}
