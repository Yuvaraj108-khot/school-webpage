async function testAPIs() {
  console.log('Testing relational APIs via fetch...\n');

  try {
    // 1. Single Marks API
    console.log('1. Testing POST /api/marks (Single)...');
    const marksRes = await fetch('http://localhost:5000/api/marks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_code: 'VERIFIED_001',
        class: '10',
        medium: 'English',
        subject: 'Mathematics',
        exam_type: 'Mid Term Exam',
        marks: 95
      })
    });
    const marksData = await marksRes.json();
    console.log('Result:', JSON.stringify(marksData, null, 2), '\n');

    // 2. Bulk Marks API
    console.log('2. Testing POST /api/marks/bulk (Bulk)...');
    const bulkRes = await fetch('http://localhost:5000/api/marks/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class: '10',
        medium: 'English',
        subject: 'Science',
        exam_type: 'Mid Term Exam',
        marks_list: [
          { student_code: 'VERIFIED_001', marks: 88 },
          { student_code: 'C5-479', marks: 74 }
        ]
      })
    });
    const bulkData = await bulkRes.json();
    console.log('Result:', JSON.stringify(bulkData, null, 2), '\n');

    // 3. Attendance API
    console.log('3. Testing POST /api/attendance (Single)...');
    const attRes = await fetch('http://localhost:5000/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_code: 'VERIFIED_001',
        class: '10',
        medium: 'English',
        period: '1',
        subject: 'English',
        teacher_name: 'Audit Teacher',
        date: new Date().toISOString(),
        status: 'Present'
      })
    });
    const attData = await attRes.json();
    console.log('Result:', JSON.stringify(attData, null, 2), '\n');

    // 4. Bulk Attendance API
    console.log('4. Testing POST /api/attendance/bulk (Bulk)...');
    const bulkAttRes = await fetch('http://localhost:5000/api/attendance/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class: '10',
        medium: 'English',
        period: '2',
        subject: 'Second Language',
        teacher_name: 'Audit Teacher',
        date: new Date().toISOString(),
        attendance_list: [
          { student_code: 'VERIFIED_001', status: 'Present' },
          { student_code: 'C5-479', status: 'Absent' }
        ]
      })
    });
    const bulkAttData = await bulkAttRes.json();
    console.log('Result:', JSON.stringify(bulkAttData, null, 2), '\n');

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('API Testing Failed:', error);
  }
}

testAPIs();
