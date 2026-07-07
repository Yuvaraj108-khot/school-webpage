const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Fix missing logo text
    if(content.includes('<div class="logo">') && !content.includes('<div class="logo-text">')) {
        content = content.replace(/(<img src="images\/logo\.png"[^>]*>)/i, '$1\n                <div class="logo-text">\n                    <h1>SBRS KARKALA</h1>\n                    <span>Shaping Global Futures</span>\n                </div>');
    }
    
    // Center logo images in login and dashboard areas
    content = content.replace(/<img src="images\/logo\.png"[^>]*margin-bottom:\s*1rem[^>]*>/g, match => {
        if(!match.includes('margin: 0 auto')) {
            return match.replace('margin-bottom: 1rem;', 'margin: 0 auto 1rem auto;');
        }
        return match;
    });

    content = content.replace(/<img src="images\/logo\.png"[^>]*style="width:\s*60px[^>]*>/g, match => {
         if(!match.includes('margin:')) {
             return match.replace('style="width:60px;', 'style="width:60px; margin: 0 auto;');
         }
         return match;
    });

    content = content.replace(/<img src="images\/logo\.png"[^>]*style="width:\s*50px[^>]*>/g, match => {
         if(!match.includes('margin:')) {
             return match.replace('style="width:50px;', 'style="width:50px; margin: 0 auto;');
         }
         return match;
    });

    fs.writeFileSync(file, content);
    console.log('Processed ' + file);
});
