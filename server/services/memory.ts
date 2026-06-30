const sessions = new Map<string, { history: any[]; touchedAt: number }>();
const MAX_SESSIONS = 1_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > SESSION_TTL_MS) sessions.delete(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function getChatHistory(userId: string) {
  let session = sessions.get(userId);
  if (!session) {
    prune();
    session = { history: [], touchedAt: Date.now() };
    sessions.set(userId, session);
  } else {
    session.touchedAt = Date.now();
    sessions.delete(userId);
    sessions.set(userId, session);
  }
  return session.history;
}

export function addToChatHistory(userId: string, role: 'user' | 'model', text: string) {
  const history = getChatHistory(userId);
  history.push({ role, parts: [{ text: text.slice(0, 20_000) }] });
  if (history.length > 40) history.splice(0, history.length - 40);
}

export function clearAllMemory() {
  sessions.clear();
}
