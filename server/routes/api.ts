import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot } from '../bot/index.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/config', (req, res) => {
  res.json(getConfig());
});

router.post('/config', (req, res) => {
  const updated = saveConfig(req.body);
  emitLog('Bot configuration updated.', 'info');
  res.json(updated);
});

router.post('/bot/restart', (req, res) => {
  stopWhatsAppBot();
  setTimeout(() => {
    startWhatsAppBot();
  }, 1000);
  res.json({ message: 'Restarting bot...' });
});

router.post('/bot/logout', (req, res) => {
  stopWhatsAppBot();
  const authFolder = path.join(process.cwd(), 'baileys_auth_info');
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
  }
  emitLog('Logged out and cleared auth data', 'warn');
  emitStatus('disconnected');
  
  setTimeout(() => {
    startWhatsAppBot();
  }, 1000);
  
  res.json({ message: 'Logged out and restarting...' });
});

router.post('/bot/memory/clear', (req, res) => {
  clearAllMemory();
  emitLog('All bot contextual memory cleared.', 'warn');
  res.json({ message: 'Memory cleared' });
});

export default router;
