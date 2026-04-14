const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const students = await prisma.student.count();
    const teachers = await prisma.teacher.count();
    const notices = await prisma.notice.count();
    const alumni = await prisma.alumni.count();
    const attendance = await prisma.attendance.count();
    const marks = await prisma.marks.count();
    const certificates = await prisma.certificateRequest.count();

    console.log('--- DATABASE STATUS ---');
    console.log('Students:', students);
    console.log('Teachers:', teachers);
    console.log('Notices:', notices);
    console.log('Alumni:', alumni);
    console.log('Attendance:', attendance);
    console.log('Marks:', marks);
    console.log('Certificates:', certificates);
    
    // Check for the specific "UI001" student
    const student = await prisma.student.findFirst({ where: { name: 'Frontend Student' } });
    console.log('\nFrontend Student Found:', student ? 'YES' : 'NO');
    if (student) console.log('Details:', JSON.stringify(student, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
