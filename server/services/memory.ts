const sessions = new Map<string, any[]>();
let messageStats = { received: 0, sent: 0 };
let activeChats = new Set<string>();

export function getChatHistory(userId: string) {
  if (!sessions.has(userId)) sessions.set(userId, []);
  return sessions.get(userId)!;
}

export function addToChatHistory(userId: string, role: 'user' | 'model', text: string) {
  const history = getChatHistory(userId);
  history.push({ role, parts: [{ text }] });
  if (history.length > 40) history.splice(0, history.length - 40);
}

export function clearAllMemory() { sessions.clear(); }
export function clearChatMemory(userId: string) { sessions.delete(userId); }
export function getMemoryStats() {
  return { totalChats: sessions.size, totalMessages: Array.from(sessions.values()).reduce((a, b) => a + b.length, 0) };
}
export function trackMessage(direction: 'received' | 'sent') { messageStats[direction]++; }
export function getMessageStats() { return { ...messageStats }; }
export function trackActiveChat(jid: string) { activeChats.add(jid); }
export function getActiveChats() { return activeChats.size; }
