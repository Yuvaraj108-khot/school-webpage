const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing connection to Supabase...');
    const startTime = Date.now();
    const students = await prisma.student.findMany({ take: 1 });
    console.log('Connection successful!');
    console.log('Time taken:', Date.now() - startTime, 'ms');
    console.log('Data sample:', JSON.stringify(students, null, 2));
  } catch (err) {
    console.error('Connection failed!');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
