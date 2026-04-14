const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fullValidation() {
  const results = {};

  try {
    console.log('\n=== FULL FRONTEND→BACKEND→PRISMA→SUPABASE VALIDATION ===\n');

    // ── STEP 1: Students ─────────────────────────────────────
    try {
      await prisma.student.deleteMany({ where: { student_code: 'UI001' } });
      const s = await prisma.student.create({
        data: { student_code: 'UI001', name: 'Frontend Student', class: '5', medium: 'English', parent_name: 'UI Parent' }
      });
      const check = await prisma.student.findUnique({ where: { student_code: 'UI001' } });
      results.students = check ? 'PASS' : 'FAIL';
      console.log('[students]   Created:', JSON.stringify(s));
    } catch(e) { results.students = 'FAIL'; console.error('[students] FAIL:', e.message); }

    // ── STEP 2: Teachers ─────────────────────────────────────
    try {
      await prisma.teacher.deleteMany({ where: { name: 'Frontend Teacher' } });
      const t = await prisma.teacher.create({
        data: { name: 'Frontend Teacher', subject: 'Science', medium: 'English' }
      });
      const check = await prisma.teacher.findFirst({ where: { name: 'Frontend Teacher' } });
      results.teachers = check ? 'PASS' : 'FAIL';
      console.log('[teachers]   Created:', JSON.stringify(t));
    } catch(e) { results.teachers = 'FAIL'; console.error('[teachers] FAIL:', e.message); }

    // ── STEP 3: Attendance ───────────────────────────────────
    try {
      await prisma.attendance.deleteMany({ where: { student_code: 'UI001' } });
      const a = await prisma.attendance.create({
        data: { student_code: 'UI001', class: '5', teacher_name: 'Frontend Teacher', date: new Date('2026-01-01'), status: 'Present' }
      });
      const check = await prisma.attendance.findFirst({ where: { student_code: 'UI001' } });
      results.attendance = check ? 'PASS' : 'FAIL';
      console.log('[attendance] Created:', JSON.stringify(a));
    } catch(e) { results.attendance = 'FAIL'; console.error('[attendance] FAIL:', e.message); }

    // ── STEP 4: Marks ────────────────────────────────────────
    try {
      await prisma.marks.deleteMany({ where: { student_code: 'UI001' } });
      const m = await prisma.marks.create({
        data: { student_code: 'UI001', class: '5', subject: 'Science', exam_type: 'Unit Test', marks: 88 }
      });
      const check = await prisma.marks.findFirst({ where: { student_code: 'UI001' } });
      results.marks = check ? 'PASS' : 'FAIL';
      console.log('[marks]      Created:', JSON.stringify(m));
    } catch(e) { results.marks = 'FAIL'; console.error('[marks] FAIL:', e.message); }

    // ── STEP 5: Notices ──────────────────────────────────────
    try {
      await prisma.notice.deleteMany({ where: { title: 'Frontend Notice' } });
      const n = await prisma.notice.create({
        data: { title: 'Frontend Notice', description: 'UI test', date: new Date('2026-01-01') }
      });
      const check = await prisma.notice.findFirst({ where: { title: 'Frontend Notice' } });
      results.notices = check ? 'PASS' : 'FAIL';
      console.log('[notices]    Created:', JSON.stringify(n));
    } catch(e) { results.notices = 'FAIL'; console.error('[notices] FAIL:', e.message); }

    // ── STEP 6: Alumni ───────────────────────────────────────
    try {
      await prisma.alumni.deleteMany({ where: { name: 'Frontend Alumni' } });
      const al = await prisma.alumni.create({
        data: { name: 'Frontend Alumni', batch_year: '2020', profession: 'Engineer' }
      });
      const check = await prisma.alumni.findFirst({ where: { name: 'Frontend Alumni' } });
      results.alumni = check ? 'PASS' : 'FAIL';
      console.log('[alumni]     Created:', JSON.stringify(al));
    } catch(e) { results.alumni = 'FAIL'; console.error('[alumni] FAIL:', e.message); }

    // ── STEP 7: Certificate Requests ────────────────────────
    try {
      await prisma.certificateRequest.deleteMany({ where: { student_code: 'UI001' } });
      const c = await prisma.certificateRequest.create({
        data: { student_code: 'UI001', certificate_type: 'Bonafide', status: 'Pending', request_date: new Date() }
      });
      const check = await prisma.certificateRequest.findFirst({ where: { student_code: 'UI001' } });
      results.certificate_requests = check ? 'PASS' : 'FAIL';
      console.log('[certs]      Created:', JSON.stringify(c));
    } catch(e) { results.certificate_requests = 'FAIL'; console.error('[certs] FAIL:', e.message); }

    // ── STEP 8: Gallery ──────────────────────────────────────
    try {
      await prisma.gallery.deleteMany({ where: { description: 'validation-test' } });
      const g = await prisma.gallery.create({
        data: { image_url: '/uploads/test.jpg', category: 'Campus', description: 'validation-test' }
      });
      const check = await prisma.gallery.findFirst({ where: { description: 'validation-test' } });
      results.gallery = check ? 'PASS' : 'FAIL';
      console.log('[gallery]    Created:', JSON.stringify(g));
    } catch(e) { results.gallery = 'FAIL'; console.error('[gallery] FAIL:', e.message); }

    // ── FINAL REPORT ─────────────────────────────────────────
    console.log('\n=================== FINAL REPORT ===================');
    Object.entries(results).forEach(([k, v]) => console.log(`  ${k.padEnd(22)}: ${v}`));

    // ── RE-FETCH VERIFICATION ────────────────────────────────
    console.log('\n=========== RE-FETCH VERIFICATION (READ) ===========');
    const s2 = await prisma.student.findUnique({ where: { student_code: 'UI001' } });
    const t2 = await prisma.teacher.findFirst({ where: { name: 'Frontend Teacher' } });
    const a2 = await prisma.attendance.findFirst({ where: { student_code: 'UI001' } });
    const m2 = await prisma.marks.findFirst({ where: { student_code: 'UI001' } });
    const n2 = await prisma.notice.findFirst({ where: { title: 'Frontend Notice' } });
    const al2 = await prisma.alumni.findFirst({ where: { name: 'Frontend Alumni' } });
    const c2 = await prisma.certificateRequest.findFirst({ where: { student_code: 'UI001' } });

    console.log('  Student read   :', s2 ? 'PASS ✓' : 'FAIL ✗');
    console.log('  Teacher read   :', t2 ? 'PASS ✓' : 'FAIL ✗');
    console.log('  Attendance read:', a2 ? 'PASS ✓' : 'FAIL ✗');
    console.log('  Marks read     :', m2 ? `PASS ✓ (marks: ${m2.marks})` : 'FAIL ✗');
    console.log('  Notice read    :', n2 ? 'PASS ✓' : 'FAIL ✗');
    console.log('  Alumni read    :', al2 ? 'PASS ✓' : 'FAIL ✗');
    console.log('  Cert read      :', c2 ? `PASS ✓ (status: ${c2.status})` : 'FAIL ✗');

    const allPass = Object.values(results).every(v => v === 'PASS');
    console.log('\n  VERDICT:', allPass ? '✅ ALL TABLES: PASS' : '❌ SOME TABLES FAILED');

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

fullValidation();
