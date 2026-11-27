import type { CarInput } from '../sim/car.ts';

const DEADZONE = 0.12;
const LOOK_BACK_BUTTON = 2;
const LOOK_BACK_KEY = 'KeyC';

export interface LookInput {
  readonly pixelsX: number;
  readonly pixelsY: number;
  readonly back: boolean;
  readonly backKey: boolean;
}

export interface Controls {
  read(): CarInput;
  look(): LookInput;
  consume(code: string): boolean;
  discard(): void;
  hold(code: string): void;
  release(code: string): void;
  tap(code: string): void;
}

const axis = (value: number): number => (Math.abs(value) < DEADZONE ? 0 : (value - Math.sign(value) * DEADZONE) / (1 - DEADZONE));

export function createControls(target: Window): Controls {
  const held = new Set<string>();
  const pressed = new Set<string>();
  const padHeld = new Set<number>();
  target.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter' || event.code.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  target.addEventListener('keyup', (event) => held.delete(event.code));
  let lookX = 0, lookY = 0, lookBack = false;
  const onGame = (event: Event): boolean => event.target instanceof HTMLCanvasElement;
  target.addEventListener('mousemove', (event) => {
    if (!onGame(event)) return;
    lookX += event.movementX;
    lookY += event.movementY;
  });
  target.addEventListener('mousedown', (event) => {
    if (event.button === LOOK_BACK_BUTTON && onGame(event)) lookBack = true;
  });
  target.addEventListener('mouseup', (event) => {
    if (event.button === LOOK_BACK_BUTTON) lookBack = false;
  });
  target.addEventListener('contextmenu', (event) => {
    if (onGame(event)) event.preventDefault();
  });
  target.addEventListener('blur', () => {
    held.clear();
    lookBack = false;
  });
  const down = (...codes: string[]): boolean => codes.some((code) => held.has(code));

  function pad(): Gamepad | null {
    for (const candidate of navigator.getGamepads()) if (candidate && candidate.connected) return candidate;
    return null;
  }

  const PAD_KEYS: readonly (readonly [number, string])[] = [[9, 'Enter'], [8, 'Escape'], [3, 'KeyR'], [4, 'KeyH']];

  return {
    read() {
      const gamepad = pad();
      const button = (index: number): number => gamepad?.buttons[index]?.value ?? 0;
      if (gamepad) {
        for (const [index, code] of PAD_KEYS) {
          const isDown = button(index) > 0.5;
          if (isDown && !padHeld.has(index)) pressed.add(code);
          if (isDown) padHeld.add(index);
          else padHeld.delete(index);
        }
      }
      const keySteer = (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0);
      const stick = gamepad ? -axis(gamepad.axes[0] ?? 0) : 0;
      return {
        throttle: Math.max(down('KeyW', 'ArrowUp') ? 1 : 0, button(7)),
        brake: Math.max(down('KeyS', 'ArrowDown') ? 1 : 0, button(6)),
        steer: Math.max(-1, Math.min(1, keySteer + stick)),
        handbrake: down('Space') || button(0) > 0.5,
        boost: down('ShiftLeft', 'ShiftRight') || button(1) > 0.5 || button(2) > 0.5,
      };
    },
    look() {
      const turned = { pixelsX: lookX, pixelsY: lookY, back: lookBack, backKey: held.has(LOOK_BACK_KEY) };
      lookX = 0;
      lookY = 0;
      return turned;
    },
    consume(code) {
      return pressed.delete(code);
    },
    discard() {
      pressed.clear();
    },
    hold(code) {
      if (!held.has(code)) pressed.add(code);
      held.add(code);
    },
    release(code) {
      held.delete(code);
    },
    tap(code) {
      pressed.add(code);
    },
  };
}
