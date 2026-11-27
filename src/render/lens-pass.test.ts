import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';
import { BLOOM_FINITE_GUARD, BLOOM_TEXEL_READ, createLensShader, finiteChannel, finiteRgb, guardedHighPass, HDR_CEILING } from './lens-pass.ts';

test('the bloom high pass drops non-finite pixels and caps bright ones before it blurs them', () => {
  const guarded = guardedHighPass(LuminosityHighPassShader.fragmentShader);
  assert.ok(guarded.includes(`${BLOOM_TEXEL_READ}\n${BLOOM_FINITE_GUARD}`));
  assert.ok(BLOOM_FINITE_GUARD.includes(finiteRgb('texel')) && BLOOM_FINITE_GUARD.includes(HDR_CEILING.toFixed(1)));
  assert.equal(guardedHighPass(guarded), guarded);
});

test('the finite guard is a plain comparison, so it holds on drivers where isnan and isinf do nothing', () => {
  const guard = finiteChannel('c.r', 16);
  assert.equal(guard, '( c.r >= 0.0 ? min( c.r, 16.0 ) : 0.0 )');
  assert.ok(!finiteRgb('c').includes('isnan') && !finiteRgb('c').includes('isinf'));
  const evaluate = (value: number): number => (value >= 0 ? Math.min(value, 16) : 0);
  assert.equal(evaluate(Number.NaN), 0);
  assert.equal(evaluate(Number.POSITIVE_INFINITY), 16);
  assert.equal(evaluate(Number.NEGATIVE_INFINITY), 0);
  assert.equal(evaluate(3), 3);
});

test('guarding fails loudly if the bloom shader stops reading its input the known way', () => {
  assert.throws(() => guardedHighPass('void main(){ gl_FragColor = vec4(0.0); }'));
});

test('every tap of the lens pass goes through the finite guard', () => {
  const fragment = createLensShader().fragmentShader;
  const reads = fragment.split('texture2D(tDiffuse').length - 1;
  assert.equal(reads, 1);
  assert.ok(fragment.includes(finiteRgb('tap')));
});
