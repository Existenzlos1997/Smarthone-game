import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollRandomCard, CARD_LIBRARY, SPELL_LIBRARY, getCardById } from '../src/cards.js';

test('getCardById returns the matching card', () => {
  const card = getCardById('dragon');
  assert.equal(card.name, 'Drache');
});

test('getCardById throws for unknown ids', () => {
  assert.throws(() => getCardById('unicorn'));
});

test('the six authored spell cards have complete targeting data', () => {
  assert.deepEqual(SPELL_LIBRARY.map((card) => card.id), ['pfeil', 'feuer', 'blitz', 'heil', 'frost', 'wut']);
  for (const spell of SPELL_LIBRARY) {
    assert.equal(getCardById(spell.id), spell);
    assert.equal(spell.type, 'spell');
    assert.ok(spell.cost > 0);
    assert.ok(spell.effect);
  }
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
