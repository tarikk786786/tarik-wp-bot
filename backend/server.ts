import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

import { startWhatsAppBot, stopWhatsAppBot } from './server/bot/index.js';
import { startTelegramBot, stopTelegramBot } from './server/bot/telegram.js';
import { initSocket, emitLog } from './server/services/socket.js';
import { initConfig } from './server/services/config.js';
import apiRoutes from './server/routes/api.js';

// Global error handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  try {
    emitLog(`CRITICAL ERROR (Uncaught Exception): ${err.message}`, 'error');
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    emitLog(`CRITICAL ERROR (Unhandled Rejection): ${reason}`, 'error');
  } catch (e) {}
});

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

initSocket(io);

const PORT = 3000;

app.use(express.json());
app.use('/api', apiRoutes);

// Frontend is now managed in a separate Next.js application.

const isServerless = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
if (!isServerless) {
  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    try {
      await initConfig();
    } catch (err: any) {
      console.error('Failed to initialize Config:', err.message);
    }
    
    // Attempt to start bots even if DB failed (they might crash, but it's better than silent failure)
    startWhatsAppBot();
    startTelegramBot();
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopWhatsAppBot();
  stopTelegramBot();
  io.close(); // Close all websocket connections
  httpServer.close(() => {
    process.exit(0);
  });
  // Force exit after 5 seconds if not closed
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', async () => {
  await stopWhatsAppBot();
  stopTelegramBot();
  io.close();
  httpServer.close(() => {
    process.exit(0);
  });
  // Force exit after 5 seconds if not closed
  setTimeout(() => process.exit(0), 5000);
});

export default app;
