const fs = require('fs');

try {
    require('../backend/server.js');
} catch (e) {
    fs.writeFileSync(__dirname + '/require_error.txt', e.stack || e.message);
}
