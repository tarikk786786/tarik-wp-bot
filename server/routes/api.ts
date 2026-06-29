import express from 'express';
import { startWhatsAppBot, stopWhatsAppBot, resetSession, getSocketState } from '../bot/index.js';
import { emitLog, emitStatus, getCurrentStatus, getCurrentQr, getConnectedNumber, getLastLoginTime, getSystemMetrics, getLogs } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory, getMessageStats, getActiveChats, getMemoryStats } from '../services/memory.js';
import { isGeminiConfigured } from '../services/gemini.js';

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/status', (_req, res) => {
  const metrics = getSystemMetrics();
  const msgStats = getMessageStats();
  const memStats = getMemoryStats();
  res.json({
    status: getCurrentStatus(),
    qr: getCurrentQr(),
    connectedNumber: getConnectedNumber(),
    lastLoginTime: getLastLoginTime(),
    socketState: getSocketState(),
    geminiConfigured: isGeminiConfigured(),
    metrics,
    messageStats: msgStats,
    memoryStats: memStats,
    activeChats: getActiveChats(),
    platform: detectPlatform(),
  });
});

router.get('/logs', (_req, res) => {
  res.json(getLogs());
});

router.get('/config', (_req, res) => {
  res.json(getConfig());
});

router.post('/config', (req, res) => {
  const updated = saveConfig(req.body);
  emitLog('⚙️ Configuration updated.', 'system');
  res.json(updated);
});

router.post('/bot/restart', (_req, res) => {
  stopWhatsAppBot();
  emitLog('🔄 Bot restart requested...', 'system');
  setTimeout(() => startWhatsAppBot(), 1500);
  res.json({ message: 'Restarting bot...' });
});

router.post('/bot/logout', (_req, res) => {
  resetSession();
  res.json({ message: 'Logged out and restarting...' });
});

router.post('/bot/memory/clear', (_req, res) => {
  clearAllMemory();
  emitLog('🧹 All bot memory cleared.', 'warning');
  res.json({ message: 'Memory cleared' });
});

function detectPlatform(): string {
  if (process.env.RENDER) return 'render';
  if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_SERVICE_NAME) return 'railway';
  if (process.env.FLY_APP_NAME) return 'fly';
  if (process.env.GOOGLE_CLOUD_PROJECT) return 'gcp';
  if (process.env.AWS_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME) return 'aws';
  if (process.env.WEBSITE_SITE_NAME) return 'azure';
  if (process.env.VERCEL) return 'vercel';
  if (fs.existsSync('/.dockerenv')) return 'docker';
  return 'vps';
}

import fs from 'fs';

export default router;
