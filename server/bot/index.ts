import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { emitStatus, emitLog, emitQR } from '../services/socket.js';
import { handleIncomingMessage } from './handler.js';
import fs from 'fs';
import path from 'path';

let sock: any = null;
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL;
const authFolder = isVercel ? '/tmp/baileys_auth_info' : path.join(process.cwd(), 'baileys_auth_info');

let botStarting = false;

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
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);

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
        setTimeout(startWhatsAppBot, 2000);
      } else {
        emitLog('Logged out. Generating new QR...', 'error');
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
        }
        setTimeout(startWhatsAppBot, 2000);
      }
    } else if (connection === 'open') {
      emitLog('WhatsApp connected successfully!', 'info');
      emitStatus('connected');
      emitQR('');
    }
  });

  sock.ev.on('messages.upsert', async (m: any) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        if (!msg.key.fromMe) {
          await handleIncomingMessage(sock, msg);
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
