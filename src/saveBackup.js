import { getCardById } from './cards.js';
import { DECK_SIZE, MAX_CARD_LEVEL, PLAYER_AVATARS, Player } from './player.js';

const BACKUP_FORMAT = 'festungskampf-save';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 1024 * 1024;
const COUNTERS = ['battles', 'wins', 'losses', 'draws', 'cardsPlayed', 'spellsCast', 'durationSeconds'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateSaveData(data) {
  if (!isRecord(data)) throw new Error('Der Spielstand fehlt oder ist ungültig.');
  if (typeof data.name !== 'string' || typeof data.avatar !== 'string') {
    throw new Error('Profilname oder Avatar fehlt.');
  }
  try {
    new Player({ name: data.name }).setAvatar(data.avatar);
  } catch {
    throw new Error('Profilname oder Avatar ist ungültig.');
  }
  for (const key of ['level', 'coins', 'gems', 'trophies', 'xp']) {
    if (!isCount(data[key]) || (key === 'level' && data[key] < 1) || (key === 'xp' && data[key] >= 100)) {
      throw new Error(`Ungültiger Wert im Feld ${key}.`);
    }
  }
  if (!Array.isArray(data.collection) || new Set(data.collection).size !== data.collection.length) {
    throw new Error('Kartensammlung ist ungültig.');
  }
  for (const cardId of data.collection) {
    try {
      getCardById(cardId);
    } catch {
      throw new Error('Kartensammlung enthält eine unbekannte Karte.');
    }
  }
  if (!isRecord(data.cardLevels) || Object.keys(data.cardLevels).some((cardId) =>
    !data.collection.includes(cardId)
    || !Number.isSafeInteger(data.cardLevels[cardId])
    || data.cardLevels[cardId] < 1
    || data.cardLevels[cardId] > MAX_CARD_LEVEL)
    || data.collection.some((cardId) => !Number.isSafeInteger(data.cardLevels[cardId]))) {
    throw new Error('Kartenstufen sind ungültig.');
  }
  if (!Array.isArray(data.deck)
    || data.deck.length !== DECK_SIZE
    || new Set(data.deck).size !== DECK_SIZE
    || data.deck.some((cardId) => !data.collection.includes(cardId))) {
    throw new Error('Kampfdeck ist ungültig.');
  }
  if (!Array.isArray(data.fortressSlots) || data.fortressSlots.length !== 4
    || data.fortressSlots.some((cardId) => cardId !== null
      && (!data.collection.includes(cardId) || getCardById(cardId).type === 'spell'))) {
    throw new Error('Festungswachen sind ungültig.');
  }
  if (data.lastHuntAt !== null
    && (!Number.isSafeInteger(data.lastHuntAt) || data.lastHuntAt < 0 || data.lastHuntAt > Date.now())) {
    throw new Error('Jagdzeitpunkt ist ungültig.');
  }
  if (!isRecord(data.battleStats) || COUNTERS.some((key) => !isCount(data.battleStats[key]))) {
    throw new Error('Kampfstatistik ist ungültig.');
  }
  for (const key of ['winStreak', 'bestWinStreak']) {
    if (!isCount(data[key])) throw new Error('Siegesserie ist ungültig.');
  }
  if (!Array.isArray(data.arenaRewardsClaimed)
    || !Array.isArray(data.achievementRewardsClaimed)
    || !Array.isArray(data.battleHistory)
    || !isRecord(data.dailyQuestProgress)) {
    throw new Error('Fortschrittsdaten sind unvollständig.');
  }
  return data;
}

export function createSaveBackup(saveData, exportedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('Exportzeitpunkt ist ungültig.');
  validateSaveData(saveData);
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    save: saveData,
  }, null, 2);
}

export function parseSaveBackup(contents) {
  if (typeof contents !== 'string' || new TextEncoder().encode(contents).length > MAX_BACKUP_BYTES) {
    throw new Error('Die Sicherungsdatei ist zu groß oder ungültig.');
  }
  let backup;
  try {
    backup = JSON.parse(contents);
  } catch {
    throw new Error('Die Sicherungsdatei enthält kein gültiges JSON.');
  }
  if (!isRecord(backup) || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new Error('Diese Sicherungsdatei wird nicht unterstützt.');
  }
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error('Die Sicherungsdatei hat keinen gültigen Exportzeitpunkt.');
  }
  return validateSaveData(backup.save);
}

export { MAX_BACKUP_BYTES };
