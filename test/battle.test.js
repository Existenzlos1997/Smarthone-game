import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBattle, FORTRESS_HP, interpolateFortressHealth } from '../src/battle.js';

test('fortress health interpolation matches the simulated result throughout playback', () => {
  const result = { playerFortressHp: 400, enemyFortressHp: 0 };
  assert.deepEqual(interpolateFortressHealth(null, 0), {
    player: FORTRESS_HP,
    enemy: FORTRESS_HP,
  });
  assert.deepEqual(interpolateFortressHealth(result, 0), {
    player: FORTRESS_HP,
    enemy: FORTRESS_HP,
  });
  assert.deepEqual(interpolateFortressHealth(result, 0.5), {
    player: 700,
    enemy: 500,
  });
  assert.deepEqual(interpolateFortressHealth(result, 1), {
    player: 400,
    enemy: 0,
  });
  assert.deepEqual(interpolateFortressHealth(result, 2), {
    player: 400,
    enemy: 0,
  });
});

test('the stronger deck wins a lopsided battle', () => {
  const result = simulateBattle({
    playerDeck: ['dragon', 'dragon', 'dragon', 'dragon'],
    enemyDeck: ['archer', 'archer', 'archer', 'archer'],
  });
  assert.equal(result.winner, 'player');
  assert.ok(result.enemyFortressHp <= 0);
  assert.ok(result.playerFortressHp > 0);
});

test('fortress defenders help defend against an otherwise winning attacker', () => {
  const withoutDefenders = simulateBattle({
    playerDeck: ['knight', 'knight', 'knight', 'knight'],
    enemyDeck: ['archer', 'archer', 'archer', 'archer'],
  });
  const withDefenders = simulateBattle({
    playerDeck: ['archer', 'archer', 'archer', 'archer'],
    enemyDeck: ['knight', 'knight', 'knight', 'knight'],
    enemyFortressDefenders: ['dragon', 'dragon', 'dragon', 'dragon'],
  });
  // Same matchup (attacker knights vs defending archers), but this time the
  // defending side also has fortress defenders, so it should end up better off.
  assert.ok(withDefenders.enemyFortressHp >= withoutDefenders.playerFortressHp);
});

test('battle rejects decks that are not exactly 4 cards', () => {
  assert.throws(() => simulateBattle({ playerDeck: ['archer'], enemyDeck: ['archer', 'archer', 'archer', 'archer'] }));
});

test('a symmetric battle stays bounded and reports fortress hp within range', () => {
  const result = simulateBattle({
    playerDeck: ['swordsman', 'archer', 'knight', 'mage'],
    enemyDeck: ['swordsman', 'archer', 'knight', 'mage'],
  });
  assert.ok(result.playerFortressHp >= 0 && result.playerFortressHp <= FORTRESS_HP);
  assert.ok(result.enemyFortressHp >= 0 && result.enemyFortressHp <= FORTRESS_HP);
  assert.ok(['player', 'enemy', 'draw'].includes(result.winner));
});
