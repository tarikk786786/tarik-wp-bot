import fs from 'fs';
import path from 'path';

export interface BotConfig {
    botEnabled: boolean;
    telegramEnabled: boolean;
    telegramBotToken: string;
    telegramPassword?: string;
    systemInstruction: string;
    replyToPrivate: boolean;
    replyToGroups: boolean;
    allowedNumbers: string[]; // e.g. ["1234567890"]
    blockedNumbers: string[]; // e.g. ["0987654321"]
    replyDelayMs: number;
    activeHoursStart: string; // "HH:MM"
    activeHoursEnd: string; // "HH:MM"
    replyMood: string;
    replyLanguage: string;
    smartAutoReply: boolean;
}

const isServerless = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || !!process.env.RENDER;
const baseConfigPath = path.join(process.cwd(), 'bot_config.json');
const tmpConfigPath = '/tmp/bot_config.json';

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

export function getConfig(): BotConfig {
    try {
        const targetPath = (isServerless && fs.existsSync(tmpConfigPath)) ? tmpConfigPath : baseConfigPath;
        if (fs.existsSync(targetPath)) {
            const data = fs.readFileSync(targetPath, 'utf8');
            return { ...defaultConfig, ...JSON.parse(data) };
        }
    } catch (e) {
        console.error("Failed to load config", e);
    }
    return defaultConfig;
}

export function saveConfig(config: Partial<BotConfig>) {
    const current = getConfig();
    const updated = { ...current, ...config };
    try {
        const targetPath = isServerless ? tmpConfigPath : baseConfigPath;
        fs.writeFileSync(targetPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch(e) {
        console.error("Failed to save config:", e);
    }
    return updated;
}
