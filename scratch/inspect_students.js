const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = "postgresql://postgres.fmhboudatpxthzxgpkep:DLwOp5js2L8quBHo@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
const prisma = new PrismaClient();

async function main() {
  try {
    const students = await prisma.student.findMany({
      include: {
        class_rel: true,
        medium_rel: true
      }
    });
    console.log(`Found ${students.length} students:`);
    students.forEach(s => {
      console.log(`ID: ${s.id}, Code: ${s.student_code}, Name: ${s.name}, Class: ${s.class} (id: ${s.class_id}), Medium: ${s.medium} (id: ${s.medium_id}), is_active: ${s.is_active}`);
    });
    
    console.log('\n--- Mediums ---');
    const mediums = await prisma.medium.findMany();
    console.log(mediums);

    console.log('\n--- Classes ---');
    const classes = await prisma.schoolClass.findMany();
    console.log(classes);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
