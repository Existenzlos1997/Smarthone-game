import { Player } from './src/player.js';
import { CARD_LIBRARY, getCardById, RARITY } from './src/cards.js';
import { simulateBattle, LANE_LENGTH, FORTRESS_HP } from './src/battle.js';
import { generateHuntRounds, isHit, HUNT_ROUNDS, ROUND_DURATION_MS, TARGET_RADIUS } from './src/huntGame.js';
import { getArenaProgress } from './src/arenas.js';

const STORAGE_KEY = 'festungskampf.save.v1';
const RARITY_ICON = {
  [RARITY.COMMON]: '💀',
  [RARITY.RARE]: '🌀',
  [RARITY.EPIC]: '🔥',
  [RARITY.LEGENDARY]: '🌙',
};
const CARD_ART = {
  swordsman: '⚔️',
  archer: '🏹',
  shieldbearer: '🛡️',
  knight: '🗡️',
  mage: '🧙',
  catapult: '🏹',
  griffin: '🦅',
  dragon: '🐉',
};

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
  showScreen('screen-shop');
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
  document.getElementById('menu-level-label').textContent = player.level;
  document.getElementById('menu-xp-fill').style.width = `${Math.min(100, player.xp)}%`;
  document.getElementById('menu-xp-count').textContent = `${player.xp} / 100 XP`;
  document.querySelector('.xp-track').setAttribute('aria-valuenow', player.xp);
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
  div.innerHTML = `
    <div class="collection-card-art" aria-hidden="true">${CARD_ART[cardId] ?? '✧'}</div>
    <div class="card-badges">
      <span class="rarity-badge">${RARITY_ICON[card.rarity]} ${card.rarity}</span>
      <span class="level-badge">St. ${level}</span>
    </div>
    <div class="card-name"></div>
    <div class="card-sub">❤ ${card.hp} &nbsp; ⚔ ${card.damage}</div>
  `;
  div.querySelector('.card-name').textContent = card.name;
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
  art.textContent = CARD_ART[cardId] ?? '✧';
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
    div.addEventListener('click', onClick);
    div.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
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
const BATTLE_CARD_ICONS = {
  swordsman: '⚔️',
  archer: '🏹',
  shieldbearer: '🛡️',
  knight: '🗡️',
  mage: '🧙',
  catapult: '🏹',
  griffin: '🦅',
  dragon: '🐉',
};
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
  document.getElementById('battle-deck-count').textContent = `${player.deck.length} / 4`;
  for (let index = 0; index < 4; index += 1) {
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
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = BATTLE_CARD_ICONS[cardId] ?? '⚔️';
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
  const durationMs = 3600;
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    drawBattleScene(ctx, canvas, progress, result, playerDeck, enemyDeck);
    const playerHp = Math.round((FORTRESS_HP - (FORTRESS_HP - result.playerFortressHp) * progress) / FORTRESS_HP * 100);
    const enemyHp = Math.round((FORTRESS_HP - (FORTRESS_HP - result.enemyFortressHp) * progress) / FORTRESS_HP * 100);
    document.getElementById('player-fortress-health').textContent = `${playerHp}%`;
    document.getElementById('enemy-fortress-health').textContent = `${enemyHp}%`;
    document.getElementById('battle-timer').textContent = `${Math.ceil((1 - progress) * result.durationSeconds)}s`;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

function drawBattleScene(ctx, canvas, progress, result, playerDeck, enemyDeck) {
  const { width, height } = canvas;
  const groundY = height * 0.69;
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, '#35205f');
  sky.addColorStop(0.58, '#9a4f91');
  sky.addColorStop(1, '#f08c91');
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
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff0c4';
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.17, height * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawHill(ctx, width, groundY, 0.53, '#55336f', 0);
  drawHill(ctx, width, groundY, 0.62, '#372755', 1);
  ctx.fillStyle = '#173c48';
  ctx.fillRect(0, groundY, width, height - groundY);
  const grass = ctx.createLinearGradient(0, groundY, 0, height);
  grass.addColorStop(0, '#315e52');
  grass.addColorStop(1, '#14293a');
  ctx.fillStyle = grass;
  ctx.fillRect(0, groundY + 5, width, height - groundY);
  ctx.fillStyle = '#95bf87';
  ctx.fillRect(0, groundY, width, 5);

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

  const hpProgress = progress;
  const playerHp = result ? FORTRESS_HP - (FORTRESS_HP - result.playerFortressHp) * hpProgress : FORTRESS_HP;
  const enemyHp = result ? FORTRESS_HP - (FORTRESS_HP - result.enemyFortressHp) * hpProgress : FORTRESS_HP;
  drawFortress(ctx, width * 0.025, groundY - height * 0.42, '#45d9b0', playerHp);
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  drawFortress(ctx, width * 0.025, groundY - height * 0.42, '#ff667b', enemyHp);
  ctx.restore();

  const advance = Math.min(1, progress / 0.72);
  drawTroops(ctx, playerDeck, advance, true, groundY);
  drawTroops(ctx, enemyDeck, advance, false, groundY);

  if (progress > 0.68 && progress < 0.96) {
    const pulse = 0.5 + Math.sin(progress * 90) * 0.5;
    ctx.fillStyle = `rgba(255, 230, 141, ${pulse})`;
    ctx.font = '900 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', width * 0.5, groundY - height * 0.12);
  }
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

function drawFortress(ctx, x, y, color, hp) {
  const towerWidth = 94;
  const towerHeight = 150;
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
  ctx.roundRect(x + 37, y + 101, 28, 49, 14);
  ctx.fill();
  ctx.fillStyle = '#e6c477';
  ctx.beginPath();
  ctx.arc(x + 51, y + 137, 7, Math.PI, Math.PI * 2);
  ctx.fill();

  const barWidth = towerWidth + 28;
  ctx.fillStyle = '#251e3e';
  ctx.beginPath();
  ctx.roundRect(x, y - 28, barWidth, 13, 7);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y - 28, barWidth * Math.max(0, hp / FORTRESS_HP), 13, 7);
  ctx.fill();
  ctx.strokeStyle = '#ffffffa6';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTroops(ctx, deck, progress, isPlayer, groundY) {
  const icons = deck.map((cardId) => BATTLE_CARD_ICONS[cardId] ?? '⚔️');
  if (icons.length === 0) return;
  icons.forEach((icon, index) => {
    const startX = isPlayer ? 175 + index * 8 : 785 - index * 8;
    const endX = isPlayer ? 460 - index * 12 : 500 + index * 12;
    const x = startX + (endX - startX) * progress;
    const y = groundY - 22 - (index % 2) * 17;
    ctx.fillStyle = isPlayer ? '#4fd8c688' : '#ff758888';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '34px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#17102c';
    ctx.shadowBlur = 6;
    ctx.fillText(icon, x, y - 13);
    ctx.shadowBlur = 0;
    ctx.fillStyle = isPlayer ? '#5de1b8' : '#ff7080';
    ctx.fillRect(x - 17, y - 39, 34, 4);
  });
}

renderMenu();
