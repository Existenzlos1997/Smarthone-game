import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveBattle, MAX_ENERGY, PLAYER_ENERGY_PER_SECOND } from '../src/liveBattle.js';

const deck = ['swordsman', 'archer', 'shieldbearer', 'knight', 'mage', 'catapult', 'griffin', 'dragon'];

test('live battle starts with four cards in hand and shows the fifth as next', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse() });
  assert.deepEqual(battle.playerHand, deck.slice(0, 4));
  assert.equal(battle.playerNextCard, deck[4]);
  assert.equal(battle.playerEnergy, 4);
});

test('playing a card spends energy and rotates it to the end of the deck', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse() });
  assert.deepEqual(battle.playCard(0), { ok: true, cardId: 'swordsman' });
  assert.equal(battle.playerEnergy, 1);
  assert.deepEqual(battle.playerHand, ['archer', 'shieldbearer', 'knight', 'mage']);
  assert.equal(battle.playerNextCard, 'catapult');
  assert.equal(battle.units.filter((unit) => unit.owner === 'player').length, 1);
});

test('rejects cards that are unaffordable or not in the active hand', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse() });
  battle.playerEnergy = 2;
  assert.equal(battle.playCard(3).reason, 'energy');
  assert.equal(battle.playCard(4).reason, 'invalid-card');
  assert.equal(battle.playerEnergy, 2);
  assert.equal(battle.units.length, 0);
});

test('energy regenerates to its cap and the enemy deploys cards', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse(), rng: () => 0 });
  battle.step(5);
  assert.ok(Math.abs(battle.playerEnergy - Math.min(MAX_ENERGY, 4 + PLAYER_ENERGY_PER_SECOND * 5)) < 1e-9);
  assert.ok(battle.enemyEnergy > 0 && battle.enemyEnergy < 4);
  assert.ok(battle.units.some((unit) => unit.owner === 'enemy'));
});

test('deployed troops march, attack enemies and create combat effects', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse(), rng: () => 0 });
  battle.playCard(0);
  const swordsman = battle.units[0];
  const spawnX = swordsman.x;
  battle.step(5);
  assert.ok(swordsman.x > spawnX);
  battle.step(3);
  assert.ok(battle.effects.some((effect) => effect.kind === 'damage'));
});

test('a destroyed fortress ends the match and prevents further card plays', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse() });
  battle.playCard(0);
  battle.units[0].x = 19.8;
  battle.enemyDeployIn = 10;
  battle.enemyFortressHp = 10;
  battle.step(0.05);
  assert.equal(battle.enemyFortressHp, 0);
  assert.equal(battle.winner, 'player');
  assert.equal(battle.playCard(0).reason, 'finished');
});

test('requires decks of exactly eight distinct known cards', () => {
  assert.throws(() => new LiveBattle({ playerDeck: deck.slice(0, 4), enemyDeck: deck }));
  assert.throws(() => new LiveBattle({ playerDeck: [...deck.slice(0, 7), 'swordsman'], enemyDeck: deck }));
});

test('a live match ends at the time limit with the fortress-health winner', () => {
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse() });
  battle.playerFortressHp = 100_000;
  battle.enemyFortressHp = 700;
  battle.step(180);
  assert.equal(battle.winner, 'player');
  assert.equal(battle.elapsed, 180);
});
