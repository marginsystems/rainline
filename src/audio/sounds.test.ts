import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_SOUNDS, engineMix, FALLBACK_SOUNDS, soundUrls, type LoopSound } from './sounds.ts';

const LAYERS: LoopSound[] = ['engine-idle-loop', 'engine-low-loop', 'engine-mid-loop', 'engine-high-loop'];

test('sound names are unique and fallbacks name real sounds', () => {
  assert.equal(new Set(ALL_SOUNDS).size, ALL_SOUNDS.length);
  for (const name of Object.keys(FALLBACK_SOUNDS)) assert.ok(ALL_SOUNDS.some((sound) => sound === name));
});

test('a single engine loop is pitched up with the revs', () => {
  const idle = engineMix(0.2, ['engine-loop']), high = engineMix(1, ['engine-loop']);
  assert.equal(idle.length, 1);
  assert.ok((high[0]?.rate ?? 0) > (idle[0]?.rate ?? 0) * 2);
  assert.deepEqual(engineMix(0.5, []), []);
});

test('layered engine loops crossfade at constant power', () => {
  for (let rpm = 0; rpm <= 1.001; rpm += 0.05) {
    const mix = engineMix(rpm, LAYERS);
    const power = mix.reduce((sum, layer) => sum + layer.volume * layer.volume, 0);
    assert.ok(Math.abs(power - 1) < 1e-6, `power ${power} at ${rpm}`);
  }
  const low = engineMix(0.05, LAYERS), high = engineMix(1, LAYERS);
  assert.equal(low.find((layer) => layer.name === 'engine-idle-loop')?.volume, 1);
  assert.equal(high.find((layer) => layer.name === 'engine-high-loop')?.volume, 1);
});

test('a local copy is tried first, then the shipped file, then the fallback', () => {
  assert.deepEqual(soundUrls('engine-loop', ['engine-loop']), ['local/audio/engine-loop.ogg', 'audio/engine-loop.ogg', 'audio/fallback/engine.ogg']);
  assert.deepEqual(soundUrls('horn', []), ['audio/horn.ogg']);
});
