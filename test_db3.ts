import { supabase } from './src/lib/supabase';

async function run() {
    const { data: d1 } = await supabase.from('capsulas_members').select('*').limit(1); // Wait, name is arbitrary. Let's get table names

    // Using pg_class or information_schema 
    // In supabase JS we can just try to fetch a known table and intentionally fail to get hints? Or maybe use REST api.
    const { data: d2, error } = await supabase.from('non_existent').select('*').limit(1);
    console.log(error);
}

run();
