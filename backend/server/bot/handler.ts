import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { aiOrchestrator } from '../../src/services/ai/orchestrator.js';
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
        const toRemove = Array.from(processedMessages).slice(0, 100);
        toRemove.forEach(id => processedMessages.delete(id));
    }

    const config = getConfig();
    if (!config.botEnabled) return;

    // --- 1. DEBUG LOGGING ---
    emitLog(`=== INCOMING MESSAGE ===\n${JSON.stringify(msg.key, null, 2)}`, 'info');

    // --- 2. EXTRACT JID STRICTLY ---
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const isGroup = jid.endsWith('@g.us');
    
    const participant = msg.key.participant || jid;
    const pushName = msg.pushName || 'Unknown';
    const senderNumber = participant.split('@')[0].split(':')[0];

    emitLog(`Extracted -> JID: ${jid} | Participant: ${participant} | FromMe: ${msg.key.fromMe} | PushName: ${pushName}`, 'info');

    if (config.smartAutoReply && isUserActive()) {
        emitLog(`Skipping reply to ${senderNumber} because user is currently active.`, 'info');
        return;
    }

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
            if (currentTime < config.activeHoursStart && currentTime > config.activeHoursEnd) return;
        }
    }

    if (config.smartAutoReply) {
        emitLog(`Smart mode active. Waiting 10s before replying to ${senderNumber}...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 10000));
        if (isUserActive()) {
            emitLog(`Skipping reply to ${senderNumber} because user became active.`, 'info');
            return;
        }
    }

    // --- 3. UNWRAP MESSAGE COMPLETELY ---
    let actualMessage = msg.message;
    let messageType = Object.keys(actualMessage)[0];

    // Deep unwrap for ephemeral, viewOnce, edited, etc.
    while (actualMessage.ephemeralMessage || actualMessage.viewOnceMessage || actualMessage.viewOnceMessageV2 || actualMessage.documentWithCaptionMessage || actualMessage.editedMessage) {
        if (actualMessage.ephemeralMessage) actualMessage = actualMessage.ephemeralMessage.message!;
        else if (actualMessage.viewOnceMessage) actualMessage = actualMessage.viewOnceMessage.message!;
        else if (actualMessage.viewOnceMessageV2) actualMessage = actualMessage.viewOnceMessageV2.message!;
        else if (actualMessage.documentWithCaptionMessage) actualMessage = actualMessage.documentWithCaptionMessage.message!;
        else if (actualMessage.editedMessage) actualMessage = actualMessage.editedMessage.message?.protocolMessage?.editedMessage!;
        
        messageType = Object.keys(actualMessage)[0];
    }

    // Extract text from the unwrapped message
    const textMessage = actualMessage.conversation || 
                        actualMessage.extendedTextMessage?.text || 
                        actualMessage.imageMessage?.caption ||
                        actualMessage.documentMessage?.caption ||
                        actualMessage.videoMessage?.caption;

    emitLog(`Unwrapped Message Type: ${messageType} | Extracted Text: ${textMessage ? textMessage.substring(0, 50) + '...' : '[No Text]'}`, 'info');

    const messageOptions = undefined;

    if (textMessage) {
        const text = textMessage.trim();
        if (text === '!ping') {
            await messageQueue.enqueue(jid, { text: 'Pong! 🏓 Bot is active.' }, messageOptions);
            return;
        } else if (text === '!clear') {
            await messageQueue.enqueue(jid, { text: 'Memory clearing is handled by MongoDB now.' }, messageOptions);
            return;
        }
    }

    if (!textMessage) {
       const isMedia = actualMessage.imageMessage || 
                       actualMessage.audioMessage || 
                       actualMessage.videoMessage || 
                       actualMessage.documentMessage ||
                       actualMessage.stickerMessage;
       if (!isMedia) {
           return;
       }
    }

    emitLog(`Processing AI Reply for ${senderNumber}...`, 'info');
    const aiStartTime = Date.now();

    // Human-like delay before reading the message
    setTimeout(async () => {
        try {
            await sock.readMessages([msg.key]);
            emitLog(`Sent delayed read receipt for ${msg.key.id}`, 'info');
        } catch (e) {}
    }, 2000 + Math.random() * 2000);

    const replyText = await aiOrchestrator.handleMessage(senderNumber, jid, textMessage || '');

    const aiDuration = Date.now() - aiStartTime;
    emitLog(`AI Generation completed in ${aiDuration}ms`, 'info');

    if (replyText) {
        if (replyText.startsWith('[APPROVAL PENDING]')) {
            emitLog(`Skipped sending: ${replyText}`, 'info');
            return;
        }
        
        try {
            await messageQueue.enqueue(jid, { text: replyText }, undefined);
            emitLog(`Enqueued reply for ${jid}`, 'info');
        } catch (e: any) {
            emitLog(`Final failure sending reply to ${senderNumber}: ${e.message}`, 'error');
        }
    }
  } catch (error: any) {
    emitLog(`Error handling message: ${error.message}`, 'error');
  }
}
