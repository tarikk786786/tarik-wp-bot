import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot, getCreds, setCreds } from '../bot/index.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus, getCurrentStatus, getCurrentQr } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';

const router = express.Router();

router.use((req, res, next) => {
  if (process.env.VERCEL) {
    // Start bot asynchronously on any API request if not already starting
    startWhatsAppBot().catch(console.error);
  }
  next();
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/status', async (req, res) => {
  if (process.env.VERCEL) {
    // If bot is starting, keep request alive for a few seconds to give it CPU time
    if (!getCurrentQr() && (getCurrentStatus() === 'initializing' || getCurrentStatus() === 'disconnected')) {
      for (let i = 0; i < 30; i++) { // 3 seconds max
        if (getCurrentQr() || getCurrentStatus() === 'connected' || getCurrentStatus() === 'qr_ready') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  res.json({ 
      status: getCurrentStatus(), 
      qr: getCurrentQr(),
      needsCreds: process.env.VERCEL ? !getCreds() : false
  });
});

router.post('/auth/sync', express.json({ limit: '10mb' }), async (req, res) => {
  if (req.body && req.body.creds) {
      setCreds(req.body.creds);
      startWhatsAppBot().catch(console.error);
      
      if (process.env.VERCEL) {
          // Keep request alive for a few seconds to let connection establish
          for (let i = 0; i < 40; i++) {
              if (getCurrentStatus() === 'connected') break;
              await new Promise(resolve => setTimeout(resolve, 100));
          }
      }
      
      res.json({ success: true });
  } else {
      res.status(400).json({ success: false });
  }
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
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL;
  const authFolder = isVercel ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info');
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
