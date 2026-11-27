export type TouchAction = 'hold' | 'tap';
export type TouchCluster = 'steer' | 'drive' | 'kick' | 'menu';

export interface TouchButton {
  readonly label: string;
  readonly code: string;
  readonly action: TouchAction;
  readonly cluster: TouchCluster;
  readonly size: 'big' | 'small';
}

export interface TouchTarget {
  hold(code: string): void;
  release(code: string): void;
  tap(code: string): void;
}

const DRIVING: readonly TouchButton[] = [
  { label: '◀', code: 'ArrowLeft', action: 'hold', cluster: 'steer', size: 'big' },
  { label: '▶', code: 'ArrowRight', action: 'hold', cluster: 'steer', size: 'big' },
  { label: 'Nitro', code: 'ShiftLeft', action: 'hold', cluster: 'drive', size: 'small' },
  { label: 'Drift', code: 'Space', action: 'hold', cluster: 'drive', size: 'small' },
  { label: 'Brake', code: 'ArrowDown', action: 'hold', cluster: 'drive', size: 'small' },
  { label: 'Gas', code: 'ArrowUp', action: 'hold', cluster: 'drive', size: 'big' },
  { label: 'Menu', code: 'Escape', action: 'tap', cluster: 'menu', size: 'small' },
  { label: 'Reset', code: 'KeyR', action: 'tap', cluster: 'menu', size: 'small' },
];

const KICKS: readonly TouchButton[] = [
  { label: 'Kick ◀', code: 'KeyZ', action: 'tap', cluster: 'kick', size: 'small' },
  { label: 'Kick ▶', code: 'KeyC', action: 'tap', cluster: 'kick', size: 'small' },
];

export const touchLayout = (kicks: boolean): readonly TouchButton[] => (kicks ? [...DRIVING, ...KICKS] : DRIVING);

export const TOUCH_CLUSTERS: readonly TouchCluster[] = ['steer', 'drive', 'kick', 'menu'];

export function createTouchControls(target: TouchTarget, kicks: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = 'touch';
  const clusters = new Map<TouchCluster, HTMLElement>();
  for (const name of TOUCH_CLUSTERS) {
    const cluster = document.createElement('div');
    cluster.className = `touch-cluster ${name}`;
    clusters.set(name, cluster);
    root.append(cluster);
  }
  for (const spec of touchLayout(kicks)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-button ${spec.size}`;
    button.textContent = spec.label;
    button.setAttribute('aria-label', spec.label);
    const pointers = new Set<number>();
    const press = (event: PointerEvent): void => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (pointers.size === 0) {
        if (spec.action === 'hold') target.hold(spec.code);
        else target.tap(spec.code);
        button.classList.add('down');
      }
      pointers.add(event.pointerId);
    };
    const lift = (event: PointerEvent): void => {
      if (!pointers.delete(event.pointerId) || pointers.size > 0) return;
      if (spec.action === 'hold') target.release(spec.code);
      button.classList.remove('down');
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', lift);
    button.addEventListener('pointercancel', lift);
    button.addEventListener('lostpointercapture', lift);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    clusters.get(spec.cluster)?.append(button);
  }
  return root;
}
