const sessions = new Map<string, any[]>();

export function getChatHistory(userId: string) {
  if (!sessions.has(userId)) {
    sessions.set(userId, []);
  }
  return sessions.get(userId)!;
}

export function addToChatHistory(userId: string, role: 'user' | 'model', text: string) {
  const history = getChatHistory(userId);
  history.push({ role, parts: [{ text }] });
  
  // Keep history manageable
  if (history.length > 40) {
    history.splice(0, history.length - 40);
  }
}

export function clearAllMemory() {
  sessions.clear();
}
