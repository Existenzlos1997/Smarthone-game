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

test('player troop cards use their owned upgrade levels in combat', () => {
  const battle = new LiveBattle({
    playerDeck: deck,
    enemyDeck: [...deck].reverse(),
    playerCardLevels: { swordsman: 3 },
  });
  battle.playCard(0);
  assert.equal(battle.units[0].card.hp, 144);
  assert.equal(battle.units[0].card.damage, 24);
});

test('enemy defenders and deployed units use arena-scaled card levels', () => {
  const battle = new LiveBattle({
    playerDeck: deck,
    enemyDeck: deck,
    enemyDefenders: ['swordsman'],
    enemyCardLevels: { swordsman: 3 },
    rng: () => 0,
  });
  const defender = battle.units.find((unit) => unit.owner === 'enemy');
  assert.equal(defender.card.hp, 144);
  battle.enemyEnergy = MAX_ENERGY;
  battle.step(1.5);
  const deployed = battle.units.find((unit) => unit.owner === 'enemy' && !unit.stationary);
  assert.equal(deployed.card.hp, 144);
  assert.equal(deployed.card.damage, 24);
});

test('live battle counts player monster and spell plays for daily quests', () => {
  const battle = new LiveBattle({
    playerDeck: ['pfeil', ...deck.slice(0, 7)],
    enemyDeck: [...deck].reverse(),
  });
  battle.playerEnergy = 10;
  assert.equal(battle.playCard(1).ok, true);
  battle.selectSpell(0);
  assert.equal(battle.castSpellAt(12).ok, true);
  assert.equal(battle.playerCardsPlayed, 2);
  assert.equal(battle.playerSpellsCast, 1);
  assert.deepEqual(battle.playerCardsPlayedIds, ['swordsman', 'pfeil']);
  assert.deepEqual(battle.playerSpellsCastIds, ['pfeil']);
});

test('spell cards require a target and rotate only after a valid cast', () => {
  const spellDeck = ['pfeil', ...deck.slice(0, 7)];
  const battle = new LiveBattle({
    playerDeck: spellDeck,
    enemyDeck: [...deck].reverse(),
    playerCardLevels: { pfeil: 2 },
  });
  battle.playerEnergy = 10;
  battle.step(1.5);
  assert.equal(battle.playCard(0).targeting, true);
  assert.equal(battle.castSpellAt(4).reason, 'wrong-side');
  assert.equal(battle.playerEnergy, 10);
  const enemy = battle.units.find((unit) => unit.owner === 'enemy');
  enemy.x = 12;
  const cast = battle.castSpellAt(12);
  assert.equal(cast.ok, true);
  assert.equal(enemy.hp, enemy.card.hp - 50);
  assert.equal(battle.playerEnergy, 7);
  assert.equal(battle.playerQueue.at(-1), 'pfeil');
  assert.ok(battle.effects.some((effect) => effect.kind === 'spell-burst' && effect.spellId === 'pfeil'));
});

test('retapping a selected spell cancels it without spending energy', () => {
  const battle = new LiveBattle({ playerDeck: ['pfeil', ...deck.slice(0, 7)], enemyDeck: [...deck].reverse() });
  assert.equal(battle.selectSpell(0).targeting, true);
  assert.equal(battle.selectSpell(0).cancelled, true);
  assert.equal(battle.selectedSpellIndex, null);
  assert.equal(battle.playerEnergy, 4);
  assert.deepEqual(battle.playerSpellsCastIds, []);
});

test('healing, frost and rage apply effects only to the correct side', () => {
  const testSpell = (spellId, targetX, expectedEffect) => {
    const spellDeck = [spellId, ...deck.slice(0, 7)];
    const battle = new LiveBattle({ playerDeck: spellDeck, enemyDeck: [...deck].reverse() });
    battle.playCard(1);
    battle.step(1.5);
    const friendly = battle.units.find((unit) => unit.owner === 'player');
    const enemy = battle.units.find((unit) => unit.owner === 'enemy');
    friendly.x = targetX;
    friendly.hp = Math.max(1, friendly.card.hp - 30);
    battle.playerEnergy = 10;
    battle.selectSpell(0);
    assert.equal(battle.castSpellAt(targetX).ok, true);
    if (expectedEffect === 'heal') assert.ok(friendly.hp > friendly.card.hp - 30);
    if (expectedEffect === 'slow') assert.equal(enemy.speedMultiplier, 0.45);
    if (expectedEffect === 'haste') assert.equal(friendly.speedMultiplier, 1.5);
  };
  testSpell('heil', 1, 'heal');
  testSpell('frost', 19, 'slow');
  testSpell('wut', 1, 'haste');
});

test('fireball damages an enemy fortress when cast in range', () => {
  const battle = new LiveBattle({ playerDeck: ['feuer', ...deck.slice(0, 7)], enemyDeck: [...deck].reverse() });
  battle.playerEnergy = 10;
  battle.selectSpell(0);
  assert.equal(battle.castSpellAt(19.5).ok, true);
  assert.equal(battle.enemyFortressHp, 1000 - 98);
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

test('enemy AI casts damage spells against player units', () => {
  const battle = new LiveBattle({
    playerDeck: deck,
    enemyDeck: ['pfeil', ...deck.slice(0, 7)],
    enemyCardLevels: { pfeil: 3 },
  });
  battle.playCard(0);
  const swordsman = battle.units.find((unit) => unit.owner === 'player');
  swordsman.x = 13;
  swordsman.stationary = true;
  battle.enemyEnergy = MAX_ENERGY;
  battle.step(1.5);
  assert.equal(swordsman.hp, swordsman.card.hp - 54);
  assert.ok(battle.effects.some((effect) => effect.kind === 'spell-burst' && effect.spellId === 'pfeil' && effect.owner === 'enemy'));
  assert.equal(battle.enemyQueue.at(-1), 'pfeil');
});

test('enemy AI heals injured defenders with a healing spell', () => {
  const battle = new LiveBattle({
    playerDeck: deck,
    enemyDeck: ['heil', ...deck.slice(0, 7)],
    enemyDefenders: ['swordsman'],
  });
  const defender = battle.units.find((unit) => unit.owner === 'enemy');
  defender.hp = 40;
  battle.enemyEnergy = MAX_ENERGY;
  battle.step(1.5);
  assert.equal(defender.hp, defender.card.hp);
  assert.ok(battle.effects.some((effect) => effect.kind === 'spell-burst' && effect.spellId === 'heil' && effect.owner === 'enemy'));
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

test('ranged attackers emit timed projectiles toward enemy units', () => {
  const battle = new LiveBattle({
    playerDeck: deck,
    enemyDeck: [...deck].reverse(),
    enemyDefenders: ['swordsman'],
  });
  battle.playCard(1);
  const archer = battle.units.find((unit) => unit.owner === 'player');
  const enemy = battle.units.find((unit) => unit.owner === 'enemy');
  archer.x = 5;
  enemy.x = 7;
  battle.step(0.05);
  const projectile = battle.effects.find((effect) => effect.kind === 'projectile');
  assert.ok(projectile);
  assert.equal(projectile.fromX, archer.x);
  assert.equal(projectile.toX, enemy.x);
  assert.ok(projectile.duration > 0);
  battle.step(projectile.duration + 0.05);
  assert.equal(battle.effects.some((effect) => effect.kind === 'projectile'), false);
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
  const battle = new LiveBattle({ playerDeck: deck, enemyDeck: [...deck].reverse(), rng: () => 0.5 });
  battle.playerFortressHp = 100_000;
  battle.enemyFortressHp = 700;
  battle.step(180);
  assert.equal(battle.winner, 'player');
  assert.equal(battle.elapsed, 180);
});
