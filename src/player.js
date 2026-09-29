import { getCardById, rollRandomCard } from './cards.js';

const DECK_SIZE = 4;
const FORTRESS_SLOTS = 4;
const XP_PER_LEVEL = 100;
const DAILY_HUNT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Holds all persistent progression for a single player: level/XP, the
 * card collection found via the daily hunt, the defensive cards slotted
 * into the fortress (only usable outside of battle) and the 4-card
 * battle deck used while fighting.
 */
export class Player {
  constructor({ name = 'Spieler', now = () => Date.now() } = {}) {
    this.name = name;
    this.now = now;
    this.level = 1;
    this.xp = 0;
    this.coins = 0;
    this.collection = ['swordsman', 'archer']; // starter cards
    this.fortressSlots = new Array(FORTRESS_SLOTS).fill(null);
    this.deck = [];
    this.lastHuntAt = null;
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
   * Performs the "daily hunt": grants a random card (weighted by rarity)
   * once every 24h. Throws if called again before the cooldown expires.
   */
  huntDaily(rng = Math.random) {
    if (!this.canHuntToday()) {
      throw new Error('Daily hunt already claimed. Try again later.');
    }
    const card = rollRandomCard(rng);
    this.lastHuntAt = this.now();
    if (!this.collection.includes(card.id)) {
      this.collection.push(card.id);
    }
    return card;
  }

  /** Equips a card the player owns into a fortress slot (outside of battle only). */
  equipFortressSlot(slotIndex, cardId) {
    if (slotIndex < 0 || slotIndex >= FORTRESS_SLOTS) {
      throw new Error(`Invalid fortress slot index: ${slotIndex}`);
    }
    if (!this.collection.includes(cardId)) {
      throw new Error(`Card not in collection: ${cardId}`);
    }
    getCardById(cardId); // validates card exists
    this.fortressSlots[slotIndex] = cardId;
  }

  clearFortressSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= FORTRESS_SLOTS) {
      throw new Error(`Invalid fortress slot index: ${slotIndex}`);
    }
    this.fortressSlots[slotIndex] = null;
  }

  /** Sets the 4-card battle deck. Must be exactly 4 owned, unique cards. */
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

export { DECK_SIZE, FORTRESS_SLOTS, XP_PER_LEVEL, DAILY_HUNT_COOLDOWN_MS };
