import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_UP_COIN_REWARD, MAX_CARD_LEVEL, Player } from '../src/player.js';

test('starts at level 1 with starter cards', () => {
  const player = new Player();
  assert.equal(player.level, 1);
  assert.equal(player.xp, 0);
  assert.equal(player.collection.length, 9);
  assert.ok(player.collection.includes('pfeil'));
  assert.equal(player.deck.length, 8);
  assert.ok(!player.deck.includes('pfeil'));
});

test('player names are trimmed, bounded and reject empty or control-character values', () => {
  const player = new Player({ name: '  Magierin  ' });
  assert.equal(player.name, 'Magierin');
  assert.equal(player.setName('  Éowyn 🧙  '), 'Éowyn 🧙');
  assert.equal(player.name, 'Éowyn 🧙');
  assert.throws(() => player.setName('   '), /visible text/);
  assert.throws(() => player.setName('Name\nBetrüger'), /visible text/);
  assert.throws(() => player.setName('Name\u0085'), /visible text/);
  assert.throws(() => player.setName('a'.repeat(21)), /at most 20/);
  assert.throws(() => player.setName(null), /must be text/);
});

test('addXp levels up once the threshold is reached', () => {
  const player = new Player();
  const leveledUp = player.addXp(150);
  assert.equal(leveledUp, true);
  assert.equal(player.level, 2);
  assert.equal(player.xp, 50);
  assert.equal(player.coins, LEVEL_UP_COIN_REWARD);
});

test('addXp can trigger multiple level-ups at once', () => {
  const player = new Player();
  player.addXp(250);
  assert.equal(player.level, 3);
  assert.equal(player.xp, 50);
  assert.equal(player.coins, LEVEL_UP_COIN_REWARD * 2);
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

test('card upgrades spend increasing coin costs and stop at the maximum level', () => {
  const player = new Player();
  player.coins = 250;
  assert.equal(player.getCardUpgradeCost('swordsman'), 50);
  assert.deepEqual(player.upgradeCard('swordsman'), { cardId: 'swordsman', level: 2, cost: 50 });
  assert.equal(player.coins, 200);
  assert.equal(player.getCardUpgradeCost('swordsman'), 100);
  player.upgradeCard('swordsman');
  assert.equal(player.getCardLevel('swordsman'), 3);
  assert.equal(player.coins, 100);
  assert.throws(() => player.upgradeCard('swordsman'), /Not enough coins/);
  assert.equal(player.getCardLevel('swordsman'), 3);
  assert.throws(() => player.getCardUpgradeCost('not-owned'));

  player.cardLevels.archer = MAX_CARD_LEVEL;
  assert.equal(player.getCardUpgradeCost('archer'), null);
  assert.throws(() => player.upgradeCard('archer'), /maximum level/);
});

test('daily battle quests track progress and award each coin reward only once', () => {
  const player = new Player({ now: () => Date.parse('2026-10-03T12:00:00Z') });
  player.recordDailyQuestProgress({ winner: 'player', cardsPlayed: 5, spellsCast: 2 });
  assert.deepEqual(
    player.getDailyQuests().map(({ id, progress, completed, claimed }) => ({ id, progress, completed, claimed })),
    [
      { id: 'win', progress: 1, completed: true, claimed: false },
      { id: 'play-cards', progress: 5, completed: true, claimed: false },
      { id: 'cast-spells', progress: 2, completed: true, claimed: false },
    ],
  );
  assert.throws(() => player.claimDailyQuest('unknown'));
  assert.deepEqual(player.claimDailyQuest('win'), { questId: 'win', reward: 120, coins: 120 });
  assert.throws(() => player.claimDailyQuest('win'), /already claimed/);
  assert.equal(player.claimDailyQuest('play-cards').coins, 200);
  assert.equal(player.claimDailyQuest('cast-spells').coins, 260);
});

test('daily battle quests reset by UTC date and ignore invalid restored progress', () => {
  let now = Date.parse('2026-10-03T23:59:00Z');
  const player = new Player({ now: () => now });
  player.recordDailyQuestProgress({ winner: 'player', cardsPlayed: 4, spellsCast: 1 });
  player.restoreDailyQuestProgress({
    day: '2026-10-03',
    wins: 99,
    cardsPlayed: 2,
    spellsCast: 1,
    claimed: ['win', 'not-a-quest'],
  });
  assert.deepEqual(player.getDailyQuests().map((quest) => quest.progress), [1, 2, 1]);
  assert.equal(player.getDailyQuests()[0].claimed, true);
  now += 60 * 1000;
  assert.deepEqual(player.getDailyQuests().map((quest) => quest.progress), [0, 0, 0]);
  assert.equal(player.getDailyQuests().some((quest) => quest.claimed), false);
});

test('battle history keeps ten newest outcomes and restores only valid bounded records', () => {
  let now = Date.parse('2026-10-03T12:00:00Z');
  const player = new Player({ now: () => now });
  player.restoreBattleHistory([{ result: 'hacked', playedAt: new Date(now).toISOString() }]);
  assert.deepEqual(player.battleHistory, []);

  for (let index = 0; index < 12; index += 1) {
    player.recordBattle({
      result: index % 2 ? 'enemy' : 'player',
      trophyChange: index % 2 ? -10 : 30,
      durationSeconds: index + 1,
      cardsPlayed: index,
      spellsCast: 1,
      playerFortressHealth: 150,
      enemyFortressHealth: -10,
    });
    now += 1000;
  }
  assert.equal(player.battleHistory.length, 10);
  assert.equal(player.battleHistory[0].durationSeconds, 12);
  assert.equal(player.battleHistory[0].playerFortressHealth, 100);
  assert.equal(player.battleHistory[0].enemyFortressHealth, 0);
  assert.equal(player.battleHistory.at(-1).durationSeconds, 3);
  const restored = new Player({ now: () => now });
  restored.restoreBattleHistory([...player.battleHistory, null, { result: 'enemy', playedAt: 'bad-date' }]);
  assert.deepEqual(restored.battleHistory, player.battleHistory);
});

test('career battle statistics accumulate outcomes and activity independently of history', () => {
  const player = new Player();
  player.recordBattle({ result: 'player', durationSeconds: 40, cardsPlayed: 5, spellsCast: 2 });
  player.recordBattle({ result: 'enemy', durationSeconds: 30, cardsPlayed: 3, spellsCast: 1 });
  player.recordBattle({ result: 'draw', durationSeconds: 20, cardsPlayed: 4, spellsCast: 0 });
  assert.deepEqual(player.battleStats, {
    battles: 3,
    wins: 1,
    losses: 1,
    draws: 1,
    cardsPlayed: 12,
    spellsCast: 3,
    durationSeconds: 90,
  });
  for (let index = 0; index < 12; index += 1) {
    player.recordBattle({ result: 'player' });
  }
  assert.equal(player.battleHistory.length, 10);
  assert.equal(player.battleStats.battles, 15);
  assert.equal(player.battleStats.wins, 13);
});

test('career battle statistics restore only non-negative safe integer counters', () => {
  const player = new Player();
  player.restoreBattleStats({
    battles: 2,
    wins: 4,
    losses: -1,
    draws: Number.POSITIVE_INFINITY,
    cardsPlayed: 12,
    spellsCast: '3',
    durationSeconds: 90,
  });
  assert.deepEqual(player.battleStats, {
    battles: 4,
    wins: 4,
    losses: 0,
    draws: 0,
    cardsPlayed: 12,
    spellsCast: 0,
    durationSeconds: 90,
  });
  player.restoreBattleStats(null);
  assert.equal(player.battleStats.wins, 4);
});

test('lifetime achievements track career stats and award each reward once', () => {
  const player = new Player();
  player.restoreAchievementClaims(['unknown', 'unknown']);
  assert.deepEqual(player.achievementRewardsClaimed, []);
  const restored = new Player();
  restored.restoreAchievementClaims(['first-battle', 'unknown', 'first-battle']);
  assert.deepEqual(restored.achievementRewardsClaimed, ['first-battle']);
  assert.throws(() => player.claimAchievement('not-an-achievement'), /Unknown achievement/);
  assert.throws(() => player.claimAchievement('veteran'), /not complete/);

  player.recordBattle({ result: 'player', cardsPlayed: 5, spellsCast: 1 });
  const firstBattle = player.getAchievements().find(({ id }) => id === 'first-battle');
  assert.equal(firstBattle.completed, true);
  assert.equal(firstBattle.claimed, false);
  assert.equal(player.claimAchievement('first-battle').coins, 50);
  assert.throws(() => player.claimAchievement('first-battle'), /already claimed/);

  for (let index = 0; index < 9; index += 1) {
    player.recordBattle({ result: index < 8 ? 'player' : 'enemy', cardsPlayed: 11, spellsCast: 3 });
  }
  const achievements = player.getAchievements();
  assert.equal(achievements.find(({ id }) => id === 'veteran').completed, true);
  assert.equal(achievements.find(({ id }) => id === 'champion').progress, 9);
  assert.equal(achievements.find(({ id }) => id === 'card-master').completed, true);
  assert.equal(achievements.find(({ id }) => id === 'spell-master').completed, true);
  assert.equal(player.claimAchievement('veteran').coins, 150);
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

test('win streaks increase on wins, survive draws, reset on losses and restore safely', () => {
  const player = new Player();
  player.recordBattleOutcome('player');
  player.recordBattleOutcome('player');
  assert.equal(player.winStreak, 2);
  assert.equal(player.bestWinStreak, 2);
  player.recordBattleOutcome('draw');
  assert.equal(player.winStreak, 2);
  player.recordBattleOutcome('enemy');
  assert.equal(player.winStreak, 0);
  assert.equal(player.bestWinStreak, 2);
  player.restoreWinStreaks({ current: 4, best: 3 });
  assert.equal(player.winStreak, 4);
  assert.equal(player.bestWinStreak, 4);
  player.restoreWinStreaks({ current: -2, best: 'bad' });
  assert.equal(player.winStreak, 0);
  assert.equal(player.bestWinStreak, 0);
});

test('arena promotion rewards are granted once and old saves do not claim past arenas again', () => {
  const player = new Player();
  player.trophies = 149;
  const [reward] = player.recordBattleOutcome('player');
  assert.deepEqual(reward, { arenaIndex: 1, coins: 100, arena: { name: 'Arena 2: Kaltmark', threshold: 150 } });
  assert.equal(player.coins, 100);
  assert.deepEqual(player.arenaRewardsClaimed, [1]);

  player.trophies = 149;
  assert.deepEqual(player.recordBattleOutcome('player'), []);
  assert.equal(player.coins, 100);

  const restored = new Player();
  restored.trophies = 350;
  restored.restoreArenaRewards();
  assert.deepEqual(restored.arenaRewardsClaimed, [1, 2]);
  restored.trophies = 349;
  assert.deepEqual(restored.recordBattleOutcome('player'), []);
  assert.equal(restored.coins, 0);
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
