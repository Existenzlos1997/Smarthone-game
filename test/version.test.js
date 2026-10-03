import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isAppOutdated } from '../src/version.js';

test('Versionsvergleich', () => {
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
});
test('veraltete App erkannt', () => {
  assert.equal(isAppOutdated('0.1.0', '0.2.0'), true);
  assert.equal(isAppOutdated('0.2.0', '0.2.0'), false);
  assert.equal(isAppOutdated('0.1.0', undefined), false);
});
