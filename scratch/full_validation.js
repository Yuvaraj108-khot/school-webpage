const http = require('http');

const testStudent = {
  student_code: "TEST999",
  name: "CRUD Test Student",
  class: "5",
  medium: "CBSE",
  parent_name: "CRUD Parent"
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
          data: data ? JSON.parse(data) : null
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
    console.log("=== STARTING END-TO-END FLOW VALIDATION ===");

    // 1. Delete if pre-existing
    console.log("\n1. Pre-cleanup (Deleting TEST999 if exists)...");
    await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students/${testStudent.student_code}`,
      method: 'DELETE'
    });

    // 2. Fetch list before insert
    console.log("\n2. Fetching student list for CBSE Class 5...");
    const listBefore = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students?medium=CBSE&class=5`,
      method: 'GET'
    });
    console.log(`Found ${listBefore.data.length} students initially.`);

    // 3. Create student
    console.log("\n3. Creating new student TEST999...");
    const postPayload = JSON.stringify(testStudent);
    const createRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/students',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postPayload)
      }
    }, postPayload);
    
    if (createRes.statusCode !== 201) {
      throw new Error(`Failed to create student: status ${createRes.statusCode}, body: ${JSON.stringify(createRes.data)}`);
    }
    console.log("Student created successfully:", createRes.data);

    // 4. Fetch list after insert to verify
    console.log("\n4. Fetching student list again to verify insertion...");
    const listAfter = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students?medium=CBSE&class=5`,
      method: 'GET'
    });
    const found = listAfter.data.find(s => s.student_code === testStudent.student_code);
    if (!found) {
      throw new Error("Student TEST999 not found in the list after creation!");
    }
    console.log("Verified: Student exists in student list. Details:", found);

    // 5. Update student
    console.log("\n5. Updating student TEST999 name to 'Updated CRUD Test'...");
    const updatePayload = JSON.stringify({
      name: "Updated CRUD Test",
      parent_name: "Updated CRUD Parent"
    });
    const updateRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students/${testStudent.student_code}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updatePayload)
      }
    }, updatePayload);

    if (updateRes.statusCode !== 200) {
      throw new Error(`Failed to update student: status ${updateRes.statusCode}, body: ${JSON.stringify(updateRes.data)}`);
    }
    console.log("Student updated successfully:", updateRes.data);

    // 6. Fetch list to verify update
    console.log("\n6. Fetching student list to verify update...");
    const listAfterUpdate = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students?medium=CBSE&class=5`,
      method: 'GET'
    });
    const foundUpdated = listAfterUpdate.data.find(s => s.student_code === testStudent.student_code);
    if (!foundUpdated || foundUpdated.name !== "Updated CRUD Test" || foundUpdated.parent_name !== "Updated CRUD Parent") {
      throw new Error("Student update verification failed! Details: " + JSON.stringify(foundUpdated));
    }
    console.log("Verified: Student details updated correctly in database.");

    // 7. Delete student
    console.log("\n7. Deleting student TEST999...");
    const deleteRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students/${testStudent.student_code}`,
      method: 'DELETE'
    });
    if (deleteRes.statusCode !== 200) {
      throw new Error(`Failed to delete student: status ${deleteRes.statusCode}`);
    }
    console.log("Delete response:", deleteRes.data);

    // 8. Fetch list to verify deletion
    console.log("\n8. Fetching student list to verify deletion...");
    const listAfterDelete = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/students?medium=CBSE&class=5`,
      method: 'GET'
    });
    const stillExists = listAfterDelete.data.find(s => s.student_code === testStudent.student_code);
    if (stillExists) {
      throw new Error("Student TEST999 still exists after delete!");
    }
    console.log("Verified: Student deleted successfully from database.");

    console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
  } catch (err) {
    console.error("\n[ERROR] Validation failed:", err.message);
  }
}

run();
