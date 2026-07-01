import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { emitLog, emitTgStatus, emitTgQR, clearTgQR, getIo } from '../services/socket.js';
import { getConfig, getSystemPrompt } from '../services/config.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { telegramQueue } from './telegramQueue.js';
import QRCode from 'qrcode';
import { insforge } from '../services/insforge.js';

let client: TelegramClient | null = null;
const processedMessages = new Set<number>();
const MAX_PROCESSED = 1000;

const apiId = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

let tgSessionString = '';

export async function getTgCreds(): Promise<boolean> {
    try {
        const sessionId = 'default_tg_session';
        const { data, error } = await insforge.database
            .from('whatsapp_sessions')
            .select('data')
            .eq('session_id', sessionId)
            .eq('key', 'session_string')
            .single();
            
        if (data && data.data) {
            tgSessionString = data.data;
            return true;
        }
    } catch (e) {}
    return false;
}

export async function clearTgCreds() {
    tgSessionString = '';
    const sessionId = 'default_tg_session';
    try {
        await insforge.database
            .from('whatsapp_sessions')
            .delete()
            .eq('session_id', sessionId);
    } catch(e) {}
}

async function loadSession(): Promise<string> {
    await getTgCreds();
    return tgSessionString;
}

async function saveSession(sessionString: string) {
    tgSessionString = sessionString;
    const sessionId = 'default_tg_session';
    try {
        await insforge.database
            .from('whatsapp_sessions')
            .upsert([{ session_id: sessionId, key: 'session_string', data: sessionString }], { onConflict: 'session_id,key' });
    } catch(e) {}
}

export async function startTelegramBot() {
    const config = getConfig();
    
    if (!config.telegramEnabled) {
        emitLog('Telegram bot is disabled.', 'info');
        emitTgStatus('disconnected');
        return;
    }

    if (client) {
        emitLog('Telegram client is already running.', 'info');
        return;
    }

    try {
        const sessionString = await loadSession();
        const stringSession = new StringSession(sessionString);
        
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });

        await client.connect();
        const isAuth = await client.checkAuthorization();

        if (!isAuth) {
            emitLog('Telegram requires authentication. Generating QR code...', 'info');
            emitTgStatus('awaiting_auth');
            
            client.signInUserWithQrCode(
                { apiId, apiHash },
                {
                    onError: async (err) => {
                        emitLog(`Telegram QR Auth Error: ${err.message}`, 'error');
                        emitTgStatus('disconnected', err.message);
                        return true;
                    },
                    qrCode: async (qr) => {
                        const tokenString = qr.token.toString('base64url');
                        const qrUrl = `tg://login?token=${tokenString}`;
                        try {
                            const qrDataURL = await QRCode.toDataURL(qrUrl);
                            emitTgQR(qrDataURL, qrUrl);
                            emitLog('Telegram QR code generated.', 'info');
                        } catch(e) {
                            emitLog('Failed to generate Telegram QR', 'error');
                        }
                    },
                    password: async (hint) => {
                        const cfg = getConfig();
                        if (cfg.telegramPassword) {
                            emitLog('Providing Telegram 2FA password...', 'info');
                            return cfg.telegramPassword;
                        }
                        emitLog(`Telegram requires 2FA Password (Hint: ${hint || 'none'}). Please configure in Settings.`, 'warn');
                        throw new Error('2FA password required but not configured.');
                    }
                }
            ).then(() => {
                emitLog('Telegram logged in successfully via QR!', 'info');
                saveSession(client!.session.save() as unknown as string);
                clearTgQR();
                emitTgStatus('connected');
                setupMessageHandler();
            }).catch(err => {
                emitLog(`Telegram Auth failed: ${err.message}`, 'error');
                clearTgQR();
                emitTgStatus('disconnected', err.message);
                client = null;
            });

        } else {
            emitLog('Connecting Telegram client...', 'info');
            emitLog('Telegram bot started successfully!', 'info');
            emitTgStatus('connected');
            setupMessageHandler();
        }

    } catch (err: any) {
        emitLog(`Failed to start Telegram client: ${err.message}`, 'error');
        clearTgQR();
        emitTgStatus('disconnected', err.message);
        client = null;
    }
}

function setupMessageHandler() {
    if (!client) return;

    client.addEventHandler(async (event: any) => {
        try {
            const msg = event.message;
            if (!msg) return;

            const messageId = msg.id;
            if (processedMessages.has(messageId)) {
                return; // Ignore duplicate
            }
            
            processedMessages.add(messageId);
            if (processedMessages.size > MAX_PROCESSED) {
                const toRemove = Array.from(processedMessages).slice(0, 100);
                toRemove.forEach(id => processedMessages.delete(id));
            }

            const currentConfig = getConfig();
            if (!currentConfig.telegramEnabled) return;

            const isGroup = msg.isGroup;
            if (isGroup && !currentConfig.replyToGroups) return;
            if (!isGroup && !currentConfig.replyToPrivate) return;

            const sender = await msg.getSender();
            const senderNumber = sender?.username || sender?.id?.toString() || 'unknown';
            
            if (currentConfig.allowedNumbers.length > 0 && !currentConfig.allowedNumbers.includes(senderNumber)) {
                return;
            }
            if (currentConfig.blockedNumbers.includes(senderNumber)) {
                return;
            }

            // Check active hours
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const [startHour, startMin] = currentConfig.activeHoursStart.split(':').map(Number);
            const [endHour, endMin] = currentConfig.activeHoursEnd.split(':').map(Number);
            
            const currentMins = currentHour * 60 + currentMinute;
            const startMins = startHour * 60 + startMin;
            const endMins = endHour * 60 + endMin;

            if (startMins < endMins) {
                if (currentMins < startMins || currentMins > endMins) return;
            } else {
                if (currentMins < startMins && currentMins > endMins) return;
            }

            const textMessage = msg.text || msg.message;
            const isMedia = !!msg.media;
            const chatId = msg.chatId.toString();
            
            if (textMessage) {
                const text = textMessage.trim();
                if (text === '!ping') {
                    await telegramQueue.enqueue(chatId, 'Pong! 🏓 Bot is active.', { replyTo: msg.id });
                    return;
                } else if (text === '!clear') {
                    try {
                        await insforge.database.from('ai_memory').delete().eq('user_id', `tg-${chatId}`);
                        await telegramQueue.enqueue(chatId, 'Memory cleared for this chat. 🧹', { replyTo: msg.id });
                    } catch(e) {
                        await telegramQueue.enqueue(chatId, 'Failed to clear memory.', { replyTo: msg.id });
                    }
                    return;
                }
            }

            if (!textMessage && !isMedia) {
                return;
            }

            emitLog(`Received Telegram message from ${senderNumber}: ${textMessage || '[Media]'}`, 'info');

            if (currentConfig.replyDelayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, currentConfig.replyDelayMs));
            }

            const finalInstruction = getSystemPrompt(senderNumber);
            
            let overrideMedia;
            if (isMedia && client) {
                try {
                    const buffer = await client.downloadMedia(msg);
                    if (buffer) {
                        let mimeType = 'application/octet-stream';
                        if (msg.photo) mimeType = 'image/jpeg';
                        else if (msg.video) mimeType = 'video/mp4';
                        else if (msg.audio) mimeType = 'audio/mp3';
                        else if (msg.document) mimeType = msg.document.mimeType || mimeType;

                        overrideMedia = {
                            data: buffer.toString('base64'),
                            mimeType
                        };
                    }
                } catch (e) {
                    emitLog('Error downloading Telegram media', 'error');
                }
            }
            
            const dummyWaMessage = {};
            
            const replyText = await processMessageWithGemini(`tg-${chatId}`, textMessage || '', dummyWaMessage, finalInstruction, overrideMedia);

            if (replyText) {
                await telegramQueue.enqueue(chatId, replyText, { replyTo: msg.id });
                emitLog(`Replied to ${senderNumber} on Telegram via Queue`, 'info');
            }

        } catch (error: any) {
            emitLog(`Error handling Telegram message: ${error.message}`, 'error');
        }
    }, new NewMessage({}));
}

export async function stopTelegramBot() {
    if (client) {
        await client.disconnect();
        client = null;
        emitLog('Telegram bot stopped.', 'info');
        emitTgStatus('disconnected');
    }
}

export function getTelegramBot() {
    return client;
}
