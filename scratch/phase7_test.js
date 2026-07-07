// Native fetch in node v18+ works, no require needed

async function phase7Testing() {
  console.log('--- PHASE 7 SYSTEM TESTS ---');
  let passCount = 0;
  let failCount = 0;

  async function test(name, url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (res.ok) {
        console.log(`[PASS] ${name}`);
        passCount++;
        return await (res.headers.get('content-type')?.includes('json') ? res.json() : res.text());
      } else {
        const text = await res.text();
        console.error(`[FAIL] ${name} - Status: ${res.status} ${text}`);
        failCount++;
        return null;
      }
    } catch (e) {
      console.error(`[ERROR] ${name} - ${e.message}`);
      failCount++;
      return null;
    }
  }

  const BASE = 'https://school-webpage-1uky.onrender.com/api';

  // 1. Student Marks View
  await test('Student marks view', `${BASE}/marks?limit=10`);

  // 2. Student Attendance View
  await test('Student attendance view', `${BASE}/attendance?limit=10`);

  // 3. Teacher Marks Entry (Bulk)
  await test('Teacher marks bulk entry', `${BASE}/marks/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      class: '10',
      medium: 'English',
      subject: 'Science',
      exam_type: 'Mid Term Exam',
      marks_list: [{ student_code: 'VERIFIED_001', marks: 89 }]
    })
  });

  // 4. Teacher Attendance Entry (Bulk)
  await test('Teacher attendance bulk entry', `${BASE}/attendance/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      class: '10',
      medium: 'English',
      period: '3',
      subject: 'Mathematics',
      teacher_name: 'Phase 7 Tester',
      date: new Date().toISOString(),
      attendance_list: [{ student_code: 'VERIFIED_001', status: 'Present' }]
    })
  });

  // 5. Subject Add/Remove
  const newSubject = await test('Subject creation', `${BASE}/subjects/relational`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase7 Test Subject', class_id: 15, medium_id: 3 })
  });
  
  if (newSubject && newSubject.id) {
      await test('Subject remove (soft delete)', `${BASE}/subjects/relational/${newSubject.id}`, { method: 'DELETE' });
  }

  // 6. Exam Creation
  const newExam = await test('Exam creation', `${BASE}/exams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phase7 Test Exam', type: 'Annual', academic_year: '2025-2026', is_active: true })
  });

  if (newExam && newExam.id) {
      await test('Exam remove (soft delete)', `${BASE}/exams/${newExam.id}`, { method: 'DELETE' });
  }

  // 7, 8, 9. Excel Downloads
  await test('Marks Excel export', `${BASE}/export/marks?class=10&medium=English&exam_type=Mid%20Term%20Exam&subject=Science`);
  await test('Attendance Excel export', `${BASE}/export/attendance?class=10&medium=English&month=5&year=2026`);
  await test('Report Card export', `${BASE}/export/report-card/VERIFIED_001`);

  console.log(`\nTEST SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
}

phase7Testing();
