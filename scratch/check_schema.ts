import { supabase } from '../src/lib/supabase';

async function checkColumns() {
    const { data, error } = await supabase.from('capsules').select('*').limit(1);
    if (error) console.error(error);
    else if (data && data.length > 0) console.log('Columns:', Object.keys(data[0]));
    else console.log('No capsules found');
}

checkColumns();
