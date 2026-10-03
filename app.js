import { DECK_SIZE, Player } from './src/player.js';
import { CARD_LIBRARY, getCardById, RARITY } from './src/cards.js';
import { simulateBattle, LANE_LENGTH, FORTRESS_HP, interpolateFortressHealth } from './src/battle.js';
import { generateHuntRounds, isHit, HUNT_ROUNDS, ROUND_DURATION_MS, TARGET_RADIUS } from './src/huntGame.js';
import { getArenaProgress } from './src/arenas.js';

const STORAGE_KEY = 'festungskampf.save.v1';
const BATTLE_VISUAL_DURATION_MS = 3600;
const TROOP_ADVANCE_END = 0.72;
// The short clash pulse starts just before troops finish advancing.
const CLASH_START = 0.68;
const CLASH_END = 0.96;
const CLASH_PULSE_FREQUENCY = 90;
const ARENA_LAYOUT = {
  groundHeight: 0.69,
  fortressLeft: 0.025,
  fortressHeight: 0.42,
  playerTroopStart: 0.182,
  playerTroopEnd: 0.479,
  enemyTroopStart: 0.818,
  enemyTroopEnd: 0.521,
  troopStartSpacing: 0.008,
  troopEndSpacing: 0.0125,
  troopHeight: 22,
  troopStagger: 17,
};
const FORTRESS_TOWER_WIDTH = 94;
const FORTRESS_TOWER_HEIGHT = 150;
const CREATURE_PALETTE = {
  swordsman: { body: '#d4a66c', belly: '#f2d9a5', accent: '#6c90d9' },
  archer: { body: '#75a94f', belly: '#c4d78a', accent: '#d1ac58' },
  shieldbearer: { body: '#658f91', belly: '#b5cebd', accent: '#d2aa58' },
  knight: { body: '#a59ac0', belly: '#ded2ed', accent: '#e0bd65' },
  mage: { body: '#9270bd', belly: '#d4b4e4', accent: '#73d6cb' },
  catapult: { body: '#bc754e', belly: '#e4b88b', accent: '#664a37' },
  griffin: { body: '#c48a55', belly: '#f1d99a', accent: '#e8c65f' },
  dragon: { body: '#398e76', belly: '#93d2a2', accent: '#e9a953' },
};
const RARITY_ICON = {
  [RARITY.COMMON]: '💀',
  [RARITY.RARE]: '🌀',
  [RARITY.EPIC]: '🔥',
  [RARITY.LEGENDARY]: '🌙',
};
const RARITY_LABEL = {
  [RARITY.COMMON]: 'Gewöhnlich',
  [RARITY.RARE]: 'Selten',
  [RARITY.EPIC]: 'Episch',
  [RARITY.LEGENDARY]: 'Legendär',
};
const monsterSprites = new Map();

function getMonsterSprite(cardId) {
  if (!monsterSprites.has(cardId)) {
    const image = new Image();
    image.src = `assets/monsters/${cardId}.svg`;
    monsterSprites.set(cardId, image);
  }
  return monsterSprites.get(cardId);
}

function createMonsterArtwork(cardId, className) {
  const image = document.createElement('img');
  image.className = className;
  image.src = `assets/monsters/${cardId}.svg`;
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.loading = 'eager';
  image.decoding = 'async';
  return image;
}

function loadPlayer() {
  const player = new Player();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      player.level = data.level ?? 1;
      player.xp = data.xp ?? 0;
      player.coins = data.coins ?? 0;
      player.gems = data.gems ?? player.gems;
      player.trophies = data.trophies ?? 0;
      player.collection = data.collection ?? player.collection;
      player.cardLevels = data.cardLevels ?? player.cardLevels;
      player.fortressSlots = data.fortressSlots ?? player.fortressSlots;
      player.deck = data.deck ?? [];
      player.lastHuntAt = data.lastHuntAt ?? null;
    } catch (err) {
      console.warn('Konnte Spielstand nicht laden, starte neu.', err);
    }
  }
  if (player.coins === undefined) player.coins = 0;
  return player;
}

function savePlayer() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    level: player.level,
    xp: player.xp,
    coins: player.coins,
    gems: player.gems,
    trophies: player.trophies,
    collection: player.collection,
    cardLevels: player.cardLevels,
    fortressSlots: player.fortressSlots,
    deck: player.deck,
    lastHuntAt: player.lastHuntAt,
  }));
}

const player = loadPlayer();

// ---------------------------------------------------------------- navigation
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
let battleAnimationFrame = null;

function showScreen(id) {
  if (id === 'screen-battle' && typeof screen.orientation?.lock === 'function') {
    screen.orientation.lock('landscape').catch(() => {});
  }
  if (id !== 'screen-battle' && typeof screen.orientation?.unlock === 'function') {
    screen.orientation.unlock();
  }
  if (id !== 'screen-battle' && battleAnimationFrame !== null) {
    cancelAnimationFrame(battleAnimationFrame);
    battleAnimationFrame = null;
    document.getElementById('btn-start-battle').disabled = !player.isDeckReady();
    document.getElementById('battle-result').textContent = 'Kampf abgebrochen — kein Ergebnis gewertet.';
  }
  if (id !== 'screen-hunt') cancelHuntSession();
  document.body.classList.toggle('battle-open', id === 'screen-battle');
  screens.forEach((s) => s.classList.toggle('active', s.id === id));
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === id));
  if (id === 'screen-fortress') renderFortressScreen();
  if (id === 'screen-deck') renderDeckScreen();
  if (id === 'screen-battle') renderBattleScreen();
  if (id === 'screen-menu') renderMenu();
  if (id === 'screen-hunt') startHuntSession();
}

document.getElementById('btn-battle').addEventListener('click', () => showScreen('screen-battle'));
document.getElementById('btn-fortress').addEventListener('click', () => showScreen('screen-fortress'));
document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => showScreen('screen-menu')));
document.querySelectorAll('[data-nav]').forEach((btn) => btn.addEventListener('click', () => {
  if (btn.dataset.nav === 'screen-hunt' && !player.canHuntToday()) {
    alert(`Nächste Jagd in ca. ${Math.ceil(player.msUntilNextHunt() / (60 * 60 * 1000))} Std.`);
    return;
  }
  showScreen(btn.dataset.nav);
}));
document.getElementById('btn-share').addEventListener('click', onShare);
document.getElementById('btn-bell').addEventListener('click', () => {
  alert(player.canHuntToday() ? 'Deine tägliche Jagd wartet auf dich! 🎯' : 'Keine neuen Benachrichtigungen.');
});

function onShare() {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ title: 'Festungskampf', url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => alert('Link kopiert! Teile ihn mit deinen Freunden.'),
      () => alert(url),
    );
  } else {
    alert(url);
  }
}

// ---------------------------------------------------------------- menu / fortress overview
function renderMenu() {
  document.getElementById('menu-fortress-title').textContent = `Festung von ${player.name}`;
  document.getElementById('menu-level').textContent = player.level;
  document.getElementById('menu-level').setAttribute('aria-label', `Spielerstufe ${player.level}`);
  document.getElementById('menu-level-label').textContent = player.level;
  const displayedXp = Math.max(0, Math.min(100, player.xp));
  document.getElementById('menu-xp-fill').style.width = `${displayedXp}%`;
  document.getElementById('menu-xp-count').textContent = `${displayedXp} / 100 XP`;
  const xpTrack = document.getElementById('menu-xp-track');
  xpTrack.setAttribute('aria-valuenow', displayedXp);
  xpTrack.setAttribute('aria-valuetext', `${displayedXp} von 100 XP`);
  document.getElementById('menu-coins').textContent = player.coins;
  document.getElementById('menu-gems').textContent = player.gems;

  const { current, next } = getArenaProgress(player.trophies);
  document.getElementById('menu-arena-name').textContent = current.name;
  document.getElementById('menu-trophies').textContent = player.trophies;
  if (next) {
    document.getElementById('menu-next-threshold').textContent = next.threshold;
    document.getElementById('menu-arena-next').textContent = `Nächste Arena ab ${next.threshold} Pokalen`;
    const span = next.threshold - current.threshold;
    const progress = span > 0 ? ((player.trophies - current.threshold) / span) * 100 : 100;
    document.getElementById('menu-trophy-fill').style.width = `${Math.max(0, Math.min(100, progress))}%`;
  } else {
    document.getElementById('menu-next-threshold').textContent = '∞';
    document.getElementById('menu-arena-next').textContent = 'Höchste Arena erreicht!';
    document.getElementById('menu-trophy-fill').style.width = '100%';
  }

  const bellBadge = document.getElementById('menu-notif-badge');
  if (player.canHuntToday()) {
    bellBadge.hidden = false;
    bellBadge.textContent = '1';
  } else {
    bellBadge.hidden = true;
  }

  const status = document.getElementById('hunt-status');
  status.textContent = player.canHuntToday()
    ? 'Tägliche Jagd verfügbar — tippe auf „Jagd“ unten!'
    : `Nächste Jagd in ca. ${Math.ceil(player.msUntilNextHunt() / (60 * 60 * 1000))} Std.`;

  const collectionEl = document.getElementById('menu-collection');
  collectionEl.innerHTML = '';
  player.collection.forEach((cardId) => {
    collectionEl.appendChild(collectionTile(cardId));
  });
  const battleArena = document.getElementById('battle-arena-name');
  if (battleArena) battleArena.textContent = current.name;
}

function collectionTile(cardId) {
  const card = getCardById(cardId);
  const level = player.getCardLevel(cardId);
  const div = document.createElement('div');
  div.className = `card rarity-${card.rarity}`;
  const art = document.createElement('div');
  art.className = 'collection-card-art';
  art.setAttribute('aria-hidden', 'true');
  art.appendChild(createMonsterArtwork(cardId, 'card-art-image'));
  const badges = document.createElement('div');
  badges.className = 'card-badges';
  const rarity = document.createElement('span');
  rarity.className = 'rarity-badge';
  rarity.textContent = `${RARITY_ICON[card.rarity]} ${RARITY_LABEL[card.rarity]}`;
  const levelBadge = document.createElement('span');
  levelBadge.className = 'level-badge';
  levelBadge.textContent = `St. ${level}`;
  badges.append(rarity, levelBadge);
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = card.name;
  const stats = document.createElement('div');
  stats.className = 'card-sub';
  stats.textContent = `❤ ${card.hp} · ⚔ ${card.damage}`;
  div.append(art, badges, name, stats);
  return div;
}


// ---------------------------------------------------------------- Kartenjagd mini-game
// A quick reaction game: a target ("Fährte") appears at a random spot for
// ROUND_DURATION_MS and has to be tapped before it disappears. Accuracy over
// HUNT_ROUNDS rounds determines the rarity of the card found (see
// src/huntGame.js for the pure scoring logic).
let huntState = null; // { rounds, index, hits, timeoutId, roundStart, raf, active }

function cancelHuntSession() {
  if (!huntState) return;
  clearTimeout(huntState.timeoutId);
  cancelAnimationFrame(huntState.raf);
  huntState.active = false;
  const canvas = document.getElementById('hunt-canvas');
  canvas.onclick = null;
  huntState = null;
}

function startHuntSession() {
  cancelHuntSession();
  const canvas = document.getElementById('hunt-canvas');
  huntState = {
    rounds: generateHuntRounds(HUNT_ROUNDS),
    index: 0,
    hits: 0,
    timeoutId: null,
    roundStart: 0,
    raf: null,
    active: true,
  };
  document.getElementById('hunt-total').textContent = HUNT_ROUNDS;
  document.getElementById('hunt-hits').textContent = '0';
  document.getElementById('hunt-result').textContent = '';
  canvas.onclick = onHuntCanvasClick;
  playHuntRound();
}

function currentHuntTarget() {
  return huntState.rounds[huntState.index];
}

function playHuntRound() {
  if (!huntState || !huntState.active) return;
  if (huntState.index >= huntState.rounds.length) {
    finishHuntSession();
    return;
  }
  document.getElementById('hunt-round').textContent = huntState.index + 1;
  huntState.roundStart = performance.now();
  huntState.timeoutId = setTimeout(() => advanceHuntRound(false), ROUND_DURATION_MS);
  drawHuntFrame();
}

function advanceHuntRound(wasHit) {
  if (!huntState || !huntState.active) return;
  clearTimeout(huntState.timeoutId);
  cancelAnimationFrame(huntState.raf);
  if (wasHit) huntState.hits += 1;
  document.getElementById('hunt-hits').textContent = huntState.hits;
  huntState.index += 1;
  playHuntRound();
}

function onHuntCanvasClick(event) {
  if (!huntState || !huntState.active) return;
  const canvas = document.getElementById('hunt-canvas');
  const rect = canvas.getBoundingClientRect();
  const nx = (event.clientX - rect.left) / rect.width;
  const ny = (event.clientY - rect.top) / rect.height;
  const hit = isHit(currentHuntTarget(), nx, ny);
  advanceHuntRound(hit);
}

function drawHuntFrame() {
  if (!huntState || !huntState.active) return;
  const canvas = document.getElementById('hunt-canvas');
  const ctx = canvas.getContext('2d');
  const target = currentHuntTarget();
  const elapsed = performance.now() - huntState.roundStart;
  const remaining = Math.max(0, 1 - elapsed / ROUND_DURATION_MS);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = target.x * canvas.width;
  const cy = target.y * canvas.height;
  const r = TARGET_RADIUS * canvas.width;

  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.4 + 0.6 * remaining), 0, Math.PI * 2);
  ctx.fillStyle = '#ffcf4d';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = `rgba(255, 95, 109, ${0.4 + 0.6 * remaining})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2 * remaining);
  ctx.stroke();

  huntState.raf = requestAnimationFrame(drawHuntFrame);
}

function finishHuntSession() {
  const hits = huntState.hits;
  const totalRounds = huntState.rounds.length;
  cancelHuntSession();
  const canvas = document.getElementById('hunt-canvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  try {
    const { card, leveledUp, level } = player.completeDailyHunt(hits, totalRounds);
    savePlayer();
    const suffix = leveledUp ? ` — bereits bekannt, jetzt Lv. ${level}!` : ' — neu in der Sammlung!';
    document.getElementById('hunt-result').textContent =
      `${hits}/${totalRounds} Treffer — gefunden: ${card.name} (${card.rarity})${suffix}`;
  } catch (err) {
    document.getElementById('hunt-result').textContent = err.message;
  }
}

// ---------------------------------------------------------------- card rendering helpers
function cardTile(cardId, { selected = false, onClick = null } = {}) {
  const card = getCardById(cardId);
  const div = document.createElement('div');
  div.className = `card rarity-${card.rarity}${selected ? ' selected' : ''}`;
  const art = document.createElement('span');
  art.className = 'collection-card-art';
  art.setAttribute('aria-hidden', 'true');
  art.appendChild(createMonsterArtwork(cardId, 'card-art-image'));
  const details = document.createElement('div');
  details.className = 'card-tile-details';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = card.name;
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent = `❤ ${card.hp} · ⚔ ${card.damage} · ➤ ${card.speed}`;
  details.append(name, stats);
  div.append(art, details);
  if (onClick) {
    div.setAttribute('role', 'button');
    div.setAttribute('aria-pressed', String(selected));
    div.tabIndex = 0;
    div.addEventListener('click', (event) => onClick(event));
    div.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick(event);
      }
    });
  }
  return div;
}

// ---------------------------------------------------------------- fortress screen
function renderFortressScreen() {
  const slotsEl = document.getElementById('fortress-slots');
  const collectionEl = document.getElementById('fortress-collection');
  slotsEl.innerHTML = '';
  collectionEl.innerHTML = '';

  player.fortressSlots.forEach((cardId, index) => {
    const slot = document.createElement('div');
    slot.className = `slot${cardId ? ' filled' : ''}`;
    slot.textContent = cardId ? getCardById(cardId).name : `Slot ${index + 1}`;
    slot.addEventListener('click', () => {
      if (cardId) {
        player.clearFortressSlot(index);
        savePlayer();
        renderFortressScreen();
      }
    });
    slotsEl.appendChild(slot);
  });

  player.collection.forEach((cardId) => {
    const tile = cardTile(cardId, {
      onClick: () => {
        const emptyIndex = player.fortressSlots.findIndex((s) => s === null);
        if (emptyIndex === -1) {
          alert('Alle Festungs-Slots sind belegt. Entferne zuerst eine Karte.');
          return;
        }
        try {
          player.equipFortressSlot(emptyIndex, cardId);
          savePlayer();
          renderFortressScreen();
        } catch (err) {
          alert(err.message);
        }
      },
    });
    collectionEl.appendChild(tile);
  });
}

// ---------------------------------------------------------------- deck screen
let pendingDeck = [];
function renderDeckScreen() {
  pendingDeck = [...player.deck];
  const slotsEl = document.getElementById('deck-slots');
  const collectionEl = document.getElementById('deck-collection');

  function redraw() {
    slotsEl.innerHTML = '';
    for (let i = 0; i < 4; i += 1) {
      const cardId = pendingDeck[i];
      const slot = document.createElement('div');
      slot.className = `slot${cardId ? ' filled' : ''}`;
      slot.textContent = cardId ? getCardById(cardId).name : `Karte ${i + 1}`;
      slot.addEventListener('click', () => {
        if (cardId) {
          pendingDeck = pendingDeck.filter((id) => id !== cardId);
          redraw();
        }
      });
      slotsEl.appendChild(slot);
    }

    collectionEl.innerHTML = '';
    player.collection.forEach((cardId) => {
      const tile = cardTile(cardId, {
        selected: pendingDeck.includes(cardId),
        onClick: () => {
          if (pendingDeck.includes(cardId)) {
            pendingDeck = pendingDeck.filter((id) => id !== cardId);
          } else if (pendingDeck.length < 4) {
            pendingDeck.push(cardId);
          } else {
            alert('Du kannst maximal 4 Karten wählen.');
            return;
          }
          if (pendingDeck.length === 4) {
            try {
              player.setDeck(pendingDeck);
              savePlayer();
            } catch (err) {
              alert(err.message);
            }
          }
          redraw();
        },
      });
      collectionEl.appendChild(tile);
    });
  }
  redraw();
}

// ---------------------------------------------------------------- battle screen
function buildEnemyForce() {
  const pool = CARD_LIBRARY.filter((c) => c.rarity === RARITY.COMMON || c.rarity === RARITY.RARE);
  const pick = () => pool[Math.floor(Math.random() * pool.length)].id;
  return {
    deck: [pick(), pick(), pick(), pick()],
    defenders: [pick(), pick(), null, null],
  };
}

let lastResult = null;
function renderBattleScreen() {
  const canvas = document.getElementById('battle-canvas');
  const ctx = canvas.getContext('2d');
  const { current } = getArenaProgress(player.trophies);
  document.getElementById('battle-arena-name').textContent = current.name;
  document.getElementById('battle-timer').textContent = 'Bereit';
  document.getElementById('player-fortress-health').textContent = '100%';
  document.getElementById('enemy-fortress-health').textContent = '100%';
  document.getElementById('battle-progress-fill').style.width = '0%';
  document.querySelector('.battle-progress-track').setAttribute('aria-valuenow', '0');
  document.querySelector('.battle-progress-track').setAttribute('aria-valuetext', 'Bereit');
  document.getElementById('battle-progress-label').textContent = 'Bereit';
  renderBattleHand();
  drawBattleScene(ctx, canvas, 0, null, player.deck, []);
  document.getElementById('battle-result').textContent = '';
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.disabled = !player.isDeckReady();
  startBtn.textContent = player.isDeckReady() ? 'Kampf beginnen' : 'Erst ein Deck aus 4 Karten bauen';
  startBtn.onclick = () => runBattle(ctx, canvas);
}

function renderBattleHand() {
  const hand = document.getElementById('battle-hand');
  hand.replaceChildren();
  document.getElementById('battle-deck-count').textContent = `${player.deck.length} / ${DECK_SIZE}`;
  for (let index = 0; index < DECK_SIZE; index += 1) {
    const cardId = player.deck[index];
    const element = document.createElement('div');
    if (!cardId) {
      element.className = 'battle-card-empty';
      element.textContent = `Karte ${index + 1}`;
      hand.appendChild(element);
      continue;
    }
    const card = getCardById(cardId);
    element.className = `battle-card rarity-${card.rarity}`;
    const icon = document.createElement('span');
    icon.className = 'battle-card-icon';
    icon.appendChild(createMonsterArtwork(cardId, 'battle-card-image'));
    const name = document.createElement('span');
    name.className = 'battle-card-name';
    name.textContent = card.name;
    element.append(icon, name);
    hand.appendChild(element);
  }
}

function runBattle(ctx, canvas) {
  if (!player.isDeckReady()) return;
  const enemy = buildEnemyForce();
  lastResult = simulateBattle({
    playerDeck: player.deck,
    enemyDeck: enemy.deck,
    playerFortressDefenders: player.fortressSlots,
    enemyFortressDefenders: enemy.defenders,
  });
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.disabled = true;
  document.getElementById('battle-result').textContent = 'Die Truppen rücken vor …';

  animateResult(ctx, canvas, lastResult, player.deck, enemy.deck, () => {
    const resultEl = document.getElementById('battle-result');
    player.recordBattleOutcome(lastResult.winner);
    if (lastResult.winner === 'player') {
      const xpGain = 40;
      const leveledUp = player.addXp(xpGain);
      player.coins += 20;
      resultEl.textContent = `Sieg! +30 🏆, +${xpGain} XP, +20 Münzen${leveledUp ? ' — Level Up!' : ''}`;
    } else if (lastResult.winner === 'enemy') {
      resultEl.textContent = 'Niederlage. -10 🏆. Verbessere dein Deck und versuche es erneut.';
    } else {
      resultEl.textContent = 'Unentschieden.';
    }
    savePlayer();
    startBtn.disabled = false;
    startBtn.textContent = 'Noch einmal kämpfen';
    renderMenu();
  });
}

function animateResult(ctx, canvas, result, playerDeck, enemyDeck, onDone) {
  const durationMs = BATTLE_VISUAL_DURATION_MS;
  const start = performance.now();
  const battleDuration = result.durationSeconds;
  const playerHealth = document.getElementById('player-fortress-health');
  const enemyHealth = document.getElementById('enemy-fortress-health');
  const timer = document.getElementById('battle-timer');
  let previousPlayerHp;
  let previousEnemyHp;
  let previousTimer;
  let previousProgress;
  const progressFill = document.getElementById('battle-progress-fill');
  const progressTrack = document.querySelector('.battle-progress-track');
  const progressLabel = document.getElementById('battle-progress-label');
  function frame(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    const fortressHealth = interpolateFortressHealth(result, progress);
    drawBattleScene(ctx, canvas, progress, result, playerDeck, enemyDeck, fortressHealth);
    const playerHp = Math.round(fortressHealth.player / FORTRESS_HP * 100);
    const enemyHp = Math.round(fortressHealth.enemy / FORTRESS_HP * 100);
    const timerText = `${Math.ceil((1 - progress) * battleDuration)}s`;
    if (playerHp !== previousPlayerHp) playerHealth.textContent = `${playerHp}%`;
    if (enemyHp !== previousEnemyHp) enemyHealth.textContent = `${enemyHp}%`;
    if (timerText !== previousTimer) timer.textContent = timerText;
    const progressValue = Math.round(progress * 100);
    if (progressValue !== previousProgress) {
      progressFill.style.width = `${progressValue}%`;
      progressTrack.setAttribute('aria-valuenow', progressValue);
      progressTrack.setAttribute('aria-valuetext', `${progressValue}%`);
      progressLabel.textContent = `${progressValue}%`;
    }
    previousPlayerHp = playerHp;
    previousEnemyHp = enemyHp;
    previousTimer = timerText;
    previousProgress = progressValue;

    if (progress < 1) {
      battleAnimationFrame = requestAnimationFrame(frame);
    } else {
      battleAnimationFrame = null;
      progressLabel.textContent = 'Abgeschlossen';
      onDone();
    }
  }
  battleAnimationFrame = requestAnimationFrame(frame);
}

function drawBattleScene(ctx, canvas, progress, result, playerDeck, enemyDeck, fortressHealth = interpolateFortressHealth(result, progress)) {
  ctx.save();
  const { width, height } = canvas;
  const groundY = height * ARENA_LAYOUT.groundHeight;
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#35205f');
  sky.addColorStop(0.58, '#87518c');
  sky.addColorStop(1, '#d98b9b');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  for (let i = 0; i < 42; i += 1) {
    const x = ((i * 173 + 31) % 997) / 997 * width;
    const y = ((i * 97 + 17) % 251) / 251 * groundY * 0.62;
    ctx.globalAlpha = 0.28 + ((i * 13) % 7) / 10;
    ctx.fillStyle = '#fff5db';
    ctx.beginPath();
    ctx.arc(x, y, i % 5 === 0 ? 2 : 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#fff1bd';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#fff0c4';
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.16, height * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#d8b6de55';
  ctx.beginPath();
  ctx.ellipse(width * 0.62, height * 0.19, width * 0.075, height * 0.035, -0.03, 0, Math.PI * 2);
  ctx.ellipse(width * 0.36, height * 0.1, width * 0.055, height * 0.025, 0.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawHill(ctx, width, groundY, 0.53, '#55336f', 0);
  drawHill(ctx, width, groundY, 0.62, '#372755', 1);
  ctx.fillStyle = '#183b43';
  ctx.fillRect(0, groundY, width, height - groundY);
  const grass = ctx.createLinearGradient(0, groundY, 0, height);
  grass.addColorStop(0, '#365f53');
  grass.addColorStop(1, '#172a38');
  ctx.fillStyle = grass;
  ctx.fillRect(0, groundY + 5, width, height - groundY);
  ctx.fillStyle = '#95bf87';
  ctx.fillRect(0, groundY, width, 5);

  drawBattleTrees(ctx, width, groundY, height);
  ctx.fillStyle = '#c3ab75';
  ctx.globalAlpha = 0.75;
  ctx.fillRect(width * 0.42, groundY - 7, width * 0.16, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ead28e';
  ctx.fillRect(width * 0.47, groundY - 9, width * 0.06, 21);

  for (let i = 0; i < 26; i += 1) {
    const x = (i * 89 + 24) % width;
    const y = groundY + 27 + ((i * 31) % Math.max(1, height - groundY - 50));
    ctx.fillStyle = i % 2 ? '#b4c879' : '#e1c274';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 2.5 : 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawFortress(ctx, width * ARENA_LAYOUT.fortressLeft, groundY - height * ARENA_LAYOUT.fortressHeight, '#45d9b0', fortressHealth.player);
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  drawFortress(ctx, width * ARENA_LAYOUT.fortressLeft, groundY - height * ARENA_LAYOUT.fortressHeight, '#ff667b', fortressHealth.enemy);
  ctx.restore();

  const advance = Math.min(1, progress / TROOP_ADVANCE_END);
  drawTroops(ctx, playerDeck, advance, true, groundY, width);
  drawTroops(ctx, enemyDeck, advance, false, groundY, width);

  if (progress > CLASH_START && progress < CLASH_END) {
    const pulse = 0.5 + Math.sin(progress * CLASH_PULSE_FREQUENCY) * 0.5;
    ctx.fillStyle = `rgba(255, 230, 141, ${pulse})`;
    ctx.font = '900 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', width * 0.5, groundY - height * 0.12);
  }
  ctx.restore();
}

function drawHill(ctx, width, groundY, heightRatio, color, offset) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= width; x += 4) {
    const wave = Math.sin(x / 105 + offset) * 18 + Math.sin(x / 47 + offset * 2) * 7;
    const y = groundY - groundY * (1 - heightRatio) + wave;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, groundY);
  ctx.closePath();
  ctx.fill();
}

function drawBattleTrees(ctx, width, groundY, height) {
  ctx.save();
  for (let index = 0; index < 8; index += 1) {
    const x = width * (0.1 + index * 0.115);
    if (x > width * 0.39 && x < width * 0.61) continue;
    const treeHeight = height * (0.17 + (index % 3) * 0.035);
    const baseY = groundY + 2;
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = '#1c4c4c';
    ctx.beginPath();
    ctx.moveTo(x, baseY - treeHeight);
    ctx.lineTo(x - treeHeight * 0.27, baseY);
    ctx.lineTo(x + treeHeight * 0.27, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#28645b';
    ctx.beginPath();
    ctx.moveTo(x, baseY - treeHeight * 0.78);
    ctx.lineTo(x - treeHeight * 0.19, baseY - treeHeight * 0.08);
    ctx.lineTo(x + treeHeight * 0.19, baseY - treeHeight * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFortress(ctx, x, y, color, hp) {
  const towerWidth = FORTRESS_TOWER_WIDTH;
  const towerHeight = FORTRESS_TOWER_HEIGHT;
  ctx.save();
  ctx.shadowColor = '#08091c99';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#55476f';
  ctx.fillRect(x + 14, y + 58, towerWidth, towerHeight - 58);
  ctx.fillStyle = '#70628a';
  ctx.fillRect(x, y + 32, towerWidth + 28, towerHeight - 32);
  ctx.fillRect(x + 9, y + 5, 30, 55);
  ctx.fillRect(x + 61, y + 5, 30, 55);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 35);
  ctx.lineTo(x + 24, y - 10);
  ctx.lineTo(x + 53, y + 35);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 48, y + 35);
  ctx.lineTo(x + 76, y - 10);
  ctx.lineTo(x + 105, y + 35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#28233c';
  ctx.beginPath();
  roundedRectPath(ctx, x + 37, y + 101, 28, 49, 14);
  ctx.fill();
  ctx.fillStyle = '#e6c477';
  ctx.beginPath();
  ctx.arc(x + 51, y + 137, 7, Math.PI, Math.PI * 2);
  ctx.fill();

  const barWidth = towerWidth + 28;
  ctx.fillStyle = '#251e3e';
  ctx.beginPath();
  roundedRectPath(ctx, x, y - 28, barWidth, 13, 7);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  roundedRectPath(ctx, x, y - 28, barWidth * Math.max(0, hp / FORTRESS_HP), 13, 7);
  ctx.fill();
  ctx.strokeStyle = '#ffffffa6';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawTroops(ctx, deck, progress, isPlayer, groundY, width) {
  ctx.save();
  const cardIds = Array.isArray(deck) ? deck : [];
  if (cardIds.length === 0) {
    ctx.restore();
    return;
  }
  cardIds.forEach((cardId, index) => {
    const startX = isPlayer
      ? width * ARENA_LAYOUT.playerTroopStart + index * width * ARENA_LAYOUT.troopStartSpacing
      : width * ARENA_LAYOUT.enemyTroopStart - index * width * ARENA_LAYOUT.troopStartSpacing;
    const endX = isPlayer
      ? width * ARENA_LAYOUT.playerTroopEnd - index * width * ARENA_LAYOUT.troopEndSpacing
      : width * ARENA_LAYOUT.enemyTroopEnd + index * width * ARENA_LAYOUT.troopEndSpacing;
    const x = startX + (endX - startX) * progress;
    const y = groundY - (index % 2) * ARENA_LAYOUT.troopStagger * 0.55;
    drawBattleCreature(ctx, x, y, cardId, isPlayer, index, progress);
  });
  ctx.restore();
}

function drawBattleCreature(ctx, x, y, cardId, isPlayer, index, progress) {
  const direction = isPlayer ? 1 : -1;
  const size = 1 + (index % 2) * 0.06;
  const moving = progress < TROOP_ADVANCE_END;
  const time = performance.now() / 1000;
  const bob = Math.sin(time * 9 + index * 1.7) * (moving ? 2.4 : 0.8);
  const clashProgress = Math.max(0, Math.min(1, (progress - CLASH_START) / (CLASH_END - CLASH_START)));
  const strike = clashProgress > 0 ? Math.max(0, Math.sin(clashProgress * Math.PI * 5 + index * 1.5)) : 0;
  ctx.save();
  ctx.translate(x + direction * strike * 6, y + bob);
  ctx.rotate(direction * strike * 0.07);
  ctx.scale(direction * size * (1 + strike * 0.08), size * (1 - strike * 0.06));
  ctx.shadowColor = '#11132599';
  ctx.shadowBlur = 7;
  const sprite = getMonsterSprite(cardId);
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.drawImage(sprite, -39, -80, 78, 78);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#17192d';
    ctx.beginPath();
    roundedRectPath(ctx, -19, -82, 38, 6, 3);
    ctx.fill();
    ctx.fillStyle = isPlayer ? '#56d5b4' : '#ff7182';
    ctx.beginPath();
    roundedRectPath(ctx, -17, -81, 34, 4, 2);
    ctx.fill();
    if (strike > 0.88) {
      ctx.strokeStyle = '#fff2b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(31, -38, 13, -1.2, 0.8);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const palette = CREATURE_PALETTE[cardId] ?? CREATURE_PALETTE.swordsman;
  ctx.fillStyle = isPlayer ? '#4fd8c688' : '#ff758888';
  ctx.beginPath();
  ctx.ellipse(0, 3, 25, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.ellipse(0, -13, 16, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.belly;
  ctx.beginPath();
  ctx.ellipse(2, -10, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.arc(0, -32, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, -41);
  ctx.lineTo(-15, -52);
  ctx.lineTo(-2, -43);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -42);
  ctx.lineTo(16, -51);
  ctx.lineTo(13, -37);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff7dc';
  ctx.beginPath();
  ctx.ellipse(-5, -33, 4, 5, -0.12, 0, Math.PI * 2);
  ctx.ellipse(5, -33, 4, 5, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#27263b';
  ctx.beginPath();
  ctx.arc(-4, -32, 1.8, 0, Math.PI * 2);
  ctx.arc(6, -32, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#392941';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(1, -24, 4, 0.12, Math.PI - 0.12);
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.ellipse(-15, -13, 5, 9, -0.2, 0, Math.PI * 2);
  ctx.ellipse(15, -13, 5, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = isPlayer ? '#56d5b4' : '#ff7182';
  ctx.beginPath();
  roundedRectPath(ctx, -18, -57, 36, 5, 3);
  ctx.fill();
  ctx.restore();
}

renderMenu();
