const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Class progression mapping
const classProgression = {
  'LKG': 'UKG',
  'UKG': '1',
  '1': '2',
  '2': '3',
  '3': '4',
  '4': '5',
  '5': '6',
  '6': '7',
  '7': '8',
  '8': '9',
  '9': '10'
};

async function runAcademicRollover() {
  console.log('--- Starting Academic Year Rollover ---');
  
  try {
    const currentYear = new Date().getFullYear();
    const newAcademicYear = `${currentYear}-${currentYear + 1}`;

    // 1. Handle 10th Standard Graduates
    const graduatingStudents = await prisma.student.findMany({
      where: { class: '10' }
    });

    console.log(`Found ${graduatingStudents.length} graduating 10th standard students.`);

    for (const student of graduatingStudents) {
      // Add to GraduatedStudent table
      await prisma.graduatedStudent.create({
        data: {
          student_code: student.student_code,
          name: student.name,
          graduation_year: currentYear.toString(),
          medium: student.medium,
          email: student.email,
          phone: null // Student model doesn't have phone, but we can store if needed
        }
      });

      // Hard delete from Student table (and related records)
      await prisma.attendance.deleteMany({ where: { student_id: student.id } });
      await prisma.marks.deleteMany({ where: { student_id: student.id } });
      await prisma.certificateRequest.deleteMany({ where: { student_id: student.id } });
      await prisma.alumniTracking.deleteMany({ where: { student_id: student.id } });
      await prisma.student.delete({ where: { id: student.id } });
      
      console.log(`Graduated & Archived: ${student.name} (${student.student_code || 'No ID'})`);
    }

    // 2. Promote Remaining Students
    const remainingStudents = await prisma.student.findMany();
    
    let promotedCount = 0;
    for (const student of remainingStudents) {
      const nextClass = classProgression[student.class];
      if (nextClass) {
        await prisma.student.update({
          where: { id: student.id },
          data: {
            class: nextClass,
            academic_year: newAcademicYear
          }
        });
        promotedCount++;
      }
    }

    console.log(`Successfully promoted ${promotedCount} students to the next class.`);
    console.log('--- Academic Year Rollover Completed ---');

  } catch (error) {
    console.error('Error during Academic Year Rollover:', error);
  }
}

// Schedule to run on May 1st at midnight
function scheduleRollover() {
  // '0 0 1 5 *' = At 00:00 on day-of-month 1 in May.
  cron.schedule('0 0 1 5 *', () => {
    console.log('Triggering scheduled Academic Year Rollover...');
    runAcademicRollover();
  });
  console.log('Academic Year Rollover cron job scheduled for May 1st.');
}

module.exports = { scheduleRollover, runAcademicRollover };
