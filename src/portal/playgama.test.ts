import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bridge, InterstitialState } from './bridge.ts';
import { playgamaSdk, startPlaygama } from './playgama.ts';
import { NO_PORTAL } from './portal.ts';

function fakeBridge() {
  const sent: string[] = [];
  let ads = 0;
  let pause: (paused: boolean) => void = () => undefined;
  let interstitial: (state: InterstitialState) => void = () => undefined;
  const bridge: Bridge = {
    sendMessage: (message) => void sent.push(message),
    showInterstitial: () => void ads++,
    onPause: (listener) => void (pause = listener),
    onInterstitial: (listener) => void (interstitial = listener),
  };
  return { bridge, sent, ads: () => ads, pause: (paused: boolean) => pause(paused), interstitial: (state: InterstitialState) => interstitial(state) };
}

test('game_ready is sent once', () => {
  const fake = fakeBridge();
  const sdk = playgamaSdk(fake.bridge, () => false);
  sdk.ready();
  sdk.ready();
  assert.deepEqual(fake.sent, ['game_ready']);
});

test('the end of a race asks for an interstitial unless hidden, paused or one is open', () => {
  let hidden = false;
  const fake = fakeBridge();
  const sdk = playgamaSdk(fake.bridge, () => hidden);
  sdk.raceEnded();
  assert.equal(fake.ads(), 1);
  fake.interstitial('opened');
  sdk.raceEnded();
  fake.interstitial('closed');
  fake.pause(true);
  sdk.raceEnded();
  fake.pause(false);
  hidden = true;
  sdk.raceEnded();
  assert.equal(fake.ads(), 1);
});

test('the game holds while the platform pauses it or an ad is open', () => {
  const fake = fakeBridge();
  const sdk = playgamaSdk(fake.bridge, () => false);
  assert.equal(sdk.paused(), false);
  fake.pause(true);
  assert.equal(sdk.paused(), true);
  fake.pause(false);
  fake.interstitial('opened');
  assert.equal(sdk.paused(), true);
  fake.interstitial('failed');
  assert.equal(sdk.paused(), false);
});

test('a missing, failing or slow Bridge leaves the game running without one', async () => {
  const now = (): Promise<void> => Promise.resolve();
  const never = (): Promise<void> => new Promise(() => undefined);
  assert.equal(await startPlaygama(undefined, never, () => false), NO_PORTAL);
  const failing = { initialize: () => Promise.reject(new Error('down')) };
  assert.equal(await startPlaygama(failing, never, () => false), NO_PORTAL);
  const slow = { initialize: () => new Promise(() => undefined) };
  assert.equal(await startPlaygama(slow, now, () => false), NO_PORTAL);
});
