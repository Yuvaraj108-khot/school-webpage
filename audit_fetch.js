const http = require('http');

const endpoints = [
    '/api/students',
    '/api/teachers',
    '/api/attendance',
    '/api/marks',
    '/api/notices',
    '/api/gallery',
    '/api/alumni',
    '/api/certificates'
];

function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:5000${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

async function audit() {
    console.log("====================================");
    console.log("STEP 4: FETCH COMPLETE DATABASE DATA");
    console.log("====================================");

    for (const endpoint of endpoints) {
        try {
            const data = await get(endpoint);
            console.log(`\nTABLE: ${endpoint}`);
            console.log(`- Total records count: ${Array.isArray(data) ? data.length : 'N/A'}`);
            if (Array.isArray(data) && data.length > 0) {
                console.log(`- Sample data (first 2):`);
                console.log(JSON.stringify(data.slice(0, 2), null, 2));
            } else {
                console.log(`- No data found.`);
            }
        } catch (error) {
            console.error(`Error fetching ${endpoint}: ${error.message}`);
        }
    }
}

audit();
