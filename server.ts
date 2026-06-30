import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { startWhatsAppBot, stopWhatsAppBot } from './server/bot/index.js';
import { startTelegramBot, stopTelegramBot } from './server/bot/telegram.js';
import { initSocket, emitLog } from './server/services/socket.js';
import { isVercel, validateEnvironment } from './server/services/runtime.js';
import apiRoutes from './server/routes/api.js';

const app = express();
app.set('trust proxy', 1);

function authorized(header?: string) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return process.env.NODE_ENV !== 'production';
  if (!header?.startsWith('Basic ')) return false;
  try {
    const separator = Buffer.from(header.slice(6), 'base64').toString('utf8').indexOf(':');
    const password = Buffer.from(header.slice(6), 'base64').toString('utf8').slice(separator + 1);
    const actual = Buffer.from(password);
    const wanted = Buffer.from(expected);
    return separator >= 0 && actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
  } catch {
    return false;
  }
}

app.get('/api/health', (_req, res) => {
  const environment = validateEnvironment();
  res.status(environment.errors.length ? 503 : 200).json({ status: environment.errors.length ? 'error' : 'ok', warnings: environment.warnings });
});

app.use((req, res, next) => {
  if (authorized(req.headers.authorization)) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Tarik Bot Admin", charset="UTF-8"');
  return res.status(401).send('Authentication required');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1_000_000,
  allowRequest: (req, callback) => callback(null, authorized(req.headers.authorization)),
});
initSocket(io);

app.use(express.json({ limit: '256kb' }));
app.use('/api', apiRoutes);

let shuttingDown = false;
async function shutdown(signal: string, error?: unknown) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (error) console.error(signal, error);
  emitLog(`Shutting down after ${signal}`, error ? 'error' : 'info');
  await Promise.allSettled([stopWhatsAppBot(), stopTelegramBot()]);
  io.close();
  httpServer.close(() => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(error ? 1 : 0), 10_000).unref();
}

process.on('uncaughtException', (error) => void shutdown('uncaughtException', error));
process.on('unhandledRejection', (error) => void shutdown('unhandledRejection', error));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

async function bootstrap() {
  const environment = validateEnvironment();
  environment.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  if (environment.errors.length) throw new Error(environment.errors.join(' '));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  if (!isVercel) {
    const port = Number(process.env.PORT) || 3000;
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
      void startWhatsAppBot();
      void startTelegramBot();
    });
  }
}

void bootstrap().catch((error) => shutdown('startup failure', error));
export default app;
