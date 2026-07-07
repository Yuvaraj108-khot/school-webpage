const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Fix logo centering in login/reset forms
    content = content.replace(/style="width: 80px; margin-bottom: 1rem;"/g, 'style="width: 80px; margin: 0 auto 1rem auto;"');
    content = content.replace(/style="width: 80px; margin-bottom: 1rem;"/g, 'style="width: 80px; margin: 0 auto 1rem auto;"'); // Ensure all replaced

    // Check dashboard logos
    content = content.replace(/style="width:60px; border-radius:50%;"/g, 'style="width:60px; margin: 0 auto; border-radius:50%;"');
    content = content.replace(/style="width:50px; border-radius:50%;"/g, 'style="width:50px; margin: 0 auto; border-radius:50%;"');

    // Dashboard teacher string
    content = content.replace(/style="width:60px; border-radius:50%;"/g, 'style="width:60px; margin: 0 auto; border-radius:50%;"');

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log('Fixed alignment in ' + file);
    }
});
