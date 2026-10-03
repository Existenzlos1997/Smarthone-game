import { DECK_SIZE, LEVEL_UP_COIN_REWARD, MAX_CARD_LEVEL, Player } from './src/player.js';
import { CARD_LIBRARY, SPELL_LIBRARY, getCardAtLevel, getCardById, RARITY } from './src/cards.js';
import { LANE_LENGTH, FORTRESS_HP, interpolateFortressHealth } from './src/battle.js';
import { LiveBattle, MAX_ENERGY, BATTLE_DURATION_SECONDS } from './src/liveBattle.js';
import { generateHuntRounds, isHit, HUNT_ROUNDS, ROUND_DURATION_MS, TARGET_RADIUS } from './src/huntGame.js';
import { getArenaCardLevel, getArenaProgress } from './src/arenas.js';

const STORAGE_KEY = 'festungskampf.save.v1';
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
  image.src = getCardById(cardId).type === 'spell'
    ? `assets/spells/${cardId}.svg`
    : `assets/monsters/${cardId}.svg`;
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
      player.restoreWinStreaks({ current: data.winStreak, best: data.bestWinStreak });
      player.restoreArenaRewards(data.arenaRewardsClaimed);
      player.restoreBattleStats(data.battleStats);
      player.collection = [...new Set([...player.collection, ...(data.collection ?? [])])];
      player.cardLevels = data.cardLevels ?? player.cardLevels;
      player.fortressSlots = data.fortressSlots ?? player.fortressSlots;
      if (
        Array.isArray(data.deck)
        && data.deck.length === DECK_SIZE
        && new Set(data.deck).size === DECK_SIZE
        && data.deck.every((id) => player.collection.includes(id))
      ) {
        player.deck = data.deck;
      }
      player.lastHuntAt = data.lastHuntAt ?? null;
      player.restoreDailyQuestProgress(data.dailyQuestProgress);
      player.restoreBattleHistory(data.battleHistory);
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
    winStreak: player.winStreak,
    bestWinStreak: player.bestWinStreak,
    arenaRewardsClaimed: player.arenaRewardsClaimed,
    battleStats: player.battleStats,
    collection: player.collection,
    cardLevels: player.cardLevels,
    fortressSlots: player.fortressSlots,
    deck: player.deck,
    lastHuntAt: player.lastHuntAt,
    dailyQuestProgress: player.dailyQuestProgress,
    battleHistory: player.battleHistory,
  }));
}

const player = loadPlayer();

// ---------------------------------------------------------------- navigation
const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
let battleAnimationFrame = null;
let liveBattle = null;
let spellAimX = null;

const battleCanvas = document.getElementById('battle-canvas');
battleCanvas.addEventListener('pointermove', (event) => {
  if (!liveBattle || liveBattle.selectedSpellIndex === null) return;
  const rect = battleCanvas.getBoundingClientRect();
  spellAimX = Math.max(0, Math.min(LANE_LENGTH, (event.clientX - rect.left) / rect.width * LANE_LENGTH));
});
battleCanvas.addEventListener('pointerdown', (event) => {
  if (!liveBattle || liveBattle.selectedSpellIndex === null) return;
  const rect = battleCanvas.getBoundingClientRect();
  const targetX = (event.clientX - rect.left) / rect.width * LANE_LENGTH;
  const result = liveBattle.castSpellAt(targetX);
  if (!result.ok) {
    const feedback = result.reason === 'wrong-side'
      ? 'Wähle die passende Schlachtfeldhälfte für diesen Zauber.'
      : 'Dieses Zauberziel ist ungültig.';
    document.getElementById('battle-result').textContent = feedback;
    return;
  }
  spellAimX = null;
  document.getElementById('battle-result').textContent = `${getCardById(result.cardId).name} wirkt!`;
  renderBattleHand(liveBattle);
  updateBattleEnergy(liveBattle.playerEnergy);
});

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
    liveBattle = null;
    document.getElementById('btn-start-battle').hidden = false;
    document.getElementById('battle-result').textContent = 'Kampf abgebrochen — kein Ergebnis gewertet.';
  }
  if (id !== 'screen-battle') document.body.classList.remove('battle-active');
  if (id !== 'screen-hunt') cancelHuntSession();
  document.body.classList.toggle('battle-open', id === 'screen-battle');
  screens.forEach((s) => s.classList.toggle('active', s.id === id));
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === id));
  if (id === 'screen-fortress') renderFortressScreen();
  if (id === 'screen-deck') renderDeckScreen();
  if (id === 'screen-shop') renderShopScreen();
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
  document.getElementById('menu-win-streak').textContent = player.winStreak;
  document.getElementById('menu-best-win-streak').textContent = player.bestWinStreak;
  document.getElementById('career-battles').textContent = player.battleStats.battles;
  document.getElementById('career-win-rate').textContent = player.battleStats.battles
    ? `${Math.round(player.battleStats.wins / player.battleStats.battles * 100)}%`
    : '—';
  document.getElementById('career-results').textContent =
    `${player.battleStats.wins} / ${player.battleStats.losses} / ${player.battleStats.draws}`;
  document.getElementById('career-cards-played').textContent = player.battleStats.cardsPlayed;
  document.getElementById('career-spells-cast').textContent = player.battleStats.spellsCast;
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

  renderDailyQuests();
  renderBattleHistory();

  const collectionEl = document.getElementById('menu-collection');
  collectionEl.innerHTML = '';
  player.collection.forEach((cardId) => {
    collectionEl.appendChild(collectionTile(cardId));
  });
  const battleArena = document.getElementById('battle-arena-name');
  if (battleArena) battleArena.textContent = current.name;
}

function renderBattleHistory() {
  const historyEl = document.getElementById('battle-history');
  if (!historyEl) return;
  historyEl.replaceChildren();
  if (player.battleHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'battle-history-empty';
    empty.textContent = 'Deine abgeschlossenen Kämpfe erscheinen hier.';
    historyEl.appendChild(empty);
    return;
  }
  for (const match of player.battleHistory) {
    const row = document.createElement('article');
    row.className = `battle-history-entry result-${match.result}`;
    const marker = document.createElement('span');
    marker.className = 'battle-history-result';
    marker.textContent = match.result === 'player' ? 'SIEG' : match.result === 'enemy' ? 'NIEDERLAGE' : 'REMIS';
    const details = document.createElement('div');
    details.className = 'battle-history-details';
    const opponent = document.createElement('strong');
    opponent.textContent = `vs. ${match.opponent}`;
    const timestamp = new Date(match.playedAt);
    const date = document.createElement('span');
    date.textContent = Number.isNaN(timestamp.getTime())
      ? 'Zeit unbekannt'
      : timestamp.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const stats = document.createElement('span');
    stats.textContent = `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, '0')} · ${match.cardsPlayed} Karten · ${match.playerFortressHealth}% Festung`;
    details.append(opponent, date, stats);
    const trophies = document.createElement('strong');
    trophies.className = 'battle-history-trophies';
    trophies.textContent = `${match.trophyChange > 0 ? '+' : ''}${match.trophyChange} ✦`;
    row.append(marker, details, trophies);
    historyEl.appendChild(row);
  }
}

function renderDailyQuests() {
  const questsEl = document.getElementById('daily-quests');
  if (!questsEl) return;
  questsEl.replaceChildren();
  for (const quest of player.getDailyQuests()) {
    const card = document.createElement('article');
    card.className = `daily-quest${quest.completed ? ' completed' : ''}`;
    const details = document.createElement('div');
    details.className = 'daily-quest-details';
    const title = document.createElement('strong');
    title.textContent = quest.label;
    const progress = document.createElement('span');
    progress.textContent = `${quest.progress}/${quest.target} · Belohnung ${quest.reward} ◉`;
    details.append(title, progress);
    const claim = document.createElement('button');
    claim.type = 'button';
    claim.className = 'btn btn-secondary quest-claim';
    claim.disabled = !quest.completed || quest.claimed;
    claim.textContent = quest.claimed ? 'Erhalten' : 'Abholen';
    claim.addEventListener('click', () => {
      try {
        player.claimDailyQuest(quest.id);
        savePlayer();
        renderMenu();
      } catch (error) {
        document.getElementById('quest-result').textContent = error.message;
      }
    });
    card.append(details, claim);
    questsEl.appendChild(card);
  }
}

function spellSummary(card) {
  const summaries = {
    damage: `${card.damage} Schaden`,
    fire: `${card.damage} Schaden`,
    lightning: `${card.damage} Schaden · bis zu ${card.maxTargets} Ziele`,
    heal: `${card.amount} Heilung`,
    slow: `${Math.round((1 - card.multiplier) * 100)}% verlangsamen`,
    haste: `${Math.round((card.multiplier - 1) * 100)}% beschleunigen`,
  };
  return summaries[card.effect] ?? 'Zauber';
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
  stats.textContent = card.type === 'spell'
    ? `✨ ${spellSummary(card)} · ${card.cost} Energie`
    : `❤ ${card.hp} · ⚔ ${card.damage}`;
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
  const level = player.getCardLevel(cardId);
  name.textContent = `${card.name} · Lv. ${level}`;
  const stats = document.createElement('div');
  stats.className = 'stats';
  const leveledCard = getCardAtLevel(cardId, level);
  stats.textContent = card.type === 'spell'
    ? `✨ ${spellSummary(leveledCard)} · ${card.cost} Energie`
    : `❤ ${leveledCard.hp} · ⚔ ${leveledCard.damage} · ➤ ${card.speed}`;
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

  player.collection.filter((cardId) => getCardById(cardId).type === 'monster').forEach((cardId) => {
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
    for (let i = 0; i < DECK_SIZE; i += 1) {
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
          } else if (pendingDeck.length < DECK_SIZE) {
            pendingDeck.push(cardId);
          } else {
            alert(`Du kannst maximal ${DECK_SIZE} Karten wählen.`);
            return;
          }
          if (pendingDeck.length === DECK_SIZE) {
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

function renderShopScreen() {
  const offersEl = document.getElementById('shop-offers');
  document.getElementById('shop-coins').textContent = String(player.coins);
  offersEl.replaceChildren();

  player.collection.forEach((cardId) => {
    const card = getCardById(cardId);
    const level = player.getCardLevel(cardId);
    const cost = player.getCardUpgradeCost(cardId);
    const offer = document.createElement('article');
    offer.className = `shop-offer rarity-${card.rarity}`;
    const artwork = createMonsterArtwork(cardId, 'shop-card-image');
    artwork.alt = '';
    const details = document.createElement('div');
    details.className = 'shop-offer-details';
    const name = document.createElement('strong');
    name.textContent = card.name;
    const levelLabel = document.createElement('span');
    const upgrade = card.type === 'monster'
      ? 'Leben/Schaden +10%'
      : card.effect === 'heal'
        ? 'Heilung +10%'
        : ['slow', 'haste'].includes(card.effect)
          ? 'Wirkdauer +10%'
          : 'Zauberschaden +10%';
    levelLabel.textContent = cost === null
      ? `Maximalstufe ${MAX_CARD_LEVEL}`
      : `Stufe ${level} → ${level + 1} · ${upgrade}`;
    details.append(name, levelLabel);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary shop-upgrade';
    button.disabled = cost === null || player.coins < cost;
    button.textContent = cost === null ? 'Max.' : `Aufwerten · ${cost} ◉`;
    button.addEventListener('click', () => {
      try {
        const result = player.upgradeCard(cardId);
        savePlayer();
        renderShopScreen();
        renderMenu();
        document.getElementById('shop-result').textContent =
          `${card.name} ist jetzt Stufe ${result.level}.`;
      } catch (error) {
        document.getElementById('shop-result').textContent = error.message;
      }
    });
    offer.append(artwork, details, button);
    offersEl.appendChild(offer);
  });
}

// ---------------------------------------------------------------- battle screen
let lastResult = null;
let leaveBattleDeadline = 0;

function buildEnemyForce() {
  const monsters = CARD_LIBRARY.map((card) => card.id);
  const spells = SPELL_LIBRARY.map((card) => card.id);
  const shuffle = (cards) => {
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [cards[index], cards[target]] = [cards[target], cards[index]];
    }
    return cards;
  };
  const selectedMonsters = shuffle(monsters).slice(0, 6);
  const deck = shuffle([...selectedMonsters, ...shuffle(spells).slice(0, 2)]);
  return { deck, defenders: selectedMonsters.slice(0, 2) };
}

function renderBattleScreen() {
  const canvas = document.getElementById('battle-canvas');
  const ctx = canvas.getContext('2d');
  const { current } = getArenaProgress(player.trophies);
  liveBattle = null;
  spellAimX = null;
  document.getElementById('battle-arena-name').textContent = current.name;
  document.getElementById('battle-timer').textContent = '3:00';
  document.getElementById('player-fortress-health').textContent = '100%';
  document.getElementById('enemy-fortress-health').textContent = '100%';
  document.getElementById('battle-result').textContent = '';
  document.getElementById('btn-battle-leave').textContent = '×';
  document.getElementById('btn-battle-leave').setAttribute('aria-label', 'Zurück zur Festung');
  leaveBattleDeadline = 0;
  document.body.classList.remove('battle-active');
  setEnergyDisplay(4);
  renderBattleHand(null);
  drawBattleScene(ctx, canvas, 0, null, [], [], undefined, player.fortressSlots, []);
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.hidden = false;
  startBtn.disabled = !player.isDeckReady();
  startBtn.textContent = player.isDeckReady() ? 'Kampf beginnen' : 'Erst ein Deck aus 8 Karten bauen';
  startBtn.onclick = () => runBattle(ctx, canvas);
}

function renderBattleHand(session) {
  const hand = document.getElementById('battle-hand');
  const queue = session?.playerQueue ?? player.deck;
  hand.replaceChildren();
  document.getElementById('battle-deck-count').textContent = `Deck ${queue.length}`;
  queue.slice(0, 4).forEach((cardId, index) => {
    const card = getCardById(cardId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `battle-card rarity-${card.rarity}${liveBattle?.selectedSpellIndex === index ? ' selected' : ''}${card.type === 'spell' ? ' spell-card' : ''}`;
    button.dataset.handIndex = String(index);
    button.setAttribute('aria-label', `${card.name}, kostet ${card.cost} Energie`);
    const cost = document.createElement('span');
    cost.className = 'battle-card-cost';
    cost.textContent = String(card.cost);
    const icon = document.createElement('span');
    icon.className = 'battle-card-icon';
    icon.appendChild(createMonsterArtwork(cardId, 'battle-card-image'));
    const name = document.createElement('span');
    name.className = 'battle-card-name';
    name.textContent = card.name;
    button.append(cost, icon, name);
    button.disabled = !session || session.playerEnergy < card.cost;
    button.addEventListener('click', () => {
      const result = liveBattle?.playCard(index);
      if (!result?.ok) return;
      document.getElementById('battle-result').textContent = result.targeting
        ? `${card.name}: Tippe auf das Schlachtfeld.`
        : result.cancelled
          ? 'Zauberziel abgebrochen.'
          : card.type === 'spell' ? `${card.name} bereit.` : `${card.name} rückt aus!`;
      renderBattleHand(liveBattle);
      updateBattleEnergy(liveBattle.playerEnergy);
    });
    hand.appendChild(button);
  });

  const next = document.getElementById('battle-next-card');
  next.replaceChildren();
  const nextCardId = session?.playerNextCard ?? player.deck[4];
  if (!nextCardId) return;
  const card = getCardById(nextCardId);
  const icon = createMonsterArtwork(nextCardId, 'next-card-image');
  const cost = document.createElement('strong');
  cost.textContent = String(card.cost);
  next.append(icon, cost);
  next.classList.toggle('spell-card', card.type === 'spell');
}

function setEnergyDisplay(energy) {
  const value = Math.max(0, Math.min(MAX_ENERGY, energy));
  const rounded = Math.floor(value * 10) / 10;
  document.getElementById('battle-progress-fill').style.width = `${value / MAX_ENERGY * 100}%`;
  document.getElementById('battle-energy-track').setAttribute('aria-valuenow', String(Math.floor(value)));
  document.getElementById('battle-energy-track').setAttribute('aria-valuetext', `${rounded} von ${MAX_ENERGY} Energie`);
  document.getElementById('battle-energy-label').textContent = `${rounded} / ${MAX_ENERGY}`;
}

function updateBattleEnergy(energy) {
  setEnergyDisplay(energy);
  document.querySelectorAll('#battle-hand .battle-card').forEach((button) => {
    const card = getCardById(liveBattle.playerQueue[Number(button.dataset.handIndex)]);
    button.disabled = energy < card.cost || Boolean(liveBattle.winner);
  });
}

function runBattle(ctx, canvas) {
  if (!player.isDeckReady() || battleAnimationFrame !== null) return;
  const enemy = buildEnemyForce();
  const enemyCardLevel = getArenaCardLevel(player.trophies);
  liveBattle = new LiveBattle({
    playerDeck: player.deck,
    enemyDeck: enemy.deck,
    playerDefenders: player.fortressSlots,
    enemyDefenders: enemy.defenders,
    playerCardLevels: player.cardLevels,
    enemyCardLevels: Object.fromEntries(enemy.deck.map((cardId) => [cardId, enemyCardLevel])),
  });
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.hidden = true;
  document.getElementById('battle-result').textContent = 'Tippe eine Karte, um deine Truppen auszusenden.';
  document.getElementById('btn-battle-leave').textContent = '×';
  leaveBattleDeadline = 0;
  document.body.classList.add('battle-active');
  document.getElementById('btn-battle-leave').setAttribute('aria-label', 'Zweimal tippen zum Aufgeben');
  renderBattleHand(liveBattle);
  let previousFrame = performance.now();

  function frame(now) {
    if (!liveBattle || document.getElementById('screen-battle').classList.contains('active') === false) {
      battleAnimationFrame = null;
      return;
    }
    const delta = Math.min(0.1, Math.max(0, (now - previousFrame) / 1000));
    previousFrame = now;
    liveBattle.step(delta);
    drawLiveBattle(ctx, canvas, liveBattle);
    updateBattleEnergy(liveBattle.playerEnergy);
    document.getElementById('player-fortress-health').textContent = `${Math.ceil(liveBattle.playerFortressHp / FORTRESS_HP * 100)}%`;
    document.getElementById('enemy-fortress-health').textContent = `${Math.ceil(liveBattle.enemyFortressHp / FORTRESS_HP * 100)}%`;
    const remaining = Math.max(0, BATTLE_DURATION_SECONDS - liveBattle.elapsed);
    document.getElementById('battle-timer').textContent = `${Math.floor(remaining / 60)}:${String(Math.ceil(remaining % 60)).padStart(2, '0')}`;
    if (liveBattle.winner) {
      battleAnimationFrame = null;
      finishLiveBattle(liveBattle.winner);
      return;
    }
    battleAnimationFrame = requestAnimationFrame(frame);
  }
  battleAnimationFrame = requestAnimationFrame(frame);
}

function drawLiveBattle(ctx, canvas, session) {
  const fortressHealth = { player: session.playerFortressHp, enemy: session.enemyFortressHp };
  const defenders = (owner) => session.units
    .filter((unit) => unit.owner === owner && unit.stationary)
    .map((unit) => unit.cardId);
  drawBattleScene(ctx, canvas, 0, null, [], [], fortressHealth, defenders('player'), defenders('enemy'));
  const width = canvas.width;
  const height = canvas.height;
  const groundY = height * ARENA_LAYOUT.groundHeight;
  if (session.selectedSpellIndex !== null) {
    const spell = getCardById(session.playerQueue[session.selectedSpellIndex]);
    const targetX = spellAimX ?? (spell.effect === 'heal' || spell.effect === 'haste' ? 5 : 15);
    const targetPx = targetX / LANE_LENGTH * width;
    const radiusPx = (spell.radius ?? 95) / 900 * width;
    ctx.save();
    ctx.fillStyle = spell.effect === 'heal' || spell.effect === 'haste' ? '#46e1bf20' : '#ff718b20';
    ctx.fillRect(
      spell.effect === 'heal' || spell.effect === 'haste' ? 0 : width / 2,
      0,
      width / 2,
      height,
    );
    ctx.strokeStyle = spell.effect === 'heal' || spell.effect === 'haste' ? '#71ffe0b5' : '#ff9baa';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.ellipse(targetPx, groundY - 6, radiusPx, 26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(targetPx, groundY - 40);
    ctx.lineTo(targetPx, groundY + 8);
    ctx.stroke();
    ctx.restore();
  }
  for (const unit of session.units) {
    if (unit.stationary) continue;
    const x = unit.x / LANE_LENGTH * width;
    const y = groundY;
    const sprite = getMonsterSprite(unit.cardId);
    const color = unit.owner === 'player' ? '#3fe0c8' : '#ff5d73';
    ctx.save();
    ctx.fillStyle = `${color}88`;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 31, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#080a1c';
    ctx.shadowBlur = 8;
    const bob = Math.abs(Math.sin(performance.now() / 95 + unit.x * 1.7)) * 3.2;
    const attackPulse = unit.attackCooldown > 0.88 ? (1 - unit.attackCooldown) / 0.12 : 0;
    if (sprite.complete && sprite.naturalWidth) {
      ctx.save();
      if (unit.owner === 'enemy') {
        ctx.translate(x * 2, y);
        ctx.scale(-1, 1);
        ctx.translate(0, -y);
      }
      ctx.globalAlpha = unit.hitFlash > 0 ? 0.65 : 1;
      ctx.drawImage(sprite, x - 42 + (unit.owner === 'player' ? attackPulse * 5 : -attackPulse * 5), y - 91 - bob, 84, 84);
      if (unit.hitFlash > 0) {
        ctx.fillStyle = '#fff5cf';
        for (let spark = 0; spark < 3; spark += 1) {
          const angle = performance.now() / 70 + spark * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(angle) * 37, y - 56 - bob + Math.sin(angle) * 22, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (attackPulse > 0) {
        ctx.globalAlpha = attackPulse;
        ctx.strokeStyle = '#fff1b0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + (unit.owner === 'player' ? 34 : -34), y - 45 - bob, 15, unit.owner === 'player' ? -1.2 : Math.PI - 1.2, unit.owner === 'player' ? 0.8 : Math.PI + 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#17152c';
    ctx.beginPath();
    roundedRectPath(ctx, x - 26, y - 99, 52, 8, 4);
    ctx.fill();
    ctx.fillStyle = unit.owner === 'player' ? '#3fe0c8' : '#ff5d73';
    ctx.beginPath();
    roundedRectPath(ctx, x - 25, y - 98, 50 * Math.max(0, unit.hp / unit.card.hp), 6, 3);
    ctx.fill();
    ctx.restore();
  }
  for (const effect of session.effects) {
    ctx.save();
    if (effect.kind === 'projectile') {
      const progress = Math.min(1, effect.age / effect.duration);
      const eased = progress * progress * (3 - 2 * progress);
      const x = (effect.fromX + (effect.toX - effect.fromX) * eased) / LANE_LENGTH * width;
      const y = groundY - 50 - Math.sin(progress * Math.PI) * 42;
      const color = effect.owner === 'player' ? '#8fffee' : '#ff9baa';
      ctx.globalAlpha = 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5 + Math.sin(performance.now() / 35) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${color}b3`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - Math.sign(effect.toX - effect.fromX) * 12, y + 3);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (effect.kind === 'spell-burst') {
      const progress = Math.min(1, effect.age / effect.duration);
      const x = effect.x / LANE_LENGTH * width;
      const radius = Math.max(10, effect.radius / LANE_LENGTH * width * (0.72 + progress * 0.28));
      const colors = {
        damage: '#f4e8ff',
        fire: '#ff8a45',
        lightning: '#ffe95f',
        heal: '#65f3c6',
        slow: '#72dcff',
        haste: '#ffc45e',
      };
      const color = colors[effect.effect] ?? '#f4e8ff';
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}24`;
      ctx.lineWidth = 5 * (1 - progress) + 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(x, groundY - 6, radius, 24 + progress * 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1 - effect.age / 0.65;
      ctx.fillStyle = effect.owner === 'player' ? '#fff2bc' : '#ffe1e8';
      ctx.font = '900 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(effect.kind === 'death' ? '✦' : `-${effect.amount}`, effect.x / LANE_LENGTH * width, groundY - 103 - effect.age * 34);
    }
    ctx.restore();
  }
}

function finishLiveBattle(winner) {
  const resultEl = document.getElementById('battle-result');
  const trophiesBefore = player.trophies;
  const previousWinStreak = player.winStreak;
  const previousBestWinStreak = player.bestWinStreak;
  const arenaRewards = player.recordBattleOutcome(winner);
  player.recordDailyQuestProgress({
    winner,
    cardsPlayed: liveBattle.playerCardsPlayed,
    spellsCast: liveBattle.playerSpellsCast,
  });
  player.recordBattle({
    result: winner,
    trophyChange: player.trophies - trophiesBefore,
    opponent: 'Übungsgegner',
    durationSeconds: Math.floor(liveBattle.elapsed),
    cardsPlayed: liveBattle.playerCardsPlayed,
    spellsCast: liveBattle.playerSpellsCast,
    playerFortressHealth: Math.ceil(liveBattle.playerFortressHp / FORTRESS_HP * 100),
    enemyFortressHealth: Math.ceil(liveBattle.enemyFortressHp / FORTRESS_HP * 100),
  });
  if (winner === 'player') {
    const xpGain = 40;
    const previousLevel = player.level;
    const leveledUp = player.addXp(xpGain);
    const levelReward = (player.level - previousLevel) * LEVEL_UP_COIN_REWARD;
    player.coins += 20;
    const streakMessage = player.winStreak > previousWinStreak
      ? ` · ${player.winStreak} Siege in Folge${player.winStreak > previousBestWinStreak ? ' — neuer Rekord!' : ''}`
      : '';
    resultEl.textContent = `Sieg! +30 🏆, +${xpGain} XP, +${20 + levelReward} Münzen${leveledUp ? ` — Level Up${levelReward ? `, +${levelReward} Levelbonus` : ''}!` : ''}${streakMessage}`;
  } else if (winner === 'enemy') {
    resultEl.textContent = `Niederlage. -10 🏆.${previousWinStreak > 0 ? ` Siegesserie von ${previousWinStreak} beendet.` : ''} Verbessere dein Deck und versuche es erneut.`;
  } else {
    resultEl.textContent = 'Unentschieden.';
  }
  if (arenaRewards.length) {
    resultEl.textContent += ` Neue Arena: ${arenaRewards.map(({ arena, coins }) => `${arena.name} · +${coins} Münzen`).join(', ')}!`;
  }
  savePlayer();
  document.body.classList.remove('battle-active');
  const startBtn = document.getElementById('btn-start-battle');
  startBtn.hidden = false;
  startBtn.textContent = 'Noch einmal kämpfen';
  startBtn.onclick = () => runBattle(document.getElementById('battle-canvas').getContext('2d'), document.getElementById('battle-canvas'));
  document.getElementById('btn-battle-leave').setAttribute('aria-label', 'Zurück zur Festung');
  renderMenu();
}

document.getElementById('btn-battle-leave').addEventListener('click', () => {
  if (!liveBattle || liveBattle.winner) {
    showScreen('screen-menu');
    return;
  }
  const now = performance.now();
  if (now > leaveBattleDeadline) {
    leaveBattleDeadline = now + 2200;
    document.getElementById('btn-battle-leave').textContent = '!';
    document.getElementById('battle-result').textContent = 'Zum Aufgeben erneut auf × tippen.';
    return;
  }
  leaveBattleDeadline = 0;
  liveBattle.winner = 'enemy';
});

function drawBattleScene(ctx, canvas, progress, result, playerDeck, enemyDeck, fortressHealth = interpolateFortressHealth(result, progress), playerDefenders = [], enemyDefenders = []) {
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
  drawFortressGuards(ctx, width * ARENA_LAYOUT.fortressLeft, groundY - height * ARENA_LAYOUT.fortressHeight, playerDefenders, true);
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  drawFortress(ctx, width * ARENA_LAYOUT.fortressLeft, groundY - height * ARENA_LAYOUT.fortressHeight, '#ff667b', fortressHealth.enemy);
  ctx.restore();
  drawFortressGuards(
    ctx,
    width * (1 - ARENA_LAYOUT.fortressLeft) - FORTRESS_TOWER_WIDTH - 28,
    groundY - height * ARENA_LAYOUT.fortressHeight,
    enemyDefenders,
    false,
  );

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

function drawFortressGuards(ctx, fortressX, fortressY, defenders, isPlayer) {
  const guards = Array.isArray(defenders) ? defenders.filter(Boolean).slice(0, 4) : [];
  if (guards.length === 0) return;
  const spacing = 27;
  const firstX = fortressX + 61 - ((guards.length - 1) * spacing) / 2;
  const time = performance.now() / 700;
  guards.forEach((cardId, index) => {
    const sprite = getMonsterSprite(cardId);
    if (!sprite.complete || sprite.naturalWidth === 0) return;
    const bob = Math.sin(time + index * 1.5) * 1.3;
    const x = firstX + index * spacing;
    ctx.fillStyle = isPlayer ? '#45d9b0' : '#ff667b';
    ctx.beginPath();
    ctx.ellipse(x, fortressY + 53 + bob, 13, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, fortressY + 51 + bob);
    ctx.scale(isPlayer ? 1 : -1, 1);
    ctx.shadowColor = '#0d1028b3';
    ctx.shadowBlur = 5;
    ctx.drawImage(sprite, -17, -37, 34, 38);
    ctx.restore();
  });
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

if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: './' }).catch((error) => {
    console.warn('Offline-App konnte nicht vorbereitet werden.', error);
  });
}

renderMenu();
