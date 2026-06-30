import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot, getCreds, setCreds } from '../bot/index.js';
import { startTelegramBot, stopTelegramBot } from '../bot/telegram.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus, getCurrentStatus, getCurrentStatusData, getCurrentQr, getCurrentTgStatus, getCurrentTgStatusData, getCurrentTgQr } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';
import { deleteExpiredBackups } from '../services/storage.js';

const router = express.Router();

const requestCounts = new Map<string, { count: number, resetTime: number }>();

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const record = requestCounts.get(ip) || { count: 0, resetTime: now + 60000 };
    
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + 60000;
    } else {
        record.count++;
    }
    
    requestCounts.set(ip, record);
    
    if (record.count > 100) { // 100 requests per minute
        return res.status(429).json({ error: 'Too many requests' });
    }
    next();
};

router.use(rateLimiter);

const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

router.use((req, res, next) => {
  if (isVercel) {
    // Start bot asynchronously on any API request if not already starting
    startWhatsAppBot().catch(console.error);
  }
  next();
});

router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    whatsapp: {
      status: getCurrentStatus(),
      details: getCurrentStatusData() || null
    },
    telegram: {
      status: getCurrentTgStatus(),
      details: getCurrentTgStatusData() || null
    }
  });
});

router.get('/status', async (req, res) => {
  const startStatus = getCurrentStatus();
  if (isVercel) {
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
      statusDetails: getCurrentStatusData(),
      tgStatus: getCurrentTgStatus(),
      tgStatusDetails: getCurrentTgStatusData(),
      tgQr: getCurrentTgQr(),
      qr: getCurrentQr(),
      needsCreds: isVercel ? !getCreds() : false,
      creds: isVercel ? getCreds() : null
  });
});

router.post('/auth/sync', express.json({ limit: '10mb' }), async (req, res) => {
  if (req.body && req.body.creds) {
      if (!getCreds()) {
          setCreds(req.body.creds);
      }
      startWhatsAppBot().catch(console.error);
      
      if (isVercel) {
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
  
  // Restart Telegram bot to apply new token/settings if needed
  stopTelegramBot();
  setTimeout(() => {
    startTelegramBot();
  }, 1000);
  
  res.json(updated);
});

router.post('/bot/restart', async (req, res) => {
  await stopWhatsAppBot();
  stopTelegramBot();
  setTimeout(() => {
    startWhatsAppBot();
    startTelegramBot();
  }, 1000);
  res.json({ message: 'Restarting bot...' });
});

router.post('/bot/logout', async (req, res) => {
  await stopWhatsAppBot();
  stopTelegramBot();
  const authFolder = isVercel ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info');
  if (fs.existsSync(authFolder)) {
    fs.rmSync(authFolder, { recursive: true, force: true });
  }
  
  deleteExpiredBackups().catch(e => {
    emitLog(`Failed to delete GCS backups on logout: ${e.message}`, 'error');
  });

  emitLog('Logged out and cleared auth data', 'warn');
  emitStatus('disconnected');
  
  setTimeout(() => {
    startWhatsAppBot();
  }, 1000);
  
  res.json({ message: 'Logged out and restarting...' });
});

router.post('/bot/tg-logout', (req, res) => {
  stopTelegramBot();
  const tgAuthFolder = isVercel ? '/tmp/tg_auth_info' : path.join(process.cwd(), 'tg_auth_info');
  const tgSessionFile = path.join(tgAuthFolder, 'session.txt');
  if (fs.existsSync(tgSessionFile)) {
    fs.unlinkSync(tgSessionFile);
  }
  emitLog('Telegram logged out and cleared auth data', 'warn');
  
  setTimeout(() => {
    startTelegramBot();
  }, 1000);
  
  res.json({ message: 'Logged out Telegram...' });
});

router.post('/bot/memory/clear', (req, res) => {
  clearAllMemory();
  emitLog('All bot contextual memory cleared.', 'warn');
  res.json({ message: 'Memory cleared' });
});

export default router;
