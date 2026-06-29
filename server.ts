import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { startWhatsAppBot, stopWhatsAppBot } from './server/bot/index.js';
import { initSocket, emitLog } from './server/services/socket.js';
import apiRoutes from './server/routes/api.js';

const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSocket(io);

// --- Middleware ---
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRoutes);

// --- Frontend ---
async function setupFrontend() {
  if (!IS_PRODUCTION) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// --- Boot ---
async function boot() {
  await setupFrontend();



  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Running on port ${PORT}`);
    emitLog(`🚀 Server started on port ${PORT}`, 'system');

    // Start WhatsApp bot after server is listening
    startWhatsAppBot();
  });
}

boot().catch((err) => {
  console.error('[SERVER] Fatal boot error:', err);
  process.exit(1);
});

// --- Graceful Shutdown ---
function gracefulShutdown(signal: string) {
  console.log(`[SERVER] ${signal} received. Shutting down gracefully...`);
  try { stopWhatsAppBot(); } catch (_) {}
  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed.');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught exception:', err);
  emitLog(`💥 Uncaught exception: ${err.message}`, 'error');
});
process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled rejection:', reason);
  emitLog(`💥 Unhandled rejection: ${String(reason)}`, 'error');
});

export default app;
