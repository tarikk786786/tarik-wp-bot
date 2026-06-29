import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { emitStatus, emitLog, emitQR, setConnectedNumber, setLastLoginTime } from '../services/socket.js';
import { handleIncomingMessage } from './handler.js';
import fs from 'fs';
import path from 'path';

const AUTH_FOLDER = path.join(process.cwd(), 'baileys_auth_info');

let sock: WASocket | null = null;
let isStarting = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 2000;

function getReconnectDelay(): number {
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 60000);
  return delay + Math.random() * 1000;
}

function validateAuthFolder(): boolean {
  try {
    const credsPath = path.join(AUTH_FOLDER, 'creds.json');
    if (!fs.existsSync(credsPath)) return true;
    const data = fs.readFileSync(credsPath, 'utf8');
    JSON.parse(data);
    return true;
  } catch (e) {
    emitLog('⚠️ Corrupted auth files detected. Cleaning up...', 'warning');
    try {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    } catch (_) {}
    return true;
  }
}

function destroySocket() {
  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.ws.close();
    } catch (_) {}
    sock = null;
  }
}

export async function startWhatsAppBot(): Promise<void> {
  if (isStarting || sock) {
    emitLog('Bot already running or starting, skipping duplicate init.', 'system');
    return;
  }

  isStarting = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  try {
    validateAuthFolder();
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    emitLog(`🔌 Connecting with WA v${version.join('.')}, isLatest: ${isLatest}`, 'whatsapp');
    emitStatus('connecting');

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: false,
      auth: state,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update as any;

      if (qr) {
        emitLog('📱 QR Code generated — scan with WhatsApp', 'whatsapp');
        try {
          const qrDataURL = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          emitQR(qrDataURL);
          emitStatus('qr_ready');
        } catch (err: any) {
          emitLog(`QR generation failed: ${err.message}`, 'error');
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        emitLog(`🔴 Connection closed (code: ${statusCode || 'unknown'}). Will reconnect: ${shouldReconnect}`, 'warning');
        emitStatus('disconnected');
        emitQR('');

        destroySocket();
        isStarting = false;

        if (shouldReconnect) {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            const delay = getReconnectDelay();
            emitLog(`🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay / 1000)}s...`, 'system');
            reconnectTimer = setTimeout(startWhatsAppBot, delay);
          } else {
            emitLog('❌ Max reconnect attempts reached. Please restart manually.', 'error');
            emitStatus('failed');
          }
        } else {
          emitLog('🚪 Logged out by user. Clearing session...', 'warning');
          try { fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch (_) {}
          reconnectAttempts = 0;
          reconnectTimer = setTimeout(startWhatsAppBot, 3000);
        }
      } else if (connection === 'open') {
        reconnectAttempts = 0;
        const user = (sock as any)?.user;
        const phoneNumber = user?.id?.split(':')[0] || user?.id?.split('@')[0] || 'Unknown';
        const loginTime = new Date().toISOString();

        setConnectedNumber(phoneNumber);
        setLastLoginTime(loginTime);
        emitLog(`✅ WhatsApp connected! Number: ${phoneNumber}`, 'success');
        emitStatus('connected');
        emitQR('');
      }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (!msg.key.fromMe) {
            await handleIncomingMessage(sock!, msg);
          }
        }
      }
    });

    isStarting = false;
  } catch (err: any) {
    isStarting = false;
    destroySocket();
    emitLog(`❌ Failed to start WhatsApp bot: ${err.message}`, 'error');

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = getReconnectDelay();
      emitLog(`🔄 Retrying in ${Math.round(delay / 1000)}s...`, 'system');
      reconnectTimer = setTimeout(startWhatsAppBot, delay);
    }
  }
}

export function stopWhatsAppBot() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;
  if (sock) {
    try { sock.logout(); } catch (_) {}
    destroySocket();
  }
  emitLog('🛑 WhatsApp bot stopped.', 'system');
}

export function resetSession() {
  stopWhatsAppBot();
  try { if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true }); } catch (_) {}
  emitLog('🗑️ Session cleared. Restarting...', 'warning');
  emitStatus('disconnected');
  setTimeout(startWhatsAppBot, 1000);
}

export function getSocketState(): string {
  if (!sock) return 'disconnected';
  try { return (sock.ws as any)?.readyState === 1 ? 'connected' : 'connecting'; } catch (_) { return 'unknown'; }
}
