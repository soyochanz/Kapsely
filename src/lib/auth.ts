import { getFriendlyAuthErrorMessage, safeSignOut, supabase } from './supabase';

export interface RegisterData {
    email: string;
    password: string;
    username: string;
    displayName: string;
    birthdate?: string;
}

export async function signUp({ email, password, username, displayName, birthdate }: RegisterData) {
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

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        Promise.resolve(promise)
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });

type SignInOptions = {
    resetLocalStateOnRetryable?: boolean;
};

export async function signIn(email: string, password: string, options: SignInOptions = {}) {
    try {
        const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            10000,
            'signIn'
        );
        if (error) throw error;
        return data;
    } catch (error: any) {
        if (options.resetLocalStateOnRetryable) {
            console.warn('[Auth] Retryable sign-in failure; preserving local auth state');
        }
        throw new Error(getFriendlyAuthErrorMessage(error, 'No se pudo iniciar sesion.'));
    }
}

export async function signOut() {
    await safeSignOut();
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
