import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateHuntRounds,
  isHit,
  weightsForAccuracy,
  rollHuntReward,
  HUNT_ROUNDS,
  TARGET_RADIUS,
} from '../src/huntGame.js';
import { CARD_LIBRARY, RARITY } from '../src/cards.js';

test('generateHuntRounds returns the requested number of targets within bounds', () => {
  const rounds = generateHuntRounds(HUNT_ROUNDS, () => 0.5);
  assert.equal(rounds.length, HUNT_ROUNDS);
  for (const round of rounds) {
    assert.ok(round.x >= 0 && round.x <= 1);
    assert.ok(round.y >= 0 && round.y <= 1);
  }
});

test('generateHuntRounds keeps targets away from the very edge', () => {
  const rounds = generateHuntRounds(4, () => 0); // rng always 0 -> minimal coordinate
  for (const round of rounds) {
    assert.ok(round.x >= TARGET_RADIUS - 1e-9);
    assert.ok(round.y >= TARGET_RADIUS - 1e-9);
  }
});

test('isHit detects a tap within the target radius', () => {
  const target = { x: 0.5, y: 0.5 };
  assert.equal(isHit(target, 0.5, 0.5), true);
  assert.equal(isHit(target, 0.5 + TARGET_RADIUS / 2, 0.5), true);
  assert.equal(isHit(target, 0.9, 0.9), false);
});

test('weightsForAccuracy rewards higher accuracy with better rarity odds', () => {
  const low = weightsForAccuracy(0);
  const perfect = weightsForAccuracy(1);
  assert.ok(perfect.legendary > low.legendary);
  assert.ok(perfect.common < low.common);
});

test('rollHuntReward with 0 hits still returns a valid card', () => {
  const card = rollHuntReward(0, 6, () => 0.999);
  assert.ok(CARD_LIBRARY.includes(card));
});

test('rollHuntReward with a perfect score never grants a common card', () => {
  for (const roll of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) {
    const card = rollHuntReward(6, 6, () => roll);
    assert.notEqual(card.rarity, RARITY.COMMON);
  }
});

test('rollHuntReward rejects a non-positive number of total rounds', () => {
  assert.throws(() => rollHuntReward(1, 0));
});
