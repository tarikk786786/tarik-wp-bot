import { insforge } from './insforge.js';
import { BotConfig } from './config.js';

// User Helpers
export async function createUser(userData: any) {
    const { data, error } = await insforge.database.from('users')
        .insert([{ id: userData.id, data: userData }]);
    if (error) throw error;
    return data;
}

export async function updateUser(userId: string, updateData: any) {
    const { data: existing, error: fetchError } = await insforge.database.from('users')
        .select('data')
        .eq('id', userId)
        .single();
    if (fetchError) throw fetchError;
    
    const newData = { ...(existing?.data || {}), ...updateData };
    
    const { data, error } = await insforge.database.from('users')
        .update({ data: newData })
        .eq('id', userId);
    if (error) throw error;
    return data;
}

export async function deleteUser(userId: string) {
    const { data, error } = await insforge.database.from('users')
        .delete()
        .eq('id', userId);
    if (error) throw error;
    return data;
}

export async function searchUsers(query: any) {
    // Basic search simulation
    const { data, error } = await insforge.database.from('users')
        .select('*');
    if (error) throw error;
    return data;
}

// Chat Helpers
export async function saveChat(chatId: string, chatData: any) {
    const { data, error } = await insforge.database.from('chats')
        .upsert([{ chat_id: chatId, data: chatData }], { onConflict: 'chat_id' });
    if (error) throw error;
    return data;
}

export async function loadChatHistory(chatId: string, limit = 50, skip = 0) {
    const { data, error } = await insforge.database.from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: false })
        .range(skip, skip + limit - 1);
    if (error) throw error;
    return data;
}

// AI Memory Helpers
export async function saveAIMemory(userId: string, memoryData: any) {
    const { data, error } = await insforge.database.from('ai_memory')
        .upsert([{ user_id: userId, history: memoryData }], { onConflict: 'user_id' });
    if (error) throw error;
    return data;
}

export async function loadAIMemory(userId: string) {
    const { data, error } = await insforge.database.from('ai_memory')
        .select('history')
        .eq('user_id', userId)
        .maybeSingle();
    
    if (error) throw error;
    return data;
}

// Settings Helpers
export async function saveSettings(settingsType: string, settingsData: any) {
    const { data, error } = await insforge.database.from('settings')
        .upsert([{ type: settingsType, data: settingsData }], { onConflict: 'type' });
    if (error) throw error;
    return data;
}

export async function loadSettings(settingsType: string) {
    const { data, error } = await insforge.database.from('settings')
        .select('data')
        .eq('type', settingsType)
        .maybeSingle();
    if (error) throw error;
    return data?.data;
}

// Session Helpers
export async function saveSession(sessionId: string, sessionData: any) {
    const { data, error } = await insforge.database.from('sessions')
        .upsert([{ session_id: sessionId, data: sessionData, last_active: new Date().toISOString() }], { onConflict: 'session_id' });
    if (error) throw error;
    return data;
}

export async function restoreSession(sessionId: string) {
    const { data, error } = await insforge.database.from('sessions')
        .select('data')
        .eq('session_id', sessionId)
        .maybeSingle();
    if (error) throw error;
    return data?.data;
}

export async function clearExpiredSessions() {
    const expiryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await insforge.database.from('sessions')
        .delete()
        .lt('last_active', expiryDate);
    if (error) throw error;
    return data;
}
