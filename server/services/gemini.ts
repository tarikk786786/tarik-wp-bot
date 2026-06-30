import { GoogleGenAI } from '@google/genai';
import { HfInference } from '@huggingface/inference';
import { getChatHistory, addToChatHistory } from './memory.js';
import { emitLog } from './socket.js';
import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';

let ai: GoogleGenAI | null = null;

// The user provided multiple HF keys for load balancing/fallback
const HF_KEYS = [
    process.env.HF_API_KEY_1 || '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',
    process.env.HF_API_KEY_2 || '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'
];
let currentHfKeyIndex = 0;

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

async function callHuggingFaceFallback(formattedHistory: any[], systemInstruction: string, text: string): Promise<string> {
    emitLog('Attempting Hugging Face fallback...', 'info');
    
    // We try each key in case one is exhausted
    for (let i = 0; i < HF_KEYS.length; i++) {
        const key = HF_KEYS[(currentHfKeyIndex + i) % HF_KEYS.length];
        const hf = new HfInference(key);
        
        try {
            // Convert Gemini history format to Hugging Face Messages format
            const messages = [
                { role: 'system', content: systemInstruction }
            ];
            
            for (const msg of formattedHistory) {
                // HF prefers text strings
                let content = '';
                if (Array.isArray(msg.parts)) {
                    content = msg.parts.map((p: any) => p.text).join(' ');
                } else if (msg.parts && msg.parts.text) {
                    content = msg.parts.text;
                }
                if (content.trim()) {
                    // map 'user' -> 'user', 'model' -> 'assistant'
                    messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content });
                }
            }
            
            // HF doesn't natively support images in standard chatCompletion via Qwen/Llama unless it's a vision model.
            // For text fallback, we just send text.
            const response = await hf.chatCompletion({
                model: 'Qwen/Qwen2.5-72B-Instruct',
                messages: messages,
                max_tokens: 500,
            });
            
            if (response.choices && response.choices.length > 0) {
                // Update current key index so we round-robin
                currentHfKeyIndex = (currentHfKeyIndex + i + 1) % HF_KEYS.length;
                return response.choices[0].message.content || 'System malfunction: empty HF response.';
            }
        } catch (err: any) {
            emitLog(`HF Key ${i + 1} failed: ${err.message}`, 'warn');
        }
    }
    
    throw new Error("All AI providers (Gemini and Hugging Face) failed or exhausted quotas.");
}

export async function processMessageWithGemini(userId: string, text: string, rawMessage: any, systemInstruction: string, overrideMedia?: { data: string, mimeType: string }): Promise<string> {
  try {
    const client = getAiClient();
    
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

    let replyText = '';
    
    if (!client) {
        emitLog('Gemini client unavailable. Switching to fallback directly.', 'warn');
        replyText = await callHuggingFaceFallback(formattedHistory, systemInstruction, text);
    } else {
        try {
            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: formattedHistory,
                config: {
                    systemInstruction: systemInstruction
                }
            });
            replyText = response.text || 'System malfunction: empty response.';
        } catch (geminiError: any) {
            emitLog(`Gemini API Error: ${geminiError.message}`, 'error');
            // Check if it's a 429 quota/rate limit error, or any other failure
            replyText = await callHuggingFaceFallback(formattedHistory, systemInstruction, text);
        }
    }
    
    await addToChatHistory(userId, 'user', text || '[Media Message]');
    await addToChatHistory(userId, 'model', replyText);

    return replyText;
  } catch (error: any) {
    emitLog(`All AI Engines Failed: ${error.message}`, 'error');
    return `System error encountered: All AI providers failed. Check quotas.`;
  }
}
