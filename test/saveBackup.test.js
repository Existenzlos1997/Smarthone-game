import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { createSaveBackup, MAX_BACKUP_BYTES, parseSaveBackup } from '../src/saveBackup.js';

function validSaveData() {
  const player = new Player();
  return {
    name: player.name,
    avatar: player.avatar,
    level: player.level,
    xp: player.xp,
    coins: player.coins,
    gems: player.gems,
    trophies: player.trophies,
    winStreak: player.winStreak,
    bestWinStreak: player.bestWinStreak,
    arenaRewardsClaimed: player.arenaRewardsClaimed,
    battleStats: player.battleStats,
    achievementRewardsClaimed: player.achievementRewardsClaimed,
    collection: player.collection,
    cardLevels: player.cardLevels,
    fortressSlots: player.fortressSlots,
    deck: player.deck,
    lastHuntAt: player.lastHuntAt,
    dailyQuestProgress: player.dailyQuestProgress,
    battleHistory: player.battleHistory,
  };
}

test('save backup round-trips a complete local player save', () => {
  const save = validSaveData();
  save.name = 'Kaltmark';
  save.coins = 450;
  const backup = createSaveBackup(save, '2026-10-03T12:00:00.000Z');
  assert.deepEqual(parseSaveBackup(backup), save);
});

test('save backup rejects unsupported, oversized and malformed documents', () => {
  assert.throws(() => parseSaveBackup('{broken'), /gültiges JSON/);
  assert.throws(() => parseSaveBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /zu groß/);
  assert.throws(() => parseSaveBackup(JSON.stringify({ format: 'other', version: 1 })), /nicht unterstützt/);
});

test('save backup rejects corrupt progression without altering the source save', () => {
  const source = validSaveData();
  for (const mutation of [
    (save) => { save.coins = -1; },
    (save) => { save.deck[0] = 'unknown-card'; },
    (save) => { save.cardLevels.swordsman = 99; },
    (save) => { save.fortressSlots[0] = 'pfeil'; },
    (save) => { save.avatar = '<script>'; },
    (save) => { save.lastHuntAt = Date.now() + 60_000; },
  ]) {
    const corrupted = structuredClone(source);
    mutation(corrupted);
    const backup = JSON.stringify({
      format: 'festungskampf-save',
      version: 1,
      exportedAt: '2026-10-03T12:00:00.000Z',
      save: corrupted,
    });
    assert.throws(() => parseSaveBackup(backup));
  }
  assert.equal(source.coins, 0);
});
