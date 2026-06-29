import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot, getCreds, setCreds } from '../bot/index.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus, getCurrentStatus, getCurrentQr } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';

const router = express.Router();

const isServerless = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const isStateless = isServerless || process.env.RENDER === '1' || process.env.RENDER === 'true' || process.env.RENDER;

router.use((req, res, next) => {
  if (isServerless) {
    // Start bot asynchronously on any API request if not already starting
    startWhatsAppBot().catch(console.error);
  }
  next();
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/status', async (req, res) => {
  const startStatus = getCurrentStatus();
  if (isServerless) {
    // If bot is starting, keep request alive to give it CPU time
    if (!getCurrentQr() && (startStatus === 'initializing' || startStatus === 'disconnected')) {
      for (let i = 0; i < 30; i++) { // 3 seconds max
        if (getCurrentQr() || getCurrentStatus() === 'connected' || getCurrentStatus() === 'qr_ready') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else if (startStatus === 'qr_ready' || startStatus === 'connected') {
      // Keep the function alive as long as possible so Baileys can maintain its websocket connection to WhatsApp
      for (let i = 0; i < 80; i++) { // 8 seconds max
        if (getCurrentStatus() !== startStatus) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  res.json({ 
      status: getCurrentStatus(), 
      qr: getCurrentQr(),
      needsCreds: isStateless ? !getCreds() : false,
      creds: isStateless ? getCreds() : null
  });
});

router.post('/auth/sync', express.json({ limit: '10mb' }), async (req, res) => {
  if (req.body && req.body.creds) {
      if (!getCreds()) {
          setCreds(req.body.creds);
      }
      startWhatsAppBot().catch(console.error);
      
      if (isServerless) {
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
  const isStateless = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || process.env.RENDER === '1' || process.env.RENDER === 'true' || process.env.RENDER;
  const authFolder = isStateless ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info');
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
