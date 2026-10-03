// Arena progression: the player's "Festung" (fortress) is placed in an arena
// based on how many trophies have been won in battle. Each arena has a
// flavourful name and a trophy threshold at which it is reached.
export const ARENAS = [
  { name: 'Arena 1: Heimatdorf', threshold: 0 },
  { name: 'Arena 2: Kaltmark', threshold: 150 },
  { name: 'Arena 3: Dornenwald', threshold: 350 },
  { name: 'Arena 4: Schattenfeste', threshold: 600 },
  { name: 'Arena 5: Drachenhort', threshold: 900 },
  { name: 'Arena 6: Himmelszitadelle', threshold: 1300 },
];

export const ARENA_REWARDS = [
  { arenaIndex: 1, coins: 100 },
  { arenaIndex: 2, coins: 150 },
  { arenaIndex: 3, coins: 200 },
  { arenaIndex: 4, coins: 250 },
  { arenaIndex: 5, coins: 300 },
];

/**
 * Returns the current arena for the given trophy count plus the trophy
 * threshold of the next arena (or null if already at the highest arena).
 */
export function getArenaProgress(trophies) {
  let current = ARENAS[0];
  let next = ARENAS[1] ?? null;
  for (let i = 0; i < ARENAS.length; i += 1) {
    if (trophies >= ARENAS[i].threshold) {
      current = ARENAS[i];
      next = ARENAS[i + 1] ?? null;
    }
  }
  return { current, next };
}

export function getArenaCardLevel(trophies) {
  return ARENAS.indexOf(getArenaProgress(trophies).current) + 1;
}
