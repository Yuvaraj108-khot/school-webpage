const { PrismaClient } = require('@prisma/client');

// Use global singleton to maintain connection across serverless invocations
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    globalForPrisma.prisma = prisma;
}

module.exports = prisma;
