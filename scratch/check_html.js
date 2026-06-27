const fs = require('fs');
let content;
try {
    content = fs.readFileSync('../dashboard_admin.html', 'utf8');
    if (content.indexOf('\0') !== -1) {
        content = fs.readFileSync('../dashboard_admin.html', 'utf16le');
    }
} catch (e) {
    fs.writeFileSync('check_html_result.txt', e.message);
    process.exit(1);
}

const matches = [];
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('API_BASE')) {
        matches.push(`Line ${i + 1}: ${line.trim()}`);
    }
});
fs.writeFileSync('check_html_result.txt', matches.join('\n'));
