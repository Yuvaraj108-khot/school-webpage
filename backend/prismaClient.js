const { PrismaClient } = require('@prisma/client');

// Use DATABASE_URL from .env (Neon production database)
const prisma = new PrismaClient();

module.exports = prisma;
