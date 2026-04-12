import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://tnvpostnyyjejexnghfp.supabase.co';
export const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnBvc3RueXlqZWpleG5naGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODgzNTAsImV4cCI6MjA4Nzg2NDM1MH0.4ZRtodCo6BEdItYYwFdLJO_BgUXYrf5RE8S3jk3woDI';

// Custom storage implementation to ensure consistency between Expo Go and Standalone builds
const ExpoAsyncStorage = {
    getItem: async (key: string) => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value;
        } catch (error) {
            console.error('Error reading from storage:', error);
            return null;
        }
    },
    setItem: async (key: string, value: string) => {
        try {
            await AsyncStorage.setItem(key, value);
        } catch (error) {
            console.error('Error writing to storage:', error);
        }
    },
    removeItem: async (key: string) => {
        try {
            await AsyncStorage.removeItem(key);
        } catch (error) {
            console.error('Error removing from storage:', error);
        }
    },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: ExpoAsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

export type Profile = {
    id: string;
    email: string;
    username: string;
    display_name: string;
    birthdate: string;
    avatar_url: string | null;
    bio: string | null;
    favorite_color: string | null;
    favorite_movie: string | null;
    favorite_song: string | null;
    is_verified?: boolean;
    is_admin?: boolean;
    display_name_history?: string[];
    created_at: string;
    updated_at: string;
};
