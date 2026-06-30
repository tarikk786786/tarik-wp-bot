import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot, logoutWhatsAppBot, getCreds, setCreds } from '../bot/index.js';
import { startTelegramBot, stopTelegramBot, clearTgCreds } from '../bot/telegram.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus, getCurrentStatus, getCurrentStatusData, getCurrentQr, getCurrentTgStatus, getCurrentTgStatusData, getCurrentTgQr } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';

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
  // Note: Vercel serverless functions are stateless and cannot maintain 
  // long-lived WebSocket connections like WhatsApp Baileys. 
  // Running this on Vercel will cause "Connection Replaced" loops as multiple 
  // instances spin up and fight for the same session.
  // It is recommended to deploy this backend to a platform like Render, Railway, 
  // or a VPS that supports background processes.
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
  res.json({ 
      status: getCurrentStatus(),
      statusDetails: getCurrentStatusData(),
      tgStatus: getCurrentTgStatus(),
      tgStatusDetails: getCurrentTgStatusData(),
      tgQr: getCurrentTgQr(),
      qr: getCurrentQr(),
      needsCreds: false,
      creds: null
  });
});

router.get('/logs', (req, res) => {
  import('../services/socket.js').then(({ logs }) => {
    res.json(logs);
  });
});

router.post('/auth/sync', express.json({ limit: '10mb' }), async (req, res) => {
  res.status(400).json({ success: false, error: 'Deprecated' });
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
  await logoutWhatsAppBot();
  stopTelegramBot();
  
  emitLog('Logged out and cleared auth data from MongoDB', 'warn');
  emitStatus('disconnected');
  
  setTimeout(() => {
    startWhatsAppBot();
  }, 1000);
  
  res.json({ message: 'Logged out and restarting...' });
});

router.post('/bot/tg-logout', async (req, res) => {
  stopTelegramBot();
  await clearTgCreds();
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
