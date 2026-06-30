import { AnyMessageContent, proto } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { getSock } from './index.js';

export const botSentMessageIds = new Set<string>();

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
                await this.delay(5000);
                continue;
            }

            const item = this.queue.shift();
            if (!item) continue;

            try {
                // Minimal delay to prevent socket spam
                await this.delay(200);

                // Send typing indicator quickly
                try {
                    await sock.sendPresenceUpdate('composing', item.jid);
                    await this.delay(300);
                    await sock.sendPresenceUpdate('paused', item.jid);
                } catch (e) {
                    emitLog(`Presence update failed for ${item.jid}, ignoring.`, 'warn');
                }

                emitLog(`[OUTBOUND] Preparing to send message to ${item.jid}...`, 'info');
                
                // --- STRICT PAYLOAD ENFORCEMENT ---
                // We MUST strip out any options if the JID is an LID to prevent encryption crashes.
                // In handler.ts we already pass `undefined` for options, but we double check here.
                let finalOptions = item.options;
                if (item.jid.endsWith('@lid')) {
                    finalOptions = undefined;
                    emitLog(`[OUTBOUND] LID detected, stripping all message options (no quoting allowed).`, 'info');
                }
                
                emitLog(`[OUTBOUND] Payload: ${JSON.stringify(item.message)}`, 'info');

                const sendStartTime = Date.now();
                const result = await sock.sendMessage(item.jid, item.message, finalOptions);
                const sendDuration = Date.now() - sendStartTime;
                
                emitLog(`[OUTBOUND SUCCESS] Message sent to ${item.jid} in ${sendDuration}ms. Result ID: ${result?.key?.id}`, 'info');
                
                if (result?.key?.id) {
                    botSentMessageIds.add(result.key.id);
                    if (botSentMessageIds.size > 1000) {
                        const toRemove = Array.from(botSentMessageIds).slice(0, 100);
                        toRemove.forEach(id => botSentMessageIds.delete(id));
                    }
                }

                this.messagesSentLastMinute++;
                this.messagesSentLastHour++;
                
                item.resolve(result);
            } catch (error: any) {
                emitLog(`[OUTBOUND ERROR] Failed to send message to ${item.jid}: ${error.message}\nStack: ${error.stack}`, 'error');
                
                if (item.retries < 3) {
                    item.retries++;
                    const backoffDelay = Math.pow(2, item.retries) * 1000;
                    emitLog(`[RETRY] Retrying message to ${item.jid} in ${backoffDelay}ms (Attempt ${item.retries}/3)`, 'warn');
                    await this.delay(backoffDelay);
                    this.queue.unshift(item); // Put it back at the front
                } else {
                    emitLog(`[OUTBOUND FATAL] Dropped message to ${item.jid} after 3 failed attempts.`, 'error');
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
