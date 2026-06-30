import { insforge } from './insforge.js';

export interface BotConfig {
    botEnabled: boolean;
    telegramEnabled: boolean;
    telegramBotToken: string;
    telegramPassword?: string;
    systemInstruction: string;
    replyToPrivate: boolean;
    replyToGroups: boolean;
    allowedNumbers: string[];
    blockedNumbers: string[];
    replyDelayMs: number;
    activeHoursStart: string;
    activeHoursEnd: string;
    replyMood: string;
    replyLanguage: string;
    smartAutoReply: boolean;
}

const defaultConfig: BotConfig = {
    botEnabled: true,
    telegramEnabled: false,
    telegramBotToken: "",
    systemInstruction: "You are Tarik Bhai AI, an advanced AI assistant created by Tarik Islam. You are highly intelligent, concise, and helpful. You know that Tarik Islam is a Forensic Science Professional, AI Developer, Cyber Security Enthusiast, Entrepreneur, and Full Stack Developer. You know he loves Dazy (Gelhu Bacha). You support Markdown formatting (e.g. *bold*, _italic_, ~strikethrough~, `code`). Keep your responses concise as this is a chat interface.",
    replyToPrivate: true,
    replyToGroups: false,
    allowedNumbers: [],
    blockedNumbers: [],
    replyDelayMs: 0,
    activeHoursStart: "00:00",
    activeHoursEnd: "23:59",
    replyMood: "Helpful Assistant",
    replyLanguage: "Auto-detect",
    smartAutoReply: false
};

let cachedConfig: BotConfig | null = null;

export async function initConfig() {
    try {
        const { data, error } = await insforge.database.from('settings')
            .select('*')
            .eq('type', 'bot_config')
            .maybeSingle();

        if (error) {
             throw error;
        }

        if (data && data.data) {
            cachedConfig = { ...defaultConfig, ...data.data };
        } else {
            cachedConfig = { ...defaultConfig };
            await insforge.database.from('settings')
                .upsert([{ type: 'bot_config', data: cachedConfig }], { onConflict: 'type' });
        }
    } catch (e) {
        console.error("Failed to load config from InsForge:", e);
        cachedConfig = { ...defaultConfig };
    }
}

export function getConfig(): BotConfig {
    if (!cachedConfig) return defaultConfig;
    return cachedConfig;
}

export function getSystemPrompt(senderNumber: string): string {
    const config = getConfig();
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
        specialContactRule = `\n\n## Special Contact Rule (HIGH PRIORITY)
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

    return `${baseInstruction}${specialContactRule}\n\nStrict Constraints:\n- Mood/Persona: ${config.replyMood}\n- Language: ${config.replyLanguage === 'Auto-detect' ? 'Respond in the language the user speaks to you.' : 'You MUST respond in ' + config.replyLanguage + '.'}`;
}

export async function saveConfigAsync(config: Partial<BotConfig>): Promise<BotConfig> {
    const current = getConfig();
    const updated = { ...current };
    
    // Only copy allowed keys
    const allowedKeys: (keyof BotConfig)[] = [
        'botEnabled', 'telegramEnabled', 'telegramBotToken', 'telegramPassword',
        'systemInstruction', 'replyToPrivate', 'replyToGroups', 'allowedNumbers',
        'blockedNumbers', 'replyDelayMs', 'activeHoursStart', 'activeHoursEnd',
        'replyMood', 'replyLanguage', 'smartAutoReply'
    ];
    
    for (const key of allowedKeys) {
        if (config[key] !== undefined) {
            (updated as any)[key] = config[key];
        }
    }

    try {
        await insforge.database.from('settings')
            .upsert([{ type: 'bot_config', data: updated }], { onConflict: 'type' });
        cachedConfig = updated;
    } catch(e) {
        console.error("Failed to save config to InsForge:", e);
    }
    return updated;
}

export function saveConfig(config: Partial<BotConfig>): BotConfig {
    const current = getConfig();
    const updated = { ...current };
    
    const allowedKeys: (keyof BotConfig)[] = [
        'botEnabled', 'telegramEnabled', 'telegramBotToken', 'telegramPassword',
        'systemInstruction', 'replyToPrivate', 'replyToGroups', 'allowedNumbers',
        'blockedNumbers', 'replyDelayMs', 'activeHoursStart', 'activeHoursEnd',
        'replyMood', 'replyLanguage', 'smartAutoReply'
    ];
    
    for (const key of allowedKeys) {
        if (config[key] !== undefined) {
            (updated as any)[key] = config[key];
        }
    }

    // Fire and forget async save to maintain sync compatibility for existing callers
    saveConfigAsync(updated).catch(console.error);
    
    cachedConfig = updated;
    return updated;
}
