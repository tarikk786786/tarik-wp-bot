import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { emitStatus, emitLog, emitQR, getIo } from '../services/socket.js';
import { handleIncomingMessage } from './handler.js';
import fs from 'fs';
import path from 'path';

let sock: any = null;
const isStateless = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || process.env.RENDER === '1' || process.env.RENDER === 'true' || process.env.RENDER;
const authFolder = isStateless ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info');

let botStarting = false;
let lastUserActivityTime = 0;

export function isUserActive() {
    return Date.now() - lastUserActivityTime < 5 * 60 * 1000;
}

export function getCreds() {
    if (!fs.existsSync(authFolder)) return null;
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
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  
  emitLog(`using WA v${version.join('.')}, isLatest: ${isLatest}`, 'info');

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
    auth: state,
    browser: ['Tarik Bhai AI', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    keepAliveIntervalMs: 20000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 1000,
    getMessage: async (key: any) => {
        return { conversation: 'Bot is running...' };
    },
  });

  sock.ev.on('creds.update', async () => {
      await saveCreds();
      // On update, if in Vercel/Render, emit the creds so the client can save them
      if (isStateless) {
          const credsString = getCreds();
          if (credsString) {
              const io = getIo();
              if (io) io.emit('creds_update', credsString);
          }
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
      const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      emitLog(`Connection closed. Reconnecting: ${shouldReconnect}`, 'warn');
      emitStatus('disconnected');
      
      if (shouldReconnect) {
        sock = null;
        setTimeout(startWhatsAppBot, 2000);
      } else {
        emitLog('Logged out. Generating new QR...', 'error');
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
        if (isStateless) {
            const io = getIo();
            if (io) io.emit('creds_update', '');
        }
        sock = null;
        setTimeout(startWhatsAppBot, 2000);
      }
    } else if (connection === 'open') {
      emitLog('WhatsApp connected successfully!', 'info');
      emitStatus('connected');
      emitQR('');
      if (isStateless) {
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
} catch (err) {
  botStarting = false;
  emitLog('Failed to start WhatsApp bot: ' + String(err), 'error');
}
}

export function stopWhatsAppBot() {
  if (sock) {
    sock.logout();
    sock = null;
  }
}
