import TelegramBot from 'node-telegram-bot-api';
import { emitLog } from '../services/socket.js';
import { getTelegramBot } from './telegram.js';

interface TgQueueItem {
    chatId: number;
    text: string;
    options?: TelegramBot.SendMessageOptions;
    retries: number;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

class TelegramQueue {
    private queue: TgQueueItem[] = [];
    private isProcessing = false;
    private messagesSentLastMinute = 0;
    private messagesSentLastHour = 0;
    private lastMinuteReset = Date.now();
    private lastHourReset = Date.now();

    private get limits() {
        return {
            perMinute: parseInt(process.env.TG_MAX_MSG_PER_MINUTE || '30', 10),
            perHour: parseInt(process.env.TG_MAX_MSG_PER_HOUR || '1000', 10),
            baseDelayMs: parseInt(process.env.TG_BASE_DELAY_MS || '1000', 10),
            randomDelayMs: parseInt(process.env.TG_RANDOM_DELAY_MS || '1500', 10),
        };
    }

    public async enqueue(chatId: number, text: string, options?: TelegramBot.SendMessageOptions): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                chatId,
                text,
                options,
                retries: 0,
                resolve,
                reject
            });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const bot = getTelegramBot();
            if (!bot) {
                emitLog(`Telegram bot not available, waiting...`, 'warn');
                await this.delay(3000);
                continue;
            }

            this.checkRateLimits();

            if (this.messagesSentLastMinute >= this.limits.perMinute || this.messagesSentLastHour >= this.limits.perHour) {
                emitLog(`Telegram rate limit reached. Pausing message queue.`, 'warn');
                await this.delay(5000);
                continue;
            }

            const item = this.queue.shift();
            if (!item) continue;

            try {
                const delayMs = this.limits.baseDelayMs + Math.random() * this.limits.randomDelayMs;
                await this.delay(delayMs);

                try {
                    await bot.sendChatAction(item.chatId, 'typing');
                    await this.delay(1000 + Math.random() * 1000);
                } catch (e) {}

                const result = await bot.sendMessage(item.chatId, item.text, item.options);
                
                this.messagesSentLastMinute++;
                this.messagesSentLastHour++;
                
                item.resolve(result);
            } catch (error: any) {
                emitLog(`Failed to send Telegram message to ${item.chatId}: ${error.message}`, 'error');
                
                if (item.retries < 3) {
                    item.retries++;
                    const backoffDelay = Math.pow(2, item.retries) * 1000;
                    emitLog(`Retrying Telegram message to ${item.chatId} in ${backoffDelay}ms (Attempt ${item.retries})`, 'warn');
                    await this.delay(backoffDelay);
                    this.queue.unshift(item);
                } else {
                    emitLog(`Dropped Telegram message to ${item.chatId} after 3 failed attempts`, 'error');
                    item.reject(error);
                }
            }
        }

        this.isProcessing = false;
    }

    private checkRateLimits() {
        const now = Date.now();
        if (now - this.lastMinuteReset > 60000) {
            this.messagesSentLastMinute = 0;
            this.lastMinuteReset = now;
        }
        if (now - this.lastHourReset > 3600000) {
            this.messagesSentLastHour = 0;
            this.lastHourReset = now;
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const telegramQueue = new TelegramQueue();
