import { createClient } from '@supabase/supabase-js'; 
import dotenv from 'dotenv'; 
import fs from 'fs'; 
const envConfig = dotenv.parse(fs.readFileSync('.env')); 
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY); 
async function run() { 
  const { error } = await supabase.from('shop_items').update({ name: 'BOOOM' }).eq('slug', 'emote_crash'); 
  console.log(error || 'Success'); 
} 
run();
