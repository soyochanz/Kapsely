
import { supabase } from '../src/lib/supabase';

async function checkSchema() {
    const { data, error } = await supabase.from('messages').select('*').limit(1);
    if (error) {
        console.error('Error fetching message:', error);
    } else {
        console.log('Message columns:', Object.keys(data[0] || {}));
    }
    
    const { data: convData, error: convError } = await supabase.from('conversations').select('*').limit(1);
    if (convError) {
        console.error('Error fetching conversation:', convError);
    } else {
        console.log('Conversation columns:', Object.keys(convData[0] || {}));
    }
}

checkSchema();
