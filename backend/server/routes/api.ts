import express from 'express';
import { stopWhatsAppBot, startWhatsAppBot, logoutWhatsAppBot, getCreds, setCreds } from '../bot/index.js';
import { startTelegramBot, stopTelegramBot, clearTgCreds } from '../bot/telegram.js';
import fs from 'fs';
import path from 'path';
import { emitLog, emitStatus, getCurrentStatus, getCurrentStatusData, getCurrentQr, getCurrentTgStatus, getCurrentTgStatusData, getCurrentTgQr } from '../services/socket.js';
import { getConfig, saveConfig } from '../services/config.js';
import { clearAllMemory } from '../services/memory.js';
import { authMiddleware } from '../middleware/auth.js';

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
    
    if (record.count > 500) { // 500 requests per minute
        return res.status(429).json({ error: 'Too many requests' });
    }
    next();
};

router.use(rateLimiter);
router.use(authMiddleware);

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
  const newConfig = req.body;

  // Basic Prompt Injection & Jailbreak check
  if (newConfig && newConfig.systemInstruction) {
      const lowerPrompt = newConfig.systemInstruction.toLowerCase();
      const forbidden = ['jailbreak', 'godmod', 'bypass', 'no restrictions', 'ignore all previous', 'ignore previous'];
      
      for (const word of forbidden) {
          if (lowerPrompt.includes(word)) {
              return res.status(400).json({ error: 'Config rejected: System instruction contains forbidden or unsafe keywords.' });
          }
      }
  }

  const updated = saveConfig(newConfig);
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

// --- NEW PHASE 4 ROUTES ---

// 1. Fetch all contacts
router.get('/contacts', async (req, res) => {
  try {
    const { insforge } = await import('../services/insforge.js');
    const { data: contacts, error } = await insforge.database.from('users').select('*').limit(50);
    if (error) throw error;
    // Map structure to match frontend expectations
    res.json((contacts || []).map(c => ({ _id: c.id, phoneNumber: c.id, ...c.data })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Update contact (e.g. mode, isVIP)
router.put('/contacts/:id', async (req, res) => {
  try {
    const { updateUser } = await import('../services/db-helpers.js');
    const updated = await updateUser(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Fetch all memories (optionally filtered by contactId)
router.get('/memory', async (req, res) => {
  try {
    const { insforge } = await import('../services/insforge.js');
    const { contactId } = req.query;
    
    let query = insforge.database.from('ai_memory').select('*');
    if (contactId) {
      query = query.eq('user_id', contactId as string);
    }
    
    const { data: memories, error } = await query.limit(100);
    if (error) throw error;
      
    // Supabase stores arrays of history. We will flatten them for the frontend
    const flatMemories = (memories || []).flatMap(row => (row.history || []).map((h: any) => ({
      _id: row.user_id + '-' + (h.metadata?.timestamp || Date.now()),
      contactId: { phoneNumber: row.user_id },
      content: h.content,
      source: h.source,
      importance: h.importance,
      createdAt: h.metadata?.timestamp
    })));

    res.json(flatMemories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete a memory
router.delete('/memory/:id', async (req, res) => {
  try {
    res.json({ success: true, warning: 'Fine-grained memory deletion is not supported in the new JSONB backend' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
