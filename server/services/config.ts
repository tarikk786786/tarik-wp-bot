import fs from 'fs';
import path from 'path';

export interface BotConfig {
  botEnabled: boolean;
  autoReply: boolean;
  systemInstruction: string;
  replyToPrivate: boolean;
  replyToGroups: boolean;
  allowedNumbers: string[];
  blockedNumbers: string[];
  replyDelayMs: number;
  typingIndicator: boolean;
  readReceipts: boolean;
  presenceUpdates: boolean;
  activeHoursStart: string;
  activeHoursEnd: string;
  replyMood: string;
  replyLanguage: string;
  autoDetectLanguage: boolean;
  replyMaxLength: number;
  temperature: number;
  memorySize: number;
  tarikBhaiMode: boolean;
  godMode: boolean;
}
import os from 'os';
const configPath = path.join(os.tmpdir(), 'bot_config.json');

const defaultConfig: BotConfig = {
  botEnabled: true,
  autoReply: true,
  systemInstruction: "You are an advanced AI assistant interacting via WhatsApp.\nYou are highly intelligent, concise, and helpful.\nYou support Markdown formatting (e.g. *bold*, _italic_, ~strikethrough~, `code`).\nKeep your responses concise as this is a chat interface.",
  replyToPrivate: true,
  replyToGroups: false,
  allowedNumbers: [],
  blockedNumbers: [],
  replyDelayMs: 0,
  typingIndicator: true,
  readReceipts: false,
  presenceUpdates: true,
  activeHoursStart: '00:00',
  activeHoursEnd: '23:59',
  replyMood: 'Helpful Assistant',
  replyLanguage: 'Auto-detect',
  autoDetectLanguage: true,
  replyMaxLength: 4096,
  temperature: 1.0,
  memorySize: 40,
  tarikBhaiMode: false,
  godMode: false,
};

export function getConfig(): BotConfig {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load config, using defaults', e);
  }
  return { ...defaultConfig };
}

export function saveConfig(config: Partial<BotConfig>): BotConfig {
  const current = getConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
