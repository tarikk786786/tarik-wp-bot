import { insforge } from './insforge.js';

export async function getChatHistory(userId: string) {
  try {
    const { data, error } = await insforge.database.from('ai_memory')
      .select('history')
      .eq('user_id', userId)
      .maybeSingle();
      
    if (error) throw error;
    return data?.history || [];
  } catch (e) {
    console.error("Failed to get chat history:", e);
    return [];
  }
}

export async function addToChatHistory(userId: string, role: 'user' | 'model', text: string) {
  try {
    const history = await getChatHistory(userId);
    history.push({ role, parts: [{ text }] });
    
    // Keep history manageable
    if (history.length > 40) {
      history.splice(0, history.length - 40);
    }
    
    await insforge.database.from('ai_memory')
      .upsert([{ user_id: userId, history }], { onConflict: 'user_id' });
  } catch (e) {
      console.error("Failed to update chat history:", e);
  }
}

export async function clearAllMemory() {
  try {
      // NOTE: This clears ALL memory for all users in the project!
      const { data, error } = await insforge.database.from('ai_memory')
          .delete()
          .neq('user_id', 'dummy'); // match everything
          
      if (error) throw error;
  } catch (e) {
      console.error("Failed to clear memory:", e);
  }
}
