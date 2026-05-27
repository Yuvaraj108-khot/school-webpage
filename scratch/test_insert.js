const http = require('http');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const testStudent = {
  student_code: "TEST1001",
  name: "Database Test Student",
  class: "5",
  medium: "English",
  parent_name: "Test Parent"
};

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  try {
    console.log("1. Cleaning up any previous test students with code 'TEST1001'...");
    try {
      await prisma.student.delete({ where: { student_code: testStudent.student_code } });
      console.log("Cleanup: Deleted existing test student.");
    } catch (e) {
      console.log("Cleanup: No existing test student found.");
    }

    console.log("2. Sending POST request to /api/students to add student...");
    const postData = JSON.stringify(testStudent);
    const postOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/students',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const response = await makeRequest(postOptions, postData);
    console.log("Response Status Code:", response.statusCode);
    console.log("Response Body:", response.data);

    if (response.statusCode !== 201) {
      throw new Error(`Failed to create student: status ${response.statusCode}`);
    }

    console.log("3. Querying Supabase via Prisma to verify the record was inserted...");
    const insertedStudent = await prisma.student.findUnique({
      where: { student_code: testStudent.student_code }
    });

    if (insertedStudent) {
      console.log("Verification SUCCESS!");
      console.log("Inserted Student Record:", JSON.stringify(insertedStudent, null, 2));
    } else {
      console.log("Verification FAILED! Student not found in database.");
    }
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
