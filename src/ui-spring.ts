export interface SpringSpec {
  readonly response: number;
  readonly dampingFraction: number;
}

export const UI_SPRINGS = {
  snappy: { response: 0.26, dampingFraction: 0.82 },
  smooth: { response: 0.5, dampingFraction: 0.92 },
  bouncy: { response: 0.42, dampingFraction: 0.6 },
} as const satisfies Record<string, SpringSpec>;

const SETTLED = 0.001;
const CURVE_STEPS = 40;

export function springValue(spec: SpringSpec, seconds: number): number {
  const omega = (2 * Math.PI) / spec.response;
  const zeta = spec.dampingFraction;
  if (zeta >= 1) return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds);
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * seconds) * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds));
}

export function springSeconds(spec: SpringSpec): number {
  return Math.log(1 / SETTLED) / (Math.min(spec.dampingFraction, 1) * ((2 * Math.PI) / spec.response));
}

export function springEasing(spec: SpringSpec): string {
  const seconds = springSeconds(spec);
  const points: string[] = [];
  for (let i = 0; i <= CURVE_STEPS; i++) points.push(i === CURVE_STEPS ? '1' : springValue(spec, (seconds * i) / CURVE_STEPS).toFixed(4));
  return `linear(${points.join(', ')})`;
}

export function installSpringVariables(style: CSSStyleDeclaration): void {
  for (const [name, spec] of Object.entries(UI_SPRINGS)) {
    style.setProperty(`--spring-${name}`, springEasing(spec));
    style.setProperty(`--spring-${name}-ms`, `${Math.round(springSeconds(spec) * 1000)}ms`);
  }
}

export interface SpringState {
  x: number;
  v: number;
}

export function stepSpring(state: SpringState, target: number, spec: SpringSpec, dt: number): void {
  const omega = (2 * Math.PI) / spec.response;
  const steps = Math.max(1, Math.ceil(dt / 0.004));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.v += (omega * omega * (target - state.x) - 2 * spec.dampingFraction * omega * state.v) * h;
    state.x += state.v * h;
  }
}
