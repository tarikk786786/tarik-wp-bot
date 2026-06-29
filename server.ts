import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { startWhatsAppBot, stopWhatsAppBot } from './server/bot/index.js';
import { initSocket } from './server/services/socket.js';
import apiRoutes from './server/routes/api.js';

const app = express();
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

async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
setupVite();

const isServerless = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
if (!isServerless) {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    startWhatsAppBot();
  });
}

export default app;
