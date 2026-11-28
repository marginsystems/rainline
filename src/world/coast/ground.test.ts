import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrack, COAST_HIGHWAY, sampleAt } from '../../../sim/track.ts';
import { coastTerrain } from './ground.ts';
import { COAST, sectionOf } from './plan.ts';

const track = buildTrack(COAST_HIGHWAY);
const terrain = coastTerrain(track);

function firstAlong(section: ReturnType<typeof sectionOf>): number {
  for (let i = 0; i < track.samples.length; i += 10) {
    const sample = sampleAt(track, i);
    if (sectionOf(sample) === section && sectionOf(sampleAt(track, i + 60)) === section && sectionOf(sampleAt(track, i - 60)) === section) return sample.s;
  }
  throw new Error(`no ${section} on the coast highway`);
}

test('the road is flat, the hill rises on one side past the guardrail and the shore falls on the other', () => {
  const along = firstAlong('coast');
  assert.equal(terrain.height(along, 0), 0);
  assert.equal(terrain.height(along, track.wallOffset - 0.5), 0);
  assert.ok(terrain.height(along, track.wallOffset + 12) > 4);
  assert.ok(terrain.height(along, -(track.wallOffset + 12)) < -4);
  const rail = terrain.barrier(along);
  assert.ok(rail && rail.at === track.wallOffset && rail.top > 0.5 && rail.top < 1.2);
});

test('the tunnel has walls to the ceiling, and off the bridge there is only the sea', () => {
  const tunnel = terrain.barrier(firstAlong('tunnel'));
  assert.ok(tunnel && tunnel.top > 6 && tunnel.at > track.wallOffset);
  const bridge = firstAlong('bridge');
  assert.equal(terrain.height(bridge, 5), 0);
  assert.equal(terrain.height(bridge, 20), COAST.seaLevel);
});
