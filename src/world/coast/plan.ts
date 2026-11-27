import { mod } from '../../../sim/math.ts';
import { sampleAt, type Track, type TrackSample } from '../../../sim/track.ts';

export const COAST = {
  tunnelBeyondX: 1150,
  bridgeBeyondZ: 250,
  seaLevel: -12,
  shelterRampMetres: 45,
  hill: [[1.6, 0], [3.2, 1.4], [7, 4.6], [16, 9.5], [36, 16], [72, 25], [130, 33], [210, 39]],
  shore: [[1.4, 0], [3.2, -1.4], [9, -7], [16, -12.6]],
  towerAtX: 500,
  towerTop: 108,
  cableLow: 7,
  cableAnchor: 2.2,
} as const;

export type Section = 'coast' | 'tunnel' | 'bridge';

export interface Span {
  readonly section: Section;
  readonly from: number;
  readonly to: number;
}

export function sectionOf(sample: TrackSample): Section {
  if (Math.abs(sample.x) > COAST.tunnelBeyondX) return 'tunnel';
  return sample.z > COAST.bridgeBeyondZ ? 'bridge' : 'coast';
}

export function spansOf(track: Track): Span[] {
  const n = track.samples.length;
  let start = 0;
  while (start < n && sectionOf(sampleAt(track, start)) === sectionOf(sampleAt(track, start - 1))) start++;
  const spans: Span[] = [];
  let from = start;
  for (let step = 1; step <= n; step++) {
    const index = start + step;
    if (step < n && sectionOf(sampleAt(track, index)) === sectionOf(sampleAt(track, from))) continue;
    spans.push({ section: sectionOf(sampleAt(track, from)), from, to: index });
    from = index;
  }
  return spans;
}

export function stations(track: Track, span: Span, everyMetres: number, startMetres: number): number[] {
  const found: number[] = [];
  const stride = everyMetres / track.spacing;
  for (let at = startMetres / track.spacing; span.from + at < span.to; at += stride) found.push(mod(Math.round(span.from + at), track.samples.length));
  return found;
}

export function shelterAt(track: Track, spans: readonly Span[], index: number): number {
  const n = track.samples.length;
  const wrapped = mod(index, n);
  for (const span of spans) {
    if (span.section !== 'tunnel') continue;
    const inside = mod(wrapped - span.from, n);
    const length = span.to - span.from;
    if (inside >= length) continue;
    const depth = Math.min(inside, length - inside) * track.spacing;
    return Math.min(1, depth / COAST.shelterRampMetres);
  }
  return 0;
}

function profileHeight(profile: readonly (readonly [number, number])[], outside: number): number {
  const first = profile[0], last = profile[profile.length - 1];
  if (!first || !last) return 0;
  if (outside <= first[0]) return first[1];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (!a || !b || outside > b[0]) continue;
    return a[1] + ((b[1] - a[1]) * (outside - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

export const hillHeight = (outside: number): number => profileHeight(COAST.hill, outside);
export const shoreHeight = (outside: number): number => profileHeight(COAST.shore, outside);

export function cableHeight(x: number): number {
  const reach = Math.abs(x);
  if (reach <= COAST.towerAtX) {
    const t = reach / COAST.towerAtX;
    return COAST.cableLow + (COAST.towerTop - COAST.cableLow) * t * t;
  }
  const t = Math.min(1, (reach - COAST.towerAtX) / (COAST.tunnelBeyondX - COAST.towerAtX));
  const straight = COAST.towerTop + (COAST.cableAnchor - COAST.towerTop) * t;
  return straight - (COAST.towerTop - COAST.cableAnchor) * 0.22 * t * (1 - t);
}
