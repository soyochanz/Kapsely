import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

const ACCOUNTS_KEY = '@multi_accounts_v1';

export interface SavedAccount {
    id: string;
    email?: string;
    username: string;
    avatar_url?: string;
    session: Session;
}

export const multiAccountService = {
    async getAccounts(): Promise<SavedAccount[]> {
        const data = await AsyncStorage.getItem(ACCOUNTS_KEY);
        return data ? JSON.parse(data) : [];
    },

    async saveCurrentAccount() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase.from('profiles')
            .select('username, avatar_url, is_verified')
            .eq('id', session.user.id)
            .single();

        const accounts = await this.getAccounts();
        const existingIdx = accounts.findIndex(a => a.id === session.user.id);

        // ENFORCE LIMITS
        if (existingIdx === -1) {
            const limit = profile?.is_verified ? 10 : 3;
            if (accounts.length >= limit) {
                throw new Error(`Límite de cuentas alcanzado (${limit}). Cierra una sesión para añadir otra.`);
            }
        }

        const newAccount: SavedAccount = {
            id: session.user.id,
            email: session.user.email,
            username: profile?.username || 'user',
            avatar_url: profile?.avatar_url,
            session
        };

        if (existingIdx >= 0) {
            accounts[existingIdx] = newAccount;
        } else {
            accounts.push(newAccount);
        }

        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
        
        // Sync push token for this new account immediately
        const { registerForPushNotificationsAsync, savePushToken } = require('./pushNotifications');
        const token = await registerForPushNotificationsAsync();
        if (token) await savePushToken(session.user.id, token);
    },

    async syncAllPushTokens() {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) return;

        const { registerForPushNotificationsAsync, savePushToken } = require('./pushNotifications');
        const token = await registerForPushNotificationsAsync();
        if (!token) return;

        console.log(`[MultiAccount] Syncing token for ${accounts.length} accounts...`);
        // We do this in parallel for speed
        await Promise.all(accounts.map(acc => savePushToken(acc.id, token)));
    },

    async switchAccount(accountId: string) {
        const accounts = await this.getAccounts();
        const target = accounts.find(a => a.id === accountId);
        if (!target) throw new Error('Account not found');

        // We use setSession to manually restore the session
        const { error } = await supabase.auth.setSession({
            access_token: target.session.access_token,
            refresh_token: target.session.refresh_token,
        });

        if (error) throw error;
        return target;
    },

    async logoutCurrentAndRemove() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const accounts = await this.getAccounts();
            const filtered = accounts.filter(a => a.id !== session.user.id);
            await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
            await supabase.auth.signOut();
        }
    },

    async removeAccount(accountId: string) {
        const accounts = await this.getAccounts();
        const filtered = accounts.filter(a => a.id !== accountId);
        await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(filtered));
    }
};
