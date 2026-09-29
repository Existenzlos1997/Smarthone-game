import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';

test('starts at level 1 with starter cards', () => {
  const player = new Player();
  assert.equal(player.level, 1);
  assert.equal(player.xp, 0);
  assert.deepEqual(player.collection, ['swordsman', 'archer']);
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
  const card = player.completeDailyHunt(6, 6, () => 0); // perfect run, deterministic roll
  assert.ok(player.collection.includes(card.id));
  assert.equal(player.canHuntToday(), false);
  assert.throws(() => player.completeDailyHunt(6, 6));

  now += 24 * 60 * 60 * 1000; // advance exactly 24h
  assert.equal(player.canHuntToday(), true);
});

test('equipping the fortress requires the card to be owned', () => {
  const player = new Player();
  assert.throws(() => player.equipFortressSlot(0, 'dragon'));
  player.collection.push('dragon');
  player.equipFortressSlot(0, 'dragon');
  assert.equal(player.fortressSlots[0], 'dragon');
  player.clearFortressSlot(0);
  assert.equal(player.fortressSlots[0], null);
});

test('setDeck requires exactly 4 unique owned cards', () => {
  const player = new Player();
  player.collection.push('knight', 'mage');
  assert.throws(() => player.setDeck(['swordsman', 'archer', 'knight'])); // too few
  assert.throws(() => player.setDeck(['swordsman', 'swordsman', 'archer', 'knight'])); // duplicate
  assert.throws(() => player.setDeck(['swordsman', 'archer', 'knight', 'dragon'])); // not owned
  player.setDeck(['swordsman', 'archer', 'knight', 'mage']);
  assert.equal(player.isDeckReady(), true);
  assert.deepEqual(player.deck, ['swordsman', 'archer', 'knight', 'mage']);
});
