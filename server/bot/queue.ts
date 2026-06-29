import { AnyMessageContent, proto } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { getSock } from './index.js';

interface QueueItem {
    jid: string;
    message: AnyMessageContent;
    options?: { quoted?: proto.IWebMessageInfo };
    retries: number;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

class MessageQueue {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private messagesSentLastMinute = 0;
    private messagesSentLastHour = 0;
    private lastMinuteReset = Date.now();
    private lastHourReset = Date.now();

    // Configurable limits from env or defaults
    private get limits() {
        return {
            perMinute: parseInt(process.env.WA_MAX_MSG_PER_MINUTE || '20', 10),
            perHour: parseInt(process.env.WA_MAX_MSG_PER_HOUR || '500', 10),
            baseDelayMs: parseInt(process.env.WA_BASE_DELAY_MS || '1500', 10),
            randomDelayMs: parseInt(process.env.WA_RANDOM_DELAY_MS || '2000', 10),
        };
    }

    public async enqueue(jid: string, message: AnyMessageContent, options?: { quoted?: proto.IWebMessageInfo }): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                jid,
                message,
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
            const sock = getSock();
            if (!sock) {
                emitLog(`Socket not available, waiting...`, 'warn');
                await this.delay(3000);
                continue;
            }

            this.checkRateLimits();

            if (this.messagesSentLastMinute >= this.limits.perMinute || this.messagesSentLastHour >= this.limits.perHour) {
                emitLog(`Rate limit reached. Pausing message queue.`, 'warn');
                await this.delay(5000); // Wait 5 seconds before checking again
                continue;
            }

            const item = this.queue.shift();
            if (!item) continue;

            try {
                // Human-like delay before sending
                const delayMs = this.limits.baseDelayMs + Math.random() * this.limits.randomDelayMs;
                await this.delay(delayMs);

                // Send typing indicator
                try {
                    await sock.sendPresenceUpdate('composing', item.jid);
                    // Slight delay while "typing"
                    await this.delay(1000 + Math.random() * 1000);
                    await sock.sendPresenceUpdate('paused', item.jid);
                } catch (e) {
                    // Ignore presence errors to avoid blocking sends
                }

                const result = await sock.sendMessage(item.jid, item.message, item.options);
                
                this.messagesSentLastMinute++;
                this.messagesSentLastHour++;
                
                item.resolve(result);
            } catch (error: any) {
                emitLog(`Failed to send message to ${item.jid}: ${error.message}`, 'error');
                
                if (item.retries < 3) {
                    item.retries++;
                    const backoffDelay = Math.pow(2, item.retries) * 1000;
                    emitLog(`Retrying message to ${item.jid} in ${backoffDelay}ms (Attempt ${item.retries})`, 'warn');
                    await this.delay(backoffDelay);
                    this.queue.unshift(item); // Put it back at the front
                } else {
                    emitLog(`Dropped message to ${item.jid} after 3 failed attempts`, 'error');
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

export const messageQueue = new MessageQueue();
