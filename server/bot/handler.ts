import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { getConfig, getSystemPrompt } from '../services/config.js';
import { isUserActive } from './index.js';
import { messageQueue } from './queue.js';

const processedMessages = new Set<string>();
const MAX_PROCESSED = 1000;

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage) {
  try {
    if (!msg.message || !msg.key.id) return;

    if (processedMessages.has(msg.key.id)) {
        return; // Ignore duplicate
    }
    
    processedMessages.add(msg.key.id);
    if (processedMessages.size > MAX_PROCESSED) {
        // Remove the oldest 100 elements to avoid memory leaks
        const toRemove = Array.from(processedMessages).slice(0, 100);
        toRemove.forEach(id => processedMessages.delete(id));
    }

    const config = getConfig();
    if (!config.botEnabled) return;
    
    if (config.smartAutoReply && isUserActive()) {
        emitLog(`Skipping reply to ${msg.key.remoteJid?.split('@')[0]} because user is currently active.`, 'info');
        return;
    }

    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;
    
    const isGroup = jid.endsWith('@g.us');
    const sender = msg.key.participant || jid;
    const senderNumber = sender.split('@')[0].split(':')[0];

    // Filter by group/private settings
    if (isGroup && !config.replyToGroups) return;
    if (!isGroup && !config.replyToPrivate) return;

    // Filter by allowed/blocked numbers
    if (config.allowedNumbers.length > 0 && !config.allowedNumbers.includes(senderNumber)) {
        return;
    }
    if (config.blockedNumbers.length > 0 && config.blockedNumbers.includes(senderNumber)) {
        return;
    }

    // Filter by active hours
    if (config.activeHoursStart !== "00:00" || config.activeHoursEnd !== "23:59") {
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        if (config.activeHoursStart < config.activeHoursEnd) {
            if (currentTime < config.activeHoursStart || currentTime > config.activeHoursEnd) return;
        } else {
            // crosses midnight
            if (currentTime < config.activeHoursStart && currentTime > config.activeHoursEnd) return;
        }
    }

    // Smart Auto Reply - delay before replying to give user a chance to reply themselves
    if (config.smartAutoReply) {
        emitLog(`Smart mode active. Waiting 10s before replying to ${senderNumber}...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 10000));
        // Check again if user became active during the delay
        if (isUserActive()) {
            emitLog(`Skipping reply to ${senderNumber} because user became active.`, 'info');
            return;
        }
    }

    // Extract text from message
    const textMessage = msg.message.conversation || 
                        msg.message.extendedTextMessage?.text || 
                        msg.message.imageMessage?.caption ||
                        msg.message.documentMessage?.caption ||
                        msg.message.videoMessage?.caption;

    if (textMessage) {
        const text = textMessage.trim();
        if (text === '!ping') {
            await messageQueue.enqueue(jid, { text: 'Pong! 🏓 Bot is active.' }, { quoted: msg });
            return;
        } else if (text === '!clear') {
            import('../services/memory.js').then(async ({ getChatHistory, addToChatHistory, clearAllMemory }) => {
                try {
                    // Just clear for this user
                    const { insforge } = await import('../services/insforge.js');
                    await insforge.database.from('ai_memory').delete().eq('user_id', jid);
                    await messageQueue.enqueue(jid, { text: 'Memory cleared for this chat. 🧹' }, { quoted: msg });
                } catch(e) {
                    await messageQueue.enqueue(jid, { text: 'Failed to clear memory.' }, { quoted: msg });
                }
            });
            return;
        }
    }

    if (!textMessage) {
       // If it's a pure media message with no caption, proceed if it's a supported type
       const isMedia = msg.message.imageMessage || 
                       msg.message.audioMessage || 
                       msg.message.videoMessage || 
                       msg.message.documentMessage ||
                       msg.message.stickerMessage;
       if (!isMedia) {
           return;
       }
    }

    emitLog(`Received message from ${senderNumber}: ${textMessage || '[Media]'}`, 'info');

    // Apply delay if configured
    if (config.replyDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, config.replyDelayMs));
    }

    // Process with Gemini
    const finalInstruction = getSystemPrompt(senderNumber);
    const replyText = await processMessageWithGemini(jid, textMessage || '', msg.message, finalInstruction);

    if (replyText) {
        try {
            await messageQueue.enqueue(jid, { text: replyText }, { quoted: msg });
            emitLog(`Replied to ${senderNumber}`, 'info');
        } catch (e: any) {
            emitLog(`Final failure sending reply to ${senderNumber}: ${e.message}`, 'error');
        }
    }
  } catch (error: any) {
    emitLog(`Error handling message: ${error.message}`, 'error');
  }
}
