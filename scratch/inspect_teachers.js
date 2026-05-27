const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = "postgresql://postgres.fmhboudatpxthzxgpkep:DLwOp5js2L8quBHo@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
const prisma = new PrismaClient();

async function main() {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        subject_teachers: {
          include: {
            subject: true
          }
        }
      }
    });
    console.log(`Found ${teachers.length} teachers:`);
    teachers.forEach(t => {
      console.log(`ID: ${t.id}, Name: ${t.name}, Subject: ${t.subject}, Medium: ${t.medium}, is_active: ${t.is_active}`);
      if (t.subject_teachers.length > 0) {
        console.log('  Assigned subjects:');
        t.subject_teachers.forEach(st => {
          console.log(`    - ${st.subject.name} (Class ID: ${st.subject.class_id})`);
        });
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
