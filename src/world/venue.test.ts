import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseVenue, DEFAULT_VENUE, venueAddress, venueInfo, VENUES } from './venue.ts';

test('with nothing saved the game opens on the coast highway', () => {
  assert.equal(DEFAULT_VENUE, 'coast');
  assert.equal(chooseVenue('', null), 'coast');
  assert.equal(chooseVenue('', 'somewhere'), 'coast');
});

test('a saved track is used, and the address bar wins over it', () => {
  assert.equal(chooseVenue('', 'city'), 'city');
  assert.equal(chooseVenue('?track=coast', 'city'), 'coast');
  assert.equal(chooseVenue('?capture=drive&track=city', null), 'city');
  assert.equal(chooseVenue('?track=moon', 'city'), 'city');
});

test('a pick that could not be saved travels in the address, so the track still changes', () => {
  assert.equal(venueAddress('/', 'city', true), '/');
  const address = venueAddress('/', 'city', false);
  assert.equal(chooseVenue(address.slice(address.indexOf('?')), null), 'city');
});

test('every track has its own name, tagline and layout', () => {
  assert.equal(new Set(VENUES.map((venue) => venue.name)).size, VENUES.length);
  for (const venue of VENUES) {
    assert.equal(venueInfo(venue.id), venue);
    assert.ok(venue.tagline.length > 0 && venue.layout.points.length > 8);
  }
});
