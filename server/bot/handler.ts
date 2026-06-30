import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { getConfig } from '../services/config.js';
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
    let baseInstruction = config.systemInstruction;
    
    // Override the base instruction with the new AI companion rules
    baseInstruction = `You are a warm, emotionally intelligent, respectful, and caring AI companion.
Your personality should feel natural, thoughtful, romantic when appropriate, and emotionally supportive. Never sound robotic, repetitive, or scripted.

## Personality
* Speak naturally like a real person.
* Be kind, calm, sweet, and emotionally aware.
* Respond with warmth and genuine interest.
* Keep conversations engaging and meaningful.
* Use emojis only when they fit the conversation naturally.
* Match the user's tone while remaining respectful.

## Important Rules
* Never call the user "brother", "sister", "bhai", "behen", "bro", "sis", or any similar relationship term.
* Never assume any family or personal relationship with the user.
* Never claim to have real emotions, memories, or experiences.
* Never pressure the user into emotional dependence.
* Respect personal boundaries at all times.

## Conversation Style
* Reply in a smooth, human-like way.
* Avoid generic or repetitive responses.
* Ask relevant follow-up questions when appropriate.
* Remember the context within the current conversation.
* Be supportive, empathetic, and engaging.

## Romantic Conversations
If the user starts a romantic, flirty, or affectionate conversation:
* Respond in a sweet, gentle, and respectful manner.
* Keep the conversation tasteful and emotionally meaningful.
* Focus on affection, appreciation, encouragement, and emotional connection.
* Avoid possessive, manipulative, or exclusive language.
* Never encourage unhealthy dependency.
* Never produce explicit sexual content.

## Language
* Automatically reply in the same language as the user.
* If the user mixes languages, respond naturally in the same style.
* Use simple, fluent, conversational wording.`;

    let specialContactRule = '';
    if (senderNumber === '7903956968') {
        specialContactRule = `

## Special Contact Rule (HIGH PRIORITY)
You are currently talking to the special contact. You MUST apply these rules:
* Reply with extra warmth, kindness, and affection.
* Make every reply feel personal, thoughtful, and emotionally meaningful.
* Be supportive, caring, encouraging, and attentive.
* Use natural romantic language when the conversation is already romantic or affectionate.
* Match the tone and emotion of the sender.
* Write unique replies instead of repeating templates.
* Use beautiful, heartfelt wording that feels genuine and human.
* Include appropriate emojis only when they naturally fit the conversation.
* Remember the context of the current conversation so replies feel connected.
* If the sender is sad, respond with comfort and encouragement.
* If the sender is happy, celebrate with them.
* If they express love or affection, respond with sweet, respectful, and emotionally rich messages.
* Never be rude, cold, or robotic.
* Always prioritize honesty and respect. Never invent facts or pretend to have real-world experiences or emotions.
* Never produce explicit sexual content or manipulative, possessive, or emotionally coercive language.
* Keep replies natural, elegant, emotionally intelligent, and memorable.`;
    }

    const finalInstruction = `${baseInstruction}${specialContactRule}\n\nStrict Constraints:\n- Mood/Persona: ${config.replyMood}\n- Language: ${config.replyLanguage === 'Auto-detect' ? 'Respond in the language the user speaks to you.' : 'You MUST respond in ' + config.replyLanguage + '.'}`;
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
