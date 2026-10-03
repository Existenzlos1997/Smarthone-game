import { getCardById } from './cards.js';
import { rollHuntReward } from './huntGame.js';

const DECK_SIZE = 8;
const FORTRESS_SLOTS = 4;
const XP_PER_LEVEL = 100;
const DAILY_HUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_CARD_LEVEL = 10;
const STARTER_GEMS = 50;
const TROPHIES_PER_WIN = 30;
const TROPHIES_PER_LOSS = 10;

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
  }

  /** The upgrade level of an owned card (defaults to 1). */
  getCardLevel(cardId) {
    return this.cardLevels[cardId] ?? 1;
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

export { DECK_SIZE, FORTRESS_SLOTS, XP_PER_LEVEL, DAILY_HUNT_COOLDOWN_MS, MAX_CARD_LEVEL, STARTER_GEMS, TROPHIES_PER_WIN, TROPHIES_PER_LOSS };
