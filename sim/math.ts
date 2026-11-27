export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));

export const mod = (x: number, n: number): number => ((x % n) + n) % n;

export const wrapAngle = (a: number): number => mod(a + Math.PI, Math.PI * 2) - Math.PI;

export const dampAngle = (current: number, target: number, rate: number, dt: number): number => current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
