import { supabase } from './supabase';

export interface RegisterData {
    email: string;
    password: string;
    username: string;
    displayName: string;
    birthdate: string; // ISO date string YYYY-MM-DD
}

export async function signUp({ email, password, username, displayName, birthdate }: RegisterData) {
    // Pass profile fields as raw_user_meta_data so the DB trigger (handle_new_user)
    // can insert the profiles row with SECURITY DEFINER — bypasses RLS timing issues.
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                username,
                display_name: displayName,
                birthdate,
            },
        },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('User creation failed');

    return authData;
}

export async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getProfile(userId: string) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}
