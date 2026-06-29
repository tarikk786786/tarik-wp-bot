import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { getConfig } from '../services/config.js';
import { isUserActive } from './index.js';

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage) {
  try {
    if (!msg.message) return;

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
    const senderNumber = sender.split('@')[0];

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

    try {
        // Notify user we are typing
        await sock.sendPresenceUpdate('composing', jid);
    } catch (e) {
        // Ignore presence update errors
    }

    // Process with Gemini
    const finalInstruction = `${config.systemInstruction}\n\nStrict Constraints:\n- Mood/Persona: ${config.replyMood}\n- Language: ${config.replyLanguage === 'Auto-detect' ? 'Respond in the language the user speaks to you.' : 'You MUST respond in ' + config.replyLanguage + '.'}`;
    const replyText = await processMessageWithGemini(jid, textMessage || '', msg.message, finalInstruction);

    if (replyText) {
        try {
            // Stop typing
            await sock.sendPresenceUpdate('paused', jid);
        } catch (e) {
            // Ignore presence errors
        }

        try {
            // Send reply
            await sock.sendMessage(jid, { text: replyText }, { quoted: msg });
            emitLog(`Replied to ${senderNumber}`, 'info');
        } catch (e: any) {
            emitLog(`Failed to send reply to ${senderNumber}: ${e.message}`, 'error');
        }
    }
  } catch (error: any) {
    emitLog(`Error handling message: ${error.message}`, 'error');
  }
}
