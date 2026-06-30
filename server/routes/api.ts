import express from 'express';
import { clearWhatsAppAuth, startWhatsAppBot, stopWhatsAppBot } from '../bot/index.js';
import { clearTgCreds, startTelegramBot, stopTelegramBot } from '../bot/telegram.js';
import { emitLog, getCurrentQr, getCurrentStatus, getCurrentTgQr, getCurrentTgStatus } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';

const router = express.Router();
const requestCounts = new Map<string, { count: number; resetTime: number }>();

router.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const record = requestCounts.get(key);
  if (!record || now >= record.resetTime) requestCounts.set(key, { count: 1, resetTime: now + 60_000 });
  else {
    record.count += 1;
    if (record.count > 120) return res.status(429).json({ error: 'Too many requests' });
  }
  if (requestCounts.size > 1_000) for (const [ip, value] of requestCounts) if (now >= value.resetTime) requestCounts.delete(ip);
  next();
});

router.get('/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: getCurrentStatus(), tgStatus: getCurrentTgStatus(), qr: getCurrentQr(), tgQr: getCurrentTgQr() });
});

router.get('/config', (_req, res) => {
  const config = getConfig();
  res.json({ ...config, telegramPassword: config.telegramPassword ? '********' : '' });
});

router.post('/config', async (req, res, next) => {
  try {
    const current = getConfig();
    const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    if (body.telegramPassword === '********' || body.telegramPassword === '') body.telegramPassword = current.telegramPassword;
    const updated = saveConfig(body);
    emitLog('Bot configuration updated');
    await stopTelegramBot();
    void startTelegramBot();
    res.json({ ...updated, telegramPassword: updated.telegramPassword ? '********' : '' });
  } catch (error) { next(error); }
});

router.post('/bot/restart', async (_req, res) => {
  await Promise.allSettled([stopWhatsAppBot(), stopTelegramBot()]);
  void startWhatsAppBot();
  void startTelegramBot();
  res.status(202).json({ message: 'Bot restart scheduled' });
});

router.post('/bot/logout', async (_req, res, next) => {
  try {
    await clearWhatsAppAuth();
    emitLog('WhatsApp authentication data cleared', 'warn');
    void startWhatsAppBot();
    res.status(202).json({ message: 'WhatsApp logged out; a new QR will be generated' });
  } catch (error) { next(error); }
});

router.post('/bot/tg-logout', async (_req, res, next) => {
  try {
    await stopTelegramBot();
    clearTgCreds();
    emitLog('Telegram authentication data cleared', 'warn');
    void startTelegramBot();
    res.status(202).json({ message: 'Telegram logged out' });
  } catch (error) { next(error); }
});

router.post('/bot/memory/clear', (_req, res) => {
  clearAllMemory();
  emitLog('All contextual memory cleared', 'warn');
  res.json({ message: 'Memory cleared' });
});

router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  emitLog(`API error: ${error.message}`, 'error');
  res.status(400).json({ error: 'Invalid request' });
});

export default router;
