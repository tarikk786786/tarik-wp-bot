import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { emitStatus, emitLog, emitQR, getIo } from '../services/socket.js';
import { handleIncomingMessage } from './handler.js';
import fs from 'fs';
import path from 'path';
import { initStorage, backupSession, restoreSession, sessionExistsOnGCS, deleteExpiredBackups } from '../services/storage.js';

let sock: any = null;
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
// Keep persistent path on non-Vercel platforms (e.g., Render with persistent disk, Docker, VPS)
export const authFolder = process.env.SESSION_PATH || (isVercel ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info'));

let botStarting = false;
let lastUserActivityTime = 0;
let retryCount = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let currentSaveCreds: (() => Promise<void>) | null = null;
let storageInitialized = false;

export function getSock() {
    return sock;
}

export function isUserActive() {
    return Date.now() - lastUserActivityTime < 5 * 60 * 1000;
}

export function getCreds() {
    if (!fs.existsSync(authFolder)) return null;
    try {
        const files = fs.readdirSync(authFolder);
        const state: any = {};
        let hasCreds = false;
        for (const file of files) {
            if (file.endsWith('.json')) {
                state[file] = fs.readFileSync(path.join(authFolder, file), 'utf8');
                if (file === 'creds.json') hasCreds = true;
            }
        }
        return hasCreds ? JSON.stringify(state) : null;
    } catch (e) {
        return null;
    }
}

export function setCreds(credsData: string) {
    if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
    }
    try {
        const state = JSON.parse(credsData);
        for (const file in state) {
            fs.writeFileSync(path.join(authFolder, file), state[file]);
        }
    } catch (e) {
        console.error('Failed to parse creds', e);
    }
}

export async function startWhatsAppBot() {
  if (sock || botStarting) return;
  botStarting = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  try {
    if (!storageInitialized) {
        initStorage();
        storageInitialized = true;
    }

    // Check if we need to restore from GCS
    if (!fs.existsSync(authFolder) || fs.readdirSync(authFolder).length === 0) {
        if (await sessionExistsOnGCS()) {
            await restoreSession(authFolder);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    currentSaveCreds = saveCreds;

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    emitLog(`Using WA v${version.join('.')}, isLatest: ${isLatest}`, 'info');

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
      auth: state,
      browser: ['Tarik Bhai AI', 'Chrome', '1.0.0'],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      getMessage: async () => {
          return { conversation: 'Bot is running...' };
      },
    });

    sock.ev.on('creds.update', async () => {
        try {
            await saveCreds();
            // Backup session to GCS in the background without blocking
            backupSession(authFolder).catch(e => {
                emitLog(`GCS Backup failed in background: ${e.message}`, 'error');
            });

            // On update, if in Vercel, emit the creds so the client can save them
            if (isVercel) {
                const credsString = getCreds();
                if (credsString) {
                    const io = getIo();
                    if (io) io.emit('creds_update', credsString);
                }
            }
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
        let reason = 'unknown';

        if (statusCode === DisconnectReason.loggedOut) {
            shouldReconnect = false;
            reason = 'Logged Out';
        } else if (statusCode === DisconnectReason.badSession) {
            shouldReconnect = false;
            reason = 'Bad Session';
        } else if (statusCode === DisconnectReason.connectionClosed) {
            reason = 'Connection Closed';
        } else if (statusCode === DisconnectReason.connectionLost) {
            reason = 'Connection Lost';
        } else if (statusCode === DisconnectReason.connectionReplaced) {
            reason = 'Connection Replaced (Opened elsewhere)';
        } else if (statusCode === DisconnectReason.restartRequired) {
            reason = 'Restart Required';
        } else if (statusCode === DisconnectReason.multideviceMismatch) {
            shouldReconnect = false;
            reason = 'Multi-device Mismatch';
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
        } else {
          emitLog('Session invalid or logged out by user. Generating new QR...', 'error');
          retryCount = 0; // reset
          if (fs.existsSync(authFolder)) {
              try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) {}
          }
          if (isVercel) {
              const io = getIo();
              if (io) io.emit('creds_update', '');
          }
          reconnectTimeout = setTimeout(startWhatsAppBot, 2000);
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
            lastUserActivityTime = Date.now();
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

  // Final backup before stop
  try {
      await backupSession(authFolder);
  } catch(e) {}

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

