const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) {
    console.warn("WARNING: Supabase URL or Anon Key is missing in .env. Image uploads will fail.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
