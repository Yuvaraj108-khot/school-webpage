const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const students = await prisma.student.findMany();
  console.log(JSON.stringify(students, null, 2));
  await prisma.$disconnect();
}
main();
