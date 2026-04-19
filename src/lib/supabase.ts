import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = 'https://tnvpostnyyjejexnghfp.supabase.co';
export const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnBvc3RueXlqZWpleG5naGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODgzNTAsImV4cCI6MjA4Nzg2NDM1MH0.4ZRtodCo6BEdItYYwFdLJO_BgUXYrf5RE8S3jk3woDI';

// On web: use native localStorage directly (avoids the AsyncStorage polyfill
// which, combined with navigator.locks, causes a deadlock and infinite loading).
// On native: use AsyncStorage as before.
const ExpoAsyncStorage =
    Platform.OS === 'web'
        ? {
              getItem: (key: string) => {
                  try {
                      return Promise.resolve(localStorage.getItem(key));
                  } catch (e) {
                      return Promise.resolve(null);
                  }
              },
              setItem: (key: string, value: string) => {
                  try {
                      localStorage.setItem(key, value);
                  } catch (e) {}
                  return Promise.resolve();
              },
              removeItem: (key: string) => {
                  try {
                      localStorage.removeItem(key);
                  } catch (e) {}
                  return Promise.resolve();
              },
          }
        : {
              getItem: async (key: string) => {
                  try {
                      return await AsyncStorage.getItem(key);
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
        // On web: disable navigator.locks to prevent the lock deadlock that occurs
        // when multiple screens call getSession() simultaneously on mount.
        // Using a simple mutex-free lock implementation instead.
        ...(Platform.OS === 'web' && {
            lock: (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
                return fn();
            },
        }),
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
