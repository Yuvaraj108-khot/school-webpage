const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const students = await prisma.student.count();
    const teachers = await prisma.teacher.count();
    const notices = await prisma.notice.count();
    const alumni = await prisma.alumni.count();
    const galleries = await prisma.gallery.count();
    const attendance = await prisma.attendance.count();
    const marks = await prisma.marks.count();
    const requests = await prisma.certificateRequest.count();
    
    console.log("Database Connection: SUCCESS");
    console.log("--- Row Counts ---");
    console.log(`Students: ${students}`);
    console.log(`Teachers: ${teachers}`);
    console.log(`Notices: ${notices}`);
    console.log(`Alumni: ${alumni}`);
    console.log(`Galleries: ${galleries}`);
    console.log(`Attendance: ${attendance}`);
    console.log(`Marks: ${marks}`);
    console.log(`Certificate Requests: ${requests}`);
  } catch (e) {
    console.log("Database Connection: FAILED");
    console.error(e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
