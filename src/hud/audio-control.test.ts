import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_AUDIO, parseAudioSetting } from './audio-control.ts';

test('a missing or broken saved setting falls back to the default', () => {
  assert.deepEqual(parseAudioSetting(null), DEFAULT_AUDIO);
  assert.deepEqual(parseAudioSetting('not json'), DEFAULT_AUDIO);
  assert.deepEqual(parseAudioSetting('7'), DEFAULT_AUDIO);
});

test('a saved setting is read back with its volume kept between 0 and 1', () => {
  assert.deepEqual(parseAudioSetting('{"volume":0.35,"muted":true}'), { volume: 0.35, muted: true });
  assert.deepEqual(parseAudioSetting('{"volume":4,"muted":false}'), { volume: 1, muted: false });
  assert.deepEqual(parseAudioSetting('{"volume":"loud"}'), { volume: DEFAULT_AUDIO.volume, muted: false });
});
