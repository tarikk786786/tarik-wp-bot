import TelegramBot from 'node-telegram-bot-api';
import { emitLog } from '../services/socket.js';
import { getConfig } from '../services/config.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { telegramQueue } from './telegramQueue.js';

let bot: TelegramBot | null = null;
const processedMessages = new Set<number>();
const MAX_PROCESSED = 1000;

async function downloadTelegramMedia(botInstance: TelegramBot, msg: TelegramBot.Message): Promise<{ data: string, mimeType: string } | undefined> {
    let fileId: string | undefined;
    let mimeType: string | undefined;

    if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1]; // highest res
        fileId = photo.file_id;
        mimeType = 'image/jpeg';
    } else if (msg.document) {
        fileId = msg.document.file_id;
        mimeType = msg.document.mime_type;
    } else if (msg.audio) {
        fileId = msg.audio.file_id;
        mimeType = msg.audio.mime_type;
    } else if (msg.video) {
        fileId = msg.video.file_id;
        mimeType = msg.video.mime_type;
    }

    if (!fileId) return undefined;

    try {
        const link = await botInstance.getFileLink(fileId);
        const response = await fetch(link);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return {
            data: buffer.toString('base64'),
            mimeType: (mimeType || 'application/octet-stream').split(';')[0]
        };
    } catch (error) {
        emitLog('Error downloading Telegram media', 'error');
        return undefined;
    }
}

export function startTelegramBot() {
    const config = getConfig();
    if (!config.telegramEnabled || !config.telegramBotToken) {
        emitLog('Telegram bot is disabled or missing token.', 'info');
        return;
    }

    if (bot) {
        emitLog('Telegram bot is already running.', 'info');
        return;
    }

    try {
        bot = new TelegramBot(config.telegramBotToken, { polling: true });

        emitLog('Telegram bot started successfully!', 'info');

        bot.on('message', async (msg) => {
            try {
                if (!msg.message_id) return;

                if (processedMessages.has(msg.message_id)) {
                    return; // Ignore duplicate
                }
                
                processedMessages.add(msg.message_id);
                if (processedMessages.size > MAX_PROCESSED) {
                    const toRemove = Array.from(processedMessages).slice(0, 100);
                    toRemove.forEach(id => processedMessages.delete(id));
                }

                const currentConfig = getConfig();
                if (!currentConfig.telegramEnabled) return;

                const chatId = msg.chat.id;
                const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
                
                if (isGroup && !currentConfig.replyToGroups) return;
                if (!isGroup && !currentConfig.replyToPrivate) return;

                const senderNumber = msg.from?.username || msg.from?.id.toString();
                if (currentConfig.allowedNumbers.length > 0 && !currentConfig.allowedNumbers.includes(senderNumber!)) {
                    return;
                }
                if (currentConfig.blockedNumbers.includes(senderNumber!)) {
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

                const textMessage = msg.text || msg.caption;
                
                const isMedia = msg.photo || msg.video || msg.audio || msg.document || msg.sticker;
                
                if (!textMessage && !isMedia) {
                    return;
                }

                emitLog(`Received Telegram message from ${senderNumber}: ${textMessage || '[Media]'}`, 'info');

                if (currentConfig.replyDelayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, currentConfig.replyDelayMs));
                }

                // Prepare instruction for Gemini
                const finalInstruction = `${currentConfig.systemInstruction}\n\nStrict Constraints:\n- Mood/Persona: ${currentConfig.replyMood}\n- Language: ${currentConfig.replyLanguage === 'Auto-detect' ? 'Respond in the language the user speaks to you.' : 'You MUST respond in ' + currentConfig.replyLanguage + '.'}`;
                
                // Download media if present
                let overrideMedia;
                if (isMedia && bot) {
                    overrideMedia = await downloadTelegramMedia(bot, msg);
                }
                
                const dummyWaMessage = {};
                
                const replyText = await processMessageWithGemini(`tg-${chatId}`, textMessage || '', dummyWaMessage, finalInstruction, overrideMedia);

                if (replyText) {
                    await telegramQueue.enqueue(chatId, replyText, { reply_to_message_id: msg.message_id });
                    emitLog(`Replied to ${senderNumber} on Telegram via Queue`, 'info');
                }

            } catch (error: any) {
                emitLog(`Error handling Telegram message: ${error.message}`, 'error');
            }
        });

        bot.on('polling_error', (error) => {
            emitLog(`Telegram polling error: ${error.message}`, 'error');
        });

    } catch (err: any) {
        emitLog(`Failed to start Telegram bot: ${err.message}`, 'error');
        bot = null;
    }
}

export function stopTelegramBot() {
    if (bot) {
        bot.stopPolling();
        bot = null;
        emitLog('Telegram bot stopped.', 'info');
    }
}

export function getTelegramBot() {
    return bot;
}
