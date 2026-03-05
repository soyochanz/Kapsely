import { supabase } from './src/lib/supabase';

async function run() {
    const { data, error } = await supabase.from('capsules').select('*').limit(1);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.error(error);
}

run();
