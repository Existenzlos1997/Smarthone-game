import { Player } from './src/player.js';
import { CARD_LIBRARY, getCardById, RARITY } from './src/cards.js';
import { simulateBattle, LANE_LENGTH, FORTRESS_HP } from './src/battle.js';
import { generateHuntRounds, isHit, HUNT_ROUNDS, ROUND_DURATION_MS, TARGET_RADIUS } from './src/huntGame.js';
import { getArenaProgress } from './src/arenas.js';
import { migrateSave, SAVE_VERSION } from './src/migrations.js';
import { startUpdater } from './src/updater.js';

const STORAGE_KEY = 'festungskampf.save.v1';
const RARITY_ICON = {
  [RARITY.COMMON]: '💀',
  [RARITY.RARE]: '🌀',
  [RARITY.EPIC]: '🔥',
  [RARITY.LEGENDARY]: '🌙',
};

function loadPlayer() {
  const player = new Player();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = migrateSave(JSON.parse(raw)) ?? {};
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
    saveVersion: SAVE_VERSION,
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
startUpdater();

// ---------------------------------------------------------------- navigation
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');

function showScreen(id) {
  if (id !== 'screen-hunt') cancelHuntSession();
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
document.querySelectorAll('.plus-btn').forEach((btn) => btn.addEventListener('click', () => {
  alert('Der Shop ist noch im Bau. Schau bald wieder vorbei!');
}));

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
  document.getElementById('menu-xp-fill').style.width = `${Math.min(100, player.xp)}%`;
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
}

function collectionTile(cardId) {
  const card = getCardById(cardId);
  const level = player.getCardLevel(cardId);
  const div = document.createElement('div');
  div.className = `card rarity-${card.rarity}`;
  div.innerHTML = `
    <div class="card-badges">
      <span class="level-badge">${level}</span>
      <span class="rarity-badge">${RARITY_ICON[card.rarity]}</span>
    </div>
    <div class="card-name">${card.name}</div>
    <div class="card-sub">Lv. ${level}</div>
  `;
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
  div.innerHTML = `<div>${card.name}</div><div class="stats">❤${card.hp} ⚔${card.damage} 🏃${card.speed}</div>`;
  if (onClick) div.addEventListener('click', onClick);
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
  drawIdleLane(ctx, canvas);
  document.getElementById('battle-result').textContent = '';
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.disabled = !player.isDeckReady();
  startBtn.textContent = player.isDeckReady() ? 'Kampf beginnen' : 'Erst ein Deck aus 4 Karten bauen';
  startBtn.onclick = () => runBattle(ctx, canvas);
}

function drawIdleLane(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f2f4ff';
  ctx.font = '14px sans-serif';
  ctx.fillText('Bereit für den Kampf...', 20, canvas.height / 2);
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

  animateResult(ctx, canvas, lastResult, () => {
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
  });
}

// Simple visual playback: draws the two fortresses and animates the
// fortress-hp bars draining towards the simulated outcome.
function animateResult(ctx, canvas, result, onDone) {
  const durationMs = 1500;
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const playerHp = FORTRESS_HP - (FORTRESS_HP - result.playerFortressHp) * progress;
    const enemyHp = FORTRESS_HP - (FORTRESS_HP - result.enemyFortressHp) * progress;

    drawFortress(ctx, 20, playerHp, '#4dd9ff');
    drawFortress(ctx, canvas.width - 60, enemyHp, '#ff5f6d');

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 30);
    ctx.lineTo(canvas.width, canvas.height - 30);
    ctx.stroke();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

function drawFortress(ctx, x, hp, color) {
  const maxBarHeight = 150;
  const barHeight = Math.max(0, (hp / FORTRESS_HP) * maxBarHeight);
  ctx.fillStyle = color;
  ctx.fillRect(x, 190 - barHeight, 40, barHeight);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(x, 40, 40, 150);
  ctx.fillStyle = '#f2f4ff';
  ctx.font = '12px sans-serif';
  ctx.fillText(Math.max(0, Math.round(hp)), x, 205);
}

renderMenu();
