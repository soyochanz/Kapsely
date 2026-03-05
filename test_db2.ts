import { supabase } from './src/lib/supabase';

async function run() {
    const res1 = await supabase.from('capsules').select('*').limit(1);
    const res2 = await supabase.from('notifications').select('*').limit(1);
    console.log("CAPSULES:");
    console.log(res1.data![0] ? Object.keys(res1.data![0]) : "Empty");
    console.log("NOTIFICATIONS:");
    console.log(res2.data![0] ? Object.keys(res2.data![0]) : "Empty");
}

run();
