import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIDGE, readBridge, startBridge } from './bridge.ts';

function fakeRoot() {
  const sent: string[] = [];
  const handlers = new Map<string, (value: unknown) => void>();
  let ads = 0;
  let started = false;
  const on = (event: string, listener: (value: unknown) => void): void => {
    handlers.set(event, listener);
  };
  const root = {
    initialize: async () => {
      started = true;
    },
    EVENT_NAME: { [BRIDGE.events.pause]: 'pause_state_changed', [BRIDGE.events.interstitial]: 'interstitial_state_changed' },
    platform: { sendMessage: (message: string) => sent.push(message), on },
    advertisement: { showInterstitial: () => ads++, on },
  };
  return { root, sent, handlers, ads: () => ads, started: () => started };
}

test('a missing or partial Bridge reads as none', async () => {
  assert.equal(readBridge(undefined), null);
  assert.equal(readBridge({ platform: {} }), null);
  assert.equal(await startBridge(undefined), null);
  assert.equal(await startBridge({}), null);
});

test('the Bridge starts, sends messages and shows interstitials', async () => {
  const fake = fakeRoot();
  const bridge = await startBridge(fake.root);
  assert.ok(fake.started());
  assert.ok(bridge);
  bridge.sendMessage(BRIDGE.ready);
  bridge.showInterstitial();
  assert.deepEqual(fake.sent, ['game_ready']);
  assert.equal(fake.ads(), 1);
});

test('pause and interstitial events pass through only when well formed', () => {
  const fake = fakeRoot();
  const bridge = readBridge(fake.root);
  assert.ok(bridge);
  const pauses: boolean[] = [];
  const states: string[] = [];
  bridge.onPause((paused) => pauses.push(paused));
  bridge.onInterstitial((state) => states.push(state));
  fake.handlers.get('pause_state_changed')?.(true);
  fake.handlers.get('pause_state_changed')?.('yes');
  fake.handlers.get('interstitial_state_changed')?.('opened');
  fake.handlers.get('interstitial_state_changed')?.('weird');
  assert.deepEqual(pauses, [true]);
  assert.deepEqual(states, ['opened']);
});
