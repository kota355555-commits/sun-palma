// Sun Palma — keyboard + mouse input. Held keys are read every frame; one-shot
// presses (pause, interact, reload, mute) are queued as flags and taken once.

export const ACTION_PAUSE = 1;
export const ACTION_INTERACT = 2;
export const ACTION_RELOAD = 4;
export const ACTION_MUTE = 8;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let lookDX = 0;
  let lookDY = 0;
  let clicked = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_INTERACT;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('click', () => {
    if (!locked && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (locked) {
      lookDX += event.movementX;
      lookDY += event.movementY;
    }
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) clicked = true;
  });

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
    moveVector() {
      // x: strafe right, y: forward — in camera space
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { f, s, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), brake: keys.has('Space') };
    },
    isLocked() { return locked; },
  };
}
