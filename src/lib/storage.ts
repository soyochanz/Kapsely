import { MMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const mmkv = new MMKV();

/**
 * Modern, synchronous storage utility for the entire app.
 * Direct access to MMKV methods with strong typing.
 */
export const storage = {
    getString: (key: string) => mmkv.getString(key),
    set: (key: string, value: string | number | boolean | Uint8Array) => mmkv.set(key, value),
    getNumber: (key: string) => mmkv.getNumber(key),
    getBoolean: (key: string) => mmkv.getBoolean(key),
    delete: (key: string) => mmkv.delete(key),
    clearAll: () => mmkv.clearAll(),
};

/**
 * Migrates specific keys from AsyncStorage to MMKV.
 * Call this during app startup.
 */
export const migrateKeys = async (keys: string[]) => {
    for (const key of keys) {
        try {
            const value = await AsyncStorage.getItem(key);
            if (value !== null) {
                console.log(`[Storage] Migrating key: ${key}`);
                mmkv.set(key, value);
                await AsyncStorage.removeItem(key);
            }
        } catch (e) {
            console.error(`[Storage] Error migrating ${key}:`, e);
        }
    }
};

/**
 * Async bridge for Supabase or other libraries that expect an asynchronous storage API.
 * This object also handles the one-time migration from AsyncStorage to MMKV.
 */
export const ExpoMMKVStorage = {
    getItem: async (key: string): Promise<string | null> => {
        // 1. Try to get the value from MMKV (new storage)
        const value = mmkv.getString(key);
        if (value !== undefined) {
            return value;
        }

        // 2. If it's not in MMKV, check if it exists in AsyncStorage (old storage)
        const asyncValue = await AsyncStorage.getItem(key);
        if (asyncValue !== null) {
            // Found it in old storage! Let's migrate it to the new one and remove it from the old one.
            console.log(`[Storage] Migrating key: ${key} from AsyncStorage to MMKV`);
            mmkv.set(key, asyncValue);
            // Optional: You can choose when to remove it from AsyncStorage. 
            // We'll do it here to keep everything clean.
            await AsyncStorage.removeItem(key);
            return asyncValue;
        }

        return null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
        mmkv.set(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
        mmkv.delete(key);
    },
};
