import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig, validateConfig } from '../server/services/config.js';

test('configuration validation clamps unsafe values and normalizes lists', () => {
  const config = validateConfig({
    replyDelayMs: 999_999,
    activeHoursStart: '99:99',
    allowedNumbers: ' 123, 123, 456 ',
    systemInstruction: 'x'.repeat(20_000),
    botEnabled: 'yes',
  });

  assert.equal(config.replyDelayMs, 60_000);
  assert.equal(config.activeHoursStart, defaultConfig.activeHoursStart);
  assert.deepEqual(config.allowedNumbers, ['123', '456']);
  assert.equal(config.systemInstruction.length, 12_000);
  assert.equal(config.botEnabled, defaultConfig.botEnabled);
});

test('configuration validation rejects unknown keys', () => {
  const config = validateConfig({ admin: true, telegramPassword: 'secret' });
  assert.equal('admin' in config, false);
  assert.equal(config.telegramPassword, 'secret');
});
