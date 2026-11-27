import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrack, COAST_HIGHWAY, DUSK_CIRCUIT, locate, minimumRadius, pointOnTrack, sampleAt, type TrackLayout } from './track.ts';

const LAYOUTS: readonly (readonly [string, TrackLayout])[] = [['night circuit', DUSK_CIRCUIT], ['coast highway', COAST_HIGHWAY]];

for (const [name, layout] of LAYOUTS) {
const track = buildTrack(layout);

test(`${name}: the track is a closed loop of evenly spaced samples`, () => {
  const n = track.samples.length;
  for (let i = 0; i < n; i++) {
    const a = sampleAt(track, i), b = sampleAt(track, i + 1);
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(Math.abs(gap - track.spacing) < 0.05, `gap ${gap} at ${i}`);
    assert.ok(Math.abs(Math.hypot(a.tx, a.tz) - 1) < 1e-6);
  }
});

test(`${name}: every corner is wide enough that the inner wall does not fold`, () => {
  assert.ok(minimumRadius(track) > track.wallOffset + 8, `tightest radius ${minimumRadius(track)}`);
});

test(`${name}: distant parts of the track never come close enough to share a wall`, () => {
  const n = track.samples.length;
  for (let i = 0; i < n; i += 3) {
    for (let j = i + 3; j < n; j += 3) {
      if (Math.min(j - i, n - (j - i)) < 90) continue;
      const a = sampleAt(track, i), b = sampleAt(track, j);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > track.wallOffset * 2 + 20);
    }
  }
});

test(`${name}: locate finds the lateral offset and progress of a point beside the track`, () => {
  for (const index of [0, 200, 640, 1250]) {
    for (const offset of [-6, 0, 4.5]) {
      const p = pointOnTrack(track, index, offset);
      const global = locate(track, p.x, p.z, null);
      const hinted = locate(track, p.x, p.z, index + 10);
      assert.ok(Math.abs(global.lateral - offset) < 0.2, `lateral ${global.lateral} for ${offset}`);
      assert.ok(Math.abs(hinted.lateral - offset) < 0.2);
      assert.ok(Math.abs(global.progress - sampleAt(track, index).s) < 1);
    }
  }
});
}

test('the coast highway is mostly straight road with two wide sweeping ends', () => {
  const track = buildTrack(COAST_HIGHWAY);
  const nearlyStraight = track.samples.filter((sample) => Math.abs(sample.curvature) < 1 / 600).length / track.samples.length;
  assert.ok(nearlyStraight > 0.6, `${(nearlyStraight * 100).toFixed(0)}% straight`);
  assert.ok(minimumRadius(track) > 200, `tightest radius ${minimumRadius(track)}`);
  assert.ok(track.length > 5500);
});
