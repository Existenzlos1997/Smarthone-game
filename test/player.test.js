import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';

test('starts at level 1 with starter cards', () => {
  const player = new Player();
  assert.equal(player.level, 1);
  assert.equal(player.xp, 0);
  assert.equal(player.collection.length, 9);
  assert.ok(player.collection.includes('pfeil'));
  assert.equal(player.deck.length, 8);
  assert.ok(!player.deck.includes('pfeil'));
});

test('addXp levels up once the threshold is reached', () => {
  const player = new Player();
  const leveledUp = player.addXp(150);
  assert.equal(leveledUp, true);
  assert.equal(player.level, 2);
  assert.equal(player.xp, 50);
});

test('addXp can trigger multiple level-ups at once', () => {
  const player = new Player();
  player.addXp(250);
  assert.equal(player.level, 3);
  assert.equal(player.xp, 50);
});

test('addXp rejects negative amounts', () => {
  const player = new Player();
  assert.throws(() => player.addXp(-1));
});

test('daily hunt grants a card and enforces a 24h cooldown', () => {
  let now = Date.parse('2024-01-01T00:00:00Z');
  const player = new Player({ now: () => now });

  assert.equal(player.canHuntToday(), true);
  const result = player.completeDailyHunt(6, 6, () => 0); // perfect run, deterministic roll
  assert.ok(player.collection.includes(result.card.id));
  assert.equal(player.canHuntToday(), false);
  assert.throws(() => player.completeDailyHunt(6, 6));

  now += 24 * 60 * 60 * 1000; // advance exactly 24h
  assert.equal(player.canHuntToday(), true);
});

test('finding an already-owned card upgrades it instead of duplicating it', () => {
  let now = Date.parse('2024-01-01T00:00:00Z');
  const player = new Player({ now: () => now });
  const first = player.completeDailyHunt(6, 6, () => 0);
  assert.equal(first.leveledUp, true);
  assert.equal(player.getCardLevel(first.card.id), 2);

  now += 24 * 60 * 60 * 1000;
  const second = player.completeDailyHunt(6, 6, () => 0); // same deterministic roll -> same card
  assert.equal(second.card.id, first.card.id);
  assert.equal(second.leveledUp, true);
  assert.equal(player.getCardLevel(first.card.id), 3);
  assert.equal(player.collection.filter((id) => id === first.card.id).length, 1);
});

test('recordBattleOutcome adjusts trophies and never goes below zero', () => {
  const player = new Player();
  player.recordBattleOutcome('player');
  assert.equal(player.trophies, 30);
  player.recordBattleOutcome('enemy');
  assert.equal(player.trophies, 20);
  player.recordBattleOutcome('enemy');
  player.recordBattleOutcome('enemy');
  assert.equal(player.trophies, 0); // clamped at 0, not negative
});

test('equipping the fortress requires the card to be owned', () => {
  const player = new Player();
  player.collection = player.collection.filter((cardId) => cardId !== 'dragon');
  assert.throws(() => player.equipFortressSlot(0, 'dragon'));
  player.collection.push('dragon');
  player.equipFortressSlot(0, 'dragon');
  assert.equal(player.fortressSlots[0], 'dragon');
  player.clearFortressSlot(0);
  assert.equal(player.fortressSlots[0], null);
});

test('setDeck requires exactly 8 unique owned cards', () => {
  const player = new Player();
  assert.throws(() => player.setDeck(player.collection.slice(0, 7)));
  assert.throws(() => player.setDeck([...player.collection.slice(0, 7), 'swordsman']));
  assert.throws(() => player.setDeck([...player.collection.slice(0, 7), 'unknown']));
  player.setDeck([...player.deck].reverse());
  assert.equal(player.isDeckReady(), true);
  assert.deepEqual(player.deck, [...player.collection].filter((cardId) => cardId !== 'pfeil').reverse());
});
