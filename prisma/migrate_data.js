const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration and seeding...');

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Seed Mediums
      console.log('Seeding mediums...');
      const englishMedium = await tx.medium.upsert({
        where: { name: 'English' },
        update: {},
        create: { name: 'English' }
      });

      const kannadaMedium = await tx.medium.upsert({
        where: { name: 'Kannada' },
        update: {},
        create: { name: 'Kannada' }
      });

      const mediumMap = {
        'English': englishMedium,
        'CBSE': englishMedium, // Map legacy CBSE string to English medium
        'Kannada': kannadaMedium
      };

      // 2. Seed School Classes (Class 1–10 for both English & Kannada)
      console.log('Seeding school classes...');
      const classes = {}; // key: "name_mediumId"
      
      const mediums = [englishMedium, kannadaMedium];
      for (const med of mediums) {
        for (let i = 1; i <= 10; i++) {
          const className = String(i);
          const cls = await tx.schoolClass.upsert({
            where: {
              name_medium_id: {
                name: className,
                medium_id: med.id
              }
            },
            update: {},
            create: {
              name: className,
              medium_id: med.id
            }
          });
          classes[`${className}_${med.id}`] = cls;
        }
      }

      // 3. Migrate Old Students
      console.log('Migrating old students to relations...');
      const students = await tx.student.findMany();
      let migratedStudentsCount = 0;

      for (const student of students) {
        // Resolve medium
        let medRecord = mediumMap[student.medium];
        if (!medRecord) {
          // Default to English if unrecognized legacy value
          medRecord = englishMedium;
        }

        // Resolve class name (e.g. "10" or "Class 10" -> "10")
        let clsName = student.class ? student.class.replace(/\D/g, '') : '';
        if (!clsName || isNaN(parseInt(clsName))) {
          // Fallback default class to Class 10 if invalid
          clsName = '10';
        }

        const classRecord = classes[`${clsName}_${medRecord.id}`];

        if (classRecord) {
          await tx.student.update({
            where: { id: student.id },
            data: {
              class_id: classRecord.id,
              medium_id: medRecord.id
            }
          });
          migratedStudentsCount++;
        }
      }
      console.log(`Migrated ${migratedStudentsCount} students successfully.`);

      // 4. Seed Subjects for every Class + Medium
      console.log('Seeding subjects...');
      const subjectNames = [
        'Mathematics',
        'Science',
        'English',
        'Social Science',
        'Second Language'
      ];

      const allClasses = await tx.schoolClass.findMany();
      let seededSubjectsCount = 0;

      for (const cls of allClasses) {
        for (const subName of subjectNames) {
          await tx.subject.upsert({
            where: {
              name_class_id_medium_id: {
                name: subName,
                class_id: cls.id,
                medium_id: cls.medium_id
              }
            },
            update: {},
            create: {
              name: subName,
              class_id: cls.id,
              medium_id: cls.medium_id
            }
          });
          seededSubjectsCount++;
        }
      }
      console.log(`Seeded ${seededSubjectsCount} class-subject records.`);

      // 5. Seed Exams
      console.log('Seeding exams...');
      const examNames = [
        'Unit Test 1',
        'Unit Test 2',
        'Mid Term Exam',
        'Final Exam'
      ];

      for (const examName of examNames) {
        await tx.exam.upsert({
          where: { name: examName },
          update: {},
          create: {
            name: examName,
            academic_year: '2025-2026'
          }
        });
      }

      return {
        mediums: ['English', 'Kannada'],
        classesCount: allClasses.length,
        migratedStudentsCount,
        subjectsCount: seededSubjectsCount,
        exams: examNames
      };
    }, {
      maxWait: 30000, // 30 seconds
      timeout: 120000 // 120 seconds (2 minutes) to ensure Supabase roundtrips succeed
    });

    console.log('Migration Transaction Completed Successfully!');
    console.log('REPORT:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('FATAL ERROR DURING MIGRATION TRANSACTION:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
