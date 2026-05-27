const { PrismaClient } = require('@prisma/client');
process.env.DATABASE_URL = "postgresql://postgres.fmhboudatpxthzxgpkep:DLwOp5js2L8quBHo@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing direct connection to Supabase (5432)...');
    const count = await prisma.student.count();
    console.log('Direct connection successful! Student count:', count);
  } catch (err) {
    console.error('Direct connection failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
