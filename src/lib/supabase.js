import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL und SUPABASE_KEY müssen gesetzt sein.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
