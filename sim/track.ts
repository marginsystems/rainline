import { mod } from './math.ts';

export interface TrackSample {
  readonly x: number;
  readonly z: number;
  readonly tx: number;
  readonly tz: number;
  readonly nx: number;
  readonly nz: number;
  readonly s: number;
  readonly curvature: number;
}

export interface Track {
  readonly samples: readonly TrackSample[];
  readonly length: number;
  readonly spacing: number;
  readonly halfWidth: number;
  readonly kerbWidth: number;
  readonly wallOffset: number;
}

export interface TrackLocation {
  readonly index: number;
  readonly lateral: number;
  readonly progress: number;
}

export interface TrackLayout {
  readonly points: readonly (readonly [number, number])[];
  readonly halfWidth: number;
  readonly kerbWidth: number;
  readonly wallOffset: number;
  readonly spacing: number;
}

export const DUSK_CIRCUIT: TrackLayout = {
  points: [
    [-150, -150], [-30, -156], [60, -140], [112, -104], [170, -110], [235, -70], [250, 5], [198, 47], [135, 42],
    [93, 76], [114, 137], [190, 160], [225, 225], [170, 285], [90, 270], [58, 203], [2, 184], [-50, 230],
    [-120, 270], [-190, 230], [-180, 150], [-110, 110], [-90, 40], [-150, -5], [-223, 11], [-275, -30], [-250, -110],
  ],
  halfWidth: 8,
  kerbWidth: 1.2,
  wallOffset: 12.5,
  spacing: 1,
};

export const COAST_HIGHWAY: TrackLayout = {
  points: [
    [-1000, 0], [-800, -14], [-600, -26], [-400, -14], [-200, 8], [0, 22], [200, 12],
    [400, -8], [600, -20], [800, -10], [1000, 0], [1100, 0], [1200, 0], [1264.7, 8.5],
    [1325, 33.5], [1376.8, 73.2], [1416.5, 125], [1441.5, 185.3], [1450, 250], [1441.5, 314.7], [1416.5, 375],
    [1376.8, 426.8], [1325, 466.5], [1264.7, 491.5], [1200, 500], [1100, 500], [900, 500], [600, 500],
    [300, 500], [0, 500], [-300, 500], [-600, 500], [-900, 500], [-1100, 500], [-1200, 500],
    [-1264.7, 491.5], [-1325, 466.5], [-1376.8, 426.8], [-1416.5, 375], [-1441.5, 314.7], [-1450, 250], [-1441.5, 185.3],
    [-1416.5, 125], [-1376.8, 73.2], [-1325, 33.5], [-1264.7, 8.5], [-1200, 0], [-1100, 0],
  ],
  halfWidth: 7.4,
  kerbWidth: 1.2,
  wallOffset: 9.6,
  spacing: 1,
};

const DENSE_STEPS_PER_SEGMENT = 96;
const LOCATE_WINDOW = 48;

function pointAt(points: readonly (readonly [number, number])[], i: number): readonly [number, number] {
  const p = points[mod(i, points.length)];
  if (!p) throw new Error('track has no control points');
  return p;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

function densePolyline(points: readonly (readonly [number, number])[]): { xs: number[]; zs: number[] } {
  const xs: number[] = [], zs: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = pointAt(points, i - 1), b = pointAt(points, i), c = pointAt(points, i + 1), d = pointAt(points, i + 2);
    for (let k = 0; k < DENSE_STEPS_PER_SEGMENT; k++) {
      const t = k / DENSE_STEPS_PER_SEGMENT;
      xs.push(catmullRom(a[0], b[0], c[0], d[0], t));
      zs.push(catmullRom(a[1], b[1], c[1], d[1], t));
    }
  }
  return { xs, zs };
}

const at = (values: readonly number[], i: number): number => values[mod(i, values.length)] ?? 0;

export function buildTrack(layout: TrackLayout): Track {
  const { xs, zs } = densePolyline(layout.points);
  const n = xs.length;
  const cumulative: number[] = [0];
  for (let i = 0; i < n; i++) cumulative.push(at(cumulative, i) + Math.hypot(at(xs, i + 1) - at(xs, i), at(zs, i + 1) - at(zs, i)));
  const length = at(cumulative, n);
  const count = Math.round(length / layout.spacing);
  const spacing = length / count;
  const px: number[] = [], pz: number[] = [];
  let segment = 0;
  for (let i = 0; i < count; i++) {
    const s = i * spacing;
    while (segment < n - 1 && at(cumulative, segment + 1) < s) segment++;
    const span = at(cumulative, segment + 1) - at(cumulative, segment);
    const t = span > 0 ? (s - at(cumulative, segment)) / span : 0;
    px.push(at(xs, segment) + (at(xs, segment + 1) - at(xs, segment)) * t);
    pz.push(at(zs, segment) + (at(zs, segment + 1) - at(zs, segment)) * t);
  }
  const tangents: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const dx = at(px, i + 1) - at(px, i - 1), dz = at(pz, i + 1) - at(pz, i - 1);
    const len = Math.hypot(dx, dz) || 1;
    tangents.push({ x: dx / len, z: dz / len });
  }
  const samples: TrackSample[] = [];
  for (let i = 0; i < count; i++) {
    const t = tangents[i], before = tangents[mod(i - 1, count)], after = tangents[mod(i + 1, count)];
    if (!t || !before || !after) throw new Error('track tangent missing');
    const curvature = (before.z * after.x - before.x * after.z) / (2 * spacing);
    samples.push({ x: at(px, i), z: at(pz, i), tx: t.x, tz: t.z, nx: t.z, nz: -t.x, s: i * spacing, curvature });
  }
  return { samples, length, spacing, halfWidth: layout.halfWidth, kerbWidth: layout.kerbWidth, wallOffset: layout.wallOffset };
}

export function sampleAt(track: Track, index: number): TrackSample {
  const sample = track.samples[mod(index, track.samples.length)];
  if (!sample) throw new Error('track has no samples');
  return sample;
}

export function locate(track: Track, x: number, z: number, hint: number | null): TrackLocation {
  const n = track.samples.length;
  let best = 0, bestDistance = Number.POSITIVE_INFINITY;
  const consider = (i: number): void => {
    const sample = sampleAt(track, i);
    const d = (x - sample.x) ** 2 + (z - sample.z) ** 2;
    if (d < bestDistance) { bestDistance = d; best = mod(i, n); }
  };
  if (hint === null) for (let i = 0; i < n; i++) consider(i);
  else for (let k = -LOCATE_WINDOW; k <= LOCATE_WINDOW; k++) consider(hint + k);
  const sample = sampleAt(track, best);
  const dx = x - sample.x, dz = z - sample.z;
  return { index: best, lateral: dx * sample.nx + dz * sample.nz, progress: mod(sample.s + dx * sample.tx + dz * sample.tz, track.length) };
}

export function pointOnTrack(track: Track, index: number, lateral: number): { x: number; z: number } {
  const sample = sampleAt(track, index);
  return { x: sample.x + sample.nx * lateral, z: sample.z + sample.nz * lateral };
}

export function minimumRadius(track: Track): number {
  let tightest = 0;
  for (const sample of track.samples) tightest = Math.max(tightest, Math.abs(sample.curvature));
  return tightest > 0 ? 1 / tightest : Number.POSITIVE_INFINITY;
}
