require('dotenv').config();
const supabase = require('../backend/supabaseClient');

async function main() {
  try {
    console.log('Attempting to create bucket "gallery"...');
    const { data: data1, error: error1 } = await supabase.storage.createBucket('gallery', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
      fileSizeLimit: 1048576 // 1MB
    });
    if (error1) {
      console.error('Failed to create gallery bucket:', error1.message);
    } else {
      console.log('Gallery bucket created successfully:', data1);
    }

    console.log('Attempting to create bucket "school-media"...');
    const { data: data2, error: error2 } = await supabase.storage.createBucket('school-media', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
      fileSizeLimit: 1048576 // 1MB
    });
    if (error2) {
      console.error('Failed to create school-media bucket:', error2.message);
    } else {
      console.log('School-media bucket created successfully:', data2);
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

main();
