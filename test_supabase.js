const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('c:/Users/Ochanz/Desktop/kaps/.env', 'utf8');
const urlMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = envFile.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function test() {
  const { data, error } = await supabase.from('capsules')
    .select('id, title, likes(count), comments(count)')
    .limit(1);
  console.log("DATA:", JSON.stringify(data, null, 2));
  if (error) console.log("ERROR:", error);
}
test();
