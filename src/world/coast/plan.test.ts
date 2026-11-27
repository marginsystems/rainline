import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTrack, COAST_HIGHWAY, sampleAt } from '../../../sim/track.ts';
import { cableHeight, COAST, hillHeight, sectionOf, shelterAt, shoreHeight, spansOf, stations } from './plan.ts';

const track = buildTrack(COAST_HIGHWAY);
const spans = spansOf(track);

test('the lap runs coast, tunnel, bridge, tunnel and the spans cover every sample once', () => {
  assert.deepEqual(spans.map((span) => span.section).sort(), ['bridge', 'coast', 'tunnel', 'tunnel']);
  assert.equal(spans.reduce((total, span) => total + span.to - span.from, 0), track.samples.length);
  for (let i = 1; i < spans.length; i++) assert.equal(spans[i]?.from, spans[i - 1]?.to);
  for (const span of spans) for (const index of [span.from, span.to - 1]) assert.equal(sectionOf(sampleAt(track, index)), span.section);
});

test('the start line is out in the open on the coast', () => {
  assert.equal(sectionOf(sampleAt(track, 0)), 'coast');
  assert.equal(shelterAt(track, spans, 0), 0);
});

test('the bends are hidden inside the tunnels and the open road is close to straight', () => {
  for (const sample of track.samples) {
    if (sectionOf(sample) !== 'tunnel') assert.ok(Math.abs(sample.curvature) < 1 / 400, `open road bends at ${sample.s.toFixed(0)} m`);
  }
});

test('shelter rises smoothly from each portal to the middle of a tunnel and is zero outside', () => {
  for (const span of spans) {
    const middle = Math.round((span.from + span.to) / 2);
    if (span.section !== 'tunnel') {
      assert.equal(shelterAt(track, spans, middle), 0);
      continue;
    }
    assert.equal(shelterAt(track, spans, middle), 1);
    assert.equal(shelterAt(track, spans, span.from), 0);
    let previous = 0;
    for (let index = span.from; index < middle; index++) {
      const now = shelterAt(track, spans, index);
      assert.ok(now >= previous && now - previous < 0.05);
      previous = now;
    }
  }
});

test('stations along a span stay inside it at the asked spacing', () => {
  const coast = spans.find((span) => span.section === 'coast');
  if (!coast) throw new Error('no coast span');
  const found = stations(track, coast, 50, 10);
  assert.ok(found.length > 40);
  for (const index of found) assert.equal(sectionOf(sampleAt(track, index)), 'coast');
});

test('the hill climbs away from the road and the shore drops to below sea level', () => {
  assert.equal(hillHeight(0), 0);
  assert.equal(shoreHeight(0), 0);
  let lastHill = 0, lastShore = 0;
  for (let outside = 0; outside < 250; outside += 2) {
    assert.ok(hillHeight(outside) >= lastHill);
    assert.ok(shoreHeight(outside) <= lastShore);
    lastHill = hillHeight(outside);
    lastShore = shoreHeight(outside);
  }
  assert.ok(lastHill > 30);
  assert.ok(lastShore < COAST.seaLevel);
});

test('the bridge cable hangs from the tower tops, clears the deck mid-span and meets the anchorages', () => {
  assert.equal(cableHeight(COAST.towerAtX), COAST.towerTop);
  assert.equal(cableHeight(-COAST.towerAtX), COAST.towerTop);
  assert.equal(cableHeight(0), COAST.cableLow);
  assert.ok(Math.abs(cableHeight(COAST.tunnelBeyondX) - COAST.cableAnchor) < 1e-6);
  for (let x = -COAST.tunnelBeyondX; x <= COAST.tunnelBeyondX; x += 25) assert.ok(cableHeight(x) >= COAST.cableAnchor - 1e-6);
});
