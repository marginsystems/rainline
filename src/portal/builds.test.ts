import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bridgeConfigText, isPortalMode, PLAYGAMA_BRIDGE, portalBuildOf, withFirstScript } from './builds.ts';

test('portal and Playgama are portal modes, the site build is not', () => {
  assert.ok(isPortalMode('portal'));
  assert.ok(isPortalMode('playgama'));
  assert.ok(!isPortalMode('production'));
  assert.equal(portalBuildOf('playgama')?.outDir, 'dist-playgama');
});

test('the Bridge script is the first script on the page', () => {
  const html = '<html><head><meta charset="utf-8" /><title>x</title><script type="module" src="./main.js"></script></head></html>';
  const page = withFirstScript(html, PLAYGAMA_BRIDGE.script);
  assert.ok(page.indexOf(PLAYGAMA_BRIDGE.script) < page.indexOf('main.js'));
  assert.ok(page.indexOf('charset') < page.indexOf(PLAYGAMA_BRIDGE.script));
  assert.throws(() => withFirstScript('<html><head></head></html>', PLAYGAMA_BRIDGE.script));
});

test('the Bridge config preloads interstitials', () => {
  assert.deepEqual(JSON.parse(bridgeConfigText()), { advertisement: { interstitial: { preloadOnStart: true } } });
});
