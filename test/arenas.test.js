import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getArenaProgress, ARENAS } from '../src/arenas.js';

test('a brand new player starts in the first arena', () => {
  const { current, next } = getArenaProgress(0);
  assert.equal(current.name, ARENAS[0].name);
  assert.equal(next.name, ARENAS[1].name);
});

test('reaching a threshold advances to that arena', () => {
  const { current, next } = getArenaProgress(150);
  assert.equal(current.name, 'Arena 2: Kaltmark');
  assert.equal(next.name, 'Arena 3: Dornenwald');
});

test('trophies between thresholds stay in the lower arena', () => {
  const { current, next } = getArenaProgress(200);
  assert.equal(current.name, 'Arena 2: Kaltmark');
  assert.equal(next.name, 'Arena 3: Dornenwald');
});

test('the highest arena has no next arena', () => {
  const { current, next } = getArenaProgress(999999);
  assert.equal(current.name, ARENAS[ARENAS.length - 1].name);
  assert.equal(next, null);
});
