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
  { id: 'swordsman', name: 'Schwertkämpfer', rarity: RARITY.COMMON, hp: 120, damage: 20, speed: 1.0, range: 1 },
  { id: 'archer', name: 'Bogenschütze', rarity: RARITY.COMMON, hp: 70, damage: 15, speed: 1.1, range: 4 },
  { id: 'shieldbearer', name: 'Schildträger', rarity: RARITY.COMMON, hp: 220, damage: 10, speed: 0.7, range: 1 },
  { id: 'knight', name: 'Ritter', rarity: RARITY.RARE, hp: 180, damage: 30, speed: 1.2, range: 1 },
  { id: 'mage', name: 'Magier', rarity: RARITY.RARE, hp: 60, damage: 35, speed: 0.9, range: 5 },
  { id: 'catapult', name: 'Katapult', rarity: RARITY.EPIC, hp: 150, damage: 60, speed: 0.5, range: 6 },
  { id: 'griffin', name: 'Greif', rarity: RARITY.EPIC, hp: 140, damage: 40, speed: 1.6, range: 1 },
  { id: 'dragon', name: 'Drache', rarity: RARITY.LEGENDARY, hp: 260, damage: 55, speed: 1.3, range: 3 },
];

export function getCardById(id) {
  const card = CARD_LIBRARY.find((c) => c.id === id);
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
 * Picks a random card from the library, weighted by rarity.
 * @param {() => number} rng - random source returning [0, 1); defaults to Math.random.
 */
export function rollRandomCard(rng = Math.random) {
  const totalWeight = CARD_LIBRARY.reduce((sum, card) => sum + RARITY_WEIGHTS[card.rarity], 0);
  let roll = rng() * totalWeight;
  for (const card of CARD_LIBRARY) {
    roll -= RARITY_WEIGHTS[card.rarity];
    if (roll <= 0) {
      return card;
    }
  }
  return CARD_LIBRARY[CARD_LIBRARY.length - 1];
}
