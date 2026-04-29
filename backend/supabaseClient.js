const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase;

if (!supabaseUrl || !supabaseKey) {
    console.warn("WARNING: Supabase URL or Anon Key is missing in .env. Image uploads will fail.");
    // Mock supabase object to prevent crash
    supabase = {
        storage: {
            from: () => ({
                upload: async () => ({ data: null, error: new Error("Supabase keys missing") }),
                getPublicUrl: () => ({ data: { publicUrl: null } })
            })
        }
    };
} else {
    supabase = createClient(supabaseUrl, supabaseKey);
}

module.exports = supabase;
