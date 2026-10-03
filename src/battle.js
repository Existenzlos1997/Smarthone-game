import { getCardById } from './cards.js';

export const LANE_LENGTH = 20; // tiles from the player fortress (0) to the enemy fortress (LANE_LENGTH)
export const FORTRESS_HP = 1000;
export const ATTACK_INTERVAL = 1; // seconds between attacks for every unit
const TICK = 0.1; // seconds per simulation step
const MAX_TIME = 120; // safety cap so a battle can never run forever

export function interpolateFortressHealth(result, progress) {
  if (!result) return { player: FORTRESS_HP, enemy: FORTRESS_HP };
  const amount = Math.max(0, Math.min(1, progress));
  return {
    player: FORTRESS_HP + (result.playerFortressHp - FORTRESS_HP) * amount,
    enemy: FORTRESS_HP + (result.enemyFortressHp - FORTRESS_HP) * amount,
  };
}

let nextUnitId = 1;

function spawnUnit(owner, cardId, x) {
  const card = getCardById(cardId);
  return {
    id: nextUnitId++,
    owner, // 'player' | 'enemy'
    cardId,
    card,
    hp: card.hp,
    x,
    stationary: false,
    cooldown: 0,
  };
}

function spawnDefender(owner, cardId, x) {
  const unit = spawnUnit(owner, cardId, x);
  unit.stationary = true;
  return unit;
}

function distance(a, b) {
  return Math.abs(a.x - b.x);
}

/**
 * Simulates a 2D lane auto-battle: the 4 deck cards on each side walk
 * automatically towards the opposing fortress (left<->right) and fight
 * whatever they encounter along the way, including the stationary
 * fortress defenders that were equipped outside of battle.
 *
 * @returns {{winner: 'player'|'enemy'|'draw', log: string[], durationSeconds: number,
 *            playerFortressHp: number, enemyFortressHp: number}}
 */
export function simulateBattle({
  playerDeck,
  enemyDeck,
  playerFortressDefenders = [],
  enemyFortressDefenders = [],
} = {}) {
  if (!Array.isArray(playerDeck) || playerDeck.length !== 4) {
    throw new Error('playerDeck must contain exactly 4 cards');
  }
  if (!Array.isArray(enemyDeck) || enemyDeck.length !== 4) {
    throw new Error('enemyDeck must contain exactly 4 cards');
  }

  const units = [
    ...playerDeck.map((id) => spawnUnit('player', id, 0.5)),
    ...enemyDeck.map((id) => spawnUnit('enemy', id, LANE_LENGTH - 0.5)),
    ...playerFortressDefenders.filter(Boolean).map((id) => spawnDefender('player', id, 0)),
    ...enemyFortressDefenders.filter(Boolean).map((id) => spawnDefender('enemy', id, LANE_LENGTH)),
  ];

  let playerFortressHp = FORTRESS_HP;
  let enemyFortressHp = FORTRESS_HP;
  const log = [];
  let t = 0;

  const isAlive = (u) => u.hp > 0;
  const opponentOf = (owner) => (owner === 'player' ? 'enemy' : 'player');
  const direction = (owner) => (owner === 'player' ? 1 : -1);
  const fortressXFor = (owner) => (owner === 'player' ? LANE_LENGTH : 0); // enemy fortress the unit marches toward

  while (t < MAX_TIME && playerFortressHp > 0 && enemyFortressHp > 0) {
    // Movement: every non-stationary unit without a target in range advances.
    for (const unit of units.filter(isAlive)) {
      if (unit.stationary) continue;
      const target = findClosestTarget(unit, units, opponentOf);
      if (!target || distance(unit, target) > unit.card.range) {
        unit.x += direction(unit.owner) * unit.card.speed * TICK;
        unit.x = Math.max(0, Math.min(LANE_LENGTH, unit.x));
      }
    }

    // Combat: units in range of an enemy unit attack it; otherwise, if in
    // range of the enemy fortress, they attack the fortress directly.
    for (const unit of units.filter(isAlive)) {
      unit.cooldown -= TICK;
      if (unit.cooldown > 0) continue;
      const target = findClosestTarget(unit, units, opponentOf);
      if (target && distance(unit, target) <= unit.card.range) {
        target.hp -= unit.card.damage;
        unit.cooldown = ATTACK_INTERVAL;
        if (target.hp <= 0) {
          log.push(`${t.toFixed(1)}s: ${unit.card.name} (${unit.owner}) besiegt ${target.card.name} (${target.owner})`);
        }
        continue;
      }
      if (!unit.stationary && Math.abs(unit.x - fortressXFor(unit.owner)) <= unit.card.range) {
        if (unit.owner === 'player') {
          enemyFortressHp = Math.max(0, enemyFortressHp - unit.card.damage);
        } else {
          playerFortressHp = Math.max(0, playerFortressHp - unit.card.damage);
        }
        unit.cooldown = ATTACK_INTERVAL;
      }
    }

    t += TICK;
  }

  let winner = 'draw';
  if (enemyFortressHp <= 0 && playerFortressHp > 0) winner = 'player';
  else if (playerFortressHp <= 0 && enemyFortressHp > 0) winner = 'enemy';

  return {
    winner,
    log,
    durationSeconds: Math.round(t * 10) / 10,
    playerFortressHp,
    enemyFortressHp,
  };
}

function findClosestTarget(unit, units, opponentOf) {
  const enemyOwner = opponentOf(unit.owner);
  let closest = null;
  let closestDistance = Infinity;
  for (const other of units) {
    if (other.owner !== enemyOwner || other.hp <= 0) continue;
    const d = distance(unit, other);
    if (d < closestDistance) {
      closestDistance = d;
      closest = other;
    }
  }
  return closest;
}
