import { proto, AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { insforge } from './insforge.js';

export const useInsForgeAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>, removeCreds: () => Promise<void> }> => {

    const cache = new Map<string, any>();

    const writeDataBatch = async (items: {key: string, data: any}[]) => {
        if (items.length === 0) return;
        const rows = items.map(item => {
            cache.set(item.key, item.data);
            return {
                session_id: sessionId,
                key: item.key,
                data: JSON.stringify(item.data, BufferJSON.replacer)
            };
        });
        // Upsert all in one request
        await insforge.database.from('whatsapp_sessions')
            .upsert(rows, { onConflict: 'session_id,key' });
    };

    const removeDataBatch = async (keys: string[]) => {
        if (keys.length === 0) return;
        keys.forEach(k => cache.delete(k));
        await insforge.database.from('whatsapp_sessions')
            .delete()
            .eq('session_id', sessionId)
            // @ts-ignore
            .in('key', keys);
    };

    const writeData = async (data: any, key: string) => {
        await writeDataBatch([{key, data}]);
    };

    const readData = async (key: string) => {
        if (cache.has(key)) {
            return cache.get(key);
        }
        const { data, error } = await insforge.database.from('whatsapp_sessions')
            .select('data')
            .eq('session_id', sessionId)
            .eq('key', key)
            .maybeSingle();
            
        if (data && data.data) {
            const parsed = JSON.parse(data.data, BufferJSON.reviver);
            cache.set(key, parsed);
            return parsed;
        }
        return null;
    };

    const removeData = async (key: string) => {
        await removeDataBatch([key]);
    };

    const removeCreds = async () => {
        cache.clear();
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
                    const toWrite: {key: string, data: any}[] = [];
                    const toRemove: string[] = [];
                    
                    for (const category in data) {
                        for (const id in data[category as keyof typeof data]) {
                            const value = data[category as keyof typeof data]?.[id];
                            const key = `${category}-${id}`;
                            if (value) {
                                toWrite.push({key, data: value});
                            } else {
                                toRemove.push(key);
                            }
                        }
                    }
                    
                    await Promise.all([
                        writeDataBatch(toWrite),
                        removeDataBatch(toRemove)
                    ]);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds'),
        removeCreds
    };
};
