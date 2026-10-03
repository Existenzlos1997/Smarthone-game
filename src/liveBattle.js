import { getCardAtLevel, getCardById } from './cards.js';
import { FORTRESS_HP, LANE_LENGTH } from './battle.js';

export const MAX_ENERGY = 10;
export const STARTING_ENERGY = 4;
export const PLAYER_ENERGY_PER_SECOND = 1.15;
export const BATTLE_DURATION_SECONDS = 180;
const ENEMY_ENERGY_PER_SECOND = 1;
const ATTACK_INTERVAL = 1;
const SIMULATION_STEP = 0.05;

function makeUnit(owner, cardId, x, stationary = false, cardLevels = {}) {
  const card = getCardAtLevel(cardId, cardLevels[cardId] ?? 1);
  if (card.type === 'spell') throw new Error(`Spell cards cannot be deployed as units: ${cardId}`);
  return {
    owner,
    cardId,
    card,
    hp: card.hp,
    x,
    stationary,
    attackCooldown: 0,
    hitFlash: 0,
    speedMultiplier: 1,
    attackSpeedMultiplier: 1,
    modifiedUntil: 0,
  };
}

export class LiveBattle {
  constructor({
    playerDeck,
    enemyDeck,
    playerDefenders = [],
    enemyDefenders = [],
    playerCardLevels = {},
    enemyCardLevels = {},
    rng = Math.random,
  } = {}) {
    this.#validateDeck(playerDeck, 'playerDeck');
    this.#validateDeck(enemyDeck, 'enemyDeck');
    this.playerCardLevels = playerCardLevels;
    this.enemyCardLevels = enemyCardLevels;
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
      ...playerDefenders.filter(Boolean).map((id) => makeUnit('player', id, 0.35, true, playerCardLevels)),
      ...enemyDefenders.filter(Boolean).map((id) => makeUnit('enemy', id, LANE_LENGTH - 0.35, true, enemyCardLevels)),
    ];
    this.effects = [];
    this.winner = null;
    this.selectedSpellIndex = null;
    this.playerCardsPlayed = 0;
    this.playerSpellsCast = 0;
  }

  get playerHand() { return this.playerQueue.slice(0, 4); }
  get playerNextCard() { return this.playerQueue[4] ?? null; }
  get enemyHand() { return this.enemyQueue.slice(0, 4); }

  playCard(handIndex) {
    if (this.winner) return { ok: false, reason: 'finished' };
    if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex > 3) return { ok: false, reason: 'invalid-card' };
    const cardId = this.playerQueue[handIndex];
    const card = getCardById(cardId);
    if (card.type === 'spell') return this.selectSpell(handIndex);
    if (this.playerEnergy < card.cost) return { ok: false, reason: 'energy' };
    this.playerEnergy -= card.cost;
    this.units.push(makeUnit('player', cardId, 1.4, false, this.playerCardLevels));
    this.playerCardsPlayed += 1;
    this.#rotateCard(handIndex, cardId);
    return { ok: true, cardId };
  }

  selectSpell(handIndex) {
    if (this.winner) return { ok: false, reason: 'finished' };
    if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex > 3) return { ok: false, reason: 'invalid-card' };
    const cardId = this.playerQueue[handIndex];
    const card = getCardById(cardId);
    if (card.type !== 'spell') return { ok: false, reason: 'not-spell' };
    if (this.playerEnergy < card.cost) return { ok: false, reason: 'energy' };
    if (this.selectedSpellIndex === handIndex) {
      this.selectedSpellIndex = null;
      return { ok: true, cancelled: true, cardId };
    }
    this.selectedSpellIndex = handIndex;
    return { ok: true, targeting: true, cardId };
  }

  castSpellAt(x) {
    const index = this.selectedSpellIndex;
    if (index === null) return { ok: false, reason: 'no-spell-selected' };
    if (this.winner) return { ok: false, reason: 'finished' };
    if (!Number.isFinite(x) || x < 0 || x > LANE_LENGTH) return { ok: false, reason: 'invalid-target' };
    const cardId = this.playerQueue[index];
    const spell = getCardAtLevel(cardId, this.playerCardLevels[cardId] ?? 1);
    if (this.playerEnergy < spell.cost) return { ok: false, reason: 'energy' };
    const ownSide = x <= LANE_LENGTH / 2;
    if (spell.effect === 'heal' || spell.effect === 'haste') {
      if (!ownSide) return { ok: false, reason: 'wrong-side' };
    } else if (ownSide) {
      return { ok: false, reason: 'wrong-side' };
    }
    this.playerEnergy -= spell.cost;
    this.#applySpell(spell, x);
    this.playerCardsPlayed += 1;
    this.playerSpellsCast += 1;
    this.#rotateCard(index, cardId);
    this.selectedSpellIndex = null;
    return { ok: true, cardId, x };
  }

  cancelSpellTarget() {
    this.selectedSpellIndex = null;
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

  #rotateCard(index, cardId) {
    this.playerQueue.splice(index, 1);
    this.playerQueue.push(cardId);
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
      if (unit.modifiedUntil && this.elapsed >= unit.modifiedUntil) {
        unit.speedMultiplier = 1;
        unit.attackSpeedMultiplier = 1;
        unit.modifiedUntil = 0;
      }
      unit.attackCooldown -= dt * unit.attackSpeedMultiplier;
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
        unit.x = Math.max(0, Math.min(LANE_LENGTH, unit.x + (unit.owner === 'player' ? 1 : -1) * unit.card.speed * unit.speedMultiplier * dt));
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
      .map((cardId, index) => ({
        cardId,
        index,
        card: getCardAtLevel(cardId, this.enemyCardLevels[cardId] ?? 1),
      }))
      .filter((entry) => entry.card.cost <= this.enemyEnergy);
    const spellChoices = affordable
      .filter((entry) => entry.card.type === 'spell')
      .map((entry) => ({ ...entry, ...this.#chooseEnemySpellTarget(entry.card) }))
      .filter((entry) => entry.x !== null && entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (spellChoices.length > 0) {
      const choice = spellChoices[0];
      this.enemyEnergy -= choice.card.cost;
      this.#applySpell(choice.card, choice.x, 'enemy');
      this.enemyQueue.splice(choice.index, 1);
      this.enemyQueue.push(choice.cardId);
      return;
    }

    const monsters = affordable.filter((entry) => entry.card.type === 'monster');
    if (!monsters.length) return;
    const choice = monsters[Math.floor(this.rng() * monsters.length)];
    this.enemyEnergy -= choice.card.cost;
    this.units.push(makeUnit('enemy', choice.cardId, LANE_LENGTH - 1.4, false, this.enemyCardLevels));
    this.enemyQueue.splice(choice.index, 1);
    this.enemyQueue.push(choice.cardId);
  }

  #chooseEnemySpellTarget(spell) {
    const allies = this.units.filter((unit) => unit.owner === 'enemy' && unit.hp > 0);
    const opponents = this.units.filter((unit) => unit.owner === 'player' && unit.hp > 0);
    const usesAllies = spell.effect === 'heal' || spell.effect === 'haste';
    const candidates = usesAllies ? allies : opponents;
    const radius = (spell.radius ?? 0) * LANE_LENGTH / 900;
    const targetPoints = candidates.map((unit) => unit.x);
    if (spell.effect === 'fire') targetPoints.push(0.5);
    let best = { x: null, score: 0 };

    for (const x of targetPoints) {
      const affected = spell.effect === 'lightning'
        ? candidates
        : candidates.filter((unit) => Math.abs(unit.x - x) <= radius);
      let score = 0;
      if (spell.effect === 'heal') {
        score = affected.reduce((sum, unit) => sum + Math.min(spell.amount, unit.card.hp - unit.hp), 0);
      } else if (spell.effect === 'haste' || spell.effect === 'slow') {
        score = affected.filter((unit) => unit.modifiedUntil <= this.elapsed).length;
      } else {
        score = Math.min(spell.maxTargets ?? affected.length, affected.length) * spell.damage;
      }
      if (spell.effect === 'fire' && x <= radius) score += spell.damage * spell.fortressDamage;
      if (score > best.score) best = { x, score };
    }
    return best;
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
    if (attacker && attacker.card.range > 1) {
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

  #applySpell(spell, x, owner = 'player') {
    const radius = (spell.radius ?? 0) * LANE_LENGTH / 900;
    const opposingOwner = owner === 'player' ? 'enemy' : 'player';
    const candidates = this.units.filter((unit) => unit.hp > 0);
    const targets = candidates.filter((unit) => {
      const isAlly = unit.owner === owner;
      if (spell.effect === 'heal' || spell.effect === 'haste') return isAlly && Math.abs(unit.x - x) <= radius;
      if (spell.effect === 'lightning') return unit.owner === opposingOwner;
      return unit.owner === opposingOwner && Math.abs(unit.x - x) <= radius;
    });

    if (spell.effect === 'lightning') {
      targets.sort((a, b) => b.hp - a.hp);
      targets.splice(spell.maxTargets);
    }

    for (const target of targets) {
      if (spell.effect === 'heal') {
        target.hp = Math.min(target.card.hp, target.hp + spell.amount);
        target.hitFlash = 0.08;
      } else if (spell.effect === 'slow' || spell.effect === 'haste') {
        target.speedMultiplier = spell.multiplier;
        target.attackSpeedMultiplier = spell.multiplier;
        target.modifiedUntil = this.elapsed + spell.duration;
      } else {
        this.#damage(target, spell.damage, null);
      }
    }

    const fortressX = owner === 'player' ? LANE_LENGTH : 0;
    if (spell.effect === 'fire' && Math.abs(fortressX - x) <= radius) {
      const amount = Math.round(spell.damage * spell.fortressDamage);
      if (owner === 'player') this.enemyFortressHp = Math.max(0, this.enemyFortressHp - amount);
      else this.playerFortressHp = Math.max(0, this.playerFortressHp - amount);
      this.effects.push({ x: fortressX, amount, owner, age: 0, kind: 'damage' });
    }

    this.effects.push({
      x,
      radius,
      spellId: spell.id,
      effect: spell.effect,
      owner,
      age: 0,
      duration: 0.8,
      kind: 'spell-burst',
    });
    if (this.enemyFortressHp <= 0) this.winner = 'player';
    else if (this.playerFortressHp <= 0) this.winner = 'enemy';
  }
}
