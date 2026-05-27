require('dotenv').config();
const supabase = require('../backend/supabaseClient');

async function main() {
  try {
    console.log('Testing Supabase Storage Connection with dotenv...');
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error('List buckets failed:', error.message);
      return;
    }
    console.log('Available buckets:', buckets.map(b => b.name));
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

main();
