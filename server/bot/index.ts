import { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import { emitStatus, emitLog, emitQR } from '../services/socket.js';
import { whatsappAuthDir } from '../services/runtime.js';
import { handleIncomingMessage } from './handler.js';
import { envNumber, errorStatus, shouldPauseConnection } from './safety.js';

let sock: ReturnType<typeof makeWASocket> | null = null;
let startPromise: Promise<void> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let generation = 0;
let retryCount = 0;
let lastUserActivityTime = 0;
let lastQr = '';

export function getSock() { return sock; }
export function isUserActive() { return Date.now() - lastUserActivityTime < 5 * 60 * 1000; }

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(run: number, delayMs: number) {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (run === generation) void startWhatsAppBot();
  }, delayMs);
  reconnectTimer.unref();
}

export async function clearWhatsAppAuth() {
  await stopWhatsAppBot();
  await fs.promises.rm(whatsappAuthDir, { recursive: true, force: true });
  emitQR('');
  emitStatus('disconnected');
}

async function connect(run: number) {
  fs.mkdirSync(whatsappAuthDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(whatsappAuthDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  if (run !== generation) return;
  emitLog(`Using WhatsApp v${version.join('.')} (latest: ${isLatest})`);

  const socket = makeWASocket({
    version,
    logger: pino({ level: process.env.LOG_LEVEL || 'silent' }) as any,
    printQRInTerminal: false,
    auth: state,
    browser: ['Tarik Bhai AI', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    getMessage: async () => undefined,
  });
  sock = socket;

  socket.ev.on('creds.update', () => {
    void saveCreds().catch((error) => emitLog(`Failed to save WhatsApp credentials: ${error.message}`, 'error'));
  });

  socket.ev.on('connection.update', (update) => {
    if (run !== generation) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr && qr !== lastQr) {
      lastQr = qr;
      void QRCode.toDataURL(qr).then((data) => {
        if (run === generation) {
          emitQR(data);
          emitStatus('qr_ready');
        }
      }).catch(() => emitLog('Failed to generate WhatsApp QR code', 'error'));
    }

    if (connection === 'open') {
      retryCount = 0;
      lastQr = '';
      emitQR('');
      emitStatus('connected');
      emitLog('WhatsApp connected successfully');
      return;
    }
    if (connection !== 'close') return;

    (socket.ev as any).removeAllListeners();
    if (sock === socket) sock = null;
    const error = lastDisconnect?.error as any;
    const statusCode = error?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    emitStatus('disconnected');
    emitLog(`WhatsApp connection closed (${statusCode || 'unknown'}): ${error?.message || 'unknown'}`, 'warn');

    if (shouldPauseConnection(statusCode)) {
      retryCount = 0;
      emitStatus('paused', { reason: statusCode });
      emitLog('WhatsApp reconnect paused to protect the account. Check the phone/account before using Restart.', 'error');
    } else if (loggedOut) {
      retryCount = 0;
      emitStatus('paused', { reason: statusCode });
      emitLog('WhatsApp logged out. Authentication was cleared; use Restart when the account is ready to link again.', 'error');
      void fs.promises.rm(whatsappAuthDir, { recursive: true, force: true });
    } else {
      retryCount += 1;
      const maximum = envNumber('WA_MAX_RECONNECT_ATTEMPTS', 6, 1, 20);
      if (retryCount > maximum) {
        emitStatus('paused', { reason: 'reconnect_limit' });
        emitLog(`WhatsApp reconnect paused after ${maximum} failures. Use Restart after checking account status and network.`, 'error');
        return;
      }
      const backoff = Math.min(1_000 * 2 ** Math.min(retryCount, 5), 30_000);
      scheduleReconnect(run, backoff + Math.floor(Math.random() * 1_000));
    }
  });

  socket.ev.on('messages.upsert', ({ type, messages }) => {
    if (run !== generation || type !== 'notify') return;
    for (const message of messages) {
      if (message.key.fromMe) lastUserActivityTime = Date.now();
      else void handleIncomingMessage(socket, message);
    }
  });
}

export function startWhatsAppBot() {
  if (sock) return Promise.resolve();
  if (startPromise) return startPromise;
  const run = ++generation;
  clearReconnectTimer();
  emitStatus('initializing');
  const pending = connect(run).catch((error) => {
    if (run !== generation) return;
    const status = errorStatus(error);
    if (shouldPauseConnection(status) || status === DisconnectReason.loggedOut) {
      emitStatus('paused', { reason: status });
      emitLog(`WhatsApp startup paused after a non-retryable error (${status || 'unknown'}).`, 'error');
      return;
    }
    retryCount += 1;
    emitStatus('disconnected');
    emitLog(`Failed to start WhatsApp bot: ${error.message}`, 'error');
    scheduleReconnect(run, Math.min(5_000 * retryCount, 60_000));
  }).finally(() => {
    if (startPromise === pending) startPromise = null;
  });
  startPromise = pending;
  return startPromise;
}

export async function stopWhatsAppBot() {
  generation += 1;
  clearReconnectTimer();
  const socket = sock;
  sock = null;
  if (socket) {
    (socket.ev as any).removeAllListeners();
    try { socket.end(undefined); } catch {}
  }
  emitStatus('disconnected');
}
