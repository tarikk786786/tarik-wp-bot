import assert from 'node:assert/strict';
import test from 'node:test';
import { errorStatus, isOptIn, isOptOut, shouldPauseConnection, shouldRetrySend } from '../server/bot/safety.js';

test('opt-out and opt-in commands are strict and case-insensitive', () => {
  assert.equal(isOptOut(' STOP! '), true);
  assert.equal(isOptOut('please stop'), false);
  assert.equal(isOptIn('Start'), true);
  assert.equal(isOptIn('restart'), false);
});

test('account protection pauses unsafe disconnects', () => {
  assert.equal(shouldPauseConnection(403), true);
  assert.equal(shouldPauseConnection(440), true);
  assert.equal(shouldPauseConnection(408), false);
});

test('send retries exclude authentication, policy, and rate-limit failures', () => {
  const forbidden = { output: { statusCode: 403 } };
  assert.equal(errorStatus(forbidden), 403);
  assert.equal(shouldRetrySend(forbidden), false);
  assert.equal(shouldRetrySend({ status: 429 }), false);
  assert.equal(shouldRetrySend(new Error('temporary network failure')), true);
});
