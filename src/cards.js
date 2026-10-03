// Static definitions for all cards that can appear in the game.
// Rarity affects how likely a card is to be found during the daily hunt.
export const RARITY = {
  COMMON: 'common',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
};

// Base stats are balanced around lane combat: hp/damage per hit and
// speed expressed in lane-tiles per second.
export const CARD_LIBRARY = [
  { id: 'swordsman', name: 'Schwertkämpfer', rarity: RARITY.COMMON, type: 'monster', cost: 3, hp: 120, damage: 20, speed: 1.0, range: 1 },
  { id: 'archer', name: 'Bogenschütze', rarity: RARITY.COMMON, type: 'monster', cost: 3, hp: 70, damage: 15, speed: 1.1, range: 4 },
  { id: 'shieldbearer', name: 'Schildträger', rarity: RARITY.COMMON, type: 'monster', cost: 4, hp: 220, damage: 10, speed: 0.7, range: 1 },
  { id: 'knight', name: 'Ritter', rarity: RARITY.RARE, type: 'monster', cost: 4, hp: 180, damage: 30, speed: 1.2, range: 1 },
  { id: 'mage', name: 'Magier', rarity: RARITY.RARE, type: 'monster', cost: 4, hp: 60, damage: 35, speed: 0.9, range: 5 },
  { id: 'catapult', name: 'Katapult', rarity: RARITY.EPIC, type: 'monster', cost: 5, hp: 150, damage: 60, speed: 0.5, range: 6 },
  { id: 'griffin', name: 'Greif', rarity: RARITY.EPIC, type: 'monster', cost: 5, hp: 140, damage: 40, speed: 1.6, range: 1 },
  { id: 'dragon', name: 'Drache', rarity: RARITY.LEGENDARY, type: 'monster', cost: 5, hp: 260, damage: 55, speed: 1.3, range: 3 },
];

export const SPELL_LIBRARY = [
  { id: 'pfeil', name: 'Pfeilhagel', rarity: RARITY.COMMON, type: 'spell', cost: 3, effect: 'damage', damage: 45, radius: 95 },
  { id: 'feuer', name: 'Feuerball', rarity: RARITY.RARE, type: 'spell', cost: 4, effect: 'fire', damage: 140, radius: 60, fortressDamage: 0.7 },
  { id: 'blitz', name: 'Blitz', rarity: RARITY.EPIC, type: 'spell', cost: 4, effect: 'lightning', damage: 110, maxTargets: 3 },
  { id: 'heil', name: 'Heilung', rarity: RARITY.RARE, type: 'spell', cost: 3, effect: 'heal', amount: 80, radius: 100 },
  { id: 'frost', name: 'Frost', rarity: RARITY.RARE, type: 'spell', cost: 3, effect: 'slow', duration: 4, multiplier: 0.45, radius: 100 },
  { id: 'wut', name: 'Wut', rarity: RARITY.EPIC, type: 'spell', cost: 3, effect: 'haste', duration: 5, multiplier: 1.5, radius: 100 },
];

export const ALL_CARDS = [...CARD_LIBRARY, ...SPELL_LIBRARY];

export function getCardById(id) {
  const card = ALL_CARDS.find((c) => c.id === id);
  if (!card) {
    throw new Error(`Unknown card id: ${id}`);
  }
  return card;
}

const RARITY_WEIGHTS = {
  [RARITY.COMMON]: 60,
  [RARITY.RARE]: 27,
  [RARITY.EPIC]: 10,
  [RARITY.LEGENDARY]: 3,
};

/**
 * Picks a random card from the library using an arbitrary rarity weight
 * table (defaults to the base RARITY_WEIGHTS).
 * @param {Record<string, number>} weights - weight per rarity.
 * @param {() => number} rng - random source returning [0, 1); defaults to Math.random.
 */
export function pickWeightedCard(weights = RARITY_WEIGHTS, rng = Math.random) {
  const weighted = CARD_LIBRARY.filter((card) => (weights[card.rarity] ?? 0) > 0);
  if (weighted.length === 0) {
    throw new Error('No card has a positive weight for the given weight table');
  }
  const totalWeight = weighted.reduce((sum, card) => sum + weights[card.rarity], 0);
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const card of weighted) {
    cumulative += weights[card.rarity];
    if (roll < cumulative) {
      return card;
    }
  }
  return weighted[weighted.length - 1];
}

/**
 * Picks a random card from the library, weighted by the base rarity table.
 * @param {() => number} rng - random source returning [0, 1); defaults to Math.random.
 */
export function rollRandomCard(rng = Math.random) {
  return pickWeightedCard(RARITY_WEIGHTS, rng);
}
