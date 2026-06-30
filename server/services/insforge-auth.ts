import { proto, AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { insforge } from './insforge.js';

export const useInsForgeAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, removeCreds: () => Promise<void> }> => {

    const writeData = async (data: any, key: string) => {
        const dataString = JSON.stringify(data, BufferJSON.replacer);
        await insforge.database.from('whatsapp_sessions')
            .upsert([{ session_id: sessionId, key, data: dataString }], { onConflict: 'session_id,key' });
    };

    const readData = async (key: string) => {
        const { data, error } = await insforge.database.from('whatsapp_sessions')
            .select('data')
            .eq('session_id', sessionId)
            .eq('key', key)
            .maybeSingle();
            
        if (data && data.data) {
            return JSON.parse(data.data, BufferJSON.reviver);
        }
        return null;
    };

    const removeData = async (key: string) => {
        await insforge.database.from('whatsapp_sessions')
            .delete()
            .eq('session_id', sessionId)
            .eq('key', key);
    };

    const removeCreds = async () => {
        await insforge.database.from('whatsapp_sessions')
            .delete()
            .eq('session_id', sessionId);
    };

    const creds: AuthenticationCreds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<void>[] = [];
                    for (const category in data) {
                        for (const id in data[category as keyof typeof data]) {
                            const value = data[category as keyof typeof data]?.[id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds'),
        removeCreds
    };
};
