import { Player } from './src/player.js';
import { CARD_LIBRARY, getCardById, RARITY } from './src/cards.js';
import { simulateBattle, LANE_LENGTH, FORTRESS_HP } from './src/battle.js';

const STORAGE_KEY = 'festungskampf.save.v1';

function loadPlayer() {
  const player = new Player();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      player.level = data.level ?? 1;
      player.xp = data.xp ?? 0;
      player.coins = data.coins ?? 0;
      player.collection = data.collection ?? player.collection;
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
    collection: player.collection,
    fortressSlots: player.fortressSlots,
    deck: player.deck,
    lastHuntAt: player.lastHuntAt,
  }));
}

const player = loadPlayer();

// ---------------------------------------------------------------- navigation
const screens = document.querySelectorAll('.screen');
function showScreen(id) {
  screens.forEach((s) => s.classList.toggle('active', s.id === id));
  if (id === 'screen-fortress') renderFortressScreen();
  if (id === 'screen-deck') renderDeckScreen();
  if (id === 'screen-battle') renderBattleScreen();
  if (id === 'screen-menu') renderMenu();
}

document.getElementById('btn-battle').addEventListener('click', () => showScreen('screen-battle'));
document.getElementById('btn-deck').addEventListener('click', () => showScreen('screen-deck'));
document.getElementById('btn-fortress').addEventListener('click', () => showScreen('screen-fortress'));
document.getElementById('btn-hunt').addEventListener('click', onHunt);
document.querySelectorAll('[data-back]').forEach((btn) => btn.addEventListener('click', () => showScreen('screen-menu')));

// ---------------------------------------------------------------- menu / hunt
function renderMenu() {
  document.getElementById('menu-level').textContent = player.level;
  document.getElementById('menu-xp-fill').style.width = `${Math.min(100, player.xp)}%`;
  document.getElementById('menu-coins').textContent = player.coins;

  const huntBtn = document.getElementById('btn-hunt');
  const status = document.getElementById('hunt-status');
  if (player.canHuntToday()) {
    huntBtn.disabled = false;
    status.textContent = '';
  } else {
    huntBtn.disabled = true;
    const hours = Math.ceil(player.msUntilNextHunt() / (60 * 60 * 1000));
    status.textContent = `Nächste Jagd in ca. ${hours} Std.`;
  }
}

function onHunt() {
  try {
    const card = player.huntDaily();
    savePlayer();
    renderMenu();
    alert(`Gefunden: ${card.name} (${card.rarity})`);
  } catch (err) {
    alert(err.message);
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
    if (lastResult.winner === 'player') {
      const xpGain = 40;
      const leveledUp = player.addXp(xpGain);
      player.coins += 20;
      resultEl.textContent = `Sieg! +${xpGain} XP, +20 Münzen${leveledUp ? ' — Level Up!' : ''}`;
    } else if (lastResult.winner === 'enemy') {
      resultEl.textContent = 'Niederlage. Verbessere dein Deck und versuche es erneut.';
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
