import { GoogleGenAI } from '@google/genai';
import { getChatHistory, addToChatHistory } from './memory.js';
import { emitLog } from './socket.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getConfig } from './config.js';

let ai: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI | null {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      ai = new GoogleGenAI({ apiKey: key });
    }
  }
  return ai;
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !!(key && key !== 'MY_GEMINI_API_KEY');
}

export async function processMessageWithGemini(
  userId: string,
  text: string,
  rawMessage: any,
  systemInstruction: string
): Promise<string> {
  try {
    const client = getAiClient();
    if (!client) {
      return 'System error: Gemini API key is missing or invalid. Please set GEMINI_API_KEY in your .env file.';
    }

    const config = getConfig();
    const history = getChatHistory(userId);

    let mediaData: string | null = null;
    let mimeType = '';

    if (rawMessage.imageMessage || rawMessage.documentMessage || rawMessage.audioMessage || rawMessage.videoMessage || rawMessage.stickerMessage) {
      try {
        const fakeMsg: any = { key: { remoteJid: userId, id: '', fromMe: false }, message: rawMessage };
        const buffer = await downloadMediaMessage(
          fakeMsg, 'buffer', {},
          { logger: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, child: () => null }) } as any, reuploadRequest: async () => ({}) as any }
        ) as Buffer;
        mediaData = buffer.toString('base64');
        mimeType = rawMessage.imageMessage?.mimetype
          || rawMessage.documentMessage?.mimetype
          || rawMessage.audioMessage?.mimetype
          || rawMessage.videoMessage?.mimetype
          || rawMessage.stickerMessage?.mimetype
          || 'application/octet-stream';
      } catch (e: any) {
        emitLog(`Failed to download media: ${e.message}`, 'error');
      }
    }

    const formattedHistory = history.map(h => ({ role: h.role, parts: h.parts }));

    let currentParts: any[];
    if (mediaData && mimeType) {
      currentParts = [
        { text: text || 'Analyze this media.' },
        { inlineData: { data: mediaData, mimeType } }
      ];
    } else {
      currentParts = [{ text: text || '[Unsupported media or empty message]' }];
    }

    formattedHistory.push({ role: 'user', parts: currentParts });

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: formattedHistory,
      config: {
        systemInstruction,
        temperature: config.temperature,
        maxOutputTokens: config.replyMaxLength,
      }
    });

    let replyText = response.text || 'Empty response from AI.';

    addToChatHistory(userId, 'user', text || '[Media Message]');
    addToChatHistory(userId, 'model', replyText);

    return replyText;
  } catch (error: any) {
    emitLog(`Gemini API Error: ${error.message}`, 'gemini');
    let displayMessage = error.message;
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error?.message) displayMessage = parsed.error.message;
    } catch (_) {}
    return `⚠️ AI Error: ${displayMessage}`;
  }
}
