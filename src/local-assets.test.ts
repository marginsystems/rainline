import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localCastUrl, localSoundUrl, NO_LOCAL_ASSETS, parseLocalManifest } from './local-assets.ts';

test('a missing or malformed manifest means no local assets', () => {
  assert.deepEqual(parseLocalManifest(null), NO_LOCAL_ASSETS);
  assert.deepEqual(parseLocalManifest('sounds'), NO_LOCAL_ASSETS);
  assert.deepEqual(parseLocalManifest({ sounds: 'horn', cast: 3 }), NO_LOCAL_ASSETS);
});

test('the manifest keeps only plain file names', () => {
  const manifest = parseLocalManifest({ sounds: ['horn', '../secret', 'Horn', 7, 'engine-loop'], cast: ['granny-skate', 'a/b'] });
  assert.deepEqual(manifest.sounds, ['horn', 'engine-loop']);
  assert.deepEqual(manifest.cast, ['granny-skate']);
});

test('local files resolve relative to the page', () => {
  assert.equal(localSoundUrl('horn'), 'local/audio/horn.ogg');
  assert.equal(localCastUrl('granny-skate'), 'local/models/cast/granny-skate.glb');
});
