import { getCardById } from './cards.js';
import { FORTRESS_HP, LANE_LENGTH } from './battle.js';

export const MAX_ENERGY = 10;
export const STARTING_ENERGY = 4;
export const PLAYER_ENERGY_PER_SECOND = 1.15;
export const BATTLE_DURATION_SECONDS = 180;
const ENEMY_ENERGY_PER_SECOND = 1;
const ATTACK_INTERVAL = 1;
const SIMULATION_STEP = 0.05;

function makeUnit(owner, cardId, x, stationary = false) {
  const card = getCardById(cardId);
  return {
    owner,
    cardId,
    card,
    hp: card.hp,
    x,
    stationary,
    attackCooldown: 0,
    hitFlash: 0,
  };
}

export class LiveBattle {
  constructor({ playerDeck, enemyDeck, playerDefenders = [], enemyDefenders = [], rng = Math.random } = {}) {
    this.#validateDeck(playerDeck, 'playerDeck');
    this.#validateDeck(enemyDeck, 'enemyDeck');
    this.playerQueue = [...playerDeck];
    this.enemyQueue = [...enemyDeck];
    this.playerEnergy = STARTING_ENERGY;
    this.enemyEnergy = STARTING_ENERGY;
    this.playerFortressHp = FORTRESS_HP;
    this.enemyFortressHp = FORTRESS_HP;
    this.elapsed = 0;
    this.enemyDeployIn = 1.5;
    this.rng = rng;
    this.units = [
      ...playerDefenders.filter(Boolean).map((id) => makeUnit('player', id, 0.35, true)),
      ...enemyDefenders.filter(Boolean).map((id) => makeUnit('enemy', id, LANE_LENGTH - 0.35, true)),
    ];
    this.effects = [];
    this.winner = null;
  }

  get playerHand() { return this.playerQueue.slice(0, 4); }
  get playerNextCard() { return this.playerQueue[4] ?? null; }
  get enemyHand() { return this.enemyQueue.slice(0, 4); }

  playCard(handIndex) {
    if (this.winner) return { ok: false, reason: 'finished' };
    if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex > 3) return { ok: false, reason: 'invalid-card' };
    const cardId = this.playerQueue[handIndex];
    const card = getCardById(cardId);
    if (this.playerEnergy < card.cost) return { ok: false, reason: 'energy' };
    this.playerEnergy -= card.cost;
    this.units.push(makeUnit('player', cardId, 1.4));
    this.playerQueue.splice(handIndex, 1);
    this.playerQueue.push(cardId);
    return { ok: true, cardId };
  }

  step(deltaSeconds) {
    if (this.winner || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this;
    let remaining = deltaSeconds;
    while (remaining > 0 && !this.winner) {
      const dt = Math.min(SIMULATION_STEP, remaining);
      this.#tick(dt);
      remaining -= dt;
    }
    return this;
  }

  #validateDeck(deck, name) {
    if (!Array.isArray(deck) || deck.length !== 8 || new Set(deck).size !== 8) {
      throw new Error(`${name} must contain exactly 8 unique cards`);
    }
    deck.forEach(getCardById);
  }

  #tick(dt) {
    this.elapsed = Math.min(BATTLE_DURATION_SECONDS, this.elapsed + dt);
    this.playerEnergy = Math.min(MAX_ENERGY, this.playerEnergy + PLAYER_ENERGY_PER_SECOND * dt);
    this.enemyEnergy = Math.min(MAX_ENERGY, this.enemyEnergy + ENEMY_ENERGY_PER_SECOND * dt);
    this.enemyDeployIn -= dt;
    if (this.enemyDeployIn <= 0) {
      this.#enemyDeploy();
      this.enemyDeployIn = 1.5;
    }

    for (const unit of this.units) {
      unit.hitFlash = Math.max(0, unit.hitFlash - dt);
      unit.attackCooldown -= dt;
    }
    this.effects = this.effects.filter((effect) => {
      effect.age += dt;
      return effect.age < (effect.duration ?? 0.65);
    });
    const living = this.units.filter((unit) => unit.hp > 0);

    for (const unit of living) {
      const target = this.#closestEnemy(unit, living);
      if (target && Math.abs(target.x - unit.x) <= unit.card.range) continue;
      if (!unit.stationary) {
        unit.x = Math.max(0, Math.min(LANE_LENGTH, unit.x + (unit.owner === 'player' ? 1 : -1) * unit.card.speed * dt));
      }
    }

    for (const unit of living) {
      if (unit.attackCooldown > 0) continue;
      const target = this.#closestEnemy(unit, living);
      if (target && Math.abs(target.x - unit.x) <= unit.card.range) {
        this.#damage(target, unit.card.damage, unit);
        unit.attackCooldown = ATTACK_INTERVAL;
        continue;
      }
      if (unit.stationary) continue;
      const distanceToFortress = unit.owner === 'player' ? LANE_LENGTH - unit.x : unit.x;
      if (distanceToFortress <= unit.card.range) {
        if (unit.owner === 'player') this.enemyFortressHp = Math.max(0, this.enemyFortressHp - unit.card.damage);
        else this.playerFortressHp = Math.max(0, this.playerFortressHp - unit.card.damage);
        this.effects.push({ x: unit.owner === 'player' ? LANE_LENGTH : 0, amount: unit.card.damage, owner: unit.owner, age: 0 });
        unit.attackCooldown = ATTACK_INTERVAL;
      }
    }

    this.units = this.units.filter((unit) => unit.hp > 0);
    if (this.enemyFortressHp <= 0) this.winner = 'player';
    else if (this.playerFortressHp <= 0) this.winner = 'enemy';
    else if (this.elapsed >= BATTLE_DURATION_SECONDS) {
      this.winner = this.playerFortressHp === this.enemyFortressHp
        ? 'draw'
        : this.playerFortressHp > this.enemyFortressHp ? 'player' : 'enemy';
    }
  }

  #enemyDeploy() {
    const affordable = this.enemyHand
      .map((cardId, index) => ({ cardId, index, cost: getCardById(cardId).cost }))
      .filter((entry) => entry.cost <= this.enemyEnergy);
    if (!affordable.length) return;
    const choice = affordable[Math.floor(this.rng() * affordable.length)];
    this.enemyEnergy -= choice.cost;
    this.units.push(makeUnit('enemy', choice.cardId, LANE_LENGTH - 1.4));
    this.enemyQueue.splice(choice.index, 1);
    this.enemyQueue.push(choice.cardId);
  }

  #closestEnemy(unit, living) {
    let closest = null;
    let closestDistance = Infinity;
    for (const other of living) {
      if (other.owner === unit.owner) continue;
      const distance = Math.abs(other.x - unit.x);
      if (distance < closestDistance) {
        closest = other;
        closestDistance = distance;
      }
    }
    return closest;
  }

  #damage(target, amount, attacker) {
    target.hp = Math.max(0, target.hp - amount);
    target.hitFlash = 0.16;
    if (attacker.card.range > 1) {
      const duration = Math.max(0.12, Math.abs(attacker.x - target.x) / 8.33);
      this.effects.push({
        x: attacker.x,
        fromX: attacker.x,
        toX: target.x,
        amount,
        owner: attacker.owner,
        age: 0,
        duration,
        kind: 'projectile',
      });
    }
    this.effects.push({ x: target.x, amount, owner: target.owner, age: 0, kind: 'damage' });
    if (target.hp === 0) this.effects.push({ x: target.x, amount: 0, owner: target.owner, age: 0, kind: 'death' });
  }
}
