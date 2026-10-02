// "Kartenjagd" (card hunt) mini-game: a quick reaction game played once per
// day. A target appears at a random spot for a short moment; the player has
// to tap/click it before it disappears. The resulting accuracy (hits out of
// total rounds) determines how good the rarity of the found card is.
import { pickWeightedCard } from './cards.js';

export const HUNT_ROUNDS = 6;
export const ROUND_DURATION_MS = 900;
export const TARGET_RADIUS = 0.09; // normalized radius (0..1 play-field units)

/**
 * Generates the sequence of target positions for one hunt session, in
 * normalized 0..1 coordinates (keeping some margin from the edges so the
 * target is never clipped by the play-field border).
 */
export function generateHuntRounds(count = HUNT_ROUNDS, rng = Math.random) {
  const rounds = [];
  for (let i = 0; i < count; i += 1) {
    rounds.push({
      x: TARGET_RADIUS + rng() * (1 - 2 * TARGET_RADIUS),
      y: TARGET_RADIUS + rng() * (1 - 2 * TARGET_RADIUS),
    });
  }
  return rounds;
}

/** Whether a tap/click at normalized (x, y) hits the given target. */
export function isHit(target, x, y, radius = TARGET_RADIUS) {
  const dx = target.x - x;
  const dy = target.y - y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

// The better the player's accuracy, the more the rarity weights shift
// towards rarer cards. Tiers are checked from best to worst accuracy.
const ACCURACY_TIERS = [
  { minAccuracy: 1, weights: { common: 0, rare: 15, epic: 55, legendary: 30 } },
  { minAccuracy: 0.67, weights: { common: 20, rare: 35, epic: 33, legendary: 12 } },
  { minAccuracy: 0.34, weights: { common: 45, rare: 35, epic: 16, legendary: 4 } },
  { minAccuracy: 0, weights: { common: 70, rare: 22, epic: 7, legendary: 1 } },
];

/** Returns the rarity weight table matching the given accuracy (0..1). */
export function weightsForAccuracy(accuracy) {
  const tier = ACCURACY_TIERS.find((t) => accuracy >= t.minAccuracy);
  return tier.weights;
}

/**
 * Rolls the card reward for a finished hunt session based on how many of
 * the `totalRounds` targets the player successfully hit.
 */
export function rollHuntReward(hits, totalRounds, rng = Math.random) {
  if (totalRounds <= 0) {
    throw new Error('totalRounds must be greater than 0');
  }
  const accuracy = Math.max(0, Math.min(1, hits / totalRounds));
  return pickWeightedCard(weightsForAccuracy(accuracy), rng);
}
