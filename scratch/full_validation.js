// Native fetch in node v18+ works, no require needed

async function runAudit() {
  console.log('==================================================');
  console.log('SECTION 15 & 16 — API AUDIT & DB INTEGRITY TEST');
  console.log('==================================================');

  let passes = 0;
  let fails = 0;

  async function testCall(name, url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        console.log(`[PASS] ${name}`);
        passes++;
        return await (res.headers.get('content-type')?.includes('json') ? res.json() : res.text());
      } else {
        console.error(`[FAIL] ${name} (Status: ${res.status}) - ${await res.text()}`);
        fails++;
        return null;
      }
    } catch (e) {
      console.error(`[ERROR] ${name}: ${e.message}`);
      fails++;
      return null;
    }
  }

  const BASE = 'http://localhost:5000/api';

  // --- Student Management Test ---
  console.log('\n--- STUDENT MANAGEMENT ---');
  const student = await testCall('Add Student', `${BASE}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_code: 'QA-STUD-01',
      name: 'QA Test Student',
      class: '10',
      medium: 'English',
      parent_name: 'QA Parent'
    })
  });

  if (student && student.id) {
    await testCall('Fetch Student', `${BASE}/students?medium=English&class=10`);
    await testCall('Update Student', `${BASE}/students/${student.student_code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA Updated Student' })
    });
    // Soft Delete Student
    await testCall('Delete Student', `${BASE}/students/${student.student_code}`, { method: 'DELETE' });
  }

  // --- Teacher Management Test ---
  console.log('\n--- TEACHER MANAGEMENT ---');
  const teacher = await testCall('Add Teacher', `${BASE}/teachers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'QA Test Teacher',
      qualifications: 'QA Master',
      experience: '10 years',
      subject: 'Quality Assurance',
      medium: 'English',
      is_active: true
    })
  });

  if (teacher && teacher.id) {
    await testCall('Fetch Teacher', `${BASE}/teachers`);
    await testCall('Delete Teacher', `${BASE}/teachers/${teacher.id}`, { method: 'DELETE' });
  }

  // --- Subject Management Test ---
  console.log('\n--- SUBJECT MANAGEMENT ---');
  const subject = await testCall('Add Subject', `${BASE}/subjects/relational`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'QA Test Subject',
      class_id: 15, // Class 10
      medium_id: 3  // English
    })
  });

  if (subject && subject.id) {
    await testCall('Fetch Subjects', `${BASE}/subjects/relational?class_id=15`);
    await testCall('Delete Subject', `${BASE}/subjects/relational/${subject.id}`, { method: 'DELETE' });
  }

  // --- Notice System Test ---
  console.log('\n--- NOTICE SYSTEM ---');
  const notice = await testCall('Add Notice', `${BASE}/notices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'QA Test Notice',
      description: 'QA Notice Details',
      date: new Date().toISOString()
    })
  });

  if (notice && notice.id) {
    await testCall('Fetch Notices', `${BASE}/notices`);
    await testCall('Delete Notice', `${BASE}/notices/${notice.id}`, { method: 'DELETE' });
  }

  // --- Alumni System Test ---
  console.log('\n--- ALUMNI SYSTEM ---');
  const alumni = await testCall('Add Alumni', `${BASE}/alumni`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'QA Test Alumni',
      batch_year: '2020',
      profession: 'Engineer'
    })
  });

  if (alumni && alumni.id) {
    await testCall('Fetch Alumni', `${BASE}/alumni`);
    await testCall('Delete Alumni', `${BASE}/alumni/${alumni.id}`, { method: 'DELETE' });
  }

  // --- Certificate System Test ---
  console.log('\n--- CERTIFICATE SYSTEM ---');
  const cert = await testCall('Request Certificate', `${BASE}/certificates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_code: 'QA-STUD-01',
      student_name: 'QA Test Student',
      class: '10',
      medium: 'English',
      certificate_type: 'Transfer Certificate',
      reason: 'Relocating'
    })
  });

  if (cert && cert.id) {
    await testCall('Fetch Certificates', `${BASE}/certificates`);
    await testCall('Update Certificate Status', `${BASE}/certificates/${cert.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Approved' })
    });
  }

  console.log('\n==================================================');
  console.log(`TOTAL PASSES: ${passes}`);
  console.log(`TOTAL FAILS: ${fails}`);
  console.log('==================================================');
}

runAudit();
