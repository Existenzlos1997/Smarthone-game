import { getCardById } from './cards.js';
import { rollHuntReward } from './huntGame.js';

const DECK_SIZE = 8;
const FORTRESS_SLOTS = 4;
const XP_PER_LEVEL = 100;
const DAILY_HUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_CARD_LEVEL = 10;
const STARTER_GEMS = 50;
const LEVEL_UP_COIN_REWARD = 50;
const TROPHIES_PER_WIN = 30;
const TROPHIES_PER_LOSS = 10;
const CARD_UPGRADE_COST_PER_LEVEL = 50;
const MAX_BATTLE_HISTORY = 10;
export const DAILY_QUESTS = [
  { id: 'win', label: 'Gewinne einen Arenakampf', target: 1, reward: 120 },
  { id: 'play-cards', label: 'Spiele 5 Karten aus', target: 5, reward: 80 },
  { id: 'cast-spells', label: 'Wirke 2 Zauber', target: 2, reward: 60 },
];

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Holds all persistent progression for a single player: level/XP, trophies
 * (which determine the current arena), gems/coins, the card collection
 * found via the daily hunt (each with its own upgrade level), the
 * defensive cards slotted into the fortress (only usable outside of
 * battle) and the 8-card battle deck used while fighting.
 */
export class Player {
  constructor({ name = 'Spieler', now = () => Date.now() } = {}) {
    this.name = name;
    this.now = now;
    this.level = 1;
    this.xp = 0;
    this.coins = 0;
    this.gems = STARTER_GEMS;
    this.trophies = 0;
    this.collection = ['swordsman', 'archer', 'shieldbearer', 'knight', 'mage', 'catapult', 'griffin', 'dragon', 'pfeil'];
    this.cardLevels = Object.fromEntries(this.collection.map((cardId) => [cardId, 1]));
    this.fortressSlots = new Array(FORTRESS_SLOTS).fill(null);
    this.deck = this.collection.slice(0, DECK_SIZE);
    this.lastHuntAt = null;
    this.dailyQuestProgress = {
      day: utcDay(this.now()),
      wins: 0,
      cardsPlayed: 0,
      spellsCast: 0,
      claimed: [],
    };
    this.battleHistory = [];
  }

  restoreBattleHistory(records) {
    if (!Array.isArray(records)) return;
    this.battleHistory = records
      .filter((record) => record && typeof record === 'object' && !Array.isArray(record))
      .filter((record) => ['player', 'enemy', 'draw'].includes(record.result) && Number.isFinite(Date.parse(record.playedAt)))
      .slice(0, MAX_BATTLE_HISTORY)
      .map((record) => ({
        result: record.result,
        playedAt: new Date(record.playedAt).toISOString(),
        trophyChange: Number.isSafeInteger(record.trophyChange) ? Math.max(-10, Math.min(30, record.trophyChange)) : 0,
        opponent: typeof record.opponent === 'string' ? record.opponent.slice(0, 40) : 'Übungsgegner',
        durationSeconds: Number.isSafeInteger(record.durationSeconds) ? Math.max(0, Math.min(180, record.durationSeconds)) : 0,
        cardsPlayed: Number.isSafeInteger(record.cardsPlayed) ? Math.max(0, Math.min(100, record.cardsPlayed)) : 0,
        spellsCast: Number.isSafeInteger(record.spellsCast) ? Math.max(0, Math.min(100, record.spellsCast)) : 0,
        playerFortressHealth: Number.isFinite(record.playerFortressHealth)
          ? Math.max(0, Math.min(100, record.playerFortressHealth))
          : 0,
        enemyFortressHealth: Number.isFinite(record.enemyFortressHealth)
          ? Math.max(0, Math.min(100, record.enemyFortressHealth))
          : 0,
      }));
  }

  recordBattle({ result, trophyChange = 0, opponent = 'Übungsgegner', durationSeconds = 0, cardsPlayed = 0, spellsCast = 0, playerFortressHealth = 0, enemyFortressHealth = 0 }) {
    if (!['player', 'enemy', 'draw'].includes(result)) throw new Error(`Invalid battle result: ${result}`);
    const record = {
      result,
      playedAt: new Date(this.now()).toISOString(),
      trophyChange: Number.isSafeInteger(trophyChange) ? trophyChange : 0,
      opponent: String(opponent).slice(0, 40),
      durationSeconds: Number.isSafeInteger(durationSeconds) ? Math.max(0, Math.min(180, durationSeconds)) : 0,
      cardsPlayed: Number.isSafeInteger(cardsPlayed) ? Math.max(0, Math.min(100, cardsPlayed)) : 0,
      spellsCast: Number.isSafeInteger(spellsCast) ? Math.max(0, Math.min(100, spellsCast)) : 0,
      playerFortressHealth: Number.isFinite(playerFortressHealth) ? Math.max(0, Math.min(100, playerFortressHealth)) : 0,
      enemyFortressHealth: Number.isFinite(enemyFortressHealth) ? Math.max(0, Math.min(100, enemyFortressHealth)) : 0,
    };
    this.battleHistory.unshift(record);
    this.battleHistory.length = Math.min(this.battleHistory.length, MAX_BATTLE_HISTORY);
    return record;
  }

  restoreDailyQuestProgress(progress) {
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return;
    const currentDay = utcDay(this.now());
    if (progress.day !== currentDay) {
      this.dailyQuestProgress = { day: currentDay, wins: 0, cardsPlayed: 0, spellsCast: 0, claimed: [] };
      return;
    }
    const integerOrZero = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    const allowedClaims = new Set(DAILY_QUESTS.map((quest) => quest.id));
    this.dailyQuestProgress = {
      day: currentDay,
      wins: Math.min(1, integerOrZero(progress.wins)),
      cardsPlayed: Math.min(5, integerOrZero(progress.cardsPlayed)),
      spellsCast: Math.min(2, integerOrZero(progress.spellsCast)),
      claimed: Array.isArray(progress.claimed)
        ? [...new Set(progress.claimed.filter((id) => allowedClaims.has(id)))]
        : [],
    };
  }

  getDailyQuests() {
    const currentDay = utcDay(this.now());
    if (this.dailyQuestProgress.day !== currentDay) {
      this.dailyQuestProgress = { day: currentDay, wins: 0, cardsPlayed: 0, spellsCast: 0, claimed: [] };
    }
    const { wins, cardsPlayed, spellsCast, claimed } = this.dailyQuestProgress;
    const progressById = { win: wins, 'play-cards': cardsPlayed, 'cast-spells': spellsCast };
    return DAILY_QUESTS.map((quest) => ({
      ...quest,
      progress: Math.min(quest.target, progressById[quest.id]),
      completed: progressById[quest.id] >= quest.target,
      claimed: claimed.includes(quest.id),
    }));
  }

  recordDailyQuestProgress({ winner, cardsPlayed = 0, spellsCast = 0 } = {}) {
    this.getDailyQuests();
    const validCount = (count) => Number.isSafeInteger(count) && count >= 0;
    if (!validCount(cardsPlayed) || !validCount(spellsCast)) {
      throw new Error('Quest progress counts must be non-negative integers');
    }
    this.dailyQuestProgress.wins = Math.min(1, this.dailyQuestProgress.wins + (winner === 'player' ? 1 : 0));
    this.dailyQuestProgress.cardsPlayed = Math.min(5, this.dailyQuestProgress.cardsPlayed + cardsPlayed);
    this.dailyQuestProgress.spellsCast = Math.min(2, this.dailyQuestProgress.spellsCast + spellsCast);
  }

  claimDailyQuest(questId) {
    const quest = this.getDailyQuests().find((entry) => entry.id === questId);
    if (!quest) throw new Error(`Unknown daily quest: ${questId}`);
    if (quest.claimed) throw new Error('Daily quest reward already claimed');
    if (!quest.completed) throw new Error('Daily quest is not complete yet');
    this.dailyQuestProgress.claimed.push(questId);
    this.coins += quest.reward;
    return { questId, reward: quest.reward, coins: this.coins };
  }

  /** The upgrade level of an owned card (defaults to 1). */
  getCardLevel(cardId) {
    return this.cardLevels[cardId] ?? 1;
  }

  getCardUpgradeCost(cardId) {
    if (!this.collection.includes(cardId)) {
      throw new Error(`Card not in collection: ${cardId}`);
    }
    const level = this.getCardLevel(cardId);
    if (level >= MAX_CARD_LEVEL) return null;
    return level * CARD_UPGRADE_COST_PER_LEVEL;
  }

  upgradeCard(cardId) {
    const cost = this.getCardUpgradeCost(cardId);
    if (cost === null) throw new Error('Card is already at the maximum level');
    if (this.coins < cost) throw new Error('Not enough coins to upgrade this card');
    this.coins -= cost;
    this.cardLevels[cardId] = this.getCardLevel(cardId) + 1;
    return { cardId, level: this.cardLevels[cardId], cost };
  }

  /** Applies the trophy change for a finished battle (never below 0). */
  recordBattleOutcome(winner) {
    if (winner === 'player') {
      this.trophies += TROPHIES_PER_WIN;
    } else if (winner === 'enemy') {
      this.trophies = Math.max(0, this.trophies - TROPHIES_PER_LOSS);
    }
  }

  /** Adds XP and rolls level-ups over as many thresholds as needed. */
  addXp(amount) {
    if (amount < 0) {
      throw new Error('XP amount must not be negative');
    }
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= XP_PER_LEVEL) {
      this.xp -= XP_PER_LEVEL;
      this.level += 1;
      this.coins += LEVEL_UP_COIN_REWARD;
      leveledUp = true;
    }
    return leveledUp;
  }

  /** Whether the daily hunt reward is available right now. */
  canHuntToday() {
    if (this.lastHuntAt === null) return true;
    return this.now() - this.lastHuntAt >= DAILY_HUNT_COOLDOWN_MS;
  }

  msUntilNextHunt() {
    if (this.canHuntToday()) return 0;
    return DAILY_HUNT_COOLDOWN_MS - (this.now() - this.lastHuntAt);
  }

  /**
   * Completes the daily hunt mini-game: `hits` out of `totalRounds` targets
   * were successfully tapped, which determines the rarity of the card
   * found. Can only be called once every 24h. If the card is already owned,
   * it is upgraded by one level (capped at MAX_CARD_LEVEL) instead of being
   * duplicated in the collection.
   */
  completeDailyHunt(hits, totalRounds, rng = Math.random) {
    if (!this.canHuntToday()) {
      throw new Error('Daily hunt already claimed. Try again later.');
    }
    const card = rollHuntReward(hits, totalRounds, rng);
    this.lastHuntAt = this.now();
    let leveledUp = false;
    if (!this.collection.includes(card.id)) {
      this.collection.push(card.id);
      this.cardLevels[card.id] = 1;
    } else if (this.getCardLevel(card.id) < MAX_CARD_LEVEL) {
      this.cardLevels[card.id] = this.getCardLevel(card.id) + 1;
      leveledUp = true;
    }
    return { card, leveledUp, level: this.getCardLevel(card.id) };
  }

  /** Equips a card the player owns into a fortress slot (outside of battle only). */
  equipFortressSlot(slotIndex, cardId) {
    if (slotIndex < 0 || slotIndex >= FORTRESS_SLOTS) {
      throw new Error(`Invalid fortress slot index: ${slotIndex}`);
    }
    if (!this.collection.includes(cardId)) {
      throw new Error(`Card not in collection: ${cardId}`);
    }
    if (getCardById(cardId).type === 'spell') {
      throw new Error('Spells cannot be equipped as fortress guards');
    }
    this.fortressSlots[slotIndex] = cardId;
  }

  clearFortressSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= FORTRESS_SLOTS) {
      throw new Error(`Invalid fortress slot index: ${slotIndex}`);
    }
    this.fortressSlots[slotIndex] = null;
  }

  /** Sets the 8-card battle deck. Must be exactly 8 owned, unique cards. */
  setDeck(cardIds) {
    if (cardIds.length !== DECK_SIZE) {
      throw new Error(`Deck must contain exactly ${DECK_SIZE} cards`);
    }
    if (new Set(cardIds).size !== cardIds.length) {
      throw new Error('Deck cannot contain duplicate cards');
    }
    for (const id of cardIds) {
      if (!this.collection.includes(id)) {
        throw new Error(`Card not in collection: ${id}`);
      }
      getCardById(id); // validates card exists
    }
    this.deck = [...cardIds];
  }

  isDeckReady() {
    return this.deck.length === DECK_SIZE;
  }
}

export {
  DECK_SIZE,
  FORTRESS_SLOTS,
  XP_PER_LEVEL,
  DAILY_HUNT_COOLDOWN_MS,
  MAX_CARD_LEVEL,
  CARD_UPGRADE_COST_PER_LEVEL,
  STARTER_GEMS,
  LEVEL_UP_COIN_REWARD,
  TROPHIES_PER_WIN,
  TROPHIES_PER_LOSS,
};
