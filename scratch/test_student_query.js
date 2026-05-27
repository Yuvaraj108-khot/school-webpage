const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = "postgresql://postgres.fmhboudatpxthzxgpkep:DLwOp5js2L8quBHo@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
const prisma = new PrismaClient();

async function test(query) {
    const { class: cls, medium } = query;
    const where = {};
    if (cls) where.class = cls;
    if (medium) {
        const normalized = (medium === 'CBSE' ? 'English' : medium);
        where.OR = [
            { medium: { equals: medium, mode: 'insensitive' } },
            { medium: { equals: normalized, mode: 'insensitive' } }
        ];
    }
    where.is_active = true;

    const students = await prisma.student.findMany({ where });
    console.log(`Query ${JSON.stringify(query)} found ${students.length} students:`);
    students.forEach(s => console.log(`  - ${s.name} (${s.student_code}): ${s.medium} / Class ${s.class}`));
}

async function main() {
  try {
    await test({ class: '5', medium: 'CBSE' });
    await test({ class: '10', medium: 'CBSE' });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
