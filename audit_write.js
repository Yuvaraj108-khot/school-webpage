const http = require('http');

const BASE_URL = 'http://localhost:5001/api';

async function post(path, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: 'localhost',
            port: 5001,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

const testData = {
    students: {
        path: '/api/students',
        payload: {
            student_code: "AUDIT" + Math.floor(Math.random() * 10000),
            name: "Audit Student",
            class: "10",
            medium: "English",
            parent_name: "Audit Parent"
        }
    },
    teachers: {
        path: '/api/teachers',
        payload: {
            name: "Audit Teacher",
            subject: "Math",
            medium: "English"
        }
    },
    attendance: {
        path: '/api/attendance',
        payload: {
            student_code: "AUDIT001",
            class: "10",
            teacher_name: "Audit Teacher",
            date: "2026-01-01",
            status: "Present"
        }
    },
    marks: {
        path: '/api/marks',
        payload: {
            student_code: "AUDIT001",
            class: "10",
            subject: "Math",
            exam_type: "Unit Test",
            marks: 95
        }
    },
    notices: {
        path: '/api/notices',
        payload: {
            title: "Audit Notice",
            description: "System test",
            date: "2026-01-01"
        }
    },
    gallery: {
        path: '/api/gallery/upload',
        payload: {
            image_url: "/uploads/audit.jpg",
            category: "Audit",
            description: "Test Image"
        }
    },
    alumni: {
        path: '/api/alumni',
        payload: {
            name: "Audit Alumni",
            batch_year: "2020",
            profession: "Engineer"
        }
    },
    certificates: {
        path: '/api/certificates',
        payload: {
            student_code: "AUDIT001",
            certificate_type: "Bonafide"
        }
    }
};

async function runWriteTest() {
    console.log("====================================");
    console.log("STEP 5: WRITE TEST (DATA INSERT VERIFICATION)");
    console.log("====================================");

    for (const [key, test] of Object.entries(testData)) {
        try {
            console.log(`\nInserting into ${key}...`);
            const result = await post(test.path, test.payload);
            console.log(`Status: ${result.status}`);
            console.log(`Response: ${JSON.stringify(result.data, null, 2)}`);
        } catch (error) {
            console.error(`Error inserting into ${key}: ${error.message}`);
        }
    }
}

runWriteTest();
