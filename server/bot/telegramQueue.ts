import { emitLog } from '../services/socket.js';
import { getTelegramBot } from './telegram.js';

interface QueueItem {
  chatId: string;
  text: string;
  replyTo?: number;
  retries: number;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const numberFromEnv = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};

class TelegramQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private sentMinute = 0;
  private sentHour = 0;
  private minuteReset = Date.now();
  private hourReset = Date.now();

  enqueue(chatId: string, text: string, options?: { replyTo?: number }) {
    if (this.queue.length >= 500) return Promise.reject(new Error('Telegram message queue is full'));
    return new Promise((resolve, reject) => {
      this.queue.push({ chatId, text: text.slice(0, 4096), replyTo: options?.replyTo, retries: 0, resolve, reject });
      void this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        this.resetCounters();
        const perMinute = numberFromEnv('TG_MAX_MSG_PER_MINUTE', 30, 1, 100);
        const perHour = numberFromEnv('TG_MAX_MSG_PER_HOUR', 1_000, 1, 5_000);
        if (this.sentMinute >= perMinute || this.sentHour >= perHour) {
          await this.delay(1_000);
          continue;
        }
        const client = getTelegramBot();
        if (!client) {
          await this.delay(1_000);
          continue;
        }
        const item = this.queue.shift()!;
        try {
          const base = numberFromEnv('TG_BASE_DELAY_MS', 1_000, 0, 60_000);
          const random = numberFromEnv('TG_RANDOM_DELAY_MS', 1_500, 0, 60_000);
          await this.delay(base + Math.random() * random);
          const result = await client.sendMessage(item.chatId, { message: item.text, replyTo: item.replyTo });
          this.sentMinute += 1;
          this.sentHour += 1;
          item.resolve(result);
        } catch (error) {
          if (item.retries++ < 3) {
            await this.delay(1_000 * 2 ** item.retries);
            this.queue.unshift(item);
          } else {
            emitLog('Telegram send failed after retries: ' + (error instanceof Error ? error.message : error), 'error');
            item.reject(error);
          }
        }
      }
    } finally {
      this.processing = false;
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

export const telegramQueue = new TelegramQueue();
