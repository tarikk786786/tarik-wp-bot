import { AnyMessageContent, proto } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { getSock } from './index.js';

interface QueueItem {
  jid: string;
  message: AnyMessageContent;
  options?: { quoted?: proto.IWebMessageInfo };
  retries: number;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const numberFromEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

class MessageQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private sentMinute = 0;
  private sentHour = 0;
  private minuteReset = Date.now();
  private hourReset = Date.now();

  private get limits() {
    return {
      perMinute: numberFromEnv('WA_MAX_MSG_PER_MINUTE', 20, 1, 100),
      perHour: numberFromEnv('WA_MAX_MSG_PER_HOUR', 500, 1, 5_000),
      baseDelayMs: numberFromEnv('WA_BASE_DELAY_MS', 1_500, 0, 60_000),
      randomDelayMs: numberFromEnv('WA_RANDOM_DELAY_MS', 2_000, 0, 60_000),
    };
  }

  enqueue(jid: string, message: AnyMessageContent, options?: { quoted?: proto.IWebMessageInfo }) {
    if (this.queue.length >= 500) return Promise.reject(new Error('WhatsApp message queue is full'));
    return new Promise((resolve, reject) => {
      this.queue.push({ jid, message, options, retries: 0, resolve, reject });
      void this.process();
    });
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.queue.length) {
        this.resetCounters();
        if (this.sentMinute >= this.limits.perMinute || this.sentHour >= this.limits.perHour) {
          await this.delay(1_000);
          continue;
        }
        const socket = getSock();
        if (!socket) {
          await this.delay(1_000);
          continue;
        }
        const item = this.queue.shift()!;
        try {
          await this.delay(this.limits.baseDelayMs + Math.random() * this.limits.randomDelayMs);
          try {
            await socket.sendPresenceUpdate('composing', item.jid);
            await this.delay(500 + Math.random() * 1_000);
            await socket.sendPresenceUpdate('paused', item.jid);
          } catch {}
          const result = await socket.sendMessage(item.jid, item.message, item.options);
          this.sentMinute += 1;
          this.sentHour += 1;
          item.resolve(result);
        } catch (error) {
          if (item.retries++ < 3) {
            await this.delay(1_000 * 2 ** item.retries);
            this.queue.unshift(item);
          } else {
            emitLog('WhatsApp send failed after retries: ' + (error instanceof Error ? error.message : error), 'error');
            item.reject(error);
          }
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length) void this.process();
    }
  }

  private resetCounters() {
    const now = Date.now();
    if (now - this.minuteReset >= 60_000) { this.sentMinute = 0; this.minuteReset = now; }
    if (now - this.hourReset >= 3_600_000) { this.sentHour = 0; this.hourReset = now; }
  }

  private delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
}

export const messageQueue = new MessageQueue();
