import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSave, SAVE_VERSION } from '../src/migrations.js';

test('alte Spielstände erhalten die aktuelle Version', () => {
  const out = migrateSave({ coins: 5 });
  assert.equal(out.saveVersion, SAVE_VERSION);
  assert.equal(out.coins, 5);
});
test('ungültige Daten ergeben null', () => assert.equal(migrateSave(null), null));
