import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_QUALITY, defaultQuality, nextQualityChoice, parseQualityChoice, qualityLabel } from './quality-control.ts';

const NAMES = ['Ultra', 'High', 'Medium', 'Low', 'Minimum'];

test('with nothing saved the game starts on the top fixed tier, not on Auto', () => {
  assert.equal(DEFAULT_QUALITY, 0);
  assert.equal(parseQualityChoice(null, NAMES.length), 0);
  assert.equal(parseQualityChoice('', NAMES.length), 0);
});

test('a saved choice is read back, and anything out of range falls back to the default', () => {
  assert.equal(parseQualityChoice('auto', NAMES.length), 'auto');
  assert.equal(parseQualityChoice('3', NAMES.length), 3);
  assert.equal(parseQualityChoice('9', NAMES.length), DEFAULT_QUALITY);
  assert.equal(parseQualityChoice('-1', NAMES.length), DEFAULT_QUALITY);
  assert.equal(parseQualityChoice('1.5', NAMES.length), DEFAULT_QUALITY);
  assert.equal(parseQualityChoice('high', NAMES.length), DEFAULT_QUALITY);
});

test('cycling walks every tier from the top, then Auto, then the top again', () => {
  const seen: string[] = [];
  let choice = parseQualityChoice(null, NAMES.length);
  for (let i = 0; i < NAMES.length + 2; i++) {
    seen.push(qualityLabel(choice, NAMES));
    choice = nextQualityChoice(choice, NAMES.length);
  }
  assert.deepEqual(seen, ['Ultra', 'High', 'Medium', 'Low', 'Minimum', 'Auto', 'Ultra']);
});

test('a touch device with nothing saved starts on Auto', () => {
  assert.equal(defaultQuality(true), 'auto');
  assert.equal(defaultQuality(false), DEFAULT_QUALITY);
  assert.equal(parseQualityChoice(null, NAMES.length, defaultQuality(true)), 'auto');
  assert.equal(parseQualityChoice('2', NAMES.length, defaultQuality(true)), 2);
});
