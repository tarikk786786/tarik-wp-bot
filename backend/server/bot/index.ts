import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { emitStatus, emitLog, emitQR, getIo } from '../services/socket.js';
import { handleIncomingMessage } from './handler.js';
import fs from 'fs';
import path from 'path';
import { botSentMessageIds } from './queue.js';
import { useInsForgeAuthState } from '../services/insforge-auth.js';

let sock: any = null;
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
// Keep persistent path on non-Vercel platforms (e.g., Render with persistent disk, Docker, VPS)
export const authFolder = process.env.SESSION_PATH || (isVercel ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info'));

let botStarting = false;
let lastUserActivityTime = 0;
let retryCount = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let currentSaveCreds: (() => Promise<void>) | null = null;
let currentRemoveCreds: (() => Promise<void>) | null = null;

export function getSock() {
    return sock;
}

export function isUserActive() {
    return Date.now() - lastUserActivityTime < 5 * 60 * 1000;
}

export function getCreds() {
    return null; // Deprecated: session stored in MongoDB
}

export function setCreds(credsData: string) {
    // Deprecated: session stored in MongoDB
}

export async function startWhatsAppBot() {
  if (sock || botStarting) return;
  botStarting = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  try {
    // Generate a unique session ID based on environment to prevent local dev vs Render collision
const sessionId = process.env.RENDER ? 'whatsapp_session_render_prod' : 'whatsapp_session_local_dev';
    const { state, saveCreds, removeCreds } = await useInsForgeAuthState(sessionId);
    currentSaveCreds = saveCreds;
    currentRemoveCreds = removeCreds;

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    emitLog(`Using WA v${version.join('.')}, isLatest: ${isLatest}`, 'info');

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
      auth: state,
      browser: ['Tarik Bhai AI', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      syncFullHistory: true,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      getMessage: async (key: any) => {
          return { conversation: 'Bot is running...' };
      },
    });

    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
        } catch (err) {
            emitLog(`Failed to save credentials: ${err}`, 'error');
        }
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        emitLog('QR Code received, waiting for scan...', 'info');
        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          emitQR(qrDataURL);
          emitStatus('qr_ready');
        } catch (err) {
          emitLog('Failed to generate QR code', 'error');
        }
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error as any;
        const statusCode = error?.output?.statusCode;
        
        let shouldReconnect = true;
        let shouldClearSession = false;
        let reason = 'unknown';

        if (statusCode === DisconnectReason.loggedOut) {
            shouldReconnect = false;
            shouldClearSession = true;
            reason = 'Logged Out';
        } else if (statusCode === DisconnectReason.badSession) {
            shouldReconnect = false;
            shouldClearSession = true;
            reason = 'Bad Session';
        } else if (statusCode === DisconnectReason.connectionClosed) {
            reason = 'Connection Closed';
        } else if (statusCode === DisconnectReason.connectionLost) {
            reason = 'Connection Lost';
        } else if (statusCode === DisconnectReason.connectionReplaced) {
            reason = 'Connection Replaced (Opened elsewhere)';
            // Bump retry count so it waits longer
            retryCount = Math.max(retryCount, 3);
        } else if (statusCode === DisconnectReason.restartRequired) {
            reason = 'Restart Required';
        } else if (statusCode === DisconnectReason.timedOut) {
            reason = 'Connection Timed Out';
        } else if (statusCode === DisconnectReason.multideviceMismatch) {
            shouldReconnect = false;
            shouldClearSession = true;
            reason = 'Multi-device Mismatch';
        } else {
            reason = `Unknown Disconnect (${statusCode})`;
        }
        
        emitLog(`Connection closed: ${reason}. Reconnecting: ${shouldReconnect}`, 'warn');
        emitStatus('disconnected', reason);
        
        // Clean up socket instance safely
        try {
            sock?.ev?.removeAllListeners();
            sock?.ws?.close();
        } catch (e) {}
        sock = null;
        botStarting = false;

        if (shouldReconnect) {
          // Exponential backoff for reconnect (2s, 4s, 8s, up to 60s)
          retryCount++;
          const retryDelay = Math.min(Math.pow(2, retryCount) * 1000, 60000);
          emitLog(`Reconnecting in ${retryDelay/1000}s...`, 'info');
          reconnectTimeout = setTimeout(startWhatsAppBot, retryDelay);
        } else if (shouldClearSession) {
          emitLog('Session invalid or logged out by user. Generating new QR...', 'error');
          retryCount = 0; // reset
          if (currentRemoveCreds) {
              try { await currentRemoveCreds(); } catch (e) {}
          }
          if (fs.existsSync(authFolder)) {
              try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
          }
          if (isVercel) {
              const io = getIo();
              if (io) io.emit('creds_update', '');
          }
          reconnectTimeout = setTimeout(startWhatsAppBot, 2000);
        } else {
          emitLog(`Bot stopped: ${reason}. Will not reconnect automatically.`, 'warn');
          retryCount = 0;
        }
      } else if (connection === 'open') {
        retryCount = 0; // Reset retry count on successful connection
        emitLog('WhatsApp connected successfully!', 'info');
        emitStatus('connected');
        emitQR('');
        if (isVercel) {
            const credsString = getCreds();
            if (credsString) {
                const io = getIo();
                if (io) io.emit('creds_update', credsString);
            }
        }
      }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            await handleIncomingMessage(sock, msg);
          } else {
            if (msg.key.id && !botSentMessageIds.has(msg.key.id)) {
                lastUserActivityTime = Date.now();
            }
          }
        }
      }
    });

    sock.ev.on('messages.update', (updates: any) => {
        for (const update of updates) {
            if (update.update?.status) {
                const statusMap: any = { 1: 'PENDING', 2: 'SERVER_ACK', 3: 'DELIVERY_ACK', 4: 'READ', 5: 'PLAYED', 6: 'ERROR' };
                const statusStr = statusMap[update.update.status] || update.update.status;
                if (botSentMessageIds.has(update.key.id)) {
                    emitLog(`[DELIVERY] Message ${update.key.id} status updated to: ${statusStr} for ${update.key.remoteJid}`, 'info');
                } else {
                    emitLog(`[DELIVERY_UNTRACKED] Message ${update.key.id} status: ${statusStr} for ${update.key.remoteJid}`, 'info');
                }
            }
        }
    });

    botStarting = false;
  } catch (err: any) {
    botStarting = false;
    emitLog(`Failed to start WhatsApp bot: ${err.message}`, 'error');
    // Auto retry after delay
    retryCount++;
    const retryDelay = Math.min(Math.pow(2, retryCount) * 1000, 60000);
    reconnectTimeout = setTimeout(startWhatsAppBot, retryDelay);
  }
}

export async function logoutWhatsAppBot() {
    await stopWhatsAppBot();
    if (currentRemoveCreds) {
        try {
            await currentRemoveCreds();
        } catch (e) {}
    }
}

export async function stopWhatsAppBot() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  if (currentSaveCreds) {
      try {
          await currentSaveCreds();
      } catch (e) {}
  }

  if (sock) {
    try {
        sock.ev.removeAllListeners();
        sock.ws?.close();
        sock.end(undefined);
    } catch(e) {}
    sock = null;
  }
  botStarting = false;
}

