import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://tnvpostnyyjejexnghfp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnBvc3RueXlqZWpleG5naGZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODgzNTAsImV4cCI6MjA4Nzg2NDM1MH0.4ZRtodCo6BEdItYYwFdLJO_BgUXYrf5RE8S3jk3woDI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
