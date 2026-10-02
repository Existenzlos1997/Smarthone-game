import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollRandomCard, CARD_LIBRARY, getCardById } from '../src/cards.js';

test('getCardById returns the matching card', () => {
  const card = getCardById('dragon');
  assert.equal(card.name, 'Drache');
});

test('getCardById throws for unknown ids', () => {
  assert.throws(() => getCardById('unicorn'));
});

test('rollRandomCard always returns a card from the library', () => {
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const card = rollRandomCard(() => roll);
    assert.ok(CARD_LIBRARY.includes(card));
  }
});

test('rollRandomCard(rng=0) returns the first (most common) card', () => {
  const card = rollRandomCard(() => 0);
  assert.equal(card, CARD_LIBRARY[0]);
});
