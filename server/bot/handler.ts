import { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { emitLog } from '../services/socket.js';
import { processMessageWithGemini } from '../services/gemini.js';
import { getConfig, saveConfig } from '../services/config.js';
import { isUserActive } from './index.js';
import { messageQueue } from './queue.js';
import { envNumber, isOptIn, isOptOut } from './safety.js';

const processedMessages = new Set<string>();
const processingChats = new Set<string>();
const lastReplyAt = new Map<string, number>();
const MAX_PROCESSED = 2_000;

function messageText(msg: WAMessage) {
  const message = msg.message;
  return message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.documentMessage?.caption ||
    message?.videoMessage?.caption || '';
}

function addressedToBot(sock: WASocket, msg: WAMessage) {
  const ownId = sock.user?.id?.split(':')[0]?.split('@')[0];
  if (!ownId) return false;
  const context = msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.documentMessage?.contextInfo;
  const mentioned = context?.mentionedJid?.some((jid) => jid.split(':')[0].split('@')[0] === ownId);
  const repliedToBot = context?.participant?.split(':')[0].split('@')[0] === ownId;
  return Boolean(mentioned || repliedToBot);
}

function isActiveNow(start: string, end: string) {
  if (start === '00:00' && end === '23:59') return true;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const from = startHour * 60 + startMinute;
  const to = endHour * 60 + endMinute;
  return from <= to ? current >= from && current <= to : current >= from || current <= to;
}

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage) {
  const jid = msg.key.remoteJid;
  const id = msg.key.id;
  if (!msg.message || !jid || !id || jid === 'status@broadcast' || jid.endsWith('@broadcast')) return;

  const uniqueId = `${jid}:${id}`;
  if (processedMessages.has(uniqueId)) return;
  processedMessages.add(uniqueId);
  if (processedMessages.size > MAX_PROCESSED) {
    for (const oldId of Array.from(processedMessages).slice(0, 200)) processedMessages.delete(oldId);
  }

  const config = getConfig();
  if (!config.botEnabled) return;

  const isGroup = jid.endsWith('@g.us');
  const sender = msg.key.participant || jid;
  const senderNumber = sender.split(':')[0].split('@')[0];
  const text = messageText(msg);

  if (!isGroup && isOptOut(text)) {
    if (!config.blockedNumbers.includes(senderNumber)) {
      saveConfig({ ...config, blockedNumbers: [...config.blockedNumbers, senderNumber] });
    }
    await messageQueue.enqueue(jid, { text: 'You are unsubscribed. Send START if you want to use the assistant again.' }, { quoted: msg });
    emitLog(`Honored opt-out from ${senderNumber}`, 'warn');
    return;
  }

  if (!isGroup && isOptIn(text)) {
    saveConfig({ ...config, blockedNumbers: config.blockedNumbers.filter((number) => number !== senderNumber) });
    await messageQueue.enqueue(jid, { text: 'You are subscribed again. How can I help?' }, { quoted: msg });
    emitLog(`Honored opt-in from ${senderNumber}`);
    return;
  }

  if (isGroup && (!config.replyToGroups || (process.env.WA_GROUP_REQUIRE_MENTION !== 'false' && !addressedToBot(sock, msg)))) return;
  if (!isGroup && !config.replyToPrivate) return;
  if (config.allowedNumbers.length && !config.allowedNumbers.includes(senderNumber)) return;
  if (config.blockedNumbers.includes(senderNumber)) return;
  if (!isActiveNow(config.activeHoursStart, config.activeHoursEnd)) return;

  const isMedia = Boolean(msg.message.imageMessage || msg.message.audioMessage || msg.message.videoMessage || msg.message.documentMessage || msg.message.stickerMessage);
  if (!text && !isMedia) return;

  const minimumInterval = envNumber('WA_MIN_CHAT_INTERVAL_MS', 15_000, 5_000, 300_000);
  if (processingChats.has(jid) || Date.now() - (lastReplyAt.get(jid) || 0) < minimumInterval) {
    emitLog(`Suppressed burst reply to ${senderNumber} for account safety`, 'warn');
    return;
  }

  if (config.smartAutoReply && isUserActive()) return;
  processingChats.add(jid);
  try {
    if (config.smartAutoReply) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      if (isUserActive()) return;
    }
    if (config.replyDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, config.replyDelayMs));

    emitLog(`Processing inbound message from ${senderNumber}`);
    const finalInstruction = `${config.systemInstruction}\n\nResponse preferences:\n- Mood/Persona: ${config.replyMood}\n- Language: ${config.replyLanguage === 'Auto-detect' ? 'Respond in the language the user uses.' : `Respond in ${config.replyLanguage}.`}`;
    const reply = await processMessageWithGemini(jid, text, msg.message, finalInstruction);
    if (!reply) return;

    await messageQueue.enqueue(jid, { text: reply.slice(0, 4_000) }, { quoted: msg });
    lastReplyAt.set(jid, Date.now());
    if (lastReplyAt.size > 2_000) lastReplyAt.delete(lastReplyAt.keys().next().value!);
    emitLog(`Replied to ${senderNumber}`);
  } catch (error) {
    emitLog(`Failed to handle message from ${senderNumber}: ${error instanceof Error ? error.message : error}`, 'error');
  } finally {
    processingChats.delete(jid);
  }
}
