import { GoogleGenAI } from '@google/genai';
import { getChatHistory, addToChatHistory } from './memory.js';
import { emitLog } from './socket.js';
import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';

let ai: GoogleGenAI | null = null;

export function getAiClient() {
    if (!ai) {
        const key = process.env.GEMINI_API_KEY;
        if (key && key !== 'MY_GEMINI_API_KEY') {
            ai = new GoogleGenAI({ apiKey: key });
        }
    }
    return ai;
}

const SYSTEM_INSTRUCTION = `You are G0DM0D3, an advanced AI assistant interacting via WhatsApp. 
You are highly intelligent, concise, and helpful. You prefer a cyberpunk, terminal-style aesthetic in your communication style but keep it subtle so as not to annoy the user.
You support Markdown formatting (e.g. *bold*, _italic_, ~strikethrough~, \`code\`).
Keep your responses concise as this is a chat interface.`;

export async function processMessageWithGemini(userId: string, text: string, rawMessage: any, systemInstruction: string, overrideMedia?: { data: string, mimeType: string }): Promise<string> {
  try {
    const client = getAiClient();
    if (!client) {
        emitLog('System error: Gemini API key is missing or invalid.', 'error');
        return '';
    }

    const history = await getChatHistory(userId);
    
    let mediaData = overrideMedia?.data || null;
    let mimeType = overrideMedia?.mimeType || '';
    
    if (!overrideMedia && rawMessage && (rawMessage.imageMessage || rawMessage.documentMessage || rawMessage.audioMessage || rawMessage.videoMessage || rawMessage.stickerMessage)) {
        try {
           const fakeMsg: any = { key: { remoteJid: userId, id: '', fromMe: false }, message: rawMessage };
           const buffer = await downloadMediaMessage(
                fakeMsg,
                'buffer',
                {},
                { logger: console as any, reuploadRequest: () => undefined }
           ) as Buffer;
           mediaData = buffer.toString('base64');
           mimeType = rawMessage.imageMessage?.mimetype || 
                      rawMessage.documentMessage?.mimetype || 
                      rawMessage.audioMessage?.mimetype || 
                      rawMessage.videoMessage?.mimetype || 
                      rawMessage.stickerMessage?.mimetype;
           
           // Clean up mimeType for audio/video (sometimes WhatsApp sends parameters we don't want like codecs)
           if (mimeType) {
               mimeType = mimeType.split(';')[0];
           }
        } catch (e) {
            emitLog('Failed to download media', 'error');
        }
    } 

    const formattedHistory = history.map(h => ({
        role: h.role,
        parts: h.parts
    }));
    
    let currentPart: any = { text: text || '[Unsupported media or empty message]' };
    
    if (mediaData && mimeType) {
        currentPart = [
            { text: text || 'Analyze this media.' },
            {
                inlineData: {
                    data: mediaData,
                    mimeType: mimeType
                }
            }
        ];
    }
    
    formattedHistory.push({
        role: 'user',
        parts: Array.isArray(currentPart) ? currentPart : [{ text: currentPart.text }]
    });

    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: formattedHistory,
        config: {
            systemInstruction: systemInstruction
        }
    });

    const replyText = response.text || 'System malfunction: empty response.';
    
    await addToChatHistory(userId, 'user', text || '[Media Message]');
    await addToChatHistory(userId, 'model', replyText);

    return replyText;
  } catch (error: any) {
    emitLog(`Gemini API Error: ${error.message}`, 'error');
    
    let displayMessage = error.message;
    try {
        const parsed = JSON.parse(error.message);
        if (parsed.error && parsed.error.message) {
            displayMessage = parsed.error.message;
        }
    } catch (e) {
        // Not a JSON string, keep original
    }
    
    return `System error encountered: ${displayMessage}`;
  }
}
